import React from 'react';
import { GitCommit, User } from 'lucide-react';

const Timeline = ({ history }) => {
  if (!history || history.length === 0) return null;

  return (
    <div className="mt-12 border-t border-github-border pt-10">
      <h4 className="mb-6 flex items-center gap-2 text-xs font-medium text-github-text-secondary">
        <GitCommit size={14} className="text-github-blue" strokeWidth={1.75} />
        Decision lineage
      </h4>

      <div className="relative pl-8">
        <div className="absolute bottom-2 left-[11px] top-2 w-px bg-github-border" aria-hidden />

        <ul className="space-y-0">
          {history.map((event, index) => {
            const dateStr = new Date(event.date).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            const isLast = index === history.length - 1;

            return (
              <li key={index} className="relative pb-8 pl-2">
                {!isLast && (
                  <div
                    className="absolute left-[-21px] top-6 h-[calc(100%-0.25rem)] w-px bg-github-border"
                    aria-hidden
                  />
                )}
                <div className="absolute -left-7 top-1 flex h-6 w-6 items-center justify-center rounded-full border border-github-border bg-github-bg-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-github-blue" />
                </div>

                <div className="es-card-interactive rounded-xl border border-github-border bg-github-bg-tertiary p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <time className="text-xs font-medium text-github-blue">
                      {dateStr !== 'Invalid Date' ? dateStr : event.date || 'Unknown'}
                    </time>
                    <span className="rounded border border-github-border bg-github-bg-secondary px-2 py-0.5 font-mono text-[10px] text-github-text-secondary">
                      PR #{event.pr_number}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-snug text-github-text-primary">
                    {event.summary || event.decision}
                  </p>
                  <div className="mt-3 flex items-center gap-2 border-t border-github-border pt-3 text-xs text-github-text-secondary">
                    <User size={12} className="text-emerald-400" strokeWidth={1.75} />
                    {event.author || 'System'}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default Timeline;
