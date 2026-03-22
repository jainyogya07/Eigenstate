# config.py
from dataclasses import dataclass

@dataclass
class Config:
    # Confidence thresholds
    CONFIDENCE_HIGH       = 85
    CONFIDENCE_MEDIUM     = 55
    CONFIDENCE_LOW        = 30
    CONFIDENCE_INFERRED   = 10
    CONFIDENCE_INSUFFICIENT = 0

    # Staleness threshold in days
    STALENESS_DAYS = 730  # 2 years per spec

    # Languages tree-sitter will handle
    SUPPORTED_LANGUAGES = ["javascript", "typescript", "python", "go"]

    # File extension → language name
    EXT_MAP = {
        ".js":  "javascript",
        ".jsx": "javascript",
        ".ts":  "typescript",
        ".tsx": "typescript",
        ".py":  "python",
        ".go":  "go",
    }

config = Config()