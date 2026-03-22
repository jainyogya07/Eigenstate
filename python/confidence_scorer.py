from dataclasses import dataclass
from signal_processor import SignalDocument

EXPLICIT_KEYWORDS = [
    "because",
    "in order to",
    "the reason",
    "due to",
    "to prevent",
    "this fixes",
    "trade-off",
    "tradeoff",
    "we decided",
    "the issue was",
    "this allows",
]


@dataclass
class SignalStrength:
    level:   str   # "HIGH" | "MEDIUM" | "LOW" | "INFERRED" | "INSUFFICIENT_DATA"
    score:   int   # 0–100
    reason:  str   # why this tier was assigned
    source:  str   # which signal triggered it


def compute_confidence(doc: SignalDocument) -> SignalStrength:
    """Deterministic confidence scoring — exactly as specified.
    Runs BEFORE the LLM is called. Never a post-hoc self-assessment.
    """
    all_text = " ".join([
        doc.pr_body,
        doc.comments,
        doc.commit_msg,
        doc.issue_body,
    ]).lower()

    # Step 0: Check for conflicts first (Section 6.2)
    if _has_contradictions(doc):
        return SignalStrength(
            level  = "INFERRED",
            score  = 25,
            reason = "conflicting signals detected; downgraded to inferred",
            source = "conflict_check",
        )

    # Tier 1: Explicit causal language found
    for kw in EXPLICIT_KEYWORDS:
        if kw in all_text:
            return SignalStrength(
                level  = "HIGH",
                score  = 90,
                reason = f"explicit keyword '{kw}' found",
                source = "pr_body or comment",
            )

    # Tier 2: Structural code pattern change
    if doc.pattern:
        return SignalStrength(
            level  = "MEDIUM",
            score  = 65,
            reason = f"pattern: {doc.pattern}",
            source = "code_diff",
        )

    # Tier 3: Issue linked with content + meaningful commit message
    if doc.issue_body and len(doc.commit_msg) > 20:
        return SignalStrength(
            level  = "LOW",
            score  = 40,
            reason = "issue context + commit message combined",
            source = "issue + commit",
        )

    # Tier 4: Fully inferred — diff only, no text signals
    if doc.diff_after or doc.diff_before:
        return SignalStrength(
            level  = "INFERRED",
            score  = 20,
            reason = "no explicit reasoning; diff-only inference",
            source = "code_diff",
        )

    # Tier 5: Nothing at all — don't call the LLM
    return SignalStrength(
        level  = "INSUFFICIENT_DATA",
        score  = 0,
        reason = "no signals found; LLM will not be called",
        source = "none",
    )

def _has_contradictions(doc: SignalDocument) -> bool:
    """
    Internal rule: If signals provide conflicting info, we can't trust the HIGH tier.
    Example: Title says 'fix' but body says 'new feature' or 'refactor'.
    Example: Diff removes a check but commit msg says 'add validation'.
    """
    t, b, c = doc.pr_title.lower(), doc.pr_body.lower(), doc.commit_msg.lower()

    # Conflict 1: fix vs feat ambiguity
    if ("fix" in t and "feat" in b) or ("fix" in b and "feat" in t):
        return True
    
    # Conflict 2: add vs remove logic
    if ("remove" in c and "add" in b) or ("delete" in c and "implement" in b):
        return True
    
    # Conflict 3: bypass/skip vs enforce
    if ("bypass" in b or "skip" in b) and ("enforce" in c or "secure" in c):
        return True

    return False

#for test
if __name__ == "__main__":
    from signal_processor import build_signal_document
    from pattern_detector import detect_pattern_change

    # Should be HIGH — has "because" in body
    pr1 = {
        "title": "fix middleware",
        "body": "Removed rate limiting because internal services were timing out",
        "commit_message": "fix: remove rate limit for internal routes",
        "comments": [],
        "diff_files": []
    }
    doc1 = build_signal_document(pr1)
    print(compute_confidence(doc1))   # HIGH, 90

    # Should be MEDIUM — pattern match, no causal keywords
    pr2 = {
        "title": "update middleware",
        "body": "",
        "commit_message": "fix",
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
    doc2 = build_signal_document(pr2)
    detect_pattern_change(doc2.diff_before, doc2.diff_after)
    # manually set since detector returns string, doesn't mutate doc
    doc2.pattern = detect_pattern_change(doc2.diff_before, doc2.diff_after)
    print(compute_confidence(doc2))   # MEDIUM, 65

    # Should be INSUFFICIENT_DATA — nothing at all
    pr3 = {
        "title": "fix typo",
        "body": "",
        "commit_message": "fix",
        "comments": [],
        "diff_files": []
    }
    doc3 = build_signal_document(pr3)
    print(compute_confidence(doc3))   # INSUFFICIENT_DATA, 0