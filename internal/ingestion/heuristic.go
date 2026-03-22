package ingestion

import (
	"regexp"
	"strings"

	"github.com/eigenstate/eigenstate/internal/intelligence"
)

var (
	goFuncRecv  = regexp.MustCompile(`(?m)^\+[^\n]*?\bfunc\s+\([^)]+\)\s+([A-Za-z0-9_]+)\s*\(`)
	goFuncPlain = regexp.MustCompile(`(?m)^\+[^\n]*?\bfunc\s+([A-Za-z0-9_]+)\s*\(`)
	jsFunc      = regexp.MustCompile(`(?m)^\+[^\n]*?\bfunction\s+([A-Za-z0-9_]+)\s*\(`)
	jsArrow     = regexp.MustCompile(`(?m)^\+[^\n]*?\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>`)
	pyDef       = regexp.MustCompile(`(?m)^\+[^\n]*?\bdef\s+([A-Za-z0-9_]+)\s*\(`)
	rsFn        = regexp.MustCompile(`(?m)^\+[^\n]*?\bfn\s+([A-Za-z0-9_]+)\s*\(`)
)

func functionNamesFromPatch(patch string) []string {
	seen := make(map[string]struct{})
	var names []string
	addAll := func(re *regexp.Regexp) {
		for _, m := range re.FindAllStringSubmatch(patch, -1) {
			if len(m) < 2 {
				continue
			}
			n := m[1]
			if n == "" || n == "if" || n == "for" || n == "switch" {
				continue
			}
			if _, ok := seen[n]; ok {
				continue
			}
			seen[n] = struct{}{}
			names = append(names, n)
		}
	}
	addAll(goFuncRecv)
	addAll(goFuncPlain)
	addAll(jsFunc)
	addAll(jsArrow)
	addAll(pyDef)
	addAll(rsFn)
	return names
}

type fnFilePair struct {
	name string
	file string
}

func extractFunctionFilePairs(diff string) []fnFilePair {
	files := ParseDiffFiles(diff)
	var out []fnFilePair
	seen := make(map[string]struct{})
	for _, df := range files {
		for _, name := range functionNamesFromPatch(df.Patch) {
			if _, ok := seen[name]; ok {
				continue
			}
			seen[name] = struct{}{}
			out = append(out, fnFilePair{name: name, file: df.Filename})
		}
	}
	return out
}

// heuristicAnalysisResult builds a minimal analysis when the Python service is down or returns nothing.
func heuristicAnalysisResult(job Job, diff string) *intelligence.PythonAnalysisResult {
	pairs := extractFunctionFilePairs(diff)
	title := strings.TrimSpace(job.Title)
	if title == "" {
		title = "Pull request"
	}

	fileMap := make(map[string]string)
	var names []string

	if len(pairs) == 0 {
		dfs := ParseDiffFiles(diff)
		if len(dfs) == 0 {
			names = []string{"repository_changes"}
			fileMap["repository_changes"] = "unknown"
		} else {
			names = []string{"changed_files"}
			fileMap["changed_files"] = dfs[0].Filename
		}
	} else {
		for _, p := range pairs {
			names = append(names, p.name)
			if _, ok := fileMap[p.name]; !ok {
				fileMap[p.name] = p.file
			}
		}
	}

	return &intelligence.PythonAnalysisResult{
		Status:               "ok",
		Repo:                 job.Repo,
		PRNumber:             job.PRNumber,
		ConfidenceLevel:      "HEURISTIC",
		ConfidenceScore:      42,
		Decision:             title + " — symbols extracted from diff (fallback path).",
		Reason:               "Full LLM reasoning requires the Python intelligence service (PYTHON_INTEL_URL). This result is from patch heuristics only.",
		Tradeoff:             "Run the intelligence layer for tradeoff analysis.",
		SuggestedPRDesc:      "",
		ChangedFunctions:     names,
		ChangedFunctionFiles: fileMap,
		IsStale:              false,
		StalenessWarning:     "",
		DecisionID:           "",
	}
}
