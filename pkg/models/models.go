package models

import "time"

// Function represents a code block (e.g., a Go function).
type Function struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	FilePath  string    `json:"file_path"`
	StartLine int       `json:"start_line"`
	EndLine   int       `json:"end_line"`
	CreatedAt time.Time `json:"created_at"`
}

// Decision represents a reconstructed engineering decision.
type Decision struct {
	ID              string    `json:"id"`
	FunctionID      string    `json:"function_id"`
	PRID            string    `json:"pr_id"`
	IssueID         string    `json:"issue_id"`
	ConfidenceScore float64   `json:"confidence_score"`
	Summary         string    `json:"summary"`
	Evidence        []string  `json:"evidence"`
	CreatedAt       time.Time `json:"created_at"`
}
