import os
from dataclasses import dataclass, field
from typing import Optional
from config import config

@dataclass
class SignalDocument:
    pr_title: str
    pr_body: str
    comments: str
    commit_msg: str
    issue_title: str
    issue_body: str
    diff_before: str
    diff_after: str
    changed_files: list[str] = field(default_factory=list)

    # traceability IDs for the LLM to cite
    signal_ids: dict[str, str] = field(default_factory=lambda: {
        "pr_title":    "SIG-001",
        "pr_body":     "SIG-002",
        "comments":    "SIG-003",
        "commit_msg":  "SIG-004",
        "issue_title": "SIG-005",
        "issue_body":  "SIG-006",
        "code_diff":   "SIG-007",
    })

    # for pattern detector and ast_extractor:
    pattern: Optional[str] = None   # e.g. "rate limiting bypass"
    changed_functions: list[str] = field(default_factory=list)

    def all_text(self):
        # Single concatenated string of all text. will be ussed by the confidence scorer to scan for causal keywords.
        parts = [
            self.pr_title,
            self.pr_body,
            self.comments,
            self.commit_msg,
            self.issue_title,
            self.issue_body,
        ]
        return " ".join(p for p in parts if p).lower()
    
    def has_text_signals(self):
        # will retrun True if there's any meaningful text beyond the difference.
        return any([
            self.pr_body.strip(),
            self.comments.strip(),
            self.issue_body.strip(),
            len(self.commit_msg.strip()) > 20, #main cehcker for lenght
        ])
    
    def language_from_path(self, file_path: str):
        #Helper, maps a file path to a supported language.
        ext = os.path.splitext(file_path)[1].lower()
        return config.EXT_MAP.get(ext)
    
def build_signal_document(pr: dict, issue: Optional[dict] = None,):
    """Takes the raw PR payload (as the Go service will POST it) and normalises everything into a SignalDocument.

    Expected keys in `pr`:
      title, body, comments (list of {body: str}),
      commit_message, diff_files (list of {filename, patch})

    Expected keys in `issue` (optional):
      title, body"""
    
    #text signals
    pr_title = pr.get("title", "") or ""
    pr_body = pr.get("body", "") or ""
    commit_msg = pr.get("commit_message", "") or ""

    raw_comments = pr.get("comments", []) or []
    comments = "\n".join(c.get("body", "") for c in raw_comments if c.get("body"))

    issue_title = ""
    issue_body  = ""
    if issue:
        issue_title = issue.get("title", "") or ""
        issue_body  = issue.get("body",  "") or ""

    # for the diff signals
    diff_files = pr.get("diff_files", []) or []
    changed_files = [f.get("filename", "") for f in diff_files if f.get("filename")]

    diff_before, diff_after = _extract_diff_halves(diff_files)

    return SignalDocument(
        pr_title = pr_title,
        pr_body = pr_body,
        comments = comments,
        commit_msg = commit_msg,
        issue_title = issue_title,
        issue_body = issue_body,
        diff_before = diff_before,
        diff_after = diff_after,
        changed_files = changed_files,
    )

def _extract_diff_halves(diff_files: list[dict]):
    """splits every file patch into removed lines (before) and added lines (after)
    skips hunk headers and file header lines

    a unified diff line starting with '-' = removed (before) and for '+' = added  (after)"""
    before_lines: list[str] = []
    after_lines:  list[str] = []

    for f in diff_files:
        patch = f.get("patch", "") or ""
        for line in patch.splitlines():
            if line.startswith("---") or line.startswith("+++"):
                continue   # file header — skip
            elif line.startswith("-"):
                before_lines.append(line[1:])  # strip the leading '-'
            elif line.startswith("+"):
                after_lines.append(line[1:])   # strip the leading '+'
            # context lines (no prefix) are ignored — not needed for pattern detection

    return "\n".join(before_lines), "\n".join(after_lines)

#temp only for checking:
# paste at the bottom of signal_processor.py temporarily
if __name__ == "__main__":
    test_pr = {
        "title": "fix: bypass rate limit for internal routes",
        "body": "Internal services were timing out because of rate limiting",
        "commit_message": "remove rate limit check for /internal paths",
        "comments": [{"body": "this fixes the SLO breach we saw last week"}],
        "diff_files": [{
            "filename": "middleware/auth.js",
            "patch": (
                "@@ -10,5 +10,5 @@\n"
                "-  if (rateLimit.check(req)) block(req)\n"
                "+  if (internalService(req)) skip(req)\n"
            )
        }]
    }
    doc = build_signal_document(test_pr)
    print(doc.pr_title)        # fix: bypass rate limit for internal routes
    print(doc.diff_before)     # if (rateLimit.check(req)) block(req)
    print(doc.diff_after)      # if (internalService(req)) skip(req)
    print(doc.has_text_signals())  # True
    print(doc.all_text()[:80])     # combined lowercase text
    print(doc.all_text())