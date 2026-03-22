import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GitCommit, Search, ShieldCheck, Wrench, Zap, Layers } from 'lucide-react';
import { apiFetch, confidenceToPercent, DEFAULT_REPO, primaryRepo } from '../api/client';
import { SEED_LINEAGE } from '../data/demoSeed';

const MotionDiv = motion.div;

const typeConfig = {
  Optimization: { icon: Zap, chip: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' },
  Security: { icon: ShieldCheck, chip: 'border-rose-500/30 bg-rose-500/10 text-rose-200' },
  Refactor: { icon: Wrench, chip: 'border-github-blue/30 bg-github-blue/10 text-blue-200' },
  Architecture: { icon: Layers, chip: 'border-violet-500/30 bg-violet-500/10 text-violet-200' },
};

const FILTERS = ['all', 'Optimization', 'Security', 'Refactor', 'Architecture'];

export default function HistoryPage() {
  const [lineage, setLineage] = useState(SEED_LINEAGE);
  const [usingSeed, setUsingSeed] = useState(true);
  const [filter, setFilter] = useState('all');
  const [repoCtx, setRepoCtx] = useState(DEFAULT_REPO);

  useEffect(() => {
    apiFetch('/repos')
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setRepoCtx(primaryRepo(list));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const { owner, repo } = repoCtx;
    apiFetch(`/api/v1/lineage?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&limit=50`)
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setLineage(data);
          setUsingSeed(false);
        } else {
          setLineage(SEED_LINEAGE);
          setUsingSeed(true);
        }
      })
      .catch(() => {
        setLineage(SEED_LINEAGE);
        setUsingSeed(true);
      });
  }, [repoCtx]);

  const filteredLineage = useMemo(() => {
    if (filter === 'all') return lineage;
    return lineage.filter((item) => (item.change_type || '').toLowerCase() === filter.toLowerCase());
  }, [lineage, filter]);

  const stats = useMemo(() => {
    const n = lineage.length || 1;
    return {
      total: lineage.length,
      opt: lineage.filter((l) => l.change_type === 'Optimization').length,
      sec: lineage.filter((l) => l.change_type === 'Security').length,
      conf: Math.round(lineage.reduce((a, b) => a + confidenceToPercent(b.confidence), 0) / n),
    };
  }, [lineage]);

  return (
    <div className="es-page custom-scrollbar min-h-full overflow-y-auto px-6 py-10 md:px-10 md:py-12">
      <div className="es-container max-w-3xl pb-16">
        <header className="mb-10 space-y-3">
          <p className="es-overline text-github-blue">History</p>
          <h1 className="es-h1 text-white">Decision timeline</h1>
          <p className="font-mono text-xs text-github-text-secondary">
            {repoCtx.owner}/{repoCtx.repo}
          </p>
          <p className="es-body max-w-lg">
            Architectural events in chronological order. Connectors show continuity between extracted decisions and their
            source signals.
          </p>
          {usingSeed && (
            <p className="rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2 text-xs text-github-text-secondary">
              Showing <span className="font-medium text-github-text-primary">demo timeline</span> until the API returns
              lineage for this repo (empty DB or GitHub ingestion blocked).
            </p>
          )}
        </header>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Events', value: stats.total },
              { label: 'Optimizations', value: stats.opt, accent: 'text-emerald-400' },
              { label: 'Security', value: stats.sec, accent: 'text-rose-400' },
              { label: 'Avg confidence', value: `${stats.conf}%`, accent: 'text-github-blue' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-github-border bg-github-bg-tertiary px-4 py-3 text-center">
                <p className={`text-lg font-semibold tabular-nums text-white ${s.accent || ''}`}>{s.value}</p>
                <p className="text-[11px] font-medium text-github-text-secondary">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors duration-150 ${
                filter === f
                  ? 'bg-github-blue text-white'
                  : 'border border-github-border bg-github-bg-tertiary text-github-text-secondary hover:border-[#444c56] hover:text-github-text-primary'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <MotionDiv
            key={filter}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="relative"
          >
            <div className="absolute bottom-4 left-[15px] top-4 w-px bg-github-border" aria-hidden />

            <ul className="relative space-y-0">
              {filteredLineage.map((item, index) => {
                const config = typeConfig[item.change_type] || typeConfig.Refactor;
                const Icon = config.icon;
                const isLast = index === filteredLineage.length - 1;
                const confPct = confidenceToPercent(item.confidence);

                return (
                  <li key={`${item.pr_number}-${index}`} className="relative pl-10 pb-10">
                    {!isLast && (
                      <div
                        className="absolute left-[11px] top-8 h-[calc(100%-0.5rem)] w-px bg-github-border"
                        aria-hidden
                      />
                    )}
                    <div className="absolute left-0 top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-github-bg-primary bg-github-bg-tertiary ring-1 ring-github-border">
                      <Icon size={14} className="text-github-text-secondary" strokeWidth={1.75} />
                    </div>

                    <article className="es-card-interactive rounded-xl border border-github-border bg-github-bg-tertiary p-5">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${config.chip}`}>
                          {item.change_type}
                        </span>
                        <time className="text-xs text-github-text-secondary">
                          {(() => {
                            const d = new Date(item.date);
                            return Number.isNaN(d.getTime())
                              ? item.date || '—'
                              : d.toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                });
                          })()}
                        </time>
                        <span className="font-mono text-xs text-github-text-secondary">PR #{item.pr_number}</span>
                        <span
                          className={`ml-auto text-xs font-semibold tabular-nums ${
                            confPct >= 95
                              ? 'text-emerald-400'
                              : confPct >= 90
                                ? 'text-github-blue'
                                : 'text-amber-400'
                          }`}
                        >
                          {confPct}%
                        </span>
                      </div>

                      <h3 className="mb-2 text-sm font-semibold leading-snug text-white">
                        {item.summary?.includes(': ') ? item.summary.split(': ').slice(1).join(': ') : item.summary}
                      </h3>
                      <p className="mb-4 text-sm leading-relaxed text-github-text-secondary">{item.decision}</p>

                      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-github-border pt-4 text-xs text-github-text-secondary">
                        <span className="inline-flex items-center gap-1">
                          <Search size={12} className="text-github-blue" />
                          {item.name || '—'}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          <GitCommit size={12} />
                          {item.file_path || '—'}
                        </span>
                        <span className="ml-auto font-medium text-github-text-primary">{item.author || 'Unknown'}</span>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </MotionDiv>
        </AnimatePresence>
      </div>
    </div>
  );
}
