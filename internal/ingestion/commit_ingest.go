package ingestion

import (
	"crypto/sha256"
	"encoding/binary"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/go-github/v60/github"
)

// commitIngestionPRNumber maps a commit SHA to a stable synthetic PR id (avoids clashing with real PR numbers).
func commitIngestionPRNumber(sha string) int {
	sum := sha256.Sum256([]byte(strings.TrimSpace(sha)))
	u := binary.BigEndian.Uint32(sum[:4])
	return 10_000_000 + int(u%7_999_900)
}

func firstLineOfMessage(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexAny(s, "\r\n"); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return s
}

func buildUnifiedDiffFromCommitFiles(files []*github.CommitFile) string {
	var b strings.Builder
	for _, f := range files {
		patch := f.GetPatch()
		if patch == "" {
			continue
		}
		path := f.GetFilename()
		_, _ = fmt.Fprintf(&b, "diff --git a/%s b/%s\n", path, path)
		_, _ = fmt.Fprintf(&b, "--- a/%s\n+++ b/%s\n", path, path)
		b.WriteString(patch)
		if !strings.HasSuffix(patch, "\n") {
			b.WriteByte('\n')
		}
	}
	return b.String()
}

// FetchCommitUnifiedDiff builds a unified diff from a commit’s file patches (for repos with no PRs).
func (s *IngestService) FetchCommitUnifiedDiff(owner, repo, sha string) (string, *github.RepositoryCommit, error) {
	commit, _, err := s.client.Repositories.GetCommit(s.ctx, owner, repo, sha, nil)
	if err != nil {
		return "", nil, err
	}
	d := buildUnifiedDiffFromCommitFiles(commit.Files)
	if d == "" {
		return "", commit, fmt.Errorf("no textual patches in commit (merge/binary/large files)")
	}
	return d, commit, nil
}

func commitTime(c *github.RepositoryCommit) time.Time {
	if c == nil || c.Commit == nil {
		return time.Time{}
	}
	if c.Commit.Committer != nil && c.Commit.Committer.Date != nil {
		return c.Commit.Committer.Date.Time
	}
	if c.Commit.Author != nil && c.Commit.Author.Date != nil {
		return c.Commit.Author.Date.Time
	}
	return time.Time{}
}

// ingestFallbackRecentCommits queues recent default-branch commits when the repo has zero pull requests.
func (s *IngestService) ingestFallbackRecentCommits(owner, repo string, limit int) {
	meta, _, err := s.client.Repositories.Get(s.ctx, owner, repo)
	if err != nil {
		slog.Error("commit fallback: repo meta", "owner", owner, "repo", repo, "error", err)
		return
	}
	branch := meta.GetDefaultBranch()
	if branch == "" {
		branch = "main"
	}
	commits, _, err := s.client.Repositories.ListCommits(s.ctx, owner, repo, &github.CommitsListOptions{
		SHA:         branch,
		ListOptions: github.ListOptions{PerPage: limit},
	})
	if err != nil {
		slog.Error("commit fallback: list commits", "owner", owner, "repo", repo, "error", err)
		return
	}
	if len(commits) == 0 {
		slog.Warn("commit fallback: no commits", "owner", owner, "repo", repo, "branch", branch)
		return
	}
	slog.Info("commit fallback: queueing commits (repo has no PRs)", "owner", owner, "repo", repo, "branch", branch, "n", len(commits))
	for _, c := range commits {
		sha := c.GetSHA()
		if sha == "" {
			continue
		}
		prNum := commitIngestionPRNumber(sha)
		ct := commitTime(c)
		if s.db != nil && !ct.IsZero() {
			lastSeen, err := s.db.GetPRLastUpdated(s.ctx, owner, repo, prNum)
			if err == nil && !ct.After(lastSeen) {
				short := sha
				if len(short) > 7 {
					short = short[:7]
				}
				slog.Debug("commit fallback: skip up-to-date", "sha", short)
				continue
			}
		}
		msg := ""
		if c.Commit != nil {
			msg = c.Commit.GetMessage()
		}
		title := firstLineOfMessage(msg)
		if title == "" {
			short := sha
			if len(short) > 7 {
				short = short[:7]
			}
			title = "Commit " + short
		}
		s.SubmitJob(Job{
			Owner:     owner,
			Repo:      repo,
			PRNumber:  prNum,
			Title:     title,
			Body:      "",
			CommitSHA: sha,
		})
	}
}
