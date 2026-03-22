package ingestion

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// WebhookHandler handles incoming GitHub webhook events.
type WebhookHandler struct {
	ingestSvc *IngestService
	secret    string
}

// NewWebhookHandler creates a new webhook handler.
func NewWebhookHandler(svc *IngestService) *WebhookHandler {
	return &WebhookHandler{
		ingestSvc: svc,
		secret:    os.Getenv("GITHUB_WEBHOOK_SECRET"),
	}
}

// HandleWebhook handles POST /webhook from GitHub.
func (wh *WebhookHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Verify webhook signature
	if wh.secret != "" {
		sig := r.Header.Get("X-Hub-Signature-256")
		if !wh.verifySignature(body, sig) {
			slog.Warn("Invalid webhook signature")
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
	}

	event := r.Header.Get("X-GitHub-Event")
	slog.Info("Received webhook", "event", event)

	switch event {
	case "pull_request":
		wh.handlePullRequestEvent(body)
	case "pull_request_review_comment":
		wh.handlePRCommentEvent(body)
	case "ping":
		slog.Info("Webhook ping received")
	default:
		slog.Info("Ignoring webhook event", "event", event)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (wh *WebhookHandler) verifySignature(payload []byte, signature string) bool {
	if !strings.HasPrefix(signature, "sha256=") {
		return false
	}
	sig := strings.TrimPrefix(signature, "sha256=")
	mac := hmac.New(sha256.New, []byte(wh.secret))
	mac.Write(payload)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(sig), []byte(expected))
}

type pullRequestEvent struct {
	Action      string `json:"action"`
	Number      int    `json:"number"`
	PullRequest struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	} `json:"pull_request"`
	Repository struct {
		FullName string `json:"full_name"`
		Owner    struct {
			Login string `json:"login"`
		} `json:"owner"`
		Name string `json:"name"`
	} `json:"repository"`
}

func (wh *WebhookHandler) handlePullRequestEvent(body []byte) {
	var event pullRequestEvent
	if err := json.Unmarshal(body, &event); err != nil {
		slog.Error("Failed to parse PR event", "error", err)
		return
	}

	if event.Action != "opened" && event.Action != "synchronize" && event.Action != "closed" {
		return
	}

	owner := event.Repository.Owner.Login
	repo := event.Repository.Name
	prNum := event.Number

	slog.Info("Processing webhook PR event",
		"action", event.Action,
		"owner", owner,
		"repo", repo,
		"pr", prNum,
	)

	// Submit to worker pool
	wh.ingestSvc.SubmitJob(Job{
		Owner:    owner,
		Repo:     repo,
		PRNumber: prNum,
		Title:    event.PullRequest.Title,
		Body:     event.PullRequest.Body,
	})
}

type prCommentEvent struct {
	Action  string `json:"action"`
	Comment struct {
		Body string `json:"body"`
		User struct {
			Login string `json:"login"`
		} `json:"user"`
	} `json:"comment"`
	PullRequest struct {
		Number int `json:"number"`
	} `json:"pull_request"`
	Repository struct {
		Owner struct {
			Login string `json:"login"`
		} `json:"owner"`
		Name string `json:"name"`
	} `json:"repository"`
}

func (wh *WebhookHandler) handlePRCommentEvent(body []byte) {
	var event prCommentEvent
	if err := json.Unmarshal(body, &event); err != nil {
		slog.Error("Failed to parse comment event", "error", err)
		return
	}

	slog.Info("Processing PR comment",
		"repo", event.Repository.Name,
		"pr", event.PullRequest.Number,
		"user", event.Comment.User.Login,
	)

	// Re-analyze the PR with new comment context
	wh.ingestSvc.SubmitJob(Job{
		Owner:    event.Repository.Owner.Login,
		Repo:     event.Repository.Name,
		PRNumber: event.PullRequest.Number,
	})
}

// ManualIngestHandler handles POST /api/ingest for manual repo ingestion.
func (wh *WebhookHandler) ManualIngestHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Owner   string `json:"owner"`
		Repo    string `json:"repo"`
		PR      int    `json:"pr_number"`
		Replace bool   `json:"replace"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Owner == "" || req.Repo == "" {
		http.Error(w, "owner and repo are required", http.StatusBadRequest)
		return
	}

	if wh.ingestSvc.db != nil && req.Replace {
		if err := wh.ingestSvc.db.DeleteRepoIngestData(r.Context(), req.Owner, req.Repo); err != nil {
			slog.Error("replace ingest: clear repo data failed", "owner", req.Owner, "repo", req.Repo, "error", err)
			http.Error(w, `{"error":"failed to clear existing ingest data"}`, http.StatusInternalServerError)
			return
		}
		slog.Info("Cleared prior ingest data for repo", "owner", req.Owner, "repo", req.Repo)
	}

	if wh.ingestSvc.db != nil {
		if _, err := wh.ingestSvc.db.RegisterRepo(r.Context(), req.Owner, req.Repo); err != nil {
			slog.Warn("register repo failed", "owner", req.Owner, "repo", req.Repo, "error", err)
		}
	}

	if req.PR > 0 {
		wh.ingestSvc.SubmitJob(Job{Owner: req.Owner, Repo: req.Repo, PRNumber: req.PR})
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "queued",
			"pr":      strconv.Itoa(req.PR),
			"replace": req.Replace,
		})
	} else {
		// Ingest all recent PRs
		go wh.ingestSvc.ingestRecentPRs(req.Owner, req.Repo)
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ingesting_all",
			"repo":    req.Owner + "/" + req.Repo,
			"replace": req.Replace,
		})
	}
}

// Unused import suppressor
var _ = fmt.Sprintf
