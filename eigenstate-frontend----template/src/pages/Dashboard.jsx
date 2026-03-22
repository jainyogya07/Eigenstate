import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  Cpu,
  GitBranch,
  LineChart,
  Loader2,
  Radio,
  ScanSearch,
  Shield,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch, formatRelativeTime, primaryRepo, resetEntireWorkspace } from '../api/client';
import { emitWorkspaceCleared } from '../lib/analyserSessionBridge';
import { clearAnalyserLocalState } from '../lib/analyserPersist';
import {
  EMPTY_STATS,
  SEED_INGESTIONS,
  SEED_LINEAGE,
  SEED_STATS,
  hasBackendIngestionActivity,
} from '../data/demoSeed';

const INSIGHTS_FALLBACK = [
  'Connect the Go server and database, then ingest a repository. Lineage-backed insights will appear here.',
  'Use Repo Analyser or Git Intelligence to review PR signal flow.',
  'Register repos under Settings (POST /repos) or via ingest.',
];

function mapIngestionsToFeedRows(list) {
  return list.slice(0, 12).map((ing) => ({
    id: ing.id,
    t:
      ing.status === 'completed'
        ? 'Ingest'
        : ing.status === 'pending'
          ? 'Queue'
          : ing.status === 'error'
            ? 'Risk'
            : 'Event',
    msg: `PR #${ing.pr_number} · ${ing.status}`,
    repo: `${ing.owner}/${ing.repo}`,
    ago: formatRelativeTime(ing.created_at) || '—',
  }));
}

/** Bar fill uses a soft saturation curve so small counts (e.g. 32) are not all pegged at 100%. */
function saturationPct(n, scale = 140) {
  if (n <= 0) return 4;
  return Math.min(100, Math.round(100 * (1 - Math.exp(-n / scale))));
}

function deriveHealth(stats) {
  if (!stats || typeof stats !== 'object') {
    return [
      { label: 'Indexed PRs', value: '—', pct: 12, hint: '', warn: false },
      { label: 'Analyses', value: '—', pct: 12, hint: '', warn: false },
      { label: 'Pending', value: '—', pct: 8, hint: '', warn: false },
      { label: 'Coverage', value: '—', pct: 0, hint: '', warn: false },
    ];
  }
  const ti = Number(stats.total_ingestions) || 0;
  const ta = Number(stats.total_analyses) || 0;
  const pe = Number(stats.pending_ingestions) || 0;
  const ratio = ti > 0 ? Math.min(100, Math.round((ta / Math.max(ti, 1)) * 100)) : 0;
  const pendingPressure = ti > 0 ? Math.min(100, Math.round((pe / Math.max(ti, 1)) * 100)) : pe > 0 ? 40 : 6;
  const backlogHeavy = ti > 0 && pe >= ti * 0.75;

  return [
    {
      label: 'Raw ingestions',
      value: String(ti),
      pct: saturationPct(ti, 160),
      hint: 'Rows in raw_ingestions (PR/commit jobs)',
      warn: false,
    },
    {
      label: 'Analyses stored',
      value: String(ta),
      pct: saturationPct(ta, 160),
      hint: 'Saved analysis JSON blobs',
      warn: false,
    },
    {
      label: 'Pending queue',
      value: String(pe),
      pct: pendingPressure,
      hint: backlogHeavy ? 'Most ingestions still pending — check workers / GitHub limits' : 'Subset with status = pending',
      warn: backlogHeavy,
    },
    {
      label: 'Analysis / ingestion',
      value: ti ? `${ratio}%` : '—',
      pct: ratio,
      hint: 'ta ÷ ingestions (coverage of the pipeline)',
      warn: false,
    },
  ];
}

function lineageToInsights(lineage) {
  if (!Array.isArray(lineage)) return [];
  return lineage
    .map((d) => (d.decision && String(d.decision).trim()) || (d.summary && String(d.summary).trim()) || '')
    .filter(Boolean)
    .slice(0, 3);
}

const ACTIVE_MODEL = import.meta.env.VITE_ACTIVE_MODEL || 'Reasoning pipeline';

