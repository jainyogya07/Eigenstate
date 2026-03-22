package ingestion

import (
	"regexp"
	"strings"

	"github.com/eigenstate/eigenstate/internal/intelligence"
)

var (
	diffGitBlockStart = regexp.MustCompile(`(?m)^diff --git `)
	diffGitHeaderLine = regexp.MustCompile(`^diff --git a/(.+?) b/(.+?)(?:\t|$)`)
)

// ParseDiffFiles splits a unified GitHub/Git diff into per-file patches for the Python pipeline.
func ParseDiffFiles(diff string) []intelligence.DiffFile {
	d := strings.TrimSpace(diff)
	if d == "" {
		return nil
	}
	idxs := diffGitBlockStart.FindAllStringIndex(d, -1)
	if len(idxs) == 0 {
		return nil
	}
	var out []intelligence.DiffFile
	for i, loc := range idxs {
		start := loc[0]
		var end int
		if i+1 < len(idxs) {
			end = idxs[i+1][0]
		} else {
			end = len(d)
		}
		block := d[start:end]
		firstNL := strings.Index(block, "\n")
		var headerLine, rest string
		if firstNL < 0 {
			headerLine = block
		} else {
			headerLine = block[:firstNL]
			rest = block[firstNL+1:]
		}
		m := diffGitHeaderLine.FindStringSubmatch(headerLine)
		if len(m) < 3 {
			continue
		}
		path := m[2]
		out = append(out, intelligence.DiffFile{
			Filename: path,
			Patch:    rest,
		})
	}
	return out
}
