package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/eigenstate/eigenstate/internal/api"
	"github.com/eigenstate/eigenstate/internal/db"
	"github.com/eigenstate/eigenstate/internal/ingestion"
)

func loadDotenvFromModuleRoot() {
	wd, err := os.Getwd()
	if err != nil {
		_ = godotenv.Load()
		return
	}
	dir := wd
	for {
		envPath := filepath.Join(dir, ".env")
		if _, err := os.Stat(envPath); err == nil {
			if err := godotenv.Load(envPath); err != nil {
				fmt.Fprintf(os.Stderr, "eigenstate: could not load %s: %v\n", envPath, err)
			}
			return
		}
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			_ = godotenv.Load()
			return
		}
		dir = parent
	}
}

func main() {
	loadDotenvFromModuleRoot()

	// Initialize structured logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	for _, arg := range os.Args[1:] {
		if arg == "-wipe-workspace" || arg == "--wipe-workspace" {
			ctx := context.Background()
			database, err := db.NewDB(ctx)
			if err != nil {
				slog.Error("database connection failed", "error", err)
				os.Exit(1)
			}
			defer database.Close(ctx)
			if err := database.AutoMigrate(ctx); err != nil {
				slog.Error("migration failed", "error", err)
				os.Exit(1)
			}
			if err := database.DeleteAllWorkspaceData(ctx); err != nil {
				slog.Error("workspace wipe failed", "error", err)
				os.Exit(1)
			}
			slog.Info("All ingest tables and registered_repos cleared. Restart the server without -wipe-workspace.")
			os.Exit(0)
		}
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	slog.Info("Starting Eigenstate Codebase Memory Engine...", "version", "1.0.0")

	// Load configuration
	cfg := ingestion.LoadConfigFromEnv()
	if cfg.GitHubToken == "" {
		slog.Warn("GITHUB_TOKEN not set — GitHub API calls will be unauthenticated")
	}

	// Initialize GitHub client
	ghClient := cfg.NewClient(ctx)

	// Initialize database with connection pool
	database, err := db.NewDB(ctx)
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
	} else {
		defer database.Close(ctx)

		// Run auto-migrations
		if err := database.AutoMigrate(ctx); err != nil {
			slog.Error("Auto-migration failed", "error", err)
		}
	}

	// Initialize Ingestion Service with worker pool
	ingestSvc := ingestion.NewIngestService(ctx, ghClient, database)
	ingestSvc.Start()

	// Initialize Webhook Handler
	webhookHandler := ingestion.NewWebhookHandler(ingestSvc)

	// Initialize API Server with all middleware
	apiServer := api.NewServer(database, webhookHandler)

	srv := &http.Server{
		Addr:              "0.0.0.0:8080",
		Handler:           apiServer.Handler(),
		ReadTimeout:       15 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MB
	}

	// Start API Server
	go func() {
		slog.Info("API Server is running",
			"addr", srv.Addr,
			"endpoints", []string{
				"GET  /healthz",
				"GET  /metrics",
				"POST /webhook",
				"POST /api/auth/token",
				"GET  /api/stats",
				"GET  /api/ingestions",
				"POST /api/ingest",
				"GET  /api/analysis/{owner}/{repo}/{pr}",
				"GET  /api/analysis/{owner}/{repo}",
				"GET  /api/timeline/function/{owner}/{repo}/{fn}",
				"GET  /api/timeline/file/{owner}/{repo}/*",
				"GET  /api/search/{owner}/{repo}?q=...",
			},
		)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("API Server failed", "error", err)
			os.Exit(1)
		}
	}()

	// Wait for interruption signal
	<-ctx.Done()
	slog.Info("Shutting down gracefully...")

	// Stop ingestion workers first
	ingestSvc.Stop()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("API Server forced to shutdown", "error", err)
	}

	slog.Info("Eigenstate stopped cleanly")
}
