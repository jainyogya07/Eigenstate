import os
from sqlalchemy import (
    create_engine, Column, String, Text,
    Integer, Float, Boolean, DateTime, JSON
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid

# ── Connection ────────────────────────────────────────────────────────────────

# Default to local socket for convenience in this environment
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql:///eigenstate")

engine  = create_engine(DATABASE_URL, echo=False)
Session = sessionmaker(bind=engine)
Base    = DeclarativeBase()

class Base(DeclarativeBase):
    pass

# ── Decisions table — matches spec schema exactly ─────────────────────────────

class Decision(Base):
    __tablename__ = "decisions"

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # PR identity
    repo                = Column(String(255), nullable=False)
    pr_number           = Column(Integer, nullable=False)
    pr_title            = Column(Text)

    # Function scope
    function_name       = Column(String(255))   # primary function this decision affects
    changed_functions   = Column(JSON)           # all functions touched
    changed_files       = Column(JSON)           # all files touched

    # Decision content
    decision_text       = Column(Text)
    reason_text         = Column(Text)
    tradeoff_text       = Column(Text)
    suggested_pr_desc   = Column(Text)

    # Evidence
    evidence_primary    = Column(Text)
    evidence_supporting = Column(JSON)
    evidence_conflicts  = Column(Text)

    # Confidence
    confidence_level    = Column(String(50))     # HIGH | MEDIUM | LOW | INFERRED | INSUFFICIENT_DATA
    confidence_score    = Column(Integer)        # 0–100
    confidence_reason   = Column(Text)
    confidence_source   = Column(Text)

    # Staleness
    is_stale            = Column(Boolean, default=False)
    staleness_warning   = Column(Text)
    invalidated_by_pr   = Column(Integer)

    # Meta
    decision_ts         = Column(DateTime, nullable=False)
    created_at          = Column(DateTime, default=datetime.utcnow)
    model_used          = Column(String(100))


def init_db():
    """Creates all tables if they don't exist yet."""
    Base.metadata.create_all(engine)
    print("✓ Database tables created")


def save_decision(
    repo:       str,
    pr_number:  int,
    pr_title:   str,
    result,                  # ReasoningResult from reasoning_engine.py
    decision_ts: datetime,
) -> Decision:
    """
    Writes a ReasoningResult to the decisions table.
    Returns the saved Decision row.
    """
    db = Session()
    try:
        row = Decision(
            repo                = repo,
            pr_number           = pr_number,
            pr_title            = pr_title,
            function_name       = result.changed_functions[0] if result.changed_functions else None,
            changed_functions   = result.changed_functions,
            changed_files       = result.changed_files,
            decision_text       = result.decision,
            reason_text         = result.reason,
            tradeoff_text       = result.tradeoff,
            suggested_pr_desc   = result.suggested_pr_desc,
            evidence_primary    = result.evidence_primary,
            evidence_supporting = result.evidence_supporting,
            evidence_conflicts  = result.evidence_conflicts,
            confidence_level    = result.confidence_level,
            confidence_score    = result.confidence_score,
            confidence_reason   = result.confidence_reason,
            confidence_source   = result.confidence_source,
            is_stale            = result.is_stale,
            staleness_warning   = result.staleness_warning,
            invalidated_by_pr   = result.invalidated_by_pr,
            decision_ts         = decision_ts,
            model_used          = result.model_used,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()


def get_decisions_for_function(repo: str, function_name: str) -> list[Decision]:
    """
    Fetches all decisions for a given function in a repo.
    Used by the Go query API via the /why endpoint.
    """
    db = Session()
    try:
        return (
            db.query(Decision)
            .filter_by(repo=repo, function_name=function_name)
            .order_by(Decision.decision_ts.desc())
            .all()
        )
    finally:
        db.close()


#test
if __name__ == "__main__":
    init_db()

    # Verify table exists
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"Tables in DB: {tables}")   # should include 'decisions'