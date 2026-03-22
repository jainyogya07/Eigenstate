package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/eigenstate/eigenstate/internal/db"
	"github.com/eigenstate/eigenstate/internal/intelligence"
	"github.com/google/go-github/v60/github"
	"golang.org/x/oauth2"
)

// IngestService handles streaming data from GitHub.
type IngestService struct {
	client         *github.Client
	diffHTTP       *http.Client
	db             *db.DB
	ctx            context.Context
	workerPool     *WorkerPool
	circuitBreaker *CircuitBreaker
	IntelClient    *intelligence.Client
}

// NewIngestService creates a new IngestService.
func NewIngestService(ctx context.Context, client *github.Client, database *db.DB) *IngestService {
	var transport http.RoundTripper = http.DefaultTransport
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
		authBase := oauth2.NewClient(ctx, ts)
		transport = authBase.Transport
	}
	diffHTTP := &http.Client{Transport: transport, Timeout: 90 * time.Second}
	intelHTTP := &http.Client{Transport: transport, Timeout: 180 * time.Second}
	svc := &IngestService{
		client:         client,
		diffHTTP:       diffHTTP,
		db:             database,
		ctx:            ctx,
		circuitBreaker: NewCircuitBreaker(5, 30*time.Second),
		IntelClient:    intelligence.NewClient(intelHTTP),
	}
	// Create worker pool: 5 workers, 100 job queue
	svc.workerPool = NewWorkerPool(svc, 5, 100)
	return svc
}

// SubmitJob submits a job to the worker pool.
func (s *IngestService) SubmitJob(job Job) {
	s.workerPool.Submit(job)
}

// FetchPRMetadata fetches pull request metadata from GitHub with circuit breaker + retries.
func (s *IngestService) FetchPRMetadata(owner, repo string, prNumber int) (*github.PullRequest, error) {
	var pr *github.PullRequest
	var fetchErr error

	cbErr := s.circuitBreaker.Execute(func() error {
		fetchErr = s.withRetry(func() error {
			var err error
			pr, _, err = s.client.PullRequests.Get(s.ctx, owner, repo, prNumber)
			return err
		})
		return fetchErr
	})

	if cbErr != nil {
		return nil, fmt.Errorf("GitHub API call failed (circuit: %s): %w", s.circuitBreaker.State(), cbErr)
	}
	return pr, nil
}

func (s *IngestService) withRetry(fn func() error) error {
	maxRetries := 3
	backoff := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		err := fn()
		if err == nil {
			return nil
		}

		slog.Warn("Retrying", "attempt", i+1, "max", maxRetries, "error", err)

		select {
		case <-s.ctx.Done():
			return s.ctx.Err()
		case <-time.After(backoff):
			backoff *= 2
		}
	}

	return fmt.Errorf("max retries exceeded")
}

// FetchPRDiff fetches the unified diff via the GitHub API so GITHUB_TOKEN rate limits apply.
func (s *IngestService) FetchPRDiff(owner, repo string, prNumber int) (string, error) {
	u := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d", owner, repo, prNumber)
	req, err := http.NewRequestWithContext(s.ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create diff request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github.v3.diff")
	req.Header.Set("User-Agent", "eigenstate-ingest/1.0")

	client := s.diffHTTP
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch diff: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("unexpected status fetching diff: %d: %s", resp.StatusCode, string(b))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read diff body: %w", err)
	}

	return string(body), nil
}

// fetchPRCommentPayloads loads inline + review comments for the reasoning layer.
func (s *IngestService) fetchPRCommentPayloads(owner, repo string, prNumber int) []intelligence.CommentPayload {
	var out []intelligence.CommentPayload
	if s.client == nil {
		return out
	}
	// PRs share the same numeric id as issues for comment threads.
	if ic, _, err := s.client.Issues.ListComments(s.ctx, owner, repo, prNumber, nil); err == nil {
		for _, c := range ic {
			out = append(out, intelligence.CommentPayload{Body: c.GetBody()})
		}
	}
	if rc, _, err := s.client.PullRequests.ListComments(s.ctx, owner, repo, prNumber, nil); err == nil {
		for _, c := range rc {
			out = append(out, intelligence.CommentPayload{Body: c.GetBody()})
		}
	}
	return out
}

// fetchAndSaveComments fetches PR review comments and saves them.
func (s *IngestService) fetchAndSaveComments(owner, repo string, prNumber int) {
	comments, _, err := s.client.PullRequests.ListComments(s.ctx, owner, repo, prNumber, nil)
	if err != nil {
		slog.Error("Failed to fetch PR comments", "pr", prNumber, "error", err)
		return
	}

	if len(comments) > 0 && s.db != nil {
		commentsJSON, _ := json.Marshal(comments)
		s.db.SavePRComments(s.ctx, owner, repo, prNumber, commentsJSON)
		slog.Info("Saved PR comments", "pr", prNumber, "count", len(comments))
	}
}

// PollAndIngest periodically polls the repository for new pull requests.
func (s *IngestService) PollAndIngest(owner, repo string) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	slog.Info("Starting polling", "owner", owner, "repo", repo)

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.ingestRecentPRs(owner, repo)
		}
	}
}

func (s *IngestService) ingestRecentPRs(owner, repo string) {
	opts := &github.PullRequestListOptions{
		State: "all",
		ListOptions: github.ListOptions{
			PerPage: 50,
		},
	}

	totalPRsListed := 0
	for {
		prs, resp, err := s.client.PullRequests.List(s.ctx, owner, repo, opts)
		if err != nil {
			slog.Error("Error listing PRs page", "error", err, "page", opts.Page)
			break
		}

		totalPRsListed += len(prs)
		for _, pr := range prs {
			// Deduplication check: skip if PR hasn't been updated since our last successful ingestion
			if s.db != nil {
				lastSeen, err := s.db.GetPRLastUpdated(s.ctx, owner, repo, pr.GetNumber())
				if err == nil && !pr.GetUpdatedAt().After(lastSeen) {
					slog.Debug("Skipping PR (already up to date)", "pr", pr.GetNumber())
					continue
				}
			}

			s.SubmitJob(Job{
				Owner:    owner,
				Repo:     repo,
				PRNumber: pr.GetNumber(),
				Title:    pr.GetTitle(),
				Body:     pr.GetBody(),
			})
		}

		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}

	if totalPRsListed == 0 {
		s.ingestFallbackRecentCommits(owner, repo, 30)
	}
}

func (s *IngestService) Start() {
	slog.Info("Starting Ingestion Service with worker pool...")
	s.workerPool.Start()

	owner := os.Getenv("GITHUB_OWNER")
	repo := os.Getenv("GITHUB_REPO")
	if owner != "" && repo != "" {
		go s.PollAndIngest(owner, repo)
	} else {
		slog.Info("No GITHUB_OWNER/GITHUB_REPO set, skipping auto-polling")
	}
}

// Stop gracefully shuts down the ingestion service.
func (s *IngestService) Stop() {
	s.workerPool.Stop()
}
