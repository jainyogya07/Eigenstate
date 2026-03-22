import React, { useEffect, useState } from 'react';
import { Cpu, Database, Eye, EyeOff, Globe, Lock, RefreshCw, Shield, Terminal, Trash2, ExternalLink } from 'lucide-react';
import { apiFetch, deleteRepoIndex, parseGitHubOwnerRepo } from '../api/client';
import { emitRepoIndexCleared, queueAnalyserSessionForRepo } from '../lib/analyserSessionBridge';

export default function SettingsPage() {
  const [repos, setRepos] = useState([]);
  const [showKeys, setShowKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addOwner, setAddOwner] = useState('');
  const [addRepo, setAddRepo] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState(null);
  const [removeBusyId, setRemoveBusyId] = useState(null);

  const refreshRepos = () =>
    apiFetch('/repos')
      .then((data) => setRepos(Array.isArray(data) ? data : []))
      .catch(() => {});

  useEffect(() => {
    refreshRepos().finally(() => setLoading(false));
  }, []);

  const handleAddRepo = async (e) => {
    e.preventDefault();
    const { owner, repo } = parseGitHubOwnerRepo(addOwner, addRepo);
    if (!owner || !repo) {
      setAddMsg({ tone: 'err', text: 'Enter GitHub owner and repo (e.g. octocat/Hello-World) or paste a github.com URL.' });
      return;
    }
    setAddBusy(true);
    setAddMsg(null);
    try {
      await apiFetch('/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      });
      await apiFetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, replace: true }),
      });
      queueAnalyserSessionForRepo(owner, repo, { replace: true });
      setAddMsg({
        tone: 'ok',
        text: `Registered ${owner}/${repo}, cleared prior ingest for that repo, and queued a fresh index. Open Repo Analyser for a dedicated chat.`,
      });
      setAddOwner('');
      setAddRepo('');
      await refreshRepos();
    } catch (err) {
      setAddMsg({ tone: 'err', text: err.message || 'Request failed' });
    } finally {
      setAddBusy(false);
    }
  };

  const handleRemoveRepo = async (row) => {
    const n = parseGitHubOwnerRepo(row.owner, row.repo);
    if (!n.owner || !n.repo) return;
    if (
      !window.confirm(
        `Remove index and unregister ${n.owner}/${n.repo}? All ingested data for this repo will be deleted from the database.`,
      )
    ) {
      return;
    }
    const busyKey = row.id != null ? String(row.id) : `${n.owner}/${n.repo}`;
    setRemoveBusyId(busyKey);
    setAddMsg(null);
    try {
      await deleteRepoIndex(n.owner, n.repo);
      emitRepoIndexCleared(n.owner, n.repo);
      await refreshRepos();
      setAddMsg({ tone: 'ok', text: `Removed index for ${n.owner}/${n.repo}.` });
    } catch (err) {
      setAddMsg({ tone: 'err', text: err.message || 'Failed to remove repository' });
    } finally {
      setRemoveBusyId(null);
    }
  };

  return (
    <div className="es-page custom-scrollbar h-full overflow-y-auto px-6 py-10 md:px-10 md:py-12">
      <div className="es-container max-w-5xl space-y-10 pb-16">
        <header className="space-y-2">
          <p className="es-overline text-github-blue">Settings</p>
          <h1 className="es-h1 text-white">Configuration</h1>
          <p className="es-body max-w-xl">Models, credentials, and system hooks. Changes apply to this workspace only.</p>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Models */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Cpu size={18} className="text-github-blue" strokeWidth={1.75} />
              <h2 className="es-h2 text-white">Models</h2>
            </div>
            <div className="space-y-3 rounded-xl border border-github-border bg-github-bg-tertiary p-5">
              {[
                { name: 'Gemini 1.5 Pro', desc: 'Deep reasoning, higher latency', active: false },
                { name: 'Gemini 1.5 Flash', desc: 'Fast extraction, default', active: true },
                { name: 'EigenState signal normalizer', desc: 'Local preprocessing', active: true },
              ].map((model) => (
                <label
                  key={model.name}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors duration-150 ${
                    model.active
                      ? 'border-github-blue/40 bg-github-blue/5'
                      : 'border-github-border bg-github-bg-secondary hover:border-[#444c56]'
                  }`}
                >
                  <input type="radio" name="model" defaultChecked={model.active} className="mt-1" readOnly />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{model.name}</span>
                      {model.active && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-github-text-secondary">{model.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* API keys */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-emerald-400" strokeWidth={1.75} />
              <h2 className="es-h2 text-white">API keys</h2>
            </div>
            <div className="space-y-5 rounded-xl border border-github-border bg-github-bg-tertiary p-5">
              {[
                { label: 'Gemini API key', mask: '**************************7A9B' },
                { label: 'GitHub token', mask: '**************************X9P2' },
              ].map((key) => (
                <div key={key.label}>
                  <label className="es-label">{key.label}</label>
                  <div className="flex gap-2">
                    <div className="es-input flex flex-1 items-center justify-between gap-2 !py-0 font-mono text-xs">
                      <span className="truncate text-github-text-secondary">{showKeys ? key.mask.replace(/\*/g, '•') : key.mask}</span>
                      <button
                        type="button"
                        onClick={() => setShowKeys(!showKeys)}
                        className="p-1 text-github-text-secondary transition-colors hover:text-white"
                        aria-label={showKeys ? 'Hide' : 'Show'}
                      >
                        {showKeys ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      type="button"
                      className="es-btn es-btn-secondary !w-11 shrink-0 px-0"
                      aria-label="Rotate"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <Lock size={16} className="mt-0.5 shrink-0 text-emerald-400" />
                <p className="text-xs leading-relaxed text-github-text-secondary">
                  Credentials stay on this instance; nothing is sent to third parties except the providers you configure
                  above.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* System config */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Database size={18} className="text-github-blue" strokeWidth={1.75} />
              <h2 className="es-h2 text-white">System</h2>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-github-border bg-github-bg-tertiary px-3 py-2 font-mono text-xs text-github-text-secondary">
              <Database size={14} />
              postgresql@eigen_shard_01
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-github-text-secondary">
                  <Globe size={14} /> Indexed repositories
                </div>
              </div>

              <form
                onSubmit={handleAddRepo}
                className="mb-4 space-y-3 rounded-xl border border-github-border bg-github-bg-secondary p-4"
              >
                <p className="text-xs font-medium text-github-text-secondary">Add GitHub repository (public or token-scoped)</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="es-input min-w-[120px] flex-1 font-mono text-sm"
                    placeholder="owner"
                    value={addOwner}
                    onChange={(ev) => setAddOwner(ev.target.value)}
                    disabled={addBusy}
                    autoComplete="off"
                  />
                  <span className="flex items-center text-github-text-secondary">/</span>
                  <input
                    className="es-input min-w-[120px] flex-1 font-mono text-sm"
                    placeholder="repo"
                    value={addRepo}
                    onChange={(ev) => setAddRepo(ev.target.value)}
                    disabled={addBusy}
                    autoComplete="off"
                  />
                  <button type="submit" className="es-btn es-btn-primary shrink-0" disabled={addBusy}>
                    {addBusy ? 'Queuing…' : 'Register & ingest'}
                  </button>
                </div>
                {addMsg && (
                  <p
                    className={`text-xs ${addMsg.tone === 'ok' ? 'text-emerald-400' : 'text-amber-300'}`}
                  >
                    {addMsg.text}
                  </p>
                )}
              </form>

              <div className="space-y-2">
                {repos.length === 0 && !loading ? (
                  <div className="rounded-xl border border-dashed border-github-border bg-github-bg-tertiary px-6 py-10 text-center">
                    <Globe className="mx-auto mb-3 h-8 w-8 text-github-text-secondary opacity-40" />
                    <p className="text-sm text-github-text-secondary">No repositories indexed yet.</p>
                  </div>
                ) : (
                  repos.map((row, i) => {
                    const n = parseGitHubOwnerRepo(row.owner, row.repo);
                    const rowKey = row.id != null ? String(row.id) : `${n.owner}/${n.repo}-${i}`;
                    const busyKey = row.id != null ? String(row.id) : `${n.owner}/${n.repo}`;
                    return (
                    <div
                      key={rowKey}
                      className="es-card-interactive flex items-center justify-between gap-4 border border-github-border bg-github-bg-tertiary px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-github-border bg-github-bg-secondary">
                          <Globe size={16} className="text-github-text-secondary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-medium text-white">
                            {n.owner}/{n.repo}
                          </p>
                          <p className="text-xs text-github-text-secondary">Last run · 48 signals</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => handleRemoveRepo(row)}
                          disabled={removeBusyId === busyKey}
                          title="Remove index and unregister"
                          className="rounded-md p-2 text-github-text-secondary hover:bg-rose-500/15 hover:text-rose-200 disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                        <a
                          href={`https://github.com/${encodeURIComponent(n.owner)}/${encodeURIComponent(n.repo)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md p-2 text-github-text-secondary hover:bg-github-bg-secondary hover:text-white"
                          aria-label="Open on GitHub"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-github-text-secondary">
                <Terminal size={14} /> Recent logs
              </div>
              <div className="rounded-xl border border-github-border bg-github-bg-secondary p-4 font-mono text-xs leading-relaxed text-github-text-secondary">
                <div className="space-y-2">
                  <p>
                    <span className="text-github-text-secondary/60">22:45:01</span>{' '}
                    <span className="text-github-blue">INFO</span> reasoning shard ready
                  </p>
                  <p>
                    <span className="text-github-text-secondary/60">22:45:12</span>{' '}
                    <span className="text-emerald-400">SYNC</span> fastify/fastify PR #4928
                  </p>
                  <p>
                    <span className="text-github-text-secondary/60">22:46:05</span>{' '}
                    <span className="text-violet-400">CORE</span> inference 412ms
                  </p>
                  <p>
                    <span className="text-github-text-secondary/60">22:47:18</span>{' '}
                    <span className="text-github-blue">INFO</span> awaiting trigger
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
