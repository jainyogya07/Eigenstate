from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from config import config
from llm_client import DecisionRecord


@dataclass
class PRSummary:
    """
    Lightweight summary of a later PR that touched the same functions.
    The Go layer will pass these in when querying decisions.
    """
    pr_number:  int
    title:      str
    merged_at:  datetime
    changed_functions: list[str]
    changed_files:     list[str]


@dataclass
class StalenessResult:
    is_stale:         bool
    warning:          Optional[str]   # human-readable, shown in UI
    invalidated_by_pr: Optional[int]  # pr_number of the later PR


def check_staleness(
    decision:        DecisionRecord,
    decision_ts:     datetime,
    changed_functions: list[str],
    changed_files:   list[str],
    later_prs:       list[PRSummary],
) -> StalenessResult:
    """
    Checks whether a decision is stale by comparing it against
    all PRs merged after the decision's timestamp.

    A decision is stale if:
      1. It is older than STALENESS_DAYS (default 2 years), AND
      2. A later PR touched at least one of the same functions or files

    Returns a StalenessResult with a human-readable warning if stale.
    """

    # Ensure decision_ts is timezone-aware for comparison
    if decision_ts.tzinfo is None:
        decision_ts = decision_ts.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    age_days = (now - decision_ts).days

    # Not old enough to be considered stale
    if age_days < config.STALENESS_DAYS:
        return StalenessResult(
            is_stale          = False,
            warning           = None,
            invalidated_by_pr = None,
        )

    # Check each later PR for overlap with this decision's scope
    decision_functions = set(changed_functions)
    decision_files     = set(changed_files)

    for pr in later_prs:
        # Ensure pr.merged_at is timezone-aware
        pr_ts = pr.merged_at
        if pr_ts.tzinfo is None:
            pr_ts = pr_ts.replace(tzinfo=timezone.utc)

        # Only look at PRs merged AFTER this decision
        if pr_ts <= decision_ts:
            continue

        later_functions = set(pr.changed_functions)
        later_files     = set(pr.changed_files)

        fn_overlap   = decision_functions & later_functions
        file_overlap = decision_files     & later_files

        if fn_overlap or file_overlap:
            warning = _build_warning(
                pr, fn_overlap, file_overlap, age_days
            )
            return StalenessResult(
                is_stale          = True,
                warning           = warning,
                invalidated_by_pr = pr.pr_number,
            )

    # Old but no later PR touched the same code — still valid
    return StalenessResult(
        is_stale          = False,
        warning           = None,
        invalidated_by_pr = None,
    )


def _build_warning(
    pr:           PRSummary,
    fn_overlap:   set[str],
    file_overlap: set[str],
    age_days:     int,
) -> str:
    """Builds the human-readable staleness warning shown in the UI."""
    parts = []

    if fn_overlap:
        fns = ", ".join(sorted(fn_overlap)[:3])  # cap at 3 for readability
        parts.append(f"function(s) {fns}")

    if file_overlap:
        files = ", ".join(sorted(file_overlap)[:3])
        parts.append(f"file(s) {files}")

    overlap_desc = " and ".join(parts)

    return (
        f"Decision is {age_days} days old. "
        f"PR #{pr.pr_number} ('{pr.title}') "
        f"modified overlapping {overlap_desc} — "
        f"verify this reasoning still applies."
    )

# testing
if __name__ == "__main__":
    from datetime import timedelta

    # Fake decision from 3 years ago touching authMiddleware
    decision_ts       = datetime.now(timezone.utc) - timedelta(days=1100)
    changed_functions = ["authMiddleware", "checkToken"]
    changed_files     = ["middleware/auth.js"]

    # Later PR that touched the same function
    later_pr = PRSummary(
        pr_number         = 287,
        title             = "refactor: update auth middleware for OAuth2",
        merged_at         = datetime.now(timezone.utc) - timedelta(days=30),
        changed_functions = ["authMiddleware"],
        changed_files     = ["middleware/auth.js"],
    )

    # Test 1 — should be stale
    result = check_staleness(
        decision          = None,
        decision_ts       = decision_ts,
        changed_functions = changed_functions,
        changed_files     = changed_files,
        later_prs         = [later_pr],
    )
    print("=== Test 1 — should be stale ===")
    print(f"is_stale: {result.is_stale}")
    print(f"warning:  {result.warning}")
    print(f"invalidated_by: PR #{result.invalidated_by_pr}")

    # Test 2 — recent decision, should NOT be stale even with overlap
    result2 = check_staleness(
        decision          = None,
        decision_ts       = datetime.now(timezone.utc) - timedelta(days=30),
        changed_functions = changed_functions,
        changed_files     = changed_files,
        later_prs         = [later_pr],
    )
    print("\n=== Test 2 — recent decision, should NOT be stale ===")
    print(f"is_stale: {result2.is_stale}")

    # Test 3 — old decision but no overlapping later PRs
    unrelated_pr = PRSummary(
        pr_number         = 300,
        title             = "feat: add logging",
        merged_at         = datetime.now(timezone.utc) - timedelta(days=10),
        changed_functions = ["logRequest"],
        changed_files     = ["lib/logger.js"],
    )
    result3 = check_staleness(
        decision          = None,
        decision_ts       = decision_ts,
        changed_functions = changed_functions,
        changed_files     = changed_files,
        later_prs         = [unrelated_pr],
    )
    print("\n=== Test 3 — old but no overlap, should NOT be stale ===")
    print(f"is_stale: {result3.is_stale}")
