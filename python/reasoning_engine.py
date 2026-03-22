# reasoning_engine.py
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from signal_processor import SignalDocument, build_signal_document
from pattern_detector import detect_pattern_change
from ast_extractor import extract_functions, FunctionBoundary
from diff_mapper import map_diff_lines_to_functions
from confidence_scorer import compute_confidence, SignalStrength
from llm_client import extract_decision, DecisionRecord
from staleness_checker import check_staleness, PRSummary, StalenessResult
from config import config


@dataclass
class ReasoningResult:
    """
    The final output of the full pipeline for one PR.
    This is what gets written to PostgreSQL and served to the frontend.
    """
    # Decision content
    decision:           Optional[str]
    reason:             Optional[str]
    tradeoff:           Optional[str]
    suggested_pr_desc:  Optional[str]

    # Evidence
    evidence_primary:    Optional[str]
    evidence_supporting: list[str]
    evidence_conflicts:  Optional[str]

    # Confidence
    confidence_level:   str
    confidence_score:   int
    confidence_reason:  str
    confidence_source:  str

    # Scope
    changed_functions:  list[str]
    changed_files:      list[str]

    # Staleness
    is_stale:           bool
    staleness_warning:  Optional[str]
    invalidated_by_pr:  Optional[int]

    # Meta
    model_used:         str
    validation_errors:  list[str] = field(default_factory=list)


def run_pipeline(
    pr:         dict,
    issue:      Optional[dict]   = None,
    later_prs:  list[PRSummary]  = None,
    decision_ts: Optional[datetime] = None,
) -> ReasoningResult:
    """
    Full reasoning pipeline for one PR. Runs in this exact order:

    1. build_signal_document()     — normalise raw PR into SignalDocument
    2. detect_pattern_change()     — check diff for known patterns
    3. extract_functions()         — AST parse each changed file
    4. map_diff_lines_to_functions() — which functions were touched
    5. compute_confidence()        — deterministic tier scoring
    6. extract_decision()          — call Gemini (or skip if INSUFFICIENT)
    7. check_staleness()           — flag if decision is outdated
    """
    later_prs   = later_prs or []
    decision_ts = decision_ts or datetime.now(timezone.utc)

    # ── Step 1: Build signal document ────────────────────────────────────────
    doc = build_signal_document(pr, issue)

    # ── Step 2: Pattern detection ─────────────────────────────────────────────
    doc.pattern = detect_pattern_change(doc.diff_before, doc.diff_after)

    # ── Step 3 + 4: AST extraction + diff mapping ─────────────────────────────
    all_changed_functions: list[str] = []

    for diff_file in pr.get("diff_files", []):
        file_path = diff_file.get("filename", "")
        patch     = diff_file.get("patch", "") or ""
        language  = doc.language_from_path(file_path)

        if not language:
            continue    # unsupported file type — skip

        # We need the full source to extract function boundaries.
        # The Go layer should pass "source" in each diff_file if available.
        # Fall back to extracting from the added lines only if not provided.
        source = diff_file.get("source") or _source_from_patch(patch)

        if not source:
            continue

        functions  = extract_functions(source, language)
        touched    = map_diff_lines_to_functions(patch, functions)
        all_changed_functions.extend(touched)

    # Deduplicate and attach to doc
    doc.changed_functions = list(set(all_changed_functions))

    # ── Step 5: Confidence scoring ────────────────────────────────────────────
    signal = compute_confidence(doc)

    # ── Step 6: LLM extraction ────────────────────────────────────────────────
    record = extract_decision(doc, signal)

    # ── Step 7: Staleness check ───────────────────────────────────────────────
    staleness = check_staleness(
        decision          = record,
        decision_ts       = decision_ts,
        changed_functions = doc.changed_functions,
        changed_files     = doc.changed_files,
        later_prs         = later_prs,
    )

    # ── Assemble final result ─────────────────────────────────────────────────
    return ReasoningResult(
        decision            = record.decision,
        reason              = record.reason,
        tradeoff            = record.tradeoff,
        suggested_pr_desc   = record.suggested_pr_desc,
        evidence_primary    = record.evidence_primary,
        evidence_supporting = record.evidence_supporting,
        evidence_conflicts  = record.evidence_conflicts,
        confidence_level    = signal.level,
        confidence_score    = signal.score,
        confidence_reason   = signal.reason,
        confidence_source   = signal.source,
        changed_functions   = doc.changed_functions,
        changed_files       = doc.changed_files,
        is_stale            = staleness.is_stale,
        staleness_warning   = staleness.warning,
        invalidated_by_pr   = staleness.invalidated_by_pr,
        model_used          = record.model_used,
        validation_errors   = record.validation_errors,
    )


# ── Helper ────────────────────────────────────────────────────────────────────

def _source_from_patch(patch: str) -> str:
    """
    Reconstructs a rough source file from a patch's added lines.
    Used when the full source file isn't available from the Go layer.
    Less accurate for AST parsing but better than nothing.
    """
    lines = []
    for line in patch.splitlines():
        if line.startswith("+++") or line.startswith("---"):
            continue
        if line.startswith("+"):
            lines.append(line[1:])
        elif not line.startswith("-"):
            lines.append(line)   # context line
    return "\n".join(lines)



# testing
if __name__ == "__main__":

    pr = {
        "title": "fix: bypass rate limit for internal routes",
        "body": "Internal services were timing out because of rate limiting",
        "commit_message": "remove rate limit check for /internal paths",
        "comments": [{"body": "this fixes the SLO breach we saw last week"}],
        "diff_files": [{
            "filename": "middleware/auth.js",
            "patch": (
                "@@ -1,6 +1,6 @@\n"
                " function authMiddleware(req, res, next) {\n"
                "-  if (rateLimit.check(req)) block(req)\n"
                "+  if (internalService(req)) skip(req)\n"
                "   return next()\n"
                " }\n"
            )
        }]
    }

    print("Running full pipeline...\n")
    result = run_pipeline(pr)

    print(f"Confidence:    {result.confidence_level} ({result.confidence_score})")
    print(f"Decision:      {result.decision}")
    print(f"Reason:        {result.reason}")
    print(f"Tradeoff:      {result.tradeoff}")
    print(f"Functions:     {result.changed_functions}")
    print(f"Suggested:     {result.suggested_pr_desc}")
    print(f"Is stale:      {result.is_stale}")
    if result.validation_errors:
        print(f"Errors:        {result.validation_errors}")