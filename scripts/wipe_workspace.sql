-- Run against the same Postgres as DATABASE_URL (psql "$DATABASE_URL" -f scripts/wipe_workspace.sql)
-- Clears all ingest-derived rows and registered repos (same as API reset-workspace).

BEGIN;

DELETE FROM functions;
DELETE FROM decision_timeline;
DELETE FROM pull_requests;
DELETE FROM issues;
DELETE FROM raw_ingestions;
DELETE FROM analysis_results;
DELETE FROM pr_comments;
DELETE FROM processing_events;
DELETE FROM registered_repos;

COMMIT;
