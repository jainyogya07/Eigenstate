import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Link2,
  AlertTriangle,
  GitPullRequest,
  User,
  Sparkles,
  Terminal,
  Brain,
  ArrowRight,
  ClipboardCheck,
  Clock,
} from 'lucide-react';
import Timeline from './Timeline';
import { apiFetch, confidenceToPercent } from '../api/client';
import { WHY_USE_LIVE_API } from '../data/demoSeed';

const MotionDiv = motion.div;

export const ConfidenceBadge = ({ score, subtitle }) => {
  const cls =
    score > 80
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : score > 50
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-200';

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold tabular-nums ${cls}`}>
        <Sparkles size={14} className="opacity-80" strokeWidth={1.75} />
        Confidence {score}%
      </div>
      {subtitle ? <span className="max-w-[14rem] text-right text-[10px] leading-snug text-github-text-secondary">{subtitle}</span> : null}
    </div>
  );
};

export const DecisionCard = ({ title, content, icon, variant = 'default' }) => (
  <div className="es-card-interactive h-full border border-github-border bg-github-bg-tertiary p-6">
    <div className="mb-3 flex items-center gap-2">
      <div
        className={
          variant === 'reason'
            ? 'text-github-blue'
            : variant === 'tradeoff'
              ? 'text-amber-400'
              : 'text-github-text-secondary'
        }
      >
        {icon}
      </div>
      <h4 className="text-xs font-medium text-github-text-secondary">{title}</h4>
    </div>
    <p className="text-sm leading-relaxed text-github-text-primary">{content}</p>
  </div>
);

export const EvidenceChain = ({ evidence }) => {
  const evidenceArray = Array.isArray(evidence)
    ? evidence
    : (typeof evidence === 'string' && evidence.trim() !== '' ? [evidence] : []);

  return (
    <div className="mt-8">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-medium text-github-text-secondary">
        <Link2 size={12} className="text-github-text-secondary" strokeWidth={1.75} /> Evidence chain
      </h4>
      <div className="grid gap-3">
        {evidenceArray.length > 0 ? (
          evidenceArray.map((ev, i) => (
            <div
              key={i}
              className="group flex items-center gap-3 rounded-lg border border-github-border bg-github-bg-secondary px-3 py-2 transition-colors duration-150 hover:border-[#444c56]"
            >
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-github-blue/50 group-hover:bg-github-blue" />
              <span className="font-mono text-xs text-github-text-secondary transition-colors group-hover:text-github-text-primary">
                {ev}
              </span>
            </div>
          ))
        ) : (
          <div className="text-xs text-slate-600 italic px-3">No specific evidence signals archived.</div>
        )}
      </div>
    </div>
  );
};

export const StalenessWarning = ({ isStale, warning }) => {
  if (!isStale) return null;
  return (
    <div className="mb-8 flex items-start gap-4 rounded-xl border border-rose-500/25 bg-rose-500/5 p-5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
        <Clock size={22} strokeWidth={1.75} />
      </div>
      <div>
        <h5 className="mb-1 text-xs font-semibold text-rose-300">Possibly stale</h5>
        <p className="text-sm leading-relaxed text-rose-200/80">
          {warning || 'Newer commits may supersede this decision.'}
        </p>
      </div>
    </div>
  );
};

export const SuggestedPRDesc = ({ content }) => {
  if (!content) return null;
  return (
    <div className="relative mt-10 overflow-hidden rounded-xl border border-github-border bg-github-bg-tertiary p-6">
      <h4 className="mb-4 flex items-center gap-2 text-xs font-medium text-github-blue">
        <ClipboardCheck size={14} strokeWidth={1.75} /> Suggested PR description
      </h4>
      <div className="rounded-lg border border-github-border bg-github-bg-secondary p-4 font-mono text-sm leading-relaxed text-github-text-primary transition-colors duration-150">
        {content}
      </div>
    </div>
  );
};

const SEED_DECISIONS = {
  "Request": {
    function_name: "Request", file_path: "lib/request.js",
    changes: [{ decision: "Refactored the Request constructor to use a flyweight pattern, reducing memory allocation by 14% per concurrent connection.", reason: "The original pattern allocated a new closure per request, causing GC pressure under 10k+ RPS loads. Flyweight shares immutable config state.", tradeoff: "Slightly more complex initialization logic, but massive throughput gains under load.", confidence: 97, pr_number: 5415, pr_title: "refactor: optimize Request memory allocation", author: "mcollina", evidence: ["Benchmark: 14% reduction in heap allocations", "GC pause time reduced from 12ms to 3ms avg", "Confirmed by flamegraph analysis"], is_stale: false }]
  },
  "getRequestHeader": {
    function_name: "getRequestHeader", file_path: "lib/request.js",
    changes: [{ decision: "Implemented case-insensitive header lookup using a pre-built lowercase map instead of repeated toLowerCase() calls.", reason: "HTTP headers are case-insensitive per RFC 7230. Repeated toLowerCase() on hot paths was a measurable bottleneck.", tradeoff: "Extra memory for the pre-built map, but O(1) lookup vs O(n) string operations.", confidence: 92, pr_number: 5380, pr_title: "perf: optimize header access patterns", author: "delvedor", evidence: ["RFC 7230 Section 3.2 compliance", "Benchmark shows 8% improvement in header-heavy routes"], is_stale: false }]
  },
  "Reply": {
    function_name: "Reply", file_path: "lib/reply.js",
    changes: [{ decision: "Added streaming response support with backpressure handling to prevent memory exhaustion on large payloads.", reason: "Enterprise users reported OOM crashes when streaming 100MB+ JSON responses. Backpressure ensures the server doesn't buffer beyond safe limits.", tradeoff: "Added complexity to the response pipeline, but prevents catastrophic memory failures.", confidence: 95, pr_number: 5402, pr_title: "feat: add backpressure support to Reply.send()", author: "mcollina", evidence: ["Issue #5398: OOM on large streaming responses", "Memory usage capped at 64MB during 500MB payload streaming test"], is_stale: false }]
  },
  "send": {
    function_name: "send", file_path: "lib/reply.js",
    changes: [{ decision: "Unified the serialization path for JSON, Buffer, and Stream responses into a single dispatch function.", reason: "Three separate code paths led to inconsistent error handling and made it impossible to apply global response hooks uniformly.", tradeoff: "Slight overhead from type-checking dispatch, but dramatically simplified the codebase and enabled consistent hook application.", confidence: 90, pr_number: 5390, pr_title: "refactor: unify Reply.send() serialization paths", author: "jsumners", evidence: ["Reduced cyclomatic complexity from 12 to 4", "All 847 existing tests pass without modification"], is_stale: false }]
  },
  "hookRunner": {
    function_name: "hookRunner", file_path: "lib/hooks.js",
    changes: [{ decision: "Replaced recursive hook execution with an iterative trampolining approach to prevent stack overflow on deeply nested plugin hierarchies.", reason: "Recursive execution could exceed call stack limits when >50 plugins each registered lifecycle hooks. Trampoline eliminates stack growth.", tradeoff: "Marginally more complex control flow, but eliminates a class of production crashes entirely.", confidence: 96, pr_number: 5425, pr_title: "fix: prevent stack overflow in hook runner", author: "mcollina", evidence: ["Issue #5420: Stack overflow with 60+ plugins", "Successfully tested with 200 nested plugins"], is_stale: false }]
  },
  "buildRouting": {
    function_name: "buildRouting", file_path: "lib/route.js",
    changes: [{ decision: "Adopted a radix-tree based router with parametric compression for O(log n) route matching.", reason: "Linear route matching degraded to 2ms+ latency with 500+ registered routes. Radix tree maintains sub-microsecond matching regardless of route count.", tradeoff: "Higher upfront compilation cost during server startup, but negligible in production where startup happens once.", confidence: 91, pr_number: 5350, pr_title: "perf: switch to radix-tree routing engine", author: "delvedor", evidence: ["find-my-way v8 benchmark results", "Route matching: 0.8μs avg across 1000 routes"], is_stale: false }]
  },
  "validateSchema": {
    function_name: "validateSchema", file_path: "lib/validation.js",
    changes: [{ decision: "Pre-compile JSON Schema validators at route registration time using Ajv's standalone compilation mode.", reason: "Runtime schema compilation added 50ms+ to the first request on each route. Pre-compilation moves this cost to startup.", tradeoff: "Slightly slower server startup, but eliminates cold-start latency on first requests.", confidence: 93, pr_number: 5440, pr_title: "perf: pre-compile schema validators at startup", author: "eomm", evidence: ["Cold-start latency reduced from 52ms to 0.3ms", "Ajv standalone mode generates optimized validation functions"], is_stale: false }]
  },
  "createServer": {
    function_name: "createServer", file_path: "lib/server.js",
    changes: [{ decision: "Implemented graceful shutdown with connection draining and configurable timeout to prevent data loss during deployments.", reason: "Hard shutdown during rolling deployments caused in-flight requests to fail with ECONNRESET. Graceful drain ensures all active requests complete.", tradeoff: "Shutdown takes longer (configurable, default 30s), but prevents data loss and client errors.", confidence: 97, pr_number: 5460, pr_title: "feat: graceful shutdown with connection draining", author: "mcollina", evidence: ["Zero failed requests during rolling deployment tests", "Kubernetes readiness probe integration confirmed"], is_stale: false }]
  },
  "createError": {
    function_name: "createError", file_path: "lib/errors.js",
    changes: [{ decision: "Standardized error creation with error codes, HTTP status mapping, and structured metadata for observability tooling.", reason: "Ad-hoc error creation made it impossible to programmatically distinguish error types in monitoring dashboards.", tradeoff: "Requires all error sites to use the factory function, but enables automated alerting and error categorization.", confidence: 98, pr_number: 5470, pr_title: "refactor: standardize error creation with codes", author: "jsumners", evidence: ["Error categorization accuracy improved from 60% to 99%", "Datadog integration now auto-classifies errors"], is_stale: false }]
  },
  "parseBody": {
    function_name: "parseBody", file_path: "lib/request.js",
    changes: [{ decision: "Switched to a streaming JSON parser with configurable size limits to prevent DoS via oversized payloads.", reason: "The previous buffered approach loaded entire request bodies into memory before parsing, making the server vulnerable to memory exhaustion attacks.", tradeoff: "Streaming parser adds latency for small payloads (~0.2ms), but provides protection against arbitrarily large inputs.", confidence: 88, pr_number: 5395, pr_title: "security: streaming body parser with size limits", author: "mcollina", evidence: ["CVE-2024-1234 mitigation", "Max body size enforced at 1MB default", "Zero OOM incidents after deployment"], is_stale: false }]
  },
  "code": {
    function_name: "code", file_path: "lib/reply.js",
    changes: [{ decision: "Made status code setter chainable and added validation to reject invalid HTTP status codes at set-time rather than send-time.", reason: "Invalid status codes (e.g., 999, -1) were silently accepted and only failed when Node.js tried to write the response, making debugging extremely difficult.", tradeoff: "Adds a validation check on every .code() call, but catches bugs at the source instead of deep in the HTTP stack.", confidence: 93, pr_number: 5388, pr_title: "fix: validate status codes eagerly in Reply.code()", author: "delvedor", evidence: ["Catches 100% of invalid status codes at set-time", "Zero breaking changes to existing valid usage"], is_stale: false }]
  },
  "serialize": {
    function_name: "serialize", file_path: "lib/reply.js",
    changes: [{ decision: "Replaced JSON.stringify with fast-json-stringify using pre-compiled schema-based serializers for 3x throughput improvement.", reason: "JSON.stringify is generic and cannot leverage schema knowledge. Schema-aware serialization eliminates type checking and key enumeration overhead.", tradeoff: "Requires schemas to be defined for optimal performance; falls back to JSON.stringify for unschema'd routes.", confidence: 85, pr_number: 5355, pr_title: "perf: schema-based fast serialization", author: "mcollina", evidence: ["3.2x improvement in serialization throughput", "fast-json-stringify benchmark suite results", "Backward compatible via automatic fallback"], is_stale: false }]
  },
  "findRoute": {
    function_name: "findRoute", file_path: "lib/route.js",
    changes: [{ decision: "Added support for parametric constraints (version, host) in route matching using a constraint-driven strategy pattern.", reason: "API versioning required matching routes by Accept-Version header, which the basic radix tree couldn't express.", tradeoff: "Adds a constraint evaluation step per match, but enables powerful multi-version API hosting on a single server.", confidence: 89, pr_number: 5360, pr_title: "feat: constraint-based route matching", author: "delvedor", evidence: ["API versioning via Accept-Version header", "Host-based routing for multi-tenant setups", "find-my-way constraint benchmarks"], is_stale: false }]
  },
  "handleRequest": {
    function_name: "handleRequest", file_path: "lib/route.js",
    changes: [{ decision: "Implemented a zero-allocation request handling pipeline by reusing context objects from a pre-allocated pool.", reason: "Each request previously created 4-6 context objects that immediately became garbage. Object pooling eliminates this allocation entirely.", tradeoff: "Pool management adds slight complexity; objects must be properly reset between uses to prevent data leaks.", confidence: 94, pr_number: 5370, pr_title: "perf: zero-allocation request pipeline", author: "mcollina", evidence: ["GC pause frequency reduced by 60%", "Heap allocation per request: 0 bytes (down from 2.4KB)", "No data leaks detected in 72h soak test"], is_stale: false }]
  },
  "onRequestHook": {
    function_name: "onRequestHook", file_path: "lib/hooks.js",
    changes: [{ decision: "Added request-level timeout enforcement in the onRequest hook to prevent slow middleware from blocking the entire event loop.", reason: "A single slow authentication middleware could block all concurrent requests. Per-hook timeouts isolate the blast radius.", tradeoff: "Adds timer overhead per hook invocation, but prevents cascading failures from slow dependencies.", confidence: 87, pr_number: 5430, pr_title: "feat: per-hook timeout enforcement", author: "jsumners", evidence: ["Prevents event loop blocking from slow auth providers", "Configurable timeout: default 30s per hook", "Circuit-breaker pattern integration"], is_stale: false }]
  },
  "preHandlerHook": {
    function_name: "preHandlerHook", file_path: "lib/hooks.js",
    changes: [{ decision: "Introduced async generator support in preHandler hooks to enable streaming validation of request data before handler execution.", reason: "Large file uploads needed to be validated (virus scan, format check) before the handler ran, but buffering the entire upload defeated the purpose of streaming.", tradeoff: "Async generators add complexity to the hook execution model, but enable truly streaming pre-processing.", confidence: 82, pr_number: 5432, pr_title: "feat: streaming preHandler with async generators", author: "mcollina", evidence: ["File upload validation without full buffering", "Memory usage constant regardless of upload size", "Compatible with existing sync preHandler hooks"], is_stale: false }]
  },
  "onSendHook": {
    function_name: "onSendHook", file_path: "lib/hooks.js",
    changes: [{ decision: "Added response mutation capability in onSend hooks with immutability guarantees using structural cloning for non-primitive payloads.", reason: "Multiple onSend hooks could accidentally mutate shared response objects, causing race conditions in concurrent requests.", tradeoff: "Structural cloning adds CPU overhead for large objects, but eliminates an entire class of concurrency bugs.", confidence: 79, pr_number: 5435, pr_title: "fix: immutable response payloads in onSend hooks", author: "eomm", evidence: ["Eliminated 3 reported race conditions", "structuredClone used for objects > 1KB", "Small payloads passed by value (no clone needed)"], is_stale: true }]
  },
  "compileSchema": {
    function_name: "compileSchema", file_path: "lib/validation.js",
    changes: [{ decision: "Implemented shared schema reference resolution with a global schema store to enable cross-route $ref usage.", reason: "Each route compiled schemas independently, duplicating shared definitions like User, Address, Error across hundreds of routes.", tradeoff: "Global schema store introduces coupling between routes, but reduces memory by 40% in schema-heavy applications.", confidence: 88, pr_number: 5445, pr_title: "feat: shared schema store with $ref resolution", author: "eomm", evidence: ["Memory reduction: 40% for apps with 200+ routes", "JSON Schema $ref spec compliance", "$id-based resolution with cycle detection"], is_stale: false }]
  },
  "loadPlugin": {
    function_name: "loadPlugin", file_path: "lib/plugins/avvio.js",
    changes: [{ decision: "Implemented topological sort for plugin loading to ensure dependency order is respected regardless of registration order.", reason: "Plugins with inter-dependencies could fail silently if registered in the wrong order. Topological sort guarantees correct initialization.", tradeoff: "Adds startup overhead for dependency graph construction, but eliminates order-dependent initialization bugs.", confidence: 91, pr_number: 5480, pr_title: "feat: dependency-aware plugin loading", author: "mcollina", evidence: ["Kahn's algorithm for topological sorting", "Circular dependency detection with useful error messages", "100% backward compatible with existing plugin registration"], is_stale: false }]
  },
  "registerPlugin": {
    function_name: "registerPlugin", file_path: "lib/plugins/avvio.js",
    changes: [{ decision: "Added encapsulation boundaries to plugin registration to prevent plugins from leaking decorators, hooks, and routes into parent scopes.", reason: "Without encapsulation, any plugin could accidentally modify the global Fastify instance, causing unpredictable behavior in other plugins.", tradeoff: "Plugins must explicitly use fastify-plugin to share state, but provides strong isolation guarantees.", confidence: 86, pr_number: 5485, pr_title: "feat: plugin encapsulation boundaries", author: "mcollina", evidence: ["Encapsulation prevents decorator pollution", "fastify-plugin opt-in for shared state", "30% reduction in plugin-related bug reports"], is_stale: false }]
  },
  "listen": {
    function_name: "listen", file_path: "lib/server.js",
    changes: [{ decision: "Unified the listen API to accept both callback and promise patterns, with automatic port selection when port 0 is specified.", reason: "The dual callback/promise API was confusing. Unified interface auto-detects usage pattern and selects the appropriate behavior.", tradeoff: "Internal complexity from supporting both patterns, but dramatically simplifies the developer experience.", confidence: 94, pr_number: 5462, pr_title: "refactor: unified listen() API", author: "mcollina", evidence: ["API ergonomics survey: 95% approval", "Automatic port selection for testing scenarios", "Full backward compatibility maintained"], is_stale: false }]
  },
  "close": {
    function_name: "close", file_path: "lib/server.js",
    changes: [{ decision: "Implemented ordered teardown with dependency-aware plugin unloading to prevent resource leaks during shutdown.", reason: "Plugins that depended on database connections would crash if the DB plugin closed first. Reverse topological teardown ensures correct order.", tradeoff: "Shutdown is sequential (not parallel), but guarantees no resource access after cleanup.", confidence: 92, pr_number: 5465, pr_title: "feat: ordered teardown in close()", author: "jsumners", evidence: ["Zero resource leak incidents post-deployment", "Reverse dependency order for teardown", "onClose hooks called in guaranteed order"], is_stale: false }]
  },
  "FST_ERR_NOT_FOUND": {
    function_name: "FST_ERR_NOT_FOUND", file_path: "lib/errors.js",
    changes: [{ decision: "Custom 404 error type with automatic route suggestion based on Levenshtein distance to registered routes.", reason: "Generic 404s in development provided no actionable information. Route suggestions help developers find typos instantly.", tradeoff: "Levenshtein computation adds ~0.1ms per 404, but only runs in development mode.", confidence: 95, pr_number: 5472, pr_title: "dx: 404 errors with route suggestions", author: "jsumners", evidence: ["Development mode route suggestion accuracy: 92%", "Production mode: zero overhead (suggestions disabled)", "Developer feedback: 'saves hours of debugging'"], is_stale: false }]
  },
  "FST_ERR_BAD_STATUS": {
    function_name: "FST_ERR_BAD_STATUS", file_path: "lib/errors.js",
    changes: [{ decision: "Added early validation error for invalid HTTP status codes with contextual error messages showing the offending route and handler.", reason: "Invalid status codes caused cryptic Node.js internal errors that were nearly impossible to trace back to the source handler.", tradeoff: "Adds validation on the hot path, but the check is a simple numeric range test with negligible overhead.", confidence: 90, pr_number: 5475, pr_title: "dx: contextual error for invalid status codes", author: "delvedor", evidence: ["Error message includes route path and handler name", "Numeric range check: ~0.001ms overhead", "Eliminates cryptic ERR_HTTP_INVALID_STATUS_CODE errors"], is_stale: false }]
  }
};

export const WhyPanel = ({ selectedFunction }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- loading gate before fetch */
  useEffect(() => {
    if (!selectedFunction) return;

    if (!WHY_USE_LIVE_API) {
      setData(SEED_DECISIONS[selectedFunction.name] || null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const owner = selectedFunction.owner || 'fastify';
    const repo = selectedFunction.repo || 'fastify';
    const filePath = selectedFunction.path ? String(selectedFunction.path).trim() : '';

    let q = `owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&function_name=${encodeURIComponent(selectedFunction.name)}`;
    if (filePath) {
      q += `&file_path=${encodeURIComponent(filePath)}`;
    }
    apiFetch(`/api/v1/why?${q}`)
      .then((resData) => {
        if (resData && resData.changes && resData.changes.length > 0) {
          setData(resData);
        } else {
          setData(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch decision:', err);
        setData(null);
        setLoading(false);
      });
  }, [selectedFunction]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!selectedFunction) {
    const flow = [
      {
        step: '01',
        title: 'Ingest',
        body: 'Pull requests and default-branch commits become structured signals—diffs, messages, review threads, and touched symbols (repos without PRs still ingest via recent commits).',
        icon: GitPullRequest,
      },
      {
        step: '02',
        title: 'Extract',
        body: 'The model resolves decision, rationale, and tradeoffs, grounded in evidence from the graph.',
        icon: Brain,
      },
      {
        step: '03',
        title: 'Trace',
        body: 'Lineage connects decisions over time so you can see how intent shifts across refactors.',
        icon: Link2,
      },
    ];

    return (
      <MotionDiv
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="custom-scrollbar h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-github-bg-primary px-6 py-10 md:px-10 md:py-12"
      >
        <div className="es-container min-w-0 max-w-3xl space-y-12">
          <header className="space-y-3">
            <p className="es-overline text-github-blue">Why Explorer</p>
            <h1 className="es-h1 text-white">How decisions evolve</h1>
            <p className="es-body max-w-xl text-base">
              Pick a symbol in the registry. EigenState reconstructs not only what changed, but why the tradeoff was
              worth it—and how that narrative connects to later work.
            </p>
          </header>

          <div className="relative pl-8">
            <div
              className="absolute bottom-2 left-[15px] top-2 w-px bg-github-border"
              aria-hidden
            />
            <ol className="space-y-8">
              {flow.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.step} className="relative">
                    <div className="absolute -left-8 top-1 flex h-8 w-8 items-center justify-center rounded-full border border-github-border bg-github-bg-secondary text-xs font-semibold text-github-text-secondary">
                      {item.step}
                    </div>
                    <div className="es-card-static border border-github-border bg-github-bg-tertiary p-5 transition-colors duration-150 hover:border-[#444c56]">
                      <div className="mb-2 flex items-center gap-2">
                        <Icon size={16} className="text-github-blue" strokeWidth={1.75} />
                        <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                      </div>
                      <p className="text-sm leading-relaxed text-github-text-secondary">{item.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <section className="grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'Audit-ready',
                desc: 'Every claim ties back to PRs or commits, files, and authors—not generic summaries.',
                icon: ShieldCheck,
              },
              {
                title: 'Conflict-aware',
                desc: 'Surface tension when new code contradicts prior architectural intent.',
                icon: AlertTriangle,
              },
              {
                title: 'Lineage-native',
                desc: 'Decisions are ordered in time so refactors read as a story, not a snapshot.',
                icon: Sparkles,
              },
            ].map((f) => (
              <div
                key={f.title}
                className="es-card-interactive border border-github-border bg-github-bg-tertiary p-5"
              >
                <f.icon className="mb-3 text-github-blue" size={18} strokeWidth={1.75} />
                <h3 className="mb-1 text-sm font-semibold text-white">{f.title}</h3>
                <p className="text-xs leading-relaxed text-github-text-secondary">{f.desc}</p>
              </div>
            ))}
          </section>
        </div>
      </MotionDiv>
    );
  }

  if (loading) {
    return (
      <div className="h-full bg-github-bg-primary p-12 animate-pulse space-y-8">
        <div className="h-10 bg-github-bg-tertiary rounded-xl w-3/4"></div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-40 bg-slate-800/40 rounded-2xl w-full"></div>
          <div className="h-40 bg-slate-800/40 rounded-2xl w-full"></div>
        </div>
        <div className="h-60 bg-slate-800/40 rounded-2xl w-full"></div>
      </div>
    );
  }

  const latestChange = data?.changes?.[data.changes.length - 1];
  const owner = selectedFunction.owner || "fastify";
  const repo = selectedFunction.repo || "fastify";
  const confidences = (data?.changes || []).map((c) => confidenceToPercent(c.confidence));
  const peakConfidence = confidences.length ? Math.max(...confidences) : 0;
  const latestPct = latestChange ? confidenceToPercent(latestChange.confidence) : 0;
  let confidenceSubtitle;
  if (confidences.length > 1 && latestPct !== peakConfidence) {
    confidenceSubtitle = `Latest timeline: ${latestPct}% · Peak across rows: ${peakConfidence}% (code map uses peak)`;
  } else if (confidences.length > 1) {
    confidenceSubtitle = `${confidences.length} indexed rows for this symbol in this file`;
  }

  return (
    <MotionDiv
      key={selectedFunction?.name || 'empty'}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-github-bg-primary px-6 py-10 custom-scrollbar md:px-10 md:py-12"
    >
      <div className="mx-auto min-w-0 max-w-4xl pb-16">
        <StalenessWarning isStale={latestChange?.is_stale} warning={latestChange?.staleness_warning} />

        {!WHY_USE_LIVE_API && (
          <p className="mb-6 rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2 text-xs text-github-text-secondary">
            Offline demo mode: fastify sample decisions only. For your ingested repos, remove{' '}
            <code className="font-mono text-github-text-primary">VITE_USE_SEED_WHY_ONLY</code> from env (default is live{' '}
            <span className="font-mono">/api/v1/why</span>).
          </p>
        )}

        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="es-overline mb-2 text-github-text-secondary">Selected symbol</p>
            <h2 className="truncate text-2xl font-bold tracking-tight text-white md:text-3xl">
              {data?.function_name || selectedFunction.name}
            </h2>
            <p className="mt-2 flex items-center gap-2 font-mono text-sm text-github-text-secondary">
              <Terminal size={14} className="shrink-0 text-github-blue" strokeWidth={1.75} />
              {selectedFunction.path || data?.file_path}
            </p>
          </div>
          {latestChange && (
            <ConfidenceBadge score={peakConfidence || latestPct} subtitle={confidenceSubtitle} />
          )}
        </div>

        {latestChange ? (
          <div className="space-y-6">
            <DecisionCard
              title="Architectural Decision"
              icon={<ShieldCheck size={18} />}
              content={latestChange.decision}
              variant="default"
            />

            <div className="grid grid-cols-2 gap-6">
              <DecisionCard
                title="Reasoning Logic"
                icon={<Brain size={18} />}
                content={latestChange.reason}
                variant="reason"
              />
              <DecisionCard
                title="Tradeoff Analysis"
                icon={<AlertTriangle size={18} />}
                content={latestChange.tradeoff}
                variant="tradeoff"
              />
            </div>

            <SuggestedPRDesc content={latestChange.suggested_pr_desc} />

            {/* Evidence & Source Signal */}
            <div className="mt-10 grid gap-8 border-t border-github-border pt-10 md:grid-cols-3">
              <div className="md:col-span-2">
                <EvidenceChain evidence={latestChange.evidence || []} />
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-medium text-github-text-secondary">
                    <GitPullRequest size={12} className="text-github-blue" strokeWidth={1.75} /> Source PR
                  </h4>
                  <a
                    href={`https://github.com/${owner}/${repo}/pull/${latestChange.pr_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="es-card-interactive block rounded-xl border border-github-border bg-github-bg-secondary p-4"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-white">PR #{latestChange.pr_number}</p>
                      <ArrowRight size={14} className="shrink-0 text-github-text-secondary" strokeWidth={1.75} />
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-github-text-secondary">
                      {latestChange.pr_title}
                    </p>
                  </a>
                </div>

                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-medium text-github-text-secondary">
                    <User size={12} className="text-emerald-400" strokeWidth={1.75} /> Author
                  </h4>
                  <div className="flex items-center gap-3 rounded-lg border border-github-border bg-github-bg-secondary px-3 py-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 text-xs font-semibold uppercase text-emerald-300">
                      {latestChange.author?.[0] || 'A'}
                    </div>
                    <span className="text-sm font-medium text-github-text-primary">
                      {latestChange.author || 'Anonymous'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Decision Lineage Timeline */}
            <Timeline history={data.changes} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-github-border bg-github-bg-tertiary px-6 py-12 text-center">
            <p className="text-sm text-github-text-secondary">
              No indexed rows for <span className="font-mono text-github-text-primary">{selectedFunction.name}</span>
              {selectedFunction.path ? (
                <>
                  {' '}
                  in <span className="font-mono text-github-text-primary">{selectedFunction.path}</span>
                </>
              ) : null}
              . Re-ingest or pick the same symbol from another file if the name is duplicated.
            </p>
          </div>
        )}
      </div>
    </MotionDiv>
  );
};

export default WhyPanel;