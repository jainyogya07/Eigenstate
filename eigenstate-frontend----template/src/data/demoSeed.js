/**
 * Offline / GitHub rate-limit demo data. Git Intelligence & History use this when the API returns
 * empty counts or no rows.
 *
 * Why Explorer: by default calls /api/v1/why with your ingested data.
 * Set VITE_USE_SEED_WHY_ONLY=true for offline pitch (fastify demo decisions only).
 */
export const WHY_USE_LIVE_API = import.meta.env.VITE_USE_SEED_WHY_ONLY !== 'true';

/** Shown when API is reachable but the database has no rows (fresh workspace). */
export const EMPTY_STATS = {
  total_ingestions: 0,
  total_analyses: 0,
  pending_ingestions: 0,
};

export const SEED_STATS = {
  total_ingestions: 47,
  total_analyses: 312,
  pending_ingestions: 3,
};

/** Numeric ids for stable React keys in clustered lists */
export const SEED_INGESTIONS = [
  { id: 1, owner: 'fastify', repo: 'fastify', pr_number: 5415, status: 'completed', created_at: '2025-03-18T10:30:00Z' },
  { id: 2, owner: 'fastify', repo: 'fastify', pr_number: 5425, status: 'completed', created_at: '2025-03-17T14:20:00Z' },
  { id: 3, owner: 'fastify', repo: 'fastify', pr_number: 5460, status: 'completed', created_at: '2025-03-16T09:10:00Z' },
  { id: 4, owner: 'fastify', repo: 'fastify', pr_number: 5440, status: 'completed', created_at: '2025-03-15T16:45:00Z' },
  { id: 5, owner: 'nodejs', repo: 'node', pr_number: 52140, status: 'pending', created_at: '2025-03-18T12:00:00Z' },
  { id: 6, owner: 'expressjs', repo: 'express', pr_number: 5680, status: 'pending', created_at: '2025-03-18T11:30:00Z' },
  { id: 7, owner: 'fastify', repo: 'fastify', pr_number: 5390, status: 'completed', created_at: '2025-03-14T11:00:00Z' },
  { id: 8, owner: 'fastify', repo: 'fastify', pr_number: 5470, status: 'completed', created_at: '2025-03-13T08:30:00Z' },
  { id: 9, owner: 'fastify', repo: 'fastify', pr_number: 5350, status: 'completed', created_at: '2025-03-12T15:20:00Z' },
  { id: 10, owner: 'expressjs', repo: 'express', pr_number: 5672, status: 'error', created_at: '2025-03-11T13:00:00Z' },
];

export const SEED_LINEAGE = [
  { name: 'Request', file_path: 'lib/request.js', change_type: 'Optimization', date: '2025-03-18T10:30:00Z', pr_number: 5415, confidence: 97, summary: 'Optimization: Flyweight pattern for Request constructor', decision: 'Refactored the Request constructor to use a flyweight pattern, reducing memory allocation by 14% per concurrent connection under high RPS loads.', author: 'mcollina' },
  { name: 'hookRunner', file_path: 'lib/hooks.js', change_type: 'Security', date: '2025-03-17T14:20:00Z', pr_number: 5425, confidence: 96, summary: 'Security: Stack overflow prevention in hook runner', decision: 'Replaced recursive hook execution with iterative trampolining to prevent stack overflow exploits in deeply nested plugin hierarchies.', author: 'mcollina' },
  { name: 'Reply.send', file_path: 'lib/reply.js', change_type: 'Refactor', date: '2025-03-15T09:10:00Z', pr_number: 5390, confidence: 90, summary: 'Refactor: Unified serialization paths', decision: 'Unified the serialization path for JSON, Buffer, and Stream responses into a single dispatch function for consistent hook application.', author: 'jsumners' },
  { name: 'buildRouting', file_path: 'lib/route.js', change_type: 'Optimization', date: '2025-03-12T16:45:00Z', pr_number: 5350, confidence: 91, summary: 'Optimization: Radix-tree routing engine', decision: 'Adopted a radix-tree based router with parametric compression for O(log n) route matching, maintaining sub-microsecond latency across 1000+ routes.', author: 'delvedor' },
  { name: 'createServer', file_path: 'lib/server.js', change_type: 'Architecture', date: '2025-03-10T11:00:00Z', pr_number: 5460, confidence: 97, summary: 'Architecture: Graceful shutdown with connection draining', decision: 'Implemented graceful shutdown with connection draining and configurable timeout to prevent data loss during rolling deployments.', author: 'mcollina' },
  { name: 'validateSchema', file_path: 'lib/validation.js', change_type: 'Optimization', date: '2025-03-08T08:30:00Z', pr_number: 5440, confidence: 93, summary: 'Optimization: Pre-compiled schema validators', decision: 'Pre-compile JSON Schema validators at route registration time using Ajv standalone compilation mode, eliminating cold-start latency.', author: 'eomm' },
  { name: 'createError', file_path: 'lib/errors.js', change_type: 'Refactor', date: '2025-03-05T15:20:00Z', pr_number: 5470, confidence: 98, summary: 'Refactor: Standardized error codes', decision: 'Standardized error creation with error codes, HTTP status mapping, and structured metadata for observability tooling integration.', author: 'jsumners' },
  { name: 'Reply', file_path: 'lib/reply.js', change_type: 'Security', date: '2025-03-02T13:00:00Z', pr_number: 5402, confidence: 95, summary: 'Security: Backpressure handling for large payloads', decision: 'Added streaming response support with backpressure handling to prevent memory exhaustion (OOM) on 100MB+ JSON payloads.', author: 'mcollina' },
  { name: 'parseBody', file_path: 'lib/request.js', change_type: 'Security', date: '2025-02-28T09:00:00Z', pr_number: 5395, confidence: 88, summary: 'Security: Streaming body parser with size limits', decision: 'Switched to a streaming JSON parser with configurable size limits to reduce DoS risk from oversized payloads.', author: 'mcollina' },
  { name: 'handleRequest', file_path: 'lib/route.js', change_type: 'Optimization', date: '2025-02-22T11:15:00Z', pr_number: 5370, confidence: 94, summary: 'Optimization: Zero-allocation request pipeline', decision: 'Reuse context objects from a pool to remove per-request allocations on the hot path.', author: 'mcollina' },
  { name: 'loadPlugin', file_path: 'lib/plugins/avvio.js', change_type: 'Architecture', date: '2025-02-18T16:00:00Z', pr_number: 5480, confidence: 91, summary: 'Architecture: Topological plugin ordering', decision: 'Topological sort guarantees plugin init order regardless of registration order.', author: 'mcollina' },
  { name: 'serialize', file_path: 'lib/reply.js', change_type: 'Optimization', date: '2025-02-10T14:30:00Z', pr_number: 5355, confidence: 85, summary: 'Optimization: Schema-based fast serialization', decision: 'Pre-compiled serializers via fast-json-stringify where schemas exist; fallback preserves compatibility.', author: 'mcollina' },
];

export function hasBackendIngestionActivity(stats, ingestions) {
  const ti = Number(stats?.total_ingestions) || 0;
  const ta = Number(stats?.total_analyses) || 0;
  const list = Array.isArray(ingestions) ? ingestions : [];
  return ti > 0 || ta > 0 || list.length > 0;
}