export default function Dashboard() {
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [pingMs, setPingMs] = useState(null);
  const [stats, setStats] = useState(null);
  const [ingestions, setIngestions] = useState([]);
  const [lineage, setLineage] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [banner, setBanner] = useState(null);
  const [wipeBusy, setWipeBusy] = useState(false);

  const refresh = useCallback(async () => {
    const t0 = performance.now();
    let h = null;
    let ms = null;
    try {
      h = await apiFetch('/healthz');
      ms = Math.round(performance.now() - t0);
    } catch (e) {
      setBanner(`API unreachable (${e.message}). Using demo placeholders — is the server on :8080?`);
    }

    let repos = [];
    try {
      repos = await apiFetch('/repos');
    } catch {
      /* optional */
    }
    const { owner, repo } = primaryRepo(Array.isArray(repos) ? repos : []);

    const [st, ing, lin] = await Promise.all([
      apiFetch('/api/stats').catch(() => null),
      apiFetch('/api/ingestions').catch(() => []),
      apiFetch(`/api/v1/lineage?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&limit=8`).catch(
        () => [],
      ),
    ]);

    setHealth(h);
    setPingMs(ms);
    setStats(st);
    setIngestions(Array.isArray(ing) ? ing : []);
    setLineage(Array.isArray(lin) ? lin : []);
    setLastSync(new Date());
    if (h) setBanner(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    const id = setInterval(() => {
      if (!cancelled) refresh();
    }, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh]);

  const apiHealthy = health?.status === 'healthy';

  const displayStats = useMemo(() => {
    if (!apiHealthy) return SEED_STATS;
    if (stats == null) return EMPTY_STATS;
    if (hasBackendIngestionActivity(stats, ingestions)) return stats;
    return EMPTY_STATS;
  }, [apiHealthy, stats, ingestions]);

  const feed = useMemo(() => {
    if (!apiHealthy) return mapIngestionsToFeedRows(SEED_INGESTIONS);
    if (stats == null) return [];
    if (hasBackendIngestionActivity(stats, ingestions)) return mapIngestionsToFeedRows(ingestions);
    return [];
  }, [apiHealthy, stats, ingestions]);

  const healthRows = useMemo(() => deriveHealth(displayStats), [displayStats]);
  const insights = useMemo(() => {
    const fromApi = lineageToInsights(lineage);
    if (fromApi.length >= 2) return fromApi;
    if (!apiHealthy) {
      const merged = [...fromApi, ...lineageToInsights(SEED_LINEAGE), ...INSIGHTS_FALLBACK];
      const seen = new Set();
      const out = [];
      for (const s of merged) {
        if (!s || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
        if (out.length >= 3) break;
      }
      return out;
    }
    if (fromApi.length > 0) return fromApi;
    return INSIGHTS_FALLBACK;
  }, [lineage, apiHealthy]);

  const handleWipeAll = async () => {
    if (
      !window.confirm(
        'Erase EVERYTHING in the database for this workspace (all repos, ingestions, functions, analyses)? This cannot be undone. Restart the Go server afterward if workers keep re-queueing jobs.',
      )
    ) {
      return;
    }
    setWipeBusy(true);
    setBanner(null);
    try {
      await resetEntireWorkspace();
      clearAnalyserLocalState();
      emitWorkspaceCleared();
      await refresh();
    } catch (e) {
      setBanner(e?.message || 'Workspace reset failed — is the API running the latest server build?');
    } finally {
      setWipeBusy(false);
    }
  };

  const engineOk = health?.status === 'healthy';
  const syncStr = lastSync
    ? lastSync.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const statusCells = [
    {
      label: 'Engine',
      value: health ? (engineOk ? 'Operational' : health.status || 'Unknown') : banner ? 'Offline' : '…',
      sub: health?.database ? `DB: ${health.database}` : 'Checking…',
      icon: Cpu,
      tone: engineOk ? 'text-emerald-400' : health ? 'text-amber-400' : 'text-github-text-secondary',
    },
    {
      label: 'Active model',
      value: ACTIVE_MODEL,
      sub: 'Extraction + lineage',
      icon: BrainCircuit,
      tone: 'text-github-blue',
    },
    {
      label: 'API latency',
      value: pingMs != null ? `${pingMs} ms` : '—',
      sub: 'Round-trip /healthz',
      icon: Activity,
      tone: 'text-github-text-secondary',
    },
    {
      label: 'Last sync',
      value: syncStr,
      sub: 'Dashboard refresh',
      icon: Radio,
      tone: 'text-github-text-secondary',
    },
  ];

  return (
    <div className="es-page min-h-full pb-16">
      <div className="es-container max-w-6xl space-y-10 pt-10 md:pt-12">
        <header className="space-y-2">
          <p className="es-overline text-github-blue">EigenState</p>
          <h1 className="es-h1 text-white">Control center</h1>
          <p className="es-body max-w-2xl">
            Live view of the architectural intelligence engine—ingestion, reasoning health, and signals from your indexed
            repositories.
          </p>
        </header>

        {banner && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {banner}
          </div>
        )}

        <div className="es-card-static flex flex-wrap items-stretch gap-px overflow-hidden rounded-xl border border-github-border bg-github-border p-px">
          {statusCells.map((cell) => (
            <div
              key={cell.label}
              className="flex min-w-[140px] flex-1 items-start gap-3 bg-github-bg-tertiary px-5 py-4 transition-colors duration-150 hover:bg-[#1c2128]"
            >
              <cell.icon className={`mt-0.5 h-4 w-4 shrink-0 ${cell.tone}`} strokeWidth={1.75} />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-github-text-secondary">{cell.label}</p>
                <p className="truncate text-sm font-semibold text-white">{cell.value}</p>
                <p className="text-xs text-github-text-secondary/80">{cell.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          <section className="space-y-4 lg:col-span-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="es-h2 text-white">Live intelligence feed</h2>
                <p className="es-body mt-1 text-sm">Recent ingestions from raw_ingestions (newest first).</p>
              </div>
              <span className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/40 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live
              </span>
            </div>
            <ul className="space-y-2">
              {feed.length === 0 && apiHealthy && stats != null && (
                <li className="rounded-xl border border-dashed border-github-border bg-github-bg-tertiary px-5 py-8 text-center text-sm text-github-text-secondary">
                  No rows in <span className="font-mono text-github-text-primary">raw_ingestions</span> — database is empty.
                  Use Quick actions → <span className="font-mono text-github-text-primary">Empty workspace (DB)</span> if old
                  cards reappear after a wipe, then restart the Go server.
                </li>
              )}
              {feed.map((row) => (
                <li
                  key={row.id}
                  className="es-card-interactive flex flex-col gap-1 border border-github-border bg-github-bg-tertiary px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 inline-flex rounded-md border border-github-border bg-github-bg-secondary px-2 py-0.5 font-mono text-[10px] font-medium text-github-text-secondary">
                      {row.t}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-github-text-primary">{row.msg}</p>
                      <p className="mt-0.5 font-mono text-xs text-github-text-secondary">{row.repo}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-github-text-secondary sm:text-right">{row.ago}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4 lg:col-span-5">
            <div>
              <h2 className="es-h2 text-white">System health</h2>
              <p className="es-body mt-1 text-sm">
                Counts from <span className="font-mono text-github-text-primary">/api/stats</span>. Bars use a soft scale so
                modest volumes are readable (not all maxed out).
              </p>
            </div>
            <div className="es-card-static space-y-6 border border-github-border bg-github-bg-tertiary p-6">
              {healthRows.map((h) => (
                <div key={h.label}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-github-text-secondary">{h.label}</span>
                    <span className="text-sm font-semibold tabular-nums text-white">{h.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-github-bg-secondary">
                    <div
                      className={`h-full rounded-full transition-[width] duration-200 ${
                        h.warn ? 'bg-amber-500/75' : 'bg-github-blue/80'
                      }`}
                      style={{ width: `${h.pct}%` }}
                    />
                  </div>
                  {h.hint ? (
                    <p
                      className={`mt-1.5 text-[10px] leading-snug ${h.warn ? 'text-amber-200/90' : 'text-github-text-secondary/90'}`}
                    >
                      {h.hint}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-github-blue" strokeWidth={1.75} />
            <h2 className="es-h2 text-white">Synthesized insights</h2>
          </div>
          <p className="es-body -mt-2 text-xs">Top decisions from /api/v1/lineage for your primary repo (first registered or default).</p>
          <div className="grid gap-4 md:grid-cols-3">
            {insights.map((text, i) => (
              <blockquote
                key={i}
                className="es-card-interactive border border-github-border border-l-2 border-l-github-blue bg-github-bg-tertiary px-5 py-4 text-sm leading-relaxed text-github-text-primary"
              >
                {text}
              </blockquote>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="es-h2 text-white">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => navigate('/analyser')} className="es-btn es-btn-primary inline-flex items-center gap-2">
              <ScanSearch className="h-4 w-4" strokeWidth={1.75} />
              Analyze repo
              <ArrowRight className="h-4 w-4 opacity-70" strokeWidth={1.75} />
            </button>
            <button type="button" onClick={() => navigate('/explorer')} className="es-btn es-btn-secondary inline-flex items-center gap-2">
              <GitBranch className="h-4 w-4" strokeWidth={1.75} />
              View lineage
            </button>
            <button type="button" onClick={() => navigate('/git')} className="es-btn es-btn-ghost inline-flex items-center gap-2">
              <Shield className="h-4 w-4" strokeWidth={1.75} />
              Run audit
            </button>
            <button type="button" onClick={() => navigate('/history')} className="es-btn es-btn-ghost inline-flex items-center gap-2">
              <LineChart className="h-4 w-4" strokeWidth={1.75} />
              History
            </button>
            <button
              type="button"
              onClick={() => handleWipeAll()}
              disabled={wipeBusy || !apiHealthy}
              className="es-btn inline-flex items-center gap-2 border border-rose-500/40 bg-rose-500/10 text-rose-200 hover:border-rose-400/60 hover:bg-rose-500/20 disabled:opacity-40"
            >
              {wipeBusy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} /> : <Trash2 className="h-4 w-4" strokeWidth={1.75} />}
              Empty workspace (DB)
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
