package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/eigenstate/eigenstate/internal/db"
	"github.com/eigenstate/eigenstate/internal/ingestion"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/time/rate"
)

// Server handles the Go Query API.
type Server struct {
	db      *db.DB
	webhook *ingestion.WebhookHandler
	limiter *rate.Limiter
}

// NewServer creates a new API server.
func NewServer(database *db.DB, wh *ingestion.WebhookHandler) *Server {
	return &Server{
		db:      database,
		webhook: wh,
		limiter: rate.NewLimiter(10, 30),
	}
}

// MetricsMiddleware instruments HTTP requests with Prometheus.
func (s *Server) MetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		duration := time.Since(start).Seconds()
		RequestDuration.WithLabelValues(r.Method, r.URL.Path).Observe(duration)
		RequestsTotal.WithLabelValues(r.Method, r.URL.Path, fmt.Sprintf("%d", ww.Status())).Inc()
	})
}

// RateLimitMiddleware limits API request rate.
func (s *Server) RateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.Allow() {
			http.Error(w, `{"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// Handler returns the HTTP handler for the API server.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()

	// Core middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.CleanPath)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(s.MetricsMiddleware)
	r.Use(s.RateLimitMiddleware)
	r.Use(JWTAuthMiddleware)

	// CORS
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	// Public endpoints
	r.Get("/healthz", s.healthCheck)
	r.Handle("/metrics", promhttp.Handler())
	r.Post("/webhook", s.webhook.HandleWebhook)

	// Auth endpoint
	r.Post("/api/auth/token", s.generateToken)

	// Repo Registration (Phase 1)
	r.Post("/repos", s.registerRepo)
	r.Get("/repos", s.listRepos)
	r.Delete("/repos/index", s.deleteRepoIndex)
	r.Post("/repos/clear-one", s.clearOneRepoIndex)

	// V1 Spec API Routes (Phase 3)
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/why", s.queryWhy)
		r.Get("/lineage", s.queryLineage)
		r.Get("/functions", s.queryFunctions)
	})

	// Internal/Admin API Routes
	r.Route("/api", func(r chi.Router) {
		r.Get("/stats", s.getStats)
		r.Get("/ingestions", s.listIngestions)
		r.Post("/ingest", s.webhook.ManualIngestHandler)
		r.Post("/admin/reset-workspace", s.resetWorkspace)

		// Analysis
		r.Get("/analysis/{owner}/{repo}/{prNumber}", s.getAnalysis)
		r.Get("/analysis/{owner}/{repo}", s.getAllAnalyses)

		// Timeline reconstruction (core Eigenstate feature!)
		r.Get("/timeline/function/{owner}/{repo}/{functionName}", s.getFunctionTimeline)
		r.Get("/timeline/file/{owner}/{repo}/*", s.getFileTimeline)

		// Search
		r.Get("/search/{owner}/{repo}", s.searchAnalyses)
	})

	return r
}

func (s *Server) healthCheck(w http.ResponseWriter, r *http.Request) {
	status := map[string]interface{}{
		"status":  "healthy",
		"service": "eigenstate",
		"version": "1.0.0",
		"uptime":  time.Since(startTime).String(),
	}
	if s.db != nil {
		status["database"] = "connected"
	} else {
		status["database"] = "disconnected"
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

var startTime = time.Now()

func (s *Server) generateToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID string `json:"user_id"`
		Role   string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.UserID == "" {
		req.UserID = "anonymous"
	}
	if req.Role == "" {
		req.Role = "viewer"
	}

	token, err := GenerateToken(req.UserID, req.Role)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

func (s *Server) getStats(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	stats, err := s.db.GetStats(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

func (s *Server) listIngestions(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	ingestions, err := s.db.GetRecentIngestions(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ingestions)
}

func (s *Server) getAnalysis(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := chi.URLParam(r, "owner")
	repo := chi.URLParam(r, "repo")
	prStr := chi.URLParam(r, "prNumber")
	prNumber, err := strconv.Atoi(prStr)
	if err != nil {
		http.Error(w, "invalid PR number", http.StatusBadRequest)
		return
	}
	analysis, err := s.db.GetAnalysis(r.Context(), owner, repo, prNumber)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(analysis)
}

func (s *Server) getAllAnalyses(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := chi.URLParam(r, "owner")
	repo := chi.URLParam(r, "repo")
	analyses, err := s.db.GetAllAnalyses(r.Context(), owner, repo)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analyses)
}

func (s *Server) getFunctionTimeline(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := chi.URLParam(r, "owner")
	repo := chi.URLParam(r, "repo")
	functionName := chi.URLParam(r, "functionName")

	timeline, err := s.db.GetFunctionTimeline(r.Context(), owner, repo, functionName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(timeline)
}

func (s *Server) getFileTimeline(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := chi.URLParam(r, "owner")
	repo := chi.URLParam(r, "repo")
	filePath := chi.URLParam(r, "*")

	timeline, err := s.db.GetFileTimeline(r.Context(), owner, repo, filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(timeline)
}

func (s *Server) searchAnalyses(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := chi.URLParam(r, "owner")
	repo := chi.URLParam(r, "repo")
	q := r.URL.Query().Get("q")
	if q == "" {
		http.Error(w, `{"error":"missing 'q' query parameter"}`, http.StatusBadRequest)
		return
	}

	results, err := s.db.SearchAnalyses(r.Context(), owner, repo, q)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

// ── Spec Endpoints ───────────────────────────────────────────────

func (s *Server) registerRepo(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	var req struct {
		Owner string `json:"owner"`
		Repo  string `json:"repo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Owner == "" || req.Repo == "" {
		http.Error(w, "owner and repo required", http.StatusBadRequest)
		return
	}

	repo, err := s.db.RegisterRepo(r.Context(), req.Owner, req.Repo)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(repo)
}

