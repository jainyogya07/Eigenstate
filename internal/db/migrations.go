package db

import (
	"context"
	"log/slog"
)

// AutoMigrate runs all schema migrations on startup.
func (d *DB) AutoMigrate(ctx context.Context) error {
	slog.Info("Running auto-migrations...")

	migrations := []string{
		// Raw ingestion tables
		`CREATE TABLE IF NOT EXISTS raw_ingestions (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
			metadata JSONB NOT NULL, diff TEXT NOT NULL,
			status TEXT DEFAULT 'pending',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(owner, repo, pr_number)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_raw_ingestions_status ON raw_ingestions(status)`,

		// Analysis results
		`CREATE TABLE IF NOT EXISTS analysis_results (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
			analysis JSONB NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(owner, repo, pr_number)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_analysis_results_repo ON analysis_results(owner, repo)`,

		// PR comments
		`CREATE TABLE IF NOT EXISTS pr_comments (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
			comments JSONB NOT NULL,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(owner, repo, pr_number)
		)`,

		// Decision timeline
		`CREATE TABLE IF NOT EXISTS decision_timeline (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL,
			function_name TEXT NOT NULL, file_path TEXT NOT NULL,
			pr_number INTEGER NOT NULL, change_type TEXT NOT NULL,
			summary TEXT NOT NULL, 
			decision TEXT DEFAULT '', reason TEXT DEFAULT '',
			tradeoff TEXT DEFAULT '', evidence TEXT DEFAULT '',
			confidence DOUBLE PRECISION DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_timeline_function ON decision_timeline(owner, repo, function_name)`,

		// ── Normalized tables (Phase 2 spec) ───────────────────────

		// Registered repos
		`CREATE TABLE IF NOT EXISTS registered_repos (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL,
			status TEXT DEFAULT 'active',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(owner, repo)
		)`,

		// Normalized pull requests
		`CREATE TABLE IF NOT EXISTS pull_requests (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
			title TEXT NOT NULL, body TEXT DEFAULT '',
			author TEXT DEFAULT '', state TEXT DEFAULT 'open',
			merged_at TEXT DEFAULT '',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(owner, repo, pr_number)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_pr_repo ON pull_requests(owner, repo)`,

		// Normalized issues
		`CREATE TABLE IF NOT EXISTS issues (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL, number INTEGER NOT NULL,
			title TEXT NOT NULL, body TEXT DEFAULT '',
			state TEXT DEFAULT 'open',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(owner, repo, number)
		)`,

		// Normalized functions (the core Eigenstate table)
		`CREATE TABLE IF NOT EXISTS functions (
			id SERIAL PRIMARY KEY,
			owner TEXT NOT NULL, repo TEXT NOT NULL,
			file_path TEXT NOT NULL, name TEXT NOT NULL,
			language TEXT DEFAULT 'unknown',
			change_type TEXT NOT NULL,
			pr_number INTEGER NOT NULL,
			summary TEXT DEFAULT '',
			decision TEXT DEFAULT '', reason TEXT DEFAULT '',
			tradeoff TEXT DEFAULT '', evidence TEXT DEFAULT '',
			confidence DOUBLE PRECISION DEFAULT 0,
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_functions_name ON functions(owner, repo, name)`,
		`CREATE INDEX IF NOT EXISTS idx_functions_file ON functions(owner, repo, file_path)`,

		// Python processing events queue
		`CREATE TABLE IF NOT EXISTS processing_events (
			id SERIAL PRIMARY KEY,
			event_type TEXT NOT NULL,
			owner TEXT NOT NULL, repo TEXT NOT NULL, pr_number INTEGER NOT NULL,
			payload JSONB DEFAULT '{}',
			status TEXT DEFAULT 'pending',
			created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_processing_events_status ON processing_events(status)`,
	}

	for i, m := range migrations {
		_, err := d.pool.Exec(ctx, m)
		if err != nil {
			slog.Error("Migration failed", "index", i, "error", err)
			return err
		}
	}

	slog.Info("Auto-migrations complete", "tables", 9, "indexes", 8)
	return nil
}
