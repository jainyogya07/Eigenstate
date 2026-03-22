-- Table to store raw data fetched from GitHub
CREATE TABLE IF NOT EXISTS raw_ingestions (
    id SERIAL PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    metadata JSONB NOT NULL,
    diff TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner, repo, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_raw_ingestions_status ON raw_ingestions(status);

-- Table to store Rust intelligence analysis results
CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    analysis JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner, repo, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_analysis_results_repo ON analysis_results(owner, repo);

-- Table to store PR review comments for intent inference
CREATE TABLE IF NOT EXISTS pr_comments (
    id SERIAL PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    comments JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner, repo, pr_number)
);

CREATE INDEX IF NOT EXISTS idx_pr_comments_repo ON pr_comments(owner, repo);
