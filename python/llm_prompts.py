from signal_processor import SignalDocument
from confidence_scorer import SignalStrength


# system prompting

SYSTEM_PROMPT = """
You are Eigenstate -- a decision reconstruction engine.
You infer engineering intent ONLY from the evidence provided.

RULES (never violate):
1. Only claim what the evidence directly supports.
2. If reason is unclear, return null -- do NOT invent.
3. CITE the source signal ID (e.g. [SIG-001]) for every claim and tradeoff.
4. Tradeoffs must be specific -- not generic buzzwords.
5. Confidence is already computed. Do not reassess it.
6. If signals contradict, report the conflict and cite both IDs.

Return ONLY valid JSON in this exact schema -- no explanation, no markdown, no backticks:
{
    "decision":  "string or null",
    "reason":    "string or null",
    "tradeoff":  "string or null",
    "evidence": {
        "primary":    "strongest signal + quote",
        "supporting": ["signal 2", "signal 3"],
        "conflicts":  "any contradictions or null"
    },
    "suggested_pr_desc": "string -- what dev should have written"
}

If you cannot fill a field from the evidence, set it to null.
Never invent a reason. Never invent a tradeoff. Never invent evidence.
If all of decision, reason, and tradeoff would be null, return this exactly:
{
    "decision":  null,
    "reason":    null,
    "tradeoff":  null,
    "evidence":  {"primary": null, "supporting": [], "conflicts": null},
    "suggested_pr_desc": null
}
"""


#user prompt builder

def build_user_prompt(doc: SignalDocument, signal: SignalStrength) -> str:
    """
    Builds the user-turn message sent to Gemini.
    Passes all available signals + pre-computed confidence score
    so the model knows exactly what evidence it has to work with.
    """
    return f"""
Confidence already computed: {signal.level} (score: {signal.score})
Triggered by: {signal.reason} via {signal.source}

--- EVIDENCE START ---

[SIG-001] PR Title: {doc.pr_title or "(none)"}
[SIG-002] PR Body: {doc.pr_body or "(none)"}
[SIG-003] Comments: {doc.comments or "(none)"}
[SIG-004] Commit Message: {doc.commit_msg or "(none)"}
[SIG-005] Issue Title: {doc.issue_title or "(none)"}
[SIG-006] Issue Body: {doc.issue_body or "(none)"}
[SIG-007] Code Difference (Added/Removed):
{doc.diff_before or "(none)"}
---
{doc.diff_after or "(none)"}

Detected pattern: {doc.pattern or "(none)"}
Changed functions: {", ".join(doc.changed_functions) if doc.changed_functions else "(none)"}

--- EVIDENCE END ---

Extract the engineering decision from the evidence above.
Return ONLY the JSON. No explanation. No markdown. No backticks.
"""

#testing
if __name__ == "__main__":
    from signal_processor import build_signal_document
    from pattern_detector import detect_pattern_change
    from confidence_scorer import compute_confidence

    pr = {
        "title": "fix: bypass rate limit for internal routes",
        "body": "Internal services were timing out because of rate limiting",
        "commit_message": "remove rate limit check for /internal paths",
        "comments": [{"body": "this fixes the SLO breach we saw last week"}],
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
    doc.pattern = detect_pattern_change(doc.diff_before, doc.diff_after)
    signal = compute_confidence(doc)

    print("=== SYSTEM PROMPT ===")
    print(SYSTEM_PROMPT)

    print("=== USER PROMPT ===")
    print(build_user_prompt(doc, signal))