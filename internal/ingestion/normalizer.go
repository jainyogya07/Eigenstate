package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strings"

	"github.com/eigenstate/eigenstate/internal/db"
	"github.com/eigenstate/eigenstate/internal/intelligence"
)

// Normalizer converts raw ingested data into normalized records.
type Normalizer struct {
	database *db.DB
}

func NewNormalizer(database *db.DB) *Normalizer {
	return &Normalizer{database: database}
}

// NormalizePR creates normalized pull_requests, functions, and timeline records.
func (n *Normalizer) NormalizePR(svc *IngestService, owner, repo string, prNumber int, title, body, author, state, mergedAt, diff string, analysisResult *intelligence.PythonAnalysisResult) {
	if n.database == nil {
		return
	}
	ctx := svc.ctx

	// Save normalized PR
	pr := db.NormalizedPR{
		Owner: owner, Repo: repo, PRNumber: prNumber,
		Title: title, Body: body, Author: author,
		State: state, MergedAt: mergedAt,
	}
	if err := n.database.SaveNormalizedPR(ctx, pr); err != nil {
		slog.Error("Failed to save normalized PR", "pr", prNumber, "error", err)
	}

	// Extract linked issues from PR body and title
	n.extractLinkedIssues(svc, owner, repo, title+" "+body)

	// Save function records from Python analysis
	if analysisResult != nil {
		heuristic := analysisIsHeuristic(analysisResult)
		for _, fnName := range analysisResult.ChangedFunctions {
			filePath := "unknown"
			if analysisResult.ChangedFunctionFiles != nil {
				if fp, ok := analysisResult.ChangedFunctionFiles[fnName]; ok && fp != "" {
					filePath = fp
				}
			}
			lang := detectLanguage(filePath)
			summary := "Function " + fnName + " changed in PR: " + title

			decision := analysisResult.Decision
			reason := analysisResult.Reason
			tradeoff := analysisResult.Tradeoff
			evidence := analysisResult.SuggestedPRDesc
			confidence := float64(analysisResult.ConfidenceScore) / 100.0

			if heuristic {
				decision, reason, tradeoff, evidence, confidence = perFunctionHeuristic(fnName, filePath, title, prNumber, diff)
			} else {
				decision, reason, tradeoff = specializeLLMPerFunction(fnName, filePath, analysisResult)
				if strings.TrimSpace(evidence) == "" {
					p := patchForPath(diff, filePath)
					a, r := countPatchLineStats(p)
					if p == "" {
						a, r = aggregateDiffStats(diff)
					}
					evidence = fmt.Sprintf("Patch footprint for `%s`: +%d / −%d lines in indexed file.", fnName, a, r)
				}
			}

			nf := db.NormalizedFunction{
				Owner: owner, Repo: repo,
				FilePath: filePath, Name: fnName,
				Language: lang, ChangeType: "modified",
				PRNumber: prNumber, Summary: summary,
				Decision: decision, Reason: reason,
				Tradeoff: tradeoff, Evidence: evidence,
				Confidence: confidence,
			}
			if err := n.database.SaveNormalizedFunction(ctx, nf); err != nil {
				slog.Error("Failed to save normalized function", "fn", fnName, "error", err)
			}

			// Also save to decision timeline
			entry := db.TimelineEntry{
				Owner: owner, Repo: repo,
				FunctionName: fnName, FilePath: filePath,
				PRNumber: prNumber, ChangeType: "modified",
				Summary:  summary,
				Decision: decision, Reason: reason,
				Tradeoff: tradeoff, Evidence: evidence,
				Confidence: confidence,
			}
			n.database.SaveTimelineEntry(ctx, entry)
		}
	}

	// Emit Python processing event
	n.emitProcessingEvent(ctx, owner, repo, prNumber, "ingestion_complete")

	numFunctions := 0
	if analysisResult != nil {
		numFunctions = len(analysisResult.ChangedFunctions)
	}

	slog.Info("Normalization complete", "pr", prNumber,
		"functions", numFunctions)
}

func (n *Normalizer) extractLinkedIssues(svc *IngestService, owner, repo, text string) {
	// Match patterns like #123, fixes #456, closes #789
	re := regexp.MustCompile(`#(\d+)`)
	matches := re.FindAllStringSubmatch(text, -1)

	seen := make(map[string]bool)
	for _, match := range matches {
		numStr := match[1]
		if seen[numStr] {
			continue
		}
		seen[numStr] = true

		// Try to fetch the issue from GitHub
		var issueNum int
		if _, err := json.Number(numStr).Int64(); err == nil {
			num, _ := json.Number(numStr).Int64()
			issueNum = int(num)
		}
		if issueNum > 0 {
			issue, _, err := svc.client.Issues.Get(svc.ctx, owner, repo, issueNum)
			if err == nil && issue != nil {
				ni := db.NormalizedIssue{
					Owner: owner, Repo: repo, Number: issueNum,
					Title: issue.GetTitle(), Body: issue.GetBody(),
					State: issue.GetState(),
				}
				n.database.SaveNormalizedIssue(svc.ctx, ni)
				slog.Info("Linked issue saved", "issue", issueNum)
			}
		}
	}
}

func (n *Normalizer) emitProcessingEvent(ctx context.Context, owner, repo string, prNumber int, eventType string) {
	// This is a placeholder — in production, use a message queue.
	// For the hackathon, we write to a processing_events table that Python can poll.
	if n.database == nil {
		return
	}
	n.database.EmitEvent(eventType, owner, repo, prNumber)
}

func detectLanguage(filePath string) string {
	switch {
	case strings.HasSuffix(filePath, ".go"):
		return "Go"
	case strings.HasSuffix(filePath, ".py"):
		return "Python"
	case strings.HasSuffix(filePath, ".rs"):
		return "Rust"
	case strings.HasSuffix(filePath, ".js"), strings.HasSuffix(filePath, ".jsx"):
		return "JavaScript"
	case strings.HasSuffix(filePath, ".ts"), strings.HasSuffix(filePath, ".tsx"):
		return "TypeScript"
	case strings.HasSuffix(filePath, ".rb"):
		return "Ruby"
	case strings.HasSuffix(filePath, ".java"):
		return "Java"
	default:
		return "Other"
	}
}
