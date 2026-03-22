# api.py
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from datetime import datetime
from typing import Optional

# Load .env from parent directory
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import asyncio
from reasoning_engine import run_pipeline
from staleness_checker import PRSummary
from database import save_decision, get_decisions_for_function, init_db

# ── Concurrency Control ───────────────────────────────────────────────────────
# LLM APIs have rate limits; use a semaphore to avoid overloading.
llm_semaphore = asyncio.Semaphore(2)

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Eigenstate Intelligence Layer",
    description="Reasoning engine that extracts engineering decisions from PRs",
    version="1.0.0",
)

@app.on_event("startup")
def startup():
    init_db()


# ── Request / Response schemas ────────────────────────────────────────────────

class DiffFile(BaseModel):
    filename: str
    patch:    Optional[str] = ""
    source:   Optional[str] = None   # full source file if available


class PRPayload(BaseModel):
    repo:       str
    pr_number:  int
    title:      str
    body:       Optional[str] = ""
    commit_message: Optional[str] = ""
    merged_at:  Optional[datetime] = None
    comments:   Optional[list[dict]] = []
    diff_files: Optional[list[DiffFile]] = []


class IssuePayload(BaseModel):
    title: Optional[str] = ""
    body:  Optional[str] = ""


class LaterPR(BaseModel):
    pr_number:         int
    title:             str
    merged_at:         datetime
    changed_functions: Optional[list[str]] = []
    changed_files:     Optional[list[str]] = []


class ProcessRequest(BaseModel):
    pr:        PRPayload
    issue:     Optional[IssuePayload] = None
    later_prs: Optional[list[LaterPR]] = []


class ProcessResponse(BaseModel):
    status:           str
    repo:             str
    pr_number:        int
    confidence_level: str
    confidence_score: int
    decision:         Optional[str]
    reason:           Optional[str]
    tradeoff:         Optional[str]
    suggested_pr_desc: Optional[str]
    changed_functions: list[str]
    is_stale:         bool
    staleness_warning: Optional[str]
    decision_id:      Optional[str]


# ── POST /process ─────────────────────────────────────────────────────────────

@app.post("/process", response_model=ProcessResponse)
async def process_pr(request: ProcessRequest):
    """
    Main endpoint consumed by the Go ingestion service.
    Runs the full reasoning pipeline and writes the decision to PostgreSQL.
    """

    # Convert Pydantic models to plain dicts for reasoning_engine
    pr_dict = {
        "title":          request.pr.title,
        "body":           request.pr.body or "",
        "commit_message": request.pr.commit_message or "",
        "comments":       request.pr.comments or [],
        "diff_files": [
            {
                "filename": f.filename,
                "patch":    f.patch or "",
                "source":   f.source,
            }
            for f in (request.pr.diff_files or [])
        ],
    }

    issue_dict = None
    if request.issue:
        issue_dict = {
            "title": request.issue.title or "",
            "body":  request.issue.body  or "",
        }

    later_prs = [
        PRSummary(
            pr_number         = lpr.pr_number,
            title             = lpr.title,
            merged_at         = lpr.merged_at,
            changed_functions = lpr.changed_functions or [],
            changed_files     = lpr.changed_files     or [],
        )
        for lpr in (request.later_prs or [])
    ]

    decision_ts = request.pr.merged_at or datetime.utcnow()

    # Run full pipeline with rate limiting
    try:
        async with llm_semaphore:
            # run_pipeline is CPU/Net heavy, offload to thread to keep FastAPI responsive
            result = await asyncio.to_thread(
                run_pipeline,
                pr_dict,
                issue_dict,
                later_prs,
                decision_ts
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    # Skip saving if no decision was extracted
    decision_id = None
    if result.confidence_level != "INSUFFICIENT_DATA" and result.decision:
        try:
            row = save_decision(
                repo        = request.pr.repo,
                pr_number   = request.pr.pr_number,
                pr_title    = request.pr.title,
                result      = result,
                decision_ts = decision_ts,
            )
            decision_id = str(row.id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DB write error: {e}")

    return ProcessResponse(
        status            = "ok",
        repo              = request.pr.repo,
        pr_number         = request.pr.pr_number,
        confidence_level  = result.confidence_level,
        confidence_score  = result.confidence_score,
        decision          = result.decision,
        reason            = result.reason,
        tradeoff          = result.tradeoff,
        suggested_pr_desc = result.suggested_pr_desc,
        changed_functions = result.changed_functions,
        is_stale          = result.is_stale,
        staleness_warning = result.staleness_warning,
        decision_id       = decision_id,
    )


# ── GET /why ──────────────────────────────────────────────────────────────────

@app.get("/why")
def get_why(repo: str, function: str):
    """
    Returns all decisions for a given function in a repo.
    Consumed by the Go query API which serves the frontend.
    """
    rows = get_decisions_for_function(repo, function)
    if not rows:
        raise HTTPException(
            status_code=404,
            detail=f"No decisions found for {function} in {repo}"
        )
    return [
        {
            "id":               str(row.id),
            "pr_number":        row.pr_number,
            "pr_title":         row.pr_title,
            "decision":         row.decision_text,
            "reason":           row.reason_text,
            "tradeoff":         row.tradeoff_text,
            "suggested_pr_desc": row.suggested_pr_desc,
            "confidence_level": row.confidence_level,
            "confidence_score": row.confidence_score,
            "evidence": {
                "primary":    row.evidence_primary,
                "supporting": row.evidence_supporting,
                "conflicts":  row.evidence_conflicts,
            },
            "is_stale":         row.is_stale,
            "staleness_warning": row.staleness_warning,
            "invalidated_by_pr": row.invalidated_by_pr,
            "decision_ts":      row.decision_ts.isoformat(),
        }
        for row in rows
    ]


# ── GET /health ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)