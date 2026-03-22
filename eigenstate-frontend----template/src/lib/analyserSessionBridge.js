/** When set, Repo Analyser opens a dedicated chat for this repo on next visit. */
export const ANALYSER_BOOTSTRAP_KEY = 'eigenstate_analyser_bootstrap';

/**
 * @param {string} owner
 * @param {string} repo
 * @param {{ replace?: boolean }} [opts]
 */
export function queueAnalyserSessionForRepo(owner, repo, opts = {}) {
  if (!owner || !repo) return;
  const payload = {
    owner: String(owner).trim(),
    repo: String(repo).trim(),
    replace: !!opts.replace,
    ts: Date.now(),
  };
  try {
    localStorage.setItem(ANALYSER_BOOTSTRAP_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new CustomEvent('eigenstate:analyser-bootstrap', { detail: payload }));
  } catch {
    /* non-browser */
  }
}

/** @returns {{ owner: string, repo: string, replace?: boolean, ts?: number } | null} */
/** Drop analyser UI state for a repo after its index is deleted. */
/** Full workspace wipe: clear analyser UI + storage (listen in Repo Analyser). */
export function emitWorkspaceCleared() {
  try {
    window.dispatchEvent(new CustomEvent('eigenstate:workspace-cleared'));
  } catch {
    /* non-browser */
  }
}

export function emitRepoIndexCleared(owner, repo) {
  if (!owner || !repo) return;
  try {
    window.dispatchEvent(new CustomEvent('eigenstate:repo-cleared', { detail: { owner, repo } }));
  } catch {
    /* non-browser */
  }
}

export function consumeAnalyserBootstrap() {
  try {
    const raw = localStorage.getItem(ANALYSER_BOOTSTRAP_KEY);
    if (!raw) return null;
    localStorage.removeItem(ANALYSER_BOOTSTRAP_KEY);
    const o = JSON.parse(raw);
    if (!o?.owner || !o?.repo) return null;
    return o;
  } catch {
    return null;
  }
}
