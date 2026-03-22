import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Clock, Cpu, GitPullRequest, Layers, Loader2, Trash2 } from 'lucide-react';
import { apiFetch, deleteRepoIndex, resetEntireWorkspace } from '../api/client';
import { emitRepoIndexCleared, emitWorkspaceCleared } from '../lib/analyserSessionBridge';
import { clearAnalyserLocalState } from '../lib/analyserPersist';
import { SEED_INGESTIONS, SEED_STATS, hasBackendIngestionActivity } from '../data/demoSeed';

function parseClusterRepo(full) {
  const s = String(full || '');
  const i = s.indexOf('/');
  if (i <= 0 || i >= s.length - 1) return { owner: '', repo: '' };
  return { owner: s.slice(0, i), repo: s.slice(i + 1) };
}

function clusterLabel(items) {
  if (items.some((i) => i.status === 'error')) return { text: 'Risk', className: 'border-rose-500/30 bg-rose-500/10 text-rose-200' };
  if (items.some((i) => i.status === 'pending')) return { text: 'Refactor', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' };
  return { text: 'Optimization', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' };
}

export default function GitIntelligence() {
  const [stats, setStats] = useState(SEED_STATS);
  const [ingestions, setIngestions] = useState(SEED_INGESTIONS);
  const [usingSeed, setUsingSeed] = useState(true);
  const [deletingKey, setDeletingKey] = useState(null);
  const [deleteErr, setDeleteErr] = useState(null);
  const [wipeBusy, setWipeBusy] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, ingestionsData] = await Promise.all([apiFetch('/api/stats'), apiFetch('/api/ingestions')]);
      const normalizedStats =
        statsData && typeof statsData === 'object'
          ? {
              total_ingestions: Number(statsData.total_ingestions) || 0,
              total_analyses: Number(statsData.total_analyses) || 0,
              pending_ingestions: Number(statsData.pending_ingestions) || 0,
            }
          : null;
      const list = Array.isArray(ingestionsData) ? ingestionsData : [];

      if (normalizedStats && hasBackendIngestionActivity(normalizedStats, list)) {
        setStats(normalizedStats);
        setIngestions(list);
        setUsingSeed(false);
      } else if (normalizedStats) {
        setStats(normalizedStats);
        setIngestions(list);
        setUsingSeed(false);
      } else {
        setStats(SEED_STATS);
        setIngestions(SEED_INGESTIONS);
        setUsingSeed(true);
      }
    } catch {
      setStats(SEED_STATS);
      setIngestions(SEED_INGESTIONS);
      setUsingSeed(true);
    }
  }, []);

  const handleWipeAll = async () => {
    if (
      !window.confirm(
        'Erase all indexed data and registered repos in Postgres? Same as Dashboard “Empty workspace”.',
      )
    ) {
      return;
    }
    setDeleteErr(null);
    setWipeBusy(true);
    try {
      await resetEntireWorkspace();
      clearAnalyserLocalState();
      emitWorkspaceCleared();
      await fetchData();
    } catch (err) {
      setDeleteErr(err?.message || 'Wipe failed');
    } finally {
      setWipeBusy(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeleteCluster = async (repoFull) => {
    const { owner, repo } = parseClusterRepo(repoFull);
    if (!owner || !repo) return;
    if (
      !window.confirm(
        `Remove index and unregister ${owner}/${repo}? This deletes all ingested PR rows, functions, and analyses for that repository.`,
      )
    ) {
      return;
    }
    setDeleteErr(null);
    setDeletingKey(repoFull);
    try {
      await deleteRepoIndex(owner, repo);
      emitRepoIndexCleared(owner, repo);
      await fetchData();
    } catch (err) {
      setDeleteErr(err?.message || 'Delete failed');
    } finally {
      setDeletingKey(null);
    }
  };

  const clusters = useMemo(() => {
    const map = new Map();
    ingestions.forEach((ing) => {
      const key = `${ing.owner}/${ing.repo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ing);
    });
    return Array.from(map.entries()).map(([repo, items]) => ({
      repo,
      items: items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      label: clusterLabel(items),
    }));
  }, [ingestions]);

  return (
    <div className="es-page custom-scrollbar min-h-full overflow-y-auto px-6 py-10 md:px-10 md:py-12">
      <div className="es-container max-w-6xl space-y-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="es-overline text-github-blue">Git intelligence</p>
            <h1 className="es-h1 text-white">Ingestion &amp; audit</h1>
            <p className="es-body max-w-xl">
              PRs grouped by repository with a coarse signal label: optimization when healthy, refactor when work is in
              flight, risk when the pipeline reports errors.
            </p>
            {usingSeed && (
              <p className="rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2 text-xs text-github-text-secondary">
                Showing <span className="font-medium text-github-text-primary">demo seed data</span> — backend has no
                ingestions yet (e.g. GitHub rate limits). Live data appears when /api/stats and /api/ingestions return real
                rows.
              </p>
            )}
            {deleteErr && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{deleteErr}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!usingSeed && (
              <button
                type="button"
                onClick={() => handleWipeAll()}
                disabled={wipeBusy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
              >
                {wipeBusy ? <Loader2 size={14} className="animate-spin" strokeWidth={1.75} /> : <Trash2 size={14} strokeWidth={1.75} />}
                Empty all workspaces
              </button>
            )}
            <div className="flex items-center gap-2 rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-medium text-github-text-secondary">Ingestion online</span>
            </div>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Ingestions', value: stats.total_ingestions, icon: Layers },
            { label: 'Analyses', value: stats.total_analyses, icon: Activity },
            { label: 'Queued', value: stats.pending_ingestions, icon: Cpu },
          ].map((s) => (
            <div
              key={s.label}
              className="es-card-interactive flex items-center gap-4 border border-github-border bg-github-bg-tertiary p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-github-border bg-github-bg-secondary text-github-blue">
                <s.icon size={18} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-white">{s.value}</p>
                <p className="text-xs font-medium text-github-text-secondary">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-12">
          <section className="space-y-4 lg:col-span-8">
            <h2 className="es-h2 text-white">Event clusters</h2>
            <div className="space-y-6">
              {clusters.length === 0 && (
                <p className="rounded-xl border border-dashed border-github-border bg-github-bg-tertiary px-5 py-8 text-center text-sm text-github-text-secondary">
                  No ingestions in the database yet. Use <span className="font-mono text-github-text-primary">POST /api/ingest</span>{' '}
                  (body: <span className="font-mono">owner</span>, <span className="font-mono">repo</span>) or the Repo
                  Analyser flow to queue PRs.
                </p>
              )}
              {clusters.map(({ repo, items, label }) => (
                <div key={repo} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-white">{repo}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${label.className}`}>
                      {label.text}
                    </span>
                    <span className="text-xs text-github-text-secondary">{items.length} events</span>
                    {!usingSeed && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCluster(repo)}
                        disabled={deletingKey === repo}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-200 transition-colors hover:border-rose-400/50 hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        {deletingKey === repo ? (
                          <Loader2 size={12} className="animate-spin" strokeWidth={1.75} />
                        ) : (
                          <Trash2 size={12} strokeWidth={1.75} />
                        )}
                        Remove index
                      </button>
                    )}
                  </div>
                  <ul className="space-y-2">
                    {items.map((ing, i) => (
                      <li
                        key={ing.id != null ? ing.id : `${repo}-${ing.pr_number}-${i}`}
                        className="es-card-interactive flex items-center gap-4 border border-github-border bg-github-bg-tertiary px-4 py-3"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                            ing.status === 'completed'
                              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                              : ing.status === 'pending'
                                ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
                                : 'border-rose-500/25 bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          <GitPullRequest size={16} strokeWidth={1.75} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium text-github-text-primary">PR #{ing.pr_number}</span>
                            {ing.status === 'completed' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                                <CheckCircle2 size={12} /> Complete
                              </span>
                            )}
                            {ing.status === 'pending' && (
                              <span className="text-xs font-medium text-amber-400">In progress</span>
                            )}
                            {ing.status === 'error' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
                                <AlertCircle size={12} /> Error
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-github-text-secondary">
                            <Clock size={12} />
                            {(() => {
                              const d = new Date(ing.created_at);
                              return Number.isNaN(d.getTime()) ? ing.created_at : d.toLocaleString();
                            })()}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 lg:col-span-4">
            <h2 className="es-h2 text-white">Pipeline health</h2>
            <div className="es-card-static space-y-5 border border-github-border bg-github-bg-tertiary p-6">
              {[
                { label: 'Extraction latency', value: '412 ms', pct: 82 },
                { label: 'PR throughput', value: 'Stable', pct: 71 },
                { label: 'Error budget', value: '3%', pct: 12, warn: true },
                { label: 'Index lag', value: '< 5 min', pct: 90 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-github-text-secondary">{row.label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${row.warn ? 'text-rose-300' : 'text-white'}`}>
                      {row.value}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-github-bg-secondary">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${row.warn ? 'bg-rose-500/80' : 'bg-github-blue/80'}`}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-github-text-secondary">
              Risk-tagged clusters prioritize failed ingestions; refactor-tagged groups have pending jobs. Optimization
              indicates a clean completed batch for that repo.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
