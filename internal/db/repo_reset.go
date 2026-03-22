package db

import (
	"context"
	"fmt"
)

// DeleteRepoIngestData removes all ingestion-derived rows for a repository.
// registered_repos is kept so the workspace still lists the repo.
func (d *DB) DeleteRepoIngestData(ctx context.Context, owner, repo string) error {
	if d == nil || d.pool == nil {
		return fmt.Errorf("database not connected")
	}
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	deletes := []string{
		`DELETE FROM functions WHERE owner = $1 AND repo = $2`,
		`DELETE FROM decision_timeline WHERE owner = $1 AND repo = $2`,
		`DELETE FROM pull_requests WHERE owner = $1 AND repo = $2`,
		`DELETE FROM issues WHERE owner = $1 AND repo = $2`,
		`DELETE FROM raw_ingestions WHERE owner = $1 AND repo = $2`,
		`DELETE FROM analysis_results WHERE owner = $1 AND repo = $2`,
		`DELETE FROM pr_comments WHERE owner = $1 AND repo = $2`,
		`DELETE FROM processing_events WHERE owner = $1 AND repo = $2`,
	}
	for _, q := range deletes {
		if _, err := tx.Exec(ctx, q, owner, repo); err != nil {
			return fmt.Errorf("delete repo data: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// DeleteRegisteredRepo removes a row from registered_repos (workspace list).
func (d *DB) DeleteRegisteredRepo(ctx context.Context, owner, repo string) error {
	if d == nil || d.pool == nil {
		return fmt.Errorf("database not connected")
	}
	_, err := d.pool.Exec(ctx, `DELETE FROM registered_repos WHERE owner = $1 AND repo = $2`, owner, repo)
	return err
}

// ClearRepoWorkspace deletes all ingest-derived data and unregisters the repository.
func (d *DB) ClearRepoWorkspace(ctx context.Context, owner, repo string) error {
	if err := d.DeleteRepoIngestData(ctx, owner, repo); err != nil {
		return err
	}
	if err := d.DeleteRegisteredRepo(ctx, owner, repo); err != nil {
		return fmt.Errorf("unregister repo: %w", err)
	}
	return nil
}

// DeleteAllWorkspaceData removes every row from ingest and registration tables (full reset).
func (d *DB) DeleteAllWorkspaceData(ctx context.Context) error {
	if d == nil || d.pool == nil {
		return fmt.Errorf("database not connected")
	}
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	stmts := []string{
		`DELETE FROM functions`,
		`DELETE FROM decision_timeline`,
		`DELETE FROM pull_requests`,
		`DELETE FROM issues`,
		`DELETE FROM raw_ingestions`,
		`DELETE FROM analysis_results`,
		`DELETE FROM pr_comments`,
		`DELETE FROM processing_events`,
		`DELETE FROM registered_repos`,
	}
	for _, q := range stmts {
		if _, err := tx.Exec(ctx, q); err != nil {
			return fmt.Errorf("workspace wipe: %s: %w", q, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}
