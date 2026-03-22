from typing import Optional

KNOWN_PATTERNS: dict[tuple[str, str], str] = {
    ("ratelimit",   "skip"):            "rate limiting bypass",
    ("rate_limit",  "skip"):            "rate limiting bypass",
    ("validate",    "bypass"):          "validation removal",
    ("validate",    "skip"):            "validation removal",
    ("cache",       "nocache"):         "caching disabled",
    ("cache",       "no-cache"):        "caching disabled",
    ("auth.required", "public"):        "auth gate removed",
    ("authenticate",  "skip"):          "auth gate removed",
    ("retry",       "noretry"):         "retry logic removed",
    ("retry",       "no_retry"):        "retry logic removed",
    ("sync",        "async"):           "synchronous to async migration",
    ("http",        "https"):           "http to https migration",
    ("password",    "hash"):            "plaintext to hashed password",
    ("catch",       "ignore"):          "error suppression added",
    ("throw",       "return"):          "exception to return value refactor",
    ("console.log", "logger"):          "logging library migration",
    ("print(",      "logger"):          "logging library migration",
    ("hardcoded",   "env"):             "hardcoded value moved to env config",
    ("os.getenv",   "config"):          "config centralisation",
    ("v1",          "v2"):              "api version migration",
    ("callback",    "promise"):         "callback to promise migration",
    ("callback",    "async"):           "callback to async/await migration",
    ("sql(",        "orm"):             "raw sql to orm migration",
    ("mutex",       "channel"):         "mutex to channel concurrency",
    ("goroutine",   "worker"):          "goroutine to worker pool refactor",
}

def detect_pattern_change(before: str, after: str) -> Optional[str]:

    """Takes diff_before and diff_after strings directly.
    Returns the first matching pattern description, or None."""

    bl, al = before.lower(), after.lower()
    for (pat_b, pat_a), description in KNOWN_PATTERNS.items():
        if pat_b in bl and pat_a in al:
            return description
    return None


#for testing only
if __name__ == "__main__":
    from signal_processor import build_signal_document

    pr = {
        "title": "fix middleware",
        "body": "",
        "commit_message": "update auth",
        "comments": [],
        "diff_files": [{
            "filename": "middleware/auth.js",
            "patch": (
                "@@ -10,3 +10,3 @@\n"
                "-  if (rateLimit.check(req)) block(req)\n"
                "+  if (internalService(req)) skip(req)\n"
            )
        }]
    }

    doc = build_signal_document(pr)
    pattern = detect_pattern_change(doc.diff_before, doc.diff_after)
    doc.pattern = pattern

    print(pattern)      # rate limiting bypass
    print(doc.pattern)  # rate limiting bypass