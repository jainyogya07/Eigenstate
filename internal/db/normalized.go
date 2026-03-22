package db

import (
	"context"
	"fmt"
)

// ── Repo Registration ──────────────────────────────────────────────

type RegisteredRepo struct {
	ID        int    `json:"id"`
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
}

func (d *DB) RegisterRepo(ctx context.Context, owner, repo string) (*RegisteredRepo, error) {
	query := `
		INSERT INTO registered_repos (owner, repo, status)
		VALUES ($1, $2, 'active')
		ON CONFLICT (owner, repo) DO UPDATE SET status = 'active'
		RETURNING id, owner, repo, status, created_at
	`
	var r RegisteredRepo
	var createdAt interface{}
	err := d.pool.QueryRow(ctx, query, owner, repo).Scan(&r.ID, &r.Owner, &r.Repo, &r.Status, &createdAt)
	if err != nil {
		return nil, fmt.Errorf("failed to register repo: %w", err)
	}
	r.CreatedAt = fmt.Sprintf("%v", createdAt)
	return &r, nil
}

func (d *DB) ListRepos(ctx context.Context) ([]RegisteredRepo, error) {
	rows, err := d.pool.Query(ctx, `SELECT id, owner, repo, status, created_at FROM registered_repos ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var repos []RegisteredRepo
	for rows.Next() {
		var r RegisteredRepo
		var ca interface{}
		rows.Scan(&r.ID, &r.Owner, &r.Repo, &r.Status, &ca)
		r.CreatedAt = fmt.Sprintf("%v", ca)
		repos = append(repos, r)
	}
	return repos, nil
}

// ── Normalized Pull Requests ───────────────────────────────────────

type NormalizedPR struct {
	ID        int    `json:"id"`
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	PRNumber  int    `json:"pr_number"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Author    string `json:"author"`
	State     string `json:"state"`
	CreatedAt string `json:"created_at"`
	MergedAt  string `json:"merged_at,omitempty"`
}

func (d *DB) SaveNormalizedPR(ctx context.Context, pr NormalizedPR) error {
	query := `
		INSERT INTO pull_requests (owner, repo, pr_number, title, body, author, state, merged_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (owner, repo, pr_number)
		DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, state = EXCLUDED.state, merged_at = EXCLUDED.merged_at
	`
	_, err := d.pool.Exec(ctx, query, pr.Owner, pr.Repo, pr.PRNumber, pr.Title, pr.Body, pr.Author, pr.State, pr.MergedAt)
	return err
}

func (d *DB) GetPullRequests(ctx context.Context, owner, repo string) ([]NormalizedPR, error) {
	rows, err := d.pool.Query(ctx, `
		SELECT id, owner, repo, pr_number, title, body, author, state, created_at, COALESCE(merged_at, '')
		FROM pull_requests WHERE owner = $1 AND repo = $2 ORDER BY pr_number DESC`, owner, repo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var prs []NormalizedPR
	for rows.Next() {
		var p NormalizedPR
		var ca interface{}
		rows.Scan(&p.ID, &p.Owner, &p.Repo, &p.PRNumber, &p.Title, &p.Body, &p.Author, &p.State, &ca, &p.MergedAt)
		p.CreatedAt = fmt.Sprintf("%v", ca)
		prs = append(prs, p)
	}
	return prs, nil
}

// ── Normalized Issues ──────────────────────────────────────────────

type NormalizedIssue struct {
	ID        int    `json:"id"`
	Owner     string `json:"owner"`
	Repo      string `json:"repo"`
	Number    int    `json:"number"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	State     string `json:"state"`
	CreatedAt string `json:"created_at"`
}

func (d *DB) SaveNormalizedIssue(ctx context.Context, issue NormalizedIssue) error {
	query := `
		INSERT INTO issues (owner, repo, number, title, body, state)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (owner, repo, number) 
		DO UPDATE SET title = EXCLUDED.title, state = EXCLUDED.state
	`
	_, err := d.pool.Exec(ctx, query, issue.Owner, issue.Repo, issue.Number, issue.Title, issue.Body, issue.State)
	return err
}

// ── Normalized Functions ───────────────────────────────────────────

type NormalizedFunction struct {
	ID         int     `json:"id"`
	Owner      string  `json:"owner"`
	Repo       string  `json:"repo"`
	FilePath   string  `json:"file_path"`
	Name       string  `json:"name"`
	Language   string  `json:"language"`
	ChangeType string  `json:"change_type"`
	PRNumber   int     `json:"pr_number"`
	Summary    string  `json:"summary"`
	Decision   string  `json:"decision"`
	Reason     string  `json:"reason"`
	Tradeoff   string  `json:"tradeoff"`
	Evidence   string  `json:"evidence"`
	Confidence float64 `json:"confidence"`
	CreatedAt  string  `json:"created_at"`
}

func (d *DB) SaveNormalizedFunction(ctx context.Context, fn NormalizedFunction) error {
	query := `
		INSERT INTO functions (owner, repo, file_path, name, language, change_type, pr_number, summary, decision, reason, tradeoff, evidence, confidence)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`
	_, err := d.pool.Exec(ctx, query, fn.Owner, fn.Repo, fn.FilePath, fn.Name, fn.Language, fn.ChangeType, fn.PRNumber, fn.Summary, fn.Decision, fn.Reason, fn.Tradeoff, fn.Evidence, fn.Confidence)
	return err
}

// ── Spec Queries: /why, /lineage, /functions ───────────────────────

// WhyResult explains "why was this function changed?"
type WhyResult struct {
	FunctionName string             `json:"function_name"`
	FilePath     string             `json:"file_path"`
	Changes      []FunctionDecision `json:"changes"`
}

type FunctionDecision struct {
	Name       string  `json:"name,omitempty"`
	FilePath   string  `json:"file_path,omitempty"`
	PRNumber   int     `json:"pr_number"`
	PRTitle    string  `json:"pr_title"`
	ChangeType string  `json:"change_type"`
	Summary    string  `json:"summary"`
	Decision   string  `json:"decision"`
	Reason     string  `json:"reason"`
	Tradeoff   string  `json:"tradeoff"`
	Evidence   string  `json:"evidence"`
	Confidence float64 `json:"confidence"`
	Author     string  `json:"author"`
	Date       string  `json:"date"`
}

// QueryWhy answers "Why was this function changed?" by joining functions + pull_requests.
// filePath, if non-empty, restricts to that path so the same symbol name in different files does not mix rows.
func (d *DB) QueryWhy(ctx context.Context, owner, repo, functionName, filePath string) (*WhyResult, error) {
	query := `
		SELECT f.file_path, f.change_type, f.pr_number, f.summary, f.decision, f.reason, f.tradeoff, f.evidence, f.confidence, f.created_at,
		       COALESCE(p.title, ''), COALESCE(p.author, '')
		FROM functions f
		LEFT JOIN pull_requests p ON f.owner = p.owner AND f.repo = p.repo AND f.pr_number = p.pr_number
		WHERE f.owner = $1 AND f.repo = $2 AND f.name = $3`
	args := []interface{}{owner, repo, functionName}
	if filePath != "" {
		query += ` AND f.file_path = $4`
		args = append(args, filePath)
	}
	query += `
		ORDER BY f.created_at ASC
	`
	rows, err := d.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("why query failed: %w", err)
	}
	defer rows.Close()

	result := &WhyResult{FunctionName: functionName}
	for rows.Next() {
		var d FunctionDecision
		var ca interface{}
		err := rows.Scan(&result.FilePath, &d.ChangeType, &d.PRNumber, &d.Summary, &d.Decision, &d.Reason, &d.Tradeoff, &d.Evidence, &d.Confidence, &ca, &d.PRTitle, &d.Author)
		if err != nil {
			return nil, err
		}
		d.Date = fmt.Sprintf("%v", ca)
		result.Changes = append(result.Changes, d)
	}
	return result, nil
}

// QueryLineage returns the ordered decision timeline for a repo.
func (d *DB) QueryLineage(ctx context.Context, owner, repo string, limit int) ([]FunctionDecision, error) {
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT f.name, f.file_path, f.change_type, f.pr_number, f.summary, f.decision, f.reason, f.tradeoff, f.evidence, f.confidence, f.created_at,
		       COALESCE(p.title, ''), COALESCE(p.author, '')
		FROM functions f
		LEFT JOIN pull_requests p ON f.owner = p.owner AND f.repo = p.repo AND f.pr_number = p.pr_number
		WHERE f.owner = $1 AND f.repo = $2
		ORDER BY f.created_at DESC
		LIMIT $3
	`
	rows, err := d.pool.Query(ctx, query, owner, repo, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var timeline []FunctionDecision
	for rows.Next() {
		var d FunctionDecision
		var name, filePath string
		var ca interface{}
		rows.Scan(&name, &filePath, &d.ChangeType, &d.PRNumber, &d.Summary, &d.Decision, &d.Reason, &d.Tradeoff, &d.Evidence, &d.Confidence, &ca, &d.PRTitle, &d.Author)
		d.Date = fmt.Sprintf("%v", ca)
		d.Name = name
		d.FilePath = filePath
		d.Summary = fmt.Sprintf("[%s] %s in %s: %s", d.ChangeType, name, filePath, d.Summary)
		timeline = append(timeline, d)
	}
	return timeline, nil
}

// FunctionEntry represents a function with its analysis metadata.
type FunctionEntry struct {
	Name       string  `json:"name"`
	Confidence float64 `json:"confidence"`
}

// FileTreeEntry returns the file tree of known functions for a repo.
type FileTreeEntry struct {
	FilePath  string          `json:"file_path"`
	Language  string          `json:"language"`
	Functions []FunctionEntry `json:"functions"`
}

func (d *DB) QueryFunctions(ctx context.Context, owner, repo string) ([]FileTreeEntry, error) {
	query := `
		SELECT file_path, name, language, MAX(confidence) as confidence
		FROM functions
		WHERE owner = $1 AND repo = $2
		GROUP BY file_path, name, language
		ORDER BY file_path, name
	`
	rows, err := d.pool.Query(ctx, query, owner, repo)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	fileMap := make(map[string]*FileTreeEntry)
	var order []string
	for rows.Next() {
		var fp, name, lang string
		var conf float64
		if err := rows.Scan(&fp, &name, &lang, &conf); err != nil {
			return nil, err
		}

		if _, ok := fileMap[fp]; !ok {
			fileMap[fp] = &FileTreeEntry{FilePath: fp, Language: lang, Functions: []FunctionEntry{}}
			order = append(order, fp)
		}
		fileMap[fp].Functions = append(fileMap[fp].Functions, FunctionEntry{
			Name:       name,
			Confidence: conf,
		})
	}

	var result []FileTreeEntry
	for _, fp := range order {
		result = append(result, *fileMap[fp])
	}
	return result, nil
}
