package intelligence

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// PythonAnalysisRequest reflects the schema of the FastAPI process endpoint.
type PythonAnalysisRequest struct {
	PR       PRPayload     `json:"pr"`
	Issue    *IssuePayload `json:"issue,omitempty"`
	LaterPRs []LaterPR     `json:"later_prs,omitempty"`
}

type PRPayload struct {
	Repo          string           `json:"repo"`
	PRNumber      int              `json:"pr_number"`
	Title         string           `json:"title"`
	Body          string           `json:"body"`
	CommitMessage string           `json:"commit_message"`
	MergedAt      *time.Time       `json:"merged_at,omitempty"`
	Comments      []CommentPayload `json:"comments"`
	DiffFiles     []DiffFile       `json:"diff_files"`
}

type CommentPayload struct {
	Body string `json:"body"`
}

type DiffFile struct {
	Filename string `json:"filename"`
	Patch    string `json:"patch"`
	Source   string `json:"source,omitempty"`
}

type IssuePayload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

type LaterPR struct {
	PRNumber         int       `json:"pr_number"`
	Title            string    `json:"title"`
	MergedAt         time.Time `json:"merged_at"`
	ChangedFunctions []string  `json:"changed_functions"`
	ChangedFiles     []string  `json:"changed_files"`
}

// PythonAnalysisResult represents the JSON response from the Python API.
type PythonAnalysisResult struct {
	Status               string            `json:"status"`
	Repo                 string            `json:"repo"`
	PRNumber             int               `json:"pr_number"`
	ConfidenceLevel      string            `json:"confidence_level"`
	ConfidenceScore      int               `json:"confidence_score"`
	Decision             string            `json:"decision"`
	Reason               string            `json:"reason"`
	Tradeoff             string            `json:"tradeoff"`
	SuggestedPRDesc      string            `json:"suggested_pr_desc"`
	ChangedFunctions     []string          `json:"changed_functions"`
	ChangedFunctionFiles map[string]string `json:"changed_function_files,omitempty"`
	IsStale              bool              `json:"is_stale"`
	StalenessWarning     string            `json:"staleness_warning"`
	DecisionID           string            `json:"decision_id"`
}

// Client wraps HTTP interactions with the Python Intelligence Layer.
type Client struct {
	httpClient *http.Client
}

func NewClient(httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{httpClient: httpClient}
}

// ProcessWithPython calls the Python intelligence layer to analyze a PR.
func (c *Client) ProcessWithPython(ctx context.Context, reqBody PythonAnalysisRequest) (*PythonAnalysisResult, error) {
	apiURL := os.Getenv("PYTHON_INTEL_URL")
	if apiURL == "" {
		// Default matches `python api.py` / uvicorn on port 8000
		apiURL = "http://127.0.0.1:8000/process"
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call python API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("python API returned non-OK status: %d, body: %s", resp.StatusCode, string(body))
	}

	var result PythonAnalysisResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode python response: %w", err)
	}

	return &result, nil
}
