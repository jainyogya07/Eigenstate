package db

import (
	"context"
	"fmt"
)

// TimelineEntry represents a function-level decision in the timeline.
type TimelineEntry struct {
	ID           int     `json:"id"`
	Owner        string  `json:"owner"`
	Repo         string  `json:"repo"`
	FunctionName string  `json:"function_name"`
	FilePath     string  `json:"file_path"`
	PRNumber     int     `json:"pr_number"`
	ChangeType   string  `json:"change_type"`
	Summary      string  `json:"summary"`
	Decision     string  `json:"decision"`
	Reason       string  `json:"reason"`
	Tradeoff     string  `json:"tradeoff"`
	Evidence     string  `json:"evidence"`
	Confidence   float64 `json:"confidence"`
	CreatedAt    string  `json:"created_at"`
}

// SaveTimelineEntry stores a function-level decision event.
func (d *DB) SaveTimelineEntry(ctx context.Context, entry TimelineEntry) error {
	query := `
		INSERT INTO decision_timeline (owner, repo, function_name, file_path, pr_number, change_type, summary, decision, reason, tradeoff, evidence, confidence)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err := d.pool.Exec(ctx, query, entry.Owner, entry.Repo, entry.FunctionName,
		entry.FilePath, entry.PRNumber, entry.ChangeType, entry.Summary, entry.Decision, entry.Reason, entry.Tradeoff, entry.Evidence, entry.Confidence)
	if err != nil {
		return fmt.Errorf("failed to save timeline entry: %w", err)
	}
	return nil
}

// GetFunctionTimeline retrieves the decision history for a specific function.
func (d *DB) GetFunctionTimeline(ctx context.Context, owner, repo, functionName string) ([]TimelineEntry, error) {
	query := `
		SELECT id, owner, repo, function_name, file_path, pr_number, change_type, summary, decision, reason, tradeoff, evidence, confidence, created_at
		FROM decision_timeline
		WHERE owner = $1 AND repo = $2 AND function_name = $3
		ORDER BY created_at ASC
	`
	rows, err := d.pool.Query(ctx, query, owner, repo, functionName)
	if err != nil {
		return nil, fmt.Errorf("failed to query timeline: %w", err)
	}
	defer rows.Close()

	var entries []TimelineEntry
	for rows.Next() {
		var e TimelineEntry
		var createdAt interface{}
		err := rows.Scan(&e.ID, &e.Owner, &e.Repo, &e.FunctionName, &e.FilePath,
			&e.PRNumber, &e.ChangeType, &e.Summary, &e.Decision, &e.Reason, &e.Tradeoff, &e.Evidence, &e.Confidence, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan timeline entry: %w", err)
		}
		e.CreatedAt = fmt.Sprintf("%v", createdAt)
		entries = append(entries, e)
	}
	return entries, nil
}

// GetFileTimeline retrieves the decision history for a specific file.
func (d *DB) GetFileTimeline(ctx context.Context, owner, repo, filePath string) ([]TimelineEntry, error) {
	query := `
		SELECT id, owner, repo, function_name, file_path, pr_number, change_type, summary, decision, reason, tradeoff, evidence, confidence, created_at
		FROM decision_timeline
		WHERE owner = $1 AND repo = $2 AND file_path = $3
		ORDER BY created_at ASC
	`
	rows, err := d.pool.Query(ctx, query, owner, repo, filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to query file timeline: %w", err)
	}
	defer rows.Close()

	var entries []TimelineEntry
	for rows.Next() {
		var e TimelineEntry
		var createdAt interface{}
		err := rows.Scan(&e.ID, &e.Owner, &e.Repo, &e.FunctionName, &e.FilePath,
			&e.PRNumber, &e.ChangeType, &e.Summary, &e.Decision, &e.Reason, &e.Tradeoff, &e.Evidence, &e.Confidence, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan timeline entry: %w", err)
		}
		e.CreatedAt = fmt.Sprintf("%v", createdAt)
		entries = append(entries, e)
	}
	return entries, nil
}

// SearchAnalyses performs a full-text search across analysis results.
func (d *DB) SearchAnalyses(ctx context.Context, owner, repo, query string) ([]map[string]interface{}, error) {
	sqlQuery := `
		SELECT pr_number, analysis, created_at
		FROM analysis_results
		WHERE owner = $1 AND repo = $2
		  AND analysis::text ILIKE '%' || $3 || '%'
		ORDER BY created_at DESC
		LIMIT 20
	`
	rows, err := d.pool.Query(ctx, sqlQuery, owner, repo, query)
	if err != nil {
		return nil, fmt.Errorf("failed to search analyses: %w", err)
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		var prNumber int
		var analysis []byte
		var createdAt interface{}
		if err := rows.Scan(&prNumber, &analysis, &createdAt); err != nil {
			return nil, fmt.Errorf("failed to scan search result: %w", err)
		}
		results = append(results, map[string]interface{}{
			"pr_number":  prNumber,
			"analysis":   string(analysis),
			"created_at": fmt.Sprintf("%v", createdAt),
		})
	}
	return results, nil
}
