import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Code, GitBranch, Send, ShieldCheck, Zap, AlertTriangle, FileCode, RefreshCw } from 'lucide-react';

const MotionDiv = motion.div;
import AnalyserSidebar from '../components/AnalyserSidebar';
import { parseGitHubOwnerRepo } from '../api/client';
import { consumeAnalyserBootstrap } from '../lib/analyserSessionBridge';
import { clearAnalyserLocalState, loadAnalyserState, saveAnalyserState } from '../lib/analyserPersist';
import { answerFromLineage, buildInsightsFromLineage, buildWelcomeFromLineage, fetchRepoLineage } from '../lib/analyserLineage';

const emptyInsights = () => ({
  complexity: 0,
  risks: ['No lineage indexed yet — finish ingestion for this repository.'],
  insights: ['Use Settings → Repositories to register and ingest, then return here.'],
});

const RepoAnalyser = () => {
  const initial = loadAnalyserState();
  const [sessions, setSessions] = useState(initial.sessions);
  const [messagesById, setMessagesById] = useState(initial.messages);
  const [insightsById, setInsightsById] = useState(initial.insights);
  const [activeSession, setActiveSession] = useState(initial.activeId);
  const sessionsRef = useRef(sessions);

  const [showDraft, setShowDraft] = useState(false);
  const [draftOwner, setDraftOwner] = useState('');
  const [draftRepo, setDraftRepo] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const scrollRef = useRef(null);
  const bootOnce = useRef(false);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    const onCleared = (e) => {
      const { owner, repo } = e.detail || {};
      if (!owner || !repo) return;
      const prev = sessionsRef.current;
      const removedIds = prev.filter((s) => s.owner === owner && s.repo === repo).map((s) => s.id);
      if (removedIds.length === 0) return;
      const nextSessions = prev.filter((s) => !(s.owner === owner && s.repo === repo));
      setMessagesById((m) => {
        const n = { ...m };
        removedIds.forEach((id) => {
          delete n[id];
        });
        return n;
      });
      setInsightsById((i) => {
        const n = { ...i };
        removedIds.forEach((id) => {
          delete n[id];
        });
        return n;
      });
      setSessions(nextSessions);
      setActiveSession((cur) => (removedIds.includes(cur) ? nextSessions[0]?.id ?? null : cur));
    };
    window.addEventListener('eigenstate:repo-cleared', onCleared);
    return () => window.removeEventListener('eigenstate:repo-cleared', onCleared);
  }, []);

  useEffect(() => {
    const onWipe = () => {
      clearAnalyserLocalState();
      setSessions([]);
      setMessagesById({});
      setInsightsById({});
      setActiveSession(null);
    };
    window.addEventListener('eigenstate:workspace-cleared', onWipe);
    return () => window.removeEventListener('eigenstate:workspace-cleared', onWipe);
  }, []);

  useEffect(() => {
    saveAnalyserState({
      sessions,
      messages: messagesById,
      insights: insightsById,
      activeId: activeSession,
    });
  }, [sessions, messagesById, insightsById, activeSession]);

  const openRepoSession = useCallback(async (ownerIn, repoIn, options = {}) => {
    const { owner, repo } = parseGitHubOwnerRepo(ownerIn, repoIn);
    if (!owner || !repo) return;

    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`;
    const prev = sessionsRef.current;
    const removedIds = prev.filter((s) => s.owner === owner && s.repo === repo).map((s) => s.id);

    setMessagesById((m) => {
      const n = { ...m };
      removedIds.forEach((r) => {
        delete n[r];
      });
      return n;
    });
    setInsightsById((i) => {
      const n = { ...i };
      removedIds.forEach((r) => {
        delete n[r];
      });
      return n;
    });

    const label = `${owner}/${repo}`;
    const newSession = {
      id,
      owner,
      repo,
      name: label,
      time: 'Now',
      lastMessage: 'Syncing indexed lineage…',
      isAnalysing: true,
    };

    setSessions((s) => [newSession, ...s.filter((x) => !(x.owner === owner && x.repo === repo))]);
    setActiveSession(id);

    const lineage = await fetchRepoLineage(owner, repo);
    const { messages, insights } = buildWelcomeFromLineage(owner, repo, lineage, {
      replace: !!options.replace,
    });

    setMessagesById((m) => ({ ...m, [id]: messages }));
    setInsightsById((i) => ({ ...i, [id]: insights }));
    setSessions((s) =>
      s.map((row) =>
        row.id === id
          ? {
              ...row,
              isAnalysing: false,
              lastMessage: messages[messages.length - 1]?.content?.slice(0, 72) || 'Ready',
              time: 'Now',
            }
          : row,
      ),
    );
  }, []);

  useEffect(() => {
    if (bootOnce.current) return;
    bootOnce.current = true;
    const boot = consumeAnalyserBootstrap();
    if (boot?.owner && boot?.repo) {
      openRepoSession(boot.owner, boot.repo, { replace: !!boot.replace });
    }
  }, [openRepoSession]);

  useEffect(() => {
    const onBoot = (e) => {
      const d = e.detail || {};
      if (d.owner && d.repo) {
        openRepoSession(d.owner, d.repo, { replace: !!d.replace });
      }
    };
    window.addEventListener('eigenstate:analyser-bootstrap', onBoot);
    return () => window.removeEventListener('eigenstate:analyser-bootstrap', onBoot);
  }, [openRepoSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messagesById, activeSession]);

  const activeSessionData = sessions.find((s) => s.id === activeSession);
  const messages = activeSessionData ? messagesById[activeSessionData.id] || [] : [];
  const panel = activeSessionData ? insightsById[activeSessionData.id] || emptyInsights() : emptyInsights();

  const refreshActiveLineage = useCallback(async () => {
    if (!activeSessionData) return;
    setReplyBusy(true);
    try {
      const lineage = await fetchRepoLineage(activeSessionData.owner, activeSessionData.repo);
      const { messages: welcome, insights } = buildWelcomeFromLineage(
        activeSessionData.owner,
        activeSessionData.repo,
        lineage,
        {},
      );
      setMessagesById((m) => ({ ...m, [activeSessionData.id]: welcome }));
      setInsightsById((i) => ({ ...i, [activeSessionData.id]: insights }));
      setSessions((s) =>
        s.map((row) =>
          row.id === activeSessionData.id
            ? { ...row, lastMessage: welcome[welcome.length - 1]?.content?.slice(0, 72) || 'Refreshed' }
            : row,
        ),
      );
    } finally {
      setReplyBusy(false);
    }
  }, [activeSessionData]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || !activeSessionData || replyBusy) return;

    const owner = activeSessionData.owner;
    const repo = activeSessionData.repo;
    const sid = activeSessionData.id;
    const q = inputValue.trim();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg = {
      id: (messages[messages.length - 1]?.id || 0) + 1,
      role: 'user',
      content: q,
      time: now,
    };
    setMessagesById((m) => ({ ...m, [sid]: [...(m[sid] || []), userMsg] }));
    setInputValue('');
    setSessions((s) =>
      s.map((row) => (row.id === sid ? { ...row, lastMessage: q.slice(0, 72), time: 'Now' } : row)),
    );

    setReplyBusy(true);
    try {
      const lineage = await fetchRepoLineage(owner, repo);
      const text = answerFromLineage(lineage, q);
      const aiMsg = {
        id: userMsg.id + 1,
        role: 'ai',
        content: text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessagesById((m) => ({ ...m, [sid]: [...(m[sid] || []), aiMsg] }));
      setInsightsById((i) => ({ ...i, [sid]: buildInsightsFromLineage(lineage) }));
      setSessions((s) =>
        s.map((row) => (row.id === sid ? { ...row, lastMessage: text.slice(0, 72) } : row)),
      );
    } catch {
      const aiMsg = {
        id: userMsg.id + 1,
        role: 'ai',
        content: 'Could not reach the API. Check the Go server and try again.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessagesById((m) => ({ ...m, [sid]: [...(m[sid] || []), aiMsg] }));
    } finally {
      setReplyBusy(false);
    }
  };

  const submitDraft = async () => {
    const { owner, repo } = parseGitHubOwnerRepo(draftOwner, draftRepo);
    if (!owner || !repo) return;
    setDraftBusy(true);
    try {
      await openRepoSession(owner, repo, {});
      setShowDraft(false);
      setDraftOwner('');
      setDraftRepo('');
    } finally {
      setDraftBusy(false);
    }
  };

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex h-full overflow-hidden bg-github-bg-primary"
    >
      <AnalyserSidebar
        sessions={sessions}
        activeSession={activeSession}
        onSelectSession={setActiveSession}
        onNewSession={() => {
          setShowDraft(true);
        }}
        showDraft={showDraft}
        draftOwner={draftOwner}
        draftRepo={draftRepo}
        onDraftOwner={setDraftOwner}
        onDraftRepo={setDraftRepo}
        onSubmitDraft={submitDraft}
        onCancelDraft={() => {
          setShowDraft(false);
        }}
        draftBusy={draftBusy}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-github-border bg-github-bg-secondary/90 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-github-border bg-github-bg-tertiary text-github-blue">
              <GitBranch size={18} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-white md:text-base">
                {activeSessionData?.name || 'Repo Analyser'}
              </h1>
              <p className="text-xs text-github-text-secondary">
                {activeSessionData?.isAnalysing
                  ? 'Pulling lineage…'
                  : activeSessionData
                    ? 'Indexed decisions · chat scoped to this repo'
                    : 'Select or create a repo chat'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeSessionData && (
              <button
                type="button"
                onClick={() => refreshActiveLineage()}
                disabled={replyBusy}
                className="es-btn es-btn-secondary !h-9 !gap-1.5 !px-3 text-xs"
              >
                <RefreshCw size={14} className={replyBusy ? 'animate-spin' : ''} strokeWidth={1.75} />
                Refresh
              </button>
            )}
            <button type="button" className="es-btn es-btn-secondary !h-9 !px-3 text-xs">
              Export trace
            </button>
            <button
              type="button"
              className="es-btn es-btn-ghost !h-9 !w-9 !p-0 text-github-text-secondary"
              aria-label="Shield"
            >
              <ShieldCheck size={18} strokeWidth={1.75} />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div ref={scrollRef} className="custom-scrollbar min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8">
            {!activeSessionData ? (
              <div className="mx-auto mt-16 max-w-md rounded-xl border border-github-border bg-github-bg-tertiary px-6 py-10 text-center">
                <p className="text-sm font-medium text-white">No repo chat selected</p>
                <p className="mt-2 text-xs leading-relaxed text-github-text-secondary">
                  Ingesting from Settings or the Code map opens a dedicated session automatically. You can also tap + in the
                  sidebar to bind a chat to owner/repo.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-6 text-center text-[11px] text-github-text-secondary">
                  Repo-scoped session · answers use `/api/v1/lineage` for this repository only
                </p>
                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <MotionDiv
                      key={`${activeSessionData.id}-${msg.id}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={`chat-bubble ${msg.role === 'ai' ? 'chat-bubble-ai' : 'chat-bubble-user'}`}
                    >
                      <div className="flex items-start gap-3">
                        {msg.role === 'ai' && (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-github-border bg-github-blue/10 text-github-blue">
                            <Bot size={16} strokeWidth={1.75} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                          <div className="mt-2 text-right text-[10px] text-github-text-secondary">{msg.time}</div>
                        </div>
                      </div>
                    </MotionDiv>
                  ))}
                </AnimatePresence>
              </>
            )}
          </div>

          <aside className="custom-scrollbar hidden w-72 shrink-0 overflow-y-auto border-l border-github-border bg-github-bg-secondary/50 px-4 py-6 xl:block xl:w-80">
            <p className="es-overline mb-4 text-github-text-secondary">Analysis context</p>

            <div className="mb-6 rounded-xl border border-github-border bg-github-bg-tertiary p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-github-text-secondary">Complexity score</span>
                <span className="text-lg font-semibold tabular-nums text-white">{panel.complexity || '—'}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-github-bg-secondary">
                <div
                  className="h-full rounded-full bg-github-blue/85 transition-all duration-200"
                  style={{ width: `${panel.complexity || 0}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-github-text-secondary">
                Derived from indexed lineage volume and average confidence for this repo—not cyclomatic analysis.
              </p>
            </div>

            <div className="mb-6">
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-300">
                <AlertTriangle size={14} strokeWidth={1.75} />
                Risk areas
              </h2>
              <ul className="space-y-2">
                {panel.risks.map((r) => (
                  <li
                    key={r}
                    className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs leading-snug text-rose-100/90"
                  >
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold text-github-text-primary">
                <FileCode size={14} className="text-github-blue" strokeWidth={1.75} />
                Code insights
              </h2>
              <ul className="space-y-2">
                {panel.insights.map((line) => (
                  <li
                    key={line}
                    className="rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2 text-xs leading-relaxed text-github-text-secondary"
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <footer className="shrink-0 border-t border-github-border bg-github-bg-secondary/80 px-4 py-4 md:px-8">
          <form onSubmit={handleSendMessage} className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 rounded-xl border border-github-border bg-github-bg-tertiary px-2 py-2 transition-[border-color] duration-150 focus-within:border-github-blue/50">
              <div className="flex gap-1 pl-2">
                <button type="button" className="p-2 text-github-text-secondary hover:text-github-blue">
                  <Zap size={18} strokeWidth={1.75} />
                </button>
                <button type="button" className="p-2 text-github-text-secondary hover:text-github-blue">
                  <Code size={18} strokeWidth={1.75} />
                </button>
              </div>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  activeSessionData
                    ? 'Ask about architecture, tradeoffs, or lineage…'
                    : 'Select a repo chat to ask questions'
                }
                disabled={!activeSessionData || replyBusy}
                className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-white placeholder:text-github-text-secondary focus:outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || !activeSessionData || replyBusy}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
                  inputValue.trim() && activeSessionData && !replyBusy
                    ? 'bg-github-blue text-white hover:bg-blue-400'
                    : 'bg-github-bg-secondary text-github-text-secondary'
                }`}
              >
                <Send size={18} strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-github-text-secondary">
              EigenState analyser · replies match your question against live `/api/v1/lineage` for this repo
            </p>
          </form>
        </footer>
      </div>
    </MotionDiv>
  );
};

export default RepoAnalyser;
