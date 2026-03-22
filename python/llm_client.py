import os
import json
import re
from dataclasses import dataclass, field
from typing import Optional

from google import genai
from google.genai import types

from signal_processor import SignalDocument
from confidence_scorer import SignalStrength
from llm_prompts import SYSTEM_PROMPT, build_user_prompt


# configuration of gemini (Restore default for convenience as requested)
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    # We'll let the client fail if key is missing, or we can raise here
    pass

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None


# output schema

@dataclass
class DecisionRecord:
    decision:          Optional[str]
    reason:            Optional[str]
    tradeoff:          Optional[str]
    evidence_primary:  Optional[str]
    evidence_supporting: list[str]
    evidence_conflicts:  Optional[str]
    suggested_pr_desc: Optional[str]
    confidence_level:  str
    confidence_score:  int
    model_used:        str = "gemini-1.5-flash"
    validation_errors: list[str] = field(default_factory=list)


# main client

def extract_decision(doc: SignalDocument, signal: SignalStrength) -> DecisionRecord:
    """
    Main entry point. Checks confidence first — if INSUFFICIENT_DATA,
    skips the API call entirely and returns a null record.
    Otherwise calls Gemini and validates the JSON response.
    """

    # Gate, don't call LLM if there's nothing to work with
    if signal.level == "INSUFFICIENT_DATA":
        return DecisionRecord(
            decision           = None,
            reason             = None,
            tradeoff           = None,
            evidence_primary   = None,
            evidence_supporting = [],
            evidence_conflicts = None,
            suggested_pr_desc  = None,
            confidence_level   = signal.level,
            confidence_score   = signal.score,
        )

    # Build prompts
    user_prompt = build_user_prompt(doc, signal)

    # Call Gemini
    raw_response = _call_gemini(user_prompt)

    # Parse and validate
    record = _parse_response(raw_response, signal)

    # Strengthening: Verify signal citations actually exist (Section 6.2)
    record.validation_errors.extend(_verify_citations(record, doc))

    return record


# api call

def _call_gemini(user_prompt: str) -> str:
    """
    Calls Gemini with the system prompt baked into the model config
    and the user prompt as the single message.
    Returns the raw text response.
    """
    response = client.models.generate_content(
        model="gemini-flash-latest",
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.0,
            max_output_tokens=1024,
        ),
        contents=user_prompt,
    )
    return response.text


# json validation

def _parse_response(raw: str, signal: SignalStrength) -> DecisionRecord:
    """
    Strips markdown fences if Gemini adds them, parses JSON,
    validates all required fields are present.
    If parsing fails, returns a null record rather than crashing.
    """
    errors: list[str] = []

    # Strip markdown fences — Gemini sometimes adds them despite instructions
    clean = re.sub(r"^```(?:json)?\s*", "", raw.strip())
    clean = re.sub(r"\s*```$", "", clean.strip())

    # Parse JSON
    try:
        data = json.loads(clean)
    except json.JSONDecodeError as e:
        return DecisionRecord(
            decision            = None,
            reason              = None,
            tradeoff            = None,
            evidence_primary    = None,
            evidence_supporting = [],
            evidence_conflicts  = None,
            suggested_pr_desc   = None,
            confidence_level    = signal.level,
            confidence_score    = signal.score,
            validation_errors   = [f"JSON parse failed: {e}", f"Raw response: {raw[:200]}"],
        )

    # Validate required fields
    required = ["decision", "reason", "tradeoff", "evidence", "suggested_pr_desc"]
    for field_name in required:
        if field_name not in data:
            errors.append(f"Missing field: {field_name}")

    # Validate evidence subfields
    evidence = data.get("evidence", {})
    if not isinstance(evidence, dict):
        errors.append("evidence field is not an object")
        evidence = {}

    supporting = evidence.get("supporting", [])
    if not isinstance(supporting, list):
        errors.append("evidence.supporting is not an array")
        supporting = []

    return DecisionRecord(
        decision            = data.get("decision"),
        reason              = data.get("reason"),
        tradeoff            = data.get("tradeoff"),
        evidence_primary    = evidence.get("primary"),
        evidence_supporting = supporting,
        evidence_conflicts  = evidence.get("conflicts"),
        suggested_pr_desc   = data.get("suggested_pr_desc"),
        confidence_level    = signal.level,
        confidence_score    = signal.score,
        validation_errors   = errors,
    )

def _verify_citations(record: DecisionRecord, doc: SignalDocument) -> list[str]:
    """
    Verifies that cited Signal IDs [SIG-###] actually point to valid evidence.
    If the LLM cites a signal that is empty or doesn't exist, it's a hallucination.
    """
    errors = []
    all_text_to_check = (record.reason or "") + (record.tradeoff or "") + (record.evidence_primary or "")
    
    # Extract all [SIG-###] patterns
    citations = re.findall(r"\[SIG-(\d+)\]", all_text_to_check)
    valid_ids = doc.signal_ids.values()

    for sig_id_num in citations:
        full_id = f"SIG-{sig_id_num}"
        if full_id not in valid_ids:
            errors.append(f"Hallucination detected: Cited ID {full_id} does not exist.")
            continue
        
        # Check if the cited signal actually has content
        # Mapping back SIG-### to document fields
        field_map = {v: k for k, v in doc.signal_ids.items()}
        field_name = field_map.get(full_id)
        if field_name:
            content = getattr(doc, field_name, "")
            if not content or content == "(none)":
                errors.append(f"Hallucination detected: Cited ID {full_id} ({field_name}) is empty.")

    return errors

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

    doc    = build_signal_document(pr)
    doc.pattern = detect_pattern_change(doc.diff_before, doc.diff_after)
    signal = compute_confidence(doc)

    print(f"Confidence: {signal.level} ({signal.score})")
    print("Calling Gemini...\n")

    result = extract_decision(doc, signal)

    print(f"Decision:   {result.decision}")
    print(f"Reason:     {result.reason}")
    print(f"Tradeoff:   {result.tradeoff}")
    print(f"Evidence:   {result.evidence_primary}")
    print(f"Suggested:  {result.suggested_pr_desc}")
    if result.validation_errors:
        print(f"Errors:     {result.validation_errors}")