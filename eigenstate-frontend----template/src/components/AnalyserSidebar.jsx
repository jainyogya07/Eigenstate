import React from 'react';
import { Search, Plus, MessageSquare, History, MoreVertical } from 'lucide-react';

const AnalyserSidebar = ({
  sessions,
  activeSession,
  onSelectSession,
  onNewSession,
  showDraft = false,
  draftOwner = '',
  draftRepo = '',
  onDraftOwner = () => {},
  onDraftRepo = () => {},
  onSubmitDraft = () => {},
  onCancelDraft = () => {},
  draftBusy = false,
}) => {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-github-border bg-github-bg-secondary md:w-72">
      <div className="space-y-4 border-b border-github-border px-4 py-6 md:px-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="es-overline text-github-text-secondary">Analyser</p>
            <h2 className="text-base font-semibold text-white">Sessions</h2>
          </div>
          <button
            type="button"
            onClick={onNewSession}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-github-blue text-white transition-colors duration-150 hover:bg-blue-400"
            aria-label="New session"
          >
            <Plus size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-github-text-secondary" />
          <input type="search" placeholder="Search sessions…" className="es-input !pl-9" />
        </div>
        {showDraft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmitDraft();
            }}
            className="space-y-2 rounded-lg border border-github-border bg-github-bg-tertiary p-3"
          >
            <p className="text-[11px] font-medium text-github-text-secondary">Repo-specific chat</p>
            <input
              type="text"
              value={draftOwner}
              onChange={(e) => onDraftOwner(e.target.value)}
              placeholder="Owner (e.g. fastify)"
              className="es-input !py-2 text-xs"
              autoComplete="off"
            />
            <input
              type="text"
              value={draftRepo}
              onChange={(e) => onDraftRepo(e.target.value)}
              placeholder="Repo name"
              className="es-input !py-2 text-xs"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={draftBusy} className="es-btn es-btn-primary flex-1 !py-2 text-xs">
                {draftBusy ? 'Loading…' : 'Open chat'}
              </button>
              <button type="button" onClick={onCancelDraft} className="es-btn es-btn-secondary !py-2 text-xs">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto px-3 py-3">
        {['All', 'Recent', 'Starred'].map((cat) => (
          <button
            key={cat}
            type="button"
            className="shrink-0 rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-1.5 text-xs font-medium text-github-text-secondary transition-colors duration-150 hover:border-[#444c56] hover:text-github-text-primary"
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto px-2 pb-4">
        {sessions.length === 0 && !showDraft && (
          <p className="px-3 py-6 text-center text-xs leading-relaxed text-github-text-secondary">
            No chats yet. Ingest a repo from Settings (or Code map), or tap + to open a repo-specific session.
          </p>
        )}
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelectSession(session.id)}
            className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ${
              activeSession === session.id
                ? 'bg-github-bg-tertiary text-white'
                : 'text-github-text-secondary hover:bg-github-bg-tertiary/70 hover:text-github-text-primary'
            }`}
          >
            <div className="relative shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-github-border bg-github-bg-secondary text-github-blue">
                <MessageSquare size={18} strokeWidth={1.75} />
              </div>
              {session.isAnalysing && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-github-bg-secondary bg-emerald-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{session.name}</span>
                <span className="shrink-0 text-[11px] text-github-text-secondary">{session.time}</span>
              </div>
              <p className="truncate text-xs text-github-text-secondary">{session.lastMessage}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-github-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-github-text-secondary">
          <History size={14} strokeWidth={1.75} />
          Archive
        </div>
        <button type="button" className="text-github-text-secondary hover:text-white">
          <MoreVertical size={16} strokeWidth={1.75} />
        </button>
      </div>
    </aside>
  );
};

export default AnalyserSidebar;