func (s *Server) listRepos(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	repos, err := s.db.ListRepos(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(repos)
}

// deleteRepoIndex clears all indexed data for a repo and removes it from registered_repos.
// Query: ?owner=...&repo=...
func (s *Server) deleteRepoIndex(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := r.URL.Query().Get("owner")
	repo := r.URL.Query().Get("repo")
	s.writeClearRepoResult(w, r.Context(), owner, repo)
}

// clearOneRepoIndex is the same as deleteRepoIndex but accepts JSON { "owner", "repo" } (avoids long query strings).
func (s *Server) clearOneRepoIndex(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	var req struct {
		Owner string `json:"owner"`
		Repo  string `json:"repo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON body"}`, http.StatusBadRequest)
		return
	}
	s.writeClearRepoResult(w, r.Context(), strings.TrimSpace(req.Owner), strings.TrimSpace(req.Repo))
}

func (s *Server) writeClearRepoResult(w http.ResponseWriter, ctx context.Context, owner, repo string) {
	if owner == "" || repo == "" {
		http.Error(w, `{"error":"owner and repo are required"}`, http.StatusBadRequest)
		return
	}
	if err := s.db.ClearRepoWorkspace(ctx, owner, repo); err != nil {
		b, _ := json.Marshal(map[string]string{"error": err.Error()})
		http.Error(w, string(b), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "owner": owner, "repo": repo})
}

// resetWorkspace wipes all ingest tables and registered repos. Requires explicit confirmation in the body.
func (s *Server) resetWorkspace(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	var req struct {
		Confirm string `json:"confirm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid JSON body"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.Confirm) != "reset-all-eigenstate-data" {
		http.Error(w, `{"error":"send confirm: reset-all-eigenstate-data"}`, http.StatusBadRequest)
		return
	}
	if err := s.db.DeleteAllWorkspaceData(r.Context()); err != nil {
		b, _ := json.Marshal(map[string]string{"error": err.Error()})
		http.Error(w, string(b), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "workspace wiped"})
}

func (s *Server) queryWhy(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := r.URL.Query().Get("owner")
	repo := r.URL.Query().Get("repo")
	fnName := r.URL.Query().Get("function_name")
	filePath := strings.TrimSpace(r.URL.Query().Get("file_path"))

	if owner == "" || repo == "" || fnName == "" {
		http.Error(w, "owner, repo, and function_name required", http.StatusBadRequest)
		return
	}

	result, err := s.db.QueryWhy(r.Context(), owner, repo, fnName, filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Server) queryLineage(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := r.URL.Query().Get("owner")
	repo := r.URL.Query().Get("repo")
	limitStr := r.URL.Query().Get("limit")

	if owner == "" || repo == "" {
		http.Error(w, "owner and repo required", http.StatusBadRequest)
		return
	}

	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	timeline, err := s.db.QueryLineage(r.Context(), owner, repo, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(timeline)
}

func (s *Server) queryFunctions(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		http.Error(w, "database not connected", http.StatusInternalServerError)
		return
	}
	owner := r.URL.Query().Get("owner")
	repo := r.URL.Query().Get("repo")
	if owner == "" || repo == "" {
		http.Error(w, "owner and repo required", http.StatusBadRequest)
		return
	}

	tree, err := s.db.QueryFunctions(r.Context(), owner, repo)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tree)
}

// Unused import suppressor
var _ = fmt.Sprintf
