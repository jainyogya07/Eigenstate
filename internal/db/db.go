package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DB handles PostgreSQL connection pool and operations.
type DB struct {
	pool *pgxpool.Pool
}

// NewDB creates a connection pool to PostgreSQL using DATABASE_URL.
func NewDB(ctx context.Context) (*DB, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return nil, fmt.Errorf("DATABASE_URL not set")
	}

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Connection pool tuning
	config.MaxConns = 20
	config.MinConns = 5

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Verify connectivity
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{pool: pool}, nil
}

// Close closes the connection pool.
func (d *DB) Close(_ context.Context) error {
	d.pool.Close()
	return nil
}

// SaveIngestion saves raw PR metadata and diff to the database.
func (d *DB) SaveIngestion(ctx context.Context, owner, repo string, prNumber int, metadata []byte, diff string) error {
	query := `
		INSERT INTO raw_ingestions (owner, repo, pr_number, metadata, diff, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)
		ON CONFLICT (owner, repo, pr_number) 
		DO UPDATE SET 
			metadata = EXCLUDED.metadata,
			diff = EXCLUDED.diff,
			status = 'pending',
			updated_at = CURRENT_TIMESTAMP
	`
	_, err := d.pool.Exec(ctx, query, owner, repo, prNumber, metadata, diff)
	if err != nil {
		return fmt.Errorf("failed to save ingestion: %w", err)
	}
	return nil
}

// SaveAnalysis saves Rust intelligence analysis results to the database.
func (d *DB) SaveAnalysis(ctx context.Context, owner, repo string, prNumber int, analysis []byte) error {
	query := `
		INSERT INTO analysis_results (owner, repo, pr_number, analysis)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (owner, repo, pr_number) 
		DO UPDATE SET analysis = EXCLUDED.analysis
	`
	_, err := d.pool.Exec(ctx, query, owner, repo, prNumber, analysis)
	if err != nil {
		return fmt.Errorf("failed to save analysis: %w", err)
	}
	return nil
}

// SavePRComments saves PR review comments.
func (d *DB) SavePRComments(ctx context.Context, owner, repo string, prNumber int, comments []byte) error {
	query := `
		INSERT INTO pr_comments (owner, repo, pr_number, comments)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (owner, repo, pr_number) 
		DO UPDATE SET comments = EXCLUDED.comments
	`
	_, err := d.pool.Exec(ctx, query, owner, repo, prNumber, comments)
	if err != nil {
		return fmt.Errorf("failed to save PR comments: %w", err)
	}
	return nil
}

// Ingestion represents a raw metadata ingestion record.
type Ingestion struct {
	ID        int    `json:"id"`
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	PRNumber  int    `json:"pr_number"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

// GetRecentIngestions returns the most recent ingestion records.
func (d *DB) GetRecentIngestions(ctx context.Context) ([]Ingestion, error) {
	query := `
		SELECT id, owner, repo, pr_number, status, created_at
		FROM raw_ingestions
		ORDER BY created_at DESC
		LIMIT 50
	`
	rows, err := d.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query ingestions: %w", err)
	}
	defer rows.Close()

	var ingestions []Ingestion
	for rows.Next() {
		var i Ingestion
		var createdAt interface{}
		err := rows.Scan(&i.ID, &i.Owner, &i.Repo, &i.PRNumber, &i.Status, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan ingestion: %w", err)
		}
		i.CreatedAt = fmt.Sprintf("%v", createdAt)
		ingestions = append(ingestions, i)
	}

	return ingestions, nil
}

// GetPRLastUpdated returns the last updated timestamp for a PR ingestion.
func (d *DB) GetPRLastUpdated(ctx context.Context, owner, repo string, prNumber int) (time.Time, error) {
	query := `SELECT updated_at FROM raw_ingestions WHERE owner = $1 AND repo = $2 AND pr_number = $3`
	var lastUpdated time.Time
	err := d.pool.QueryRow(ctx, query, owner, repo, prNumber).Scan(&lastUpdated)
	if err != nil {
		return time.Time{}, err
	}
	return lastUpdated, nil
}

// GetAnalysis retrieves analysis results for a specific PR.
func (d *DB) GetAnalysis(ctx context.Context, owner, repo string, prNumber int) ([]byte, error) {
	query := `SELECT analysis FROM analysis_results WHERE owner = $1 AND repo = $2 AND pr_number = $3`
	var analysis []byte
	err := d.pool.QueryRow(ctx, query, owner, repo, prNumber).Scan(&analysis)
	if err != nil {
		return nil, fmt.Errorf("failed to get analysis: %w", err)
	}
	return analysis, nil
}

// GetAllAnalyses retrieves all analysis results for a repo.
func (d *DB) GetAllAnalyses(ctx context.Context, owner, repo string) ([]map[string]interface{}, error) {
	query := `
		SELECT pr_number, analysis, created_at 
		FROM analysis_results 
		WHERE owner = $1 AND repo = $2
		ORDER BY created_at DESC
	`
	rows, err := d.pool.Query(ctx, query, owner, repo)
	if err != nil {
		return nil, fmt.Errorf("failed to query analyses: %w", err)
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var prNumber int
		var analysis []byte
		var createdAt interface{}
		if err := rows.Scan(&prNumber, &analysis, &createdAt); err != nil {
			return nil, fmt.Errorf("failed to scan analysis: %w", err)
		}
		results = append(results, map[string]interface{}{
			"pr_number":  prNumber,
			"analysis":   string(analysis),
			"created_at": fmt.Sprintf("%v", createdAt),
		})
	}
	return results, nil
}

// GetStats returns ingestion statistics.
func (d *DB) GetStats(ctx context.Context) (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	var totalIngestions int
	err := d.pool.QueryRow(ctx, "SELECT COUNT(*) FROM raw_ingestions").Scan(&totalIngestions)
	if err != nil {
		return nil, err
	}
	stats["total_ingestions"] = totalIngestions

	var totalAnalyses int
	err = d.pool.QueryRow(ctx, "SELECT COUNT(*) FROM analysis_results").Scan(&totalAnalyses)
	if err != nil {
		return nil, err
	}
	stats["total_analyses"] = totalAnalyses

	var pendingIngestions int
	err = d.pool.QueryRow(ctx, "SELECT COUNT(*) FROM raw_ingestions WHERE status = 'pending'").Scan(&pendingIngestions)
	if err != nil {
		return nil, err
	}
	stats["pending_ingestions"] = pendingIngestions

	return stats, nil
}

// EmitEvent writes an event to the processing_events table for the Python layer to pick up.
func (d *DB) EmitEvent(eventType, owner, repo string, prNumber int) error {
	query := `
		INSERT INTO processing_events (event_type, owner, repo, pr_number, status)
		VALUES ($1, $2, $3, $4, 'pending')
	`
	_, err := d.pool.Exec(context.Background(), query, eventType, owner, repo, prNumber)
	if err != nil {
		return fmt.Errorf("failed to emit processing event: %w", err)
	}
	return nil
}
