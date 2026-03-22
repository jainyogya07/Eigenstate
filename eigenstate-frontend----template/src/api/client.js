/**
 * API base: in dev, use same-origin paths so Vite proxy forwards to the Go server.
 * In production, set VITE_API_URL (e.g. http://localhost:8080) if the UI is on another origin.
 */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  return base ? `${base}${p}` : p;
}

export async function apiFetch(path, init = {}) {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    throw err;
  }
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

/** Default demo repo when none registered yet */
export const DEFAULT_REPO = {
  owner: import.meta.env.VITE_DEFAULT_OWNER || 'fastify',
  repo: import.meta.env.VITE_DEFAULT_REPO || 'fastify',
};

/**
 * Pick primary workspace repo: first registered repo, else defaults.
 * @param {Array<{owner?: string, repo?: string}> | null} list
 */
/**
 * Normalize owner/repo when the repo field contains a full github.com URL (common mistake in forms).
 * @param {string} ownerIn
 * @param {string} repoIn
 * @returns {{ owner: string, repo: string }}
 */
export function parseGitHubOwnerRepo(ownerIn, repoIn) {
  const o = String(ownerIn || '').trim();
  const r = String(repoIn || '').trim();

  const fromUrl = (s) => {
    if (!s || !s.includes('github.com')) return null;
    const path = (s.split('github.com/')[1] || '')
      .split(/[?#]/)[0]
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1] };
    }
    return null;
  };

  const u = fromUrl(r) || fromUrl(o);
  if (u) return u;

  if (o.includes('/') && !r) {
    const p = o.split('/').filter(Boolean);
    if (p.length >= 2) return { owner: p[p.length - 2], repo: p[p.length - 1] };
  }
  if (r.includes('/') && !o) {
    const p = r.split('/').filter(Boolean);
    if (p.length >= 2) return { owner: p[p.length - 2], repo: p[p.length - 1] };
  }
  return { owner: o, repo: r };
}

/**
 * Parse owner/repo from the code-map filter field (GitHub URL or owner/repo).
 * Returns null for partial URLs (e.g. https://github.com/) or arbitrary filter text.
 */
export function parseRepoFromSearchQuery(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed.includes(' ')) return null;

  if (trimmed.includes('github.com')) {
    const path = (trimmed.split('github.com/')[1] || '')
      .split(/[?#]/)[0]
      .replace(/\.git$/i, '')
      .replace(/\/+$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) return null;

  const clean = trimmed.replace(/^n\//, '').replace(/\/+$/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
  }
  return null;
}

export function primaryRepo(list) {
  if (list && list.length > 0) {
    const row = list[0];
    if (row?.owner || row?.repo) {
      const n = parseGitHubOwnerRepo(row.owner, row.repo);
      if (n.owner && n.repo) return n;
    }
  }
  return { ...DEFAULT_REPO };
}

/**
 * Backend stores confidence as 0–1; demo seeds use 0–100. Returns integer percent for UI.
 * @param {unknown} value
 * @returns {number}
 */
export function confidenceToPercent(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  if (x >= 0 && x <= 1) return Math.round(x * 100);
  return Math.round(Math.min(100, Math.max(0, x)));
}

/** Remove all indexed data and unregister the repo (POST JSON — works with long repo names). */
export async function deleteRepoIndex(owner, repo) {
  return apiFetch('/repos/clear-one', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo }),
  });
}

/** Wipe every ingest table and all registered repos (requires confirmation phrase). */
export async function resetEntireWorkspace() {
  return apiFetch('/api/admin/reset-workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'reset-all-eigenstate-data' }),
  });
}

export function formatRelativeTime(isoOrString) {
  if (!isoOrString) return '';
  const t = new Date(isoOrString).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
