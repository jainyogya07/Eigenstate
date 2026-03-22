from reasoning_engine import ReasoningResult


# ── Template ──────────────────────────────────────────────────────────────────

TEMPLATE = """\
## What changed
{decision}

## Why
{reason}

## Tradeoff
{tradeoff}

## Affected functions
{functions}

## Evidence
{evidence}
"""


def generate_pr_description(result: ReasoningResult) -> str:
    """
    Generates a structured PR description from a ReasoningResult.
    This is the 'what the developer should have written' field
    shown in the Eigenstate UI alongside the decision.

    Returns empty string if there's not enough signal to generate
    a meaningful description.
    """

    # Nothing to generate if no decision was extracted
    if not result.decision:
        return ""

    # If Gemini already generated a good suggested_pr_desc, use it directly
    if result.suggested_pr_desc:
        return _format_full(result)

    # Fallback — build from individual fields
    return _format_minimal(result)


def _format_full(result: ReasoningResult) -> str:
    """
    Full format — uses all extracted fields.
    Used when Gemini returned a complete extraction.
    """
    functions = (
        ", ".join(f"`{f}`" for f in result.changed_functions)
        if result.changed_functions
        else "_not detected_"
    )

    evidence = result.evidence_primary or "_not available_"
    if result.evidence_supporting:
        supporting = "\n".join(f"- {s}" for s in result.evidence_supporting)
        evidence  += f"\n\nSupporting signals:\n{supporting}"

    tradeoff = result.tradeoff or "_not explicitly stated_"
    reason   = result.reason   or "_not explicitly stated_"

    description = TEMPLATE.format(
        decision  = result.decision,
        reason    = reason,
        tradeoff  = tradeoff,
        functions = functions,
        evidence  = evidence,
    )

    # Append Gemini's suggested description as a "suggested rewrite" block
    description += (
        f"\n---\n"
        f"## Suggested PR description\n"
        f"{result.suggested_pr_desc}\n"
    )

    return description.strip()


def _format_minimal(result: ReasoningResult) -> str:
    """
    Minimal format — used when suggested_pr_desc is missing.
    Builds a clean description from just the core fields.
    """
    lines = []

    lines.append(f"## Decision\n{result.decision}")

    if result.reason:
        lines.append(f"## Reason\n{result.reason}")

    if result.tradeoff:
        lines.append(f"## Tradeoff\n{result.tradeoff}")

    if result.changed_functions:
        fns = ", ".join(f"`{f}`" for f in result.changed_functions)
        lines.append(f"## Affected functions\n{fns}")

    lines.append(
        f"\n---\n"
        f"_Confidence: {result.confidence_level} "
        f"({result.confidence_score}) — {result.confidence_reason}_"
    )

    return "\n\n".join(lines).strip()


def format_staleness_warning(result: ReasoningResult) -> str:
    """
    Formats the staleness warning shown in the UI banner.
    Returns empty string if decision is not stale.
    """
    if not result.is_stale:
        return ""

    pr_ref = (
        f"PR #{result.invalidated_by_pr}"
        if result.invalidated_by_pr
        else "a later PR"
    )

    return (
        f"⚠️ This decision may be outdated. "
        f"{pr_ref} modified the same code after this decision was recorded. "
        f"{result.staleness_warning or ''}"
    ).strip()


#testing
if __name__ == "__main__":
    from signal_processor import build_signal_document
    from pattern_detector import detect_pattern_change
    from confidence_scorer import compute_confidence
    from llm_client import extract_decision
    from reasoning_engine import run_pipeline

    pr = {
        "title": "fix: bypass rate limit for internal routes",
        "body":  "Internal services were timing out because of rate limiting",
        "commit_message": "remove rate limit check for /internal paths",
        "comments": [{"body": "this fixes the SLO breach we saw last week"}],
        "diff_files": [{
            "filename": "middleware/auth.js",
            "patch": (
                "@@ -1,3 +1,3 @@\n"
                "-  if (rateLimit.check(req)) block(req)\n"
                "+  if (internalService(req)) skip(req)\n"
            )
        }]
    }

    result = run_pipeline(pr)

    print("=== Generated PR Description ===")
    print(generate_pr_description(result))

    print("\n=== Staleness Warning ===")
    print(format_staleness_warning(result) or "(not stale)")