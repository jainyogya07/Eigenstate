import os
import time
import requests
from datetime import datetime, timezone

from reasoning_engine import run_pipeline
from database import save_decision, init_db

# ── Config ────────────────────────────────────────────────────────────────────

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")
REPO         = "fastify/fastify"
MAX_PRS      = 20       # how many PRs to process
SLEEP_S   = 5       # 5 seconds between PRs to avoid Gemini rate limits

HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept":        "application/vnd.github.v3+json",
}


# ── GitHub fetchers ───────────────────────────────────────────────────────────

def fetch_merged_prs(repo: str, count: int) -> list[dict]:
    """Fetches the most recent merged PRs from a GitHub repo."""
    print(f"Fetching {count} merged PRs from {repo}...")
    url    = f"https://api.github.com/repos/{repo}/pulls"
    params = {"state": "closed", "per_page": count, "sort": "updated", "direction": "desc"}

    response = requests.get(url, headers=HEADERS, params=params)
    response.raise_for_status()

    # Only keep merged PRs (closed != merged on GitHub)
    prs = [pr for pr in response.json() if pr.get("merged_at")]
    print(f"  Found {len(prs)} merged PRs")
    return prs


def fetch_pr_files(repo: str, pr_number: int) -> list[dict]:
    """Fetches the list of files changed in a PR."""
    url      = f"https://api.github.com/repos/{repo}/pulls/{pr_number}/files"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def fetch_pr_comments(repo: str, pr_number: int) -> list[dict]:
    """Fetches review comments on a PR."""
    url      = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()


def fetch_linked_issue(repo: str, pr: dict) -> dict | None:
    """
    Tries to find a linked issue from the PR body.
    GitHub doesn't have a direct API for this — we parse the body
    for common patterns like 'Fixes #123' or 'Closes #456'.
    """
    import re
    body = pr.get("body") or ""
    match = re.search(r"(?:fixes|closes|resolves)\s+#(\d+)", body, re.IGNORECASE)
    if not match:
        return None

    issue_number = match.group(1)
    url          = f"https://api.github.com/repos/{repo}/issues/{issue_number}"
    response     = requests.get(url, headers=HEADERS)
    if response.status_code == 200:
        return response.json()
    return None


# ── PR builder ────────────────────────────────────────────────────────────────

def build_pr_dict(pr: dict, files: list[dict], comments: list[dict]) -> dict:
    """
    Converts raw GitHub API response into the format
    reasoning_engine.run_pipeline() expects.
    """
    # Get the first commit message — GitHub PR API doesn't return it directly
    # so we use the PR title as a proxy
    return {
        "title":          pr.get("title", ""),
        "body":           pr.get("body") or "",
        "commit_message": pr.get("title", ""),   # proxy
        "comments":       [{"body": c.get("body", "")} for c in comments],
        "diff_files": [
            {
                "filename": f.get("filename", ""),
                "patch":    f.get("patch") or "",
            }
            for f in files
            if f.get("filename")
        ],
    }


# ── Main seeder ───────────────────────────────────────────────────────────────

def seed():
    print("=" * 60)
    print(f"Eigenstate Seeder — {REPO}")
    print("=" * 60)

    init_db()

    prs = fetch_merged_prs(REPO, MAX_PRS)

    seeded     = 0
    skipped    = 0
    errors     = 0

    for pr in prs:
        pr_number = pr["number"]
        pr_title  = pr["title"]
        merged_at = datetime.fromisoformat(
            pr["merged_at"].replace("Z", "+00:00")
        )

        print(f"\nPR #{pr_number}: {pr_title[:60]}")

        try:
            # Fetch supporting data
            files    = fetch_pr_files(REPO, pr_number)
            comments = fetch_pr_comments(REPO, pr_number)
            issue    = fetch_linked_issue(REPO, pr)

            # Build input dict
            pr_dict    = build_pr_dict(pr, files, comments)
            issue_dict = {"title": issue.get("title", ""), "body": issue.get("body", "")} if issue else None

            # Run full pipeline
            result = run_pipeline(
                pr          = pr_dict,
                issue       = issue_dict,
                later_prs   = [],
                decision_ts = merged_at,
            )

            print(f"  Confidence: {result.confidence_level} ({result.confidence_score})")

            # Only save if we extracted something meaningful
            if result.confidence_level == "INSUFFICIENT_DATA" or not result.decision:
                print(f"  Skipped — insufficient signal")
                skipped += 1
            else:
                row = save_decision(
                    repo        = REPO,
                    pr_number   = pr_number,
                    pr_title    = pr_title,
                    result      = result,
                    decision_ts = merged_at,
                )
                print(f"  ✓ Saved — {result.decision[:60]}")
                seeded += 1

        except Exception as e:
            print(f"  ✗ Error — {e}")
            errors += 1

        # Sleep between calls to avoid Gemini rate limiting
        time.sleep(SLEEP_S)

    print("\n" + "=" * 60)
    print(f"Done. Seeded: {seeded} | Skipped: {skipped} | Errors: {errors}")
    print("=" * 60)


if __name__ == "__main__":
    seed()