package ingestion

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/eigenstate/eigenstate/internal/intelligence"
	"github.com/google/go-github/v60/github"
)

// Job represents an ingestion job for the worker pool.
type Job struct {
	Owner     string
	Repo      string
	PRNumber  int
	Title     string
	Body      string
	CommitSHA string // when set, ingest this commit instead of a GitHub PR (repos with no PRs)
}

// WorkerPool manages concurrent ingestion workers.
type WorkerPool struct {
	jobs    chan Job
	svc     *IngestService
	wg      sync.WaitGroup
	workers int
}

// NewWorkerPool creates a new worker pool.
func NewWorkerPool(svc *IngestService, workers int, queueSize int) *WorkerPool {
	return &WorkerPool{
		jobs:    make(chan Job, queueSize),
		svc:     svc,
		workers: workers,
	}
}

// Start launches the workers.
func (wp *WorkerPool) Start() {
	slog.Info("Starting worker pool", "workers", wp.workers)
	for i := 0; i < wp.workers; i++ {
		wp.wg.Add(1)
		go wp.worker(i)
	}
}

// Submit adds a job to the queue.
func (wp *WorkerPool) Submit(job Job) {
	select {
	case wp.jobs <- job:
		slog.Info("Job queued", "owner", job.Owner, "repo", job.Repo, "pr", job.PRNumber)
	default:
		slog.Warn("Job queue full, dropping job", "pr", job.PRNumber)
	}
}

// Stop gracefully shuts down the worker pool.
func (wp *WorkerPool) Stop() {
	close(wp.jobs)
	wp.wg.Wait()
	slog.Info("Worker pool stopped")
}

func (wp *WorkerPool) worker(id int) {
	defer wp.wg.Done()
	slog.Info("Worker started", "worker_id", id)

	for job := range wp.jobs {
		slog.Info("Worker processing job", "worker_id", id, "pr", job.PRNumber)
		wp.processJob(job)
	}
}

func (wp *WorkerPool) processJob(job Job) {
	var (
		pr           *github.PullRequest
		commit       *github.RepositoryCommit
		diff         string
		metadataJSON []byte
		comments     []intelligence.CommentPayload
		err          error
	)

	if job.CommitSHA != "" {
		diff, commit, err = wp.svc.FetchCommitUnifiedDiff(job.Owner, job.Repo, job.CommitSHA)
		if err != nil {
			slog.Error("Worker: commit diff failed", "sha", job.CommitSHA, "error", err)
			return
		}
		meta := map[string]string{"source": "commit", "sha": job.CommitSHA}
		metadataJSON, _ = json.Marshal(meta)
		comments = nil
	} else {
		pr, err = wp.svc.FetchPRMetadata(job.Owner, job.Repo, job.PRNumber)
		if err != nil {
			slog.Error("Worker: failed to fetch PR", "pr", job.PRNumber, "error", err)
			return
		}
		diff, err = wp.svc.FetchPRDiff(job.Owner, job.Repo, job.PRNumber)
		if err != nil {
			slog.Error("Worker: failed to fetch diff", "pr", job.PRNumber, "error", err)
			return
		}
		metadataJSON, _ = json.Marshal(pr)
		wp.svc.fetchAndSaveComments(job.Owner, job.Repo, job.PRNumber)
		comments = wp.svc.fetchPRCommentPayloads(job.Owner, job.Repo, job.PRNumber)
	}

	title := job.Title
	body := job.Body
	if pr != nil {
		if title == "" {
			title = pr.GetTitle()
		}
		if body == "" {
			body = pr.GetBody()
		}
	} else if commit != nil && commit.Commit != nil && title == "" {
		title = firstLineOfMessage(commit.Commit.GetMessage())
	}

	if wp.svc.db != nil {
		if err := wp.svc.db.SaveIngestion(wp.svc.ctx, job.Owner, job.Repo, job.PRNumber, metadataJSON, diff); err != nil {
			slog.Error("Worker: save ingestion failed", "error", err)
		}
	}

	diffFiles := ParseDiffFiles(diff)

	req := intelligence.PythonAnalysisRequest{
		PR: intelligence.PRPayload{
			Repo:      job.Repo,
			PRNumber:  job.PRNumber,
			Title:     title,
			Body:      body,
			Comments:  comments,
			DiffFiles: diffFiles,
		},
	}
	if pr != nil && pr.MergedAt != nil {
		t := pr.GetMergedAt().Time
		req.PR.MergedAt = &t
	} else if commit != nil {
		if ct := commitTime(commit); !ct.IsZero() {
			req.PR.MergedAt = &ct
		}
	}

	result, pyErr := wp.svc.IntelClient.ProcessWithPython(wp.svc.ctx, req)
	if pyErr != nil {
		slog.Warn("Worker: Python analysis failed, using heuristic fallback", "pr", job.PRNumber, "error", pyErr)
		result = heuristicAnalysisResult(job, diff)
	} else if result != nil && len(result.ChangedFunctions) == 0 {
		h := heuristicAnalysisResult(job, diff)
		if len(h.ChangedFunctions) > 0 {
			result.ChangedFunctions = h.ChangedFunctions
			if result.ChangedFunctionFiles == nil {
				result.ChangedFunctionFiles = h.ChangedFunctionFiles
			} else {
				for k, v := range h.ChangedFunctionFiles {
					if _, ok := result.ChangedFunctionFiles[k]; !ok {
						result.ChangedFunctionFiles[k] = v
					}
				}
			}
		}
	}
	if result == nil {
		slog.Error("Worker: no analysis result", "pr", job.PRNumber)
		return
	}

	slog.Info("Worker: analysis complete",
		"pr", job.PRNumber,
		"functions", len(result.ChangedFunctions),
		"confidence", result.ConfidenceScore,
	)

	if wp.svc.db != nil {
		analysisJSON, _ := json.Marshal(result)
		wp.svc.db.SaveAnalysis(wp.svc.ctx, job.Owner, job.Repo, job.PRNumber, analysisJSON)

		state := "open"
		mergedAt := ""
		author := ""
		if pr != nil {
			state = pr.GetState()
			if pr.MergedAt != nil {
				mergedAt = pr.GetMergedAt().Format("2006-01-02T15:04:05Z07:00")
			}
			if pr.User != nil {
				author = pr.User.GetLogin()
			}
		} else if commit != nil {
			state = "merged"
			if ct := commitTime(commit); !ct.IsZero() {
				mergedAt = ct.UTC().Format("2006-01-02T15:04:05Z07:00")
			}
			if commit.Author != nil {
				author = commit.Author.GetLogin()
			}
		}

		normalizer := NewNormalizer(wp.svc.db)
		normalizer.NormalizePR(wp.svc, job.Owner, job.Repo, job.PRNumber, title, body, author, state, mergedAt, diff, result)
	}
}
