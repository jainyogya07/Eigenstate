package ingestion

import (
	"fmt"
	"hash/fnv"
	"path"
	"strings"

	"github.com/eigenstate/eigenstate/internal/intelligence"
)

func analysisIsHeuristic(r *intelligence.PythonAnalysisResult) bool {
	if r == nil {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(r.ConfidenceLevel), "HEURISTIC") {
		return true
	}
	return strings.Contains(strings.ToLower(r.Reason), "patch heuristics")
}

func patchForPath(diff, filePath string) string {
	if filePath == "" || filePath == "unknown" {
		return ""
	}
	files := ParseDiffFiles(diff)
	for _, df := range files {
		if df.Filename == filePath {
			return df.Patch
		}
	}
	for _, df := range files {
		if strings.HasSuffix(df.Filename, filePath) || strings.HasSuffix(filePath, df.Filename) {
			return df.Patch
		}
	}
	base := path.Base(filePath)
	for _, df := range files {
		if path.Base(df.Filename) == base {
			return df.Patch
		}
	}
	return ""
}

func countPatchLineStats(patch string) (added, removed int) {
	for _, line := range strings.Split(patch, "\n") {
		if len(line) == 0 {
			continue
		}
		switch line[0] {
		case '+':
			if strings.HasPrefix(line, "+++") {
				continue
			}
			added++
		case '-':
			if strings.HasPrefix(line, "---") {
				continue
			}
			removed++
		}
	}
	return added, removed
}

func aggregateDiffStats(diff string) (added, removed int) {
	for _, df := range ParseDiffFiles(diff) {
		a, r := countPatchLineStats(df.Patch)
		added += a
		removed += r
	}
	return added, removed
}

func fnMentionedInAddedLines(patch, fnName string) bool {
	if patch == "" || fnName == "" {
		return false
	}
	for _, line := range strings.Split(patch, "\n") {
		if !strings.HasPrefix(line, "+") || strings.HasPrefix(line, "+++") {
			continue
		}
		if strings.Contains(line, fnName) {
			return true
		}
	}
	return false
}

func stableUint32(s string) uint32 {
	h := fnv.New32a()
	_, _ = h.Write([]byte(s))
	return h.Sum32()
}

var heuristicTradeoffs = []string{
	"Scope stays inside this routine; exercise it with focused tests before treating behavior as stable.",
	"Larger patches increase review surface—double-check call sites and side effects for this symbol.",
	"If this path is user-facing, consider a quick smoke test; heuristics do not prove correctness.",
	"Low-level diff signal only; pairing with PYTHON_INTEL_URL yields PR-linked narrative and tradeoffs.",
	"Watch for coupling: changes here may assume state set elsewhere in the same PR.",
}

// perFunctionHeuristic derives symbol-specific copy and confidence from the unified diff.
func perFunctionHeuristic(fnName, filePath, prTitle string, prNumber int, diff string) (decision, reason, tradeoff, evidence string, confidence float64) {
	title := strings.TrimSpace(prTitle)
	if title == "" {
		title = "this change"
	}

	patch := patchForPath(diff, filePath)
	added, removed := countPatchLineStats(patch)
	if patch == "" {
		added, removed = aggregateDiffStats(diff)
	}

	displayPath := filePath
	if displayPath == "" || displayPath == "unknown" {
		displayPath = "repository (aggregated diff)"
	}

	inAdds := fnMentionedInAddedLines(patch, fnName)
	if !inAdds && patch != "" {
		inAdds = strings.Contains(patch, fnName)
	}

	decision = fmt.Sprintf("`%s` in %s — part of “%s” (patch: +%d / −%d lines).",
		fnName, displayPath, title, added, removed)

	reason = fmt.Sprintf(
		"Heuristic read of the unified diff: this symbol is associated with the touched file. "+
			"In added lines: %s. "+
			"For full intent and tradeoffs, run the Python intelligence service (PYTHON_INTEL_URL).",
		map[bool]string{true: "present", false: "not clearly isolated in +lines"}[inAdds],
	)

	idx := int(stableUint32(fnName) % uint32(len(heuristicTradeoffs)))
	tradeoff = heuristicTradeoffs[idx]

	evidence = fmt.Sprintf("Diff evidence: file %s, +%d / −%d lines in patch segment; symbol `%s` (PR #%d).",
		displayPath, added, removed, fnName, prNumber)

	// 0.28–0.72 from patch mass + per-symbol jitter (still clearly “uncertain” vs LLM)
	base := 0.28
	if t := float64(added + removed); t > 0 {
		extra := t / 180.0
		if extra > 0.28 {
			extra = 0.28
		}
		base += extra
	}
	j := float64(stableUint32(fmt.Sprintf("%s|%s|%d", fnName, filePath, prNumber))%23) / 300.0
	confidence = base + j
	if confidence > 0.72 {
		confidence = 0.72
	}
	return decision, reason, tradeoff, evidence, confidence
}

// specializeLLMPerFunction keeps PR-level LLM text but scopes it to each symbol so the UI is not identical.
func specializeLLMPerFunction(fnName, filePath string, r *intelligence.PythonAnalysisResult) (decision, reason, tradeoff string) {
	fp := filePath
	if fp == "" || fp == "unknown" {
		fp = "(path from index)"
	}
	decision = strings.TrimSpace(r.Decision)
	if decision != "" {
		decision = fmt.Sprintf("%s — this PR also touches `%s` in `%s`.", decision, fnName, fp)
	} else {
		decision = fmt.Sprintf("PR-level analysis applies to `%s` in `%s`.", fnName, fp)
	}
	reason = strings.TrimSpace(r.Reason)
	if reason != "" {
		reason = fmt.Sprintf("For `%s` (`%s`): %s", fnName, fp, reason)
	} else {
		reason = fmt.Sprintf("Reasoning for `%s` in `%s` follows the PR summary above.", fnName, fp)
	}
	tradeoff = strings.TrimSpace(r.Tradeoff)
	if tradeoff != "" {
		tradeoff = fmt.Sprintf("%s Local impact is centered on `%s`.", tradeoff, fnName)
	} else {
		tradeoff = fmt.Sprintf("Tradeoff detail for `%s` was not isolated in the model output.", fnName)
	}
	return decision, reason, tradeoff
}
