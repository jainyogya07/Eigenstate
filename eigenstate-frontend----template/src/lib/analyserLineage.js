import { apiFetch, confidenceToPercent } from '../api/client';

/**
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchRepoLineage(owner, repo, limit = 20) {
  const q = `owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&limit=${limit}`;
  try {
    const rows = await apiFetch(`/api/v1/lineage?${q}`);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {Array<Record<string, unknown>>} lineage
 * @param {{ replace?: boolean }} [opts]
 * @returns {{ messages: Array<{ id: number, role: 'ai'|'user', content: string, time: string }>, insights: { complexity: number, risks: string[], insights: string[] } }}
 */
export function buildWelcomeFromLineage(owner, repo, lineage, opts = {}) {
  const label = `${owner}/${repo}`;
  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const insights = buildInsightsFromLineage(lineage);

  const head = opts.replace
    ? `Prior index for ${label} was cleared and a fresh ingest is running.`
    : `Repository analyser connected for ${label}.`;

  if (!lineage.length) {
    return {
      messages: [
        { id: 1, role: 'ai', content: `${head}\n\nNo decision rows are indexed yet. When ingestion finishes, refresh this chat (re-select the session) or send a message to pull the latest lineage.`, time: now() },
      ],
      insights,
    };
  }

  const prs = new Set(lineage.map((r) => r.pr_number).filter(Boolean));
  const bullets = lineage.slice(0, 5).map((row) => {
    const title = row.pr_title ? String(row.pr_title) : `PR #${row.pr_number}`;
    const fn = row.name ? `\`${row.name}\`` : 'symbol';
    const dec = row.decision ? String(row.decision).slice(0, 100) : String(row.summary || '').slice(0, 100);
    const tail = dec.length >= 100 ? '…' : '';
    return `• ${title} — ${fn}: ${dec}${tail}`;
  });

  const second = `Architectural trace (latest ${lineage.length} rows, ${prs.size} PRs):\n\n${bullets.join('\n')}\n\nAsk about a file, PR number, or symbol name—I will match against indexed lineage.`;

  return {
    messages: [
      { id: 1, role: 'ai', content: head, time: now() },
      { id: 2, role: 'ai', content: second, time: now() },
    ],
    insights,
  };
}

function shortFilePath(fp) {
  const s = String(fp || '');
  if (!s) return '?';
  const parts = s.split('/');
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : s;
}

/** @param {Array<Record<string, unknown>>} lineage */
export function buildInsightsFromLineage(lineage) {
  if (!Array.isArray(lineage) || lineage.length === 0) {
    return {
      complexity: 0,
      risks: ['No lineage indexed yet — finish ingestion for this repository.'],
      insights: ['Use Settings → Repositories to register and ingest, then return here.'],
    };
  }

  const confidences = lineage.map((x) => confidenceToPercent(x.confidence));
  const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const uniqFiles = new Set(lineage.map((r) => r.file_path).filter(Boolean)).size;
  const uniqPRs = new Set(lineage.map((r) => r.pr_number).filter((x) => x != null)).size;
  const complexity = Math.min(
    94,
    Math.round(32 + Math.min(lineage.length * 1.8, 18) + Math.min(uniqFiles * 2.5, 12) + Math.min(uniqPRs * 1.2, 10) + avg * 0.28),
  );

  const risks = [];
  const seenRisk = new Set();
  for (const row of lineage) {
    const p = confidenceToPercent(row.confidence);
    if (p >= 56) continue;
    const sum = (row.summary && String(row.summary).trim()) || (row.decision && String(row.decision).trim()) || '';
    if (!sum) continue;
    const key = `${row.pr_number}|${row.file_path}|${sum.slice(0, 48)}`;
    if (seenRisk.has(key)) continue;
    seenRisk.add(key);
    const fn = row.name ? String(row.name) : 'symbol';
    risks.push(
      `PR #${row.pr_number} · ${shortFilePath(row.file_path)} · \`${fn}\` (${p}%): ${sum.slice(0, 72)}${sum.length > 72 ? '…' : ''}`,
    );
    if (risks.length >= 6) break;
  }

  if (risks.length === 0) {
    risks.push('No low-confidence rows in this window — open Why Explorer for per-symbol detail.');
  } else if (risks.length === 1) {
    risks.push('Several PRs may touch the same heuristic label; use file paths to disambiguate.');
  }

  const insights = [];
  const seenInsight = new Set();
  for (const row of lineage) {
    const d = row.decision ? String(row.decision).trim() : '';
    const s = d || String(row.summary || '').trim();
    if (!s) continue;
    const key = s.slice(0, 64);
    if (seenInsight.has(key)) continue;
    seenInsight.add(key);
    insights.push(s.length > 128 ? `${s.slice(0, 128)}…` : s);
    if (insights.length >= 4) break;
  }
  if (insights.length === 0) {
    insights.push('Indexed rows are light on free-text decisions — enable PYTHON_INTEL_URL for richer narratives.');
  }

  return { complexity, risks: risks.slice(0, 4), insights };
}

/**
 * @param {Array<Record<string, unknown>>} lineage
 * @param {string} question
 */
export function answerFromLineage(lineage, question) {
  const q = question.trim().toLowerCase();
  if (!q) {
    return 'Ask something specific about this repository’s indexed decisions.';
  }
  if (!lineage.length) {
    return 'No indexed lineage for this repo yet. Complete ingestion, then try again.';
  }

  const scored = lineage.map((row, i) => {
    const hay = [
      row.name,
      row.file_path,
      row.decision,
      row.reason,
      row.summary,
      row.pr_title,
      row.tradeoff,
      row.evidence,
      row.pr_number != null ? String(row.pr_number) : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    let score = 0;
    q.split(/\s+/).forEach((term) => {
      if (term.length > 2 && hay.includes(term)) score += 2;
    });
    if (hay.includes(q)) score += 10;
    return { row, score, i };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best.score < 1) {
    const r = lineage[0];
    const conf = confidenceToPercent(r.confidence);
    return `No strong keyword match. Latest indexed signal: ${String(r.decision || r.summary || '').slice(0, 220)}${(r.decision || r.summary || '').length > 220 ? '…' : ''}\n\n(PR #${r.pr_number}, confidence ${conf}%)`;
  }

  const r = best.row;
  const conf = confidenceToPercent(r.confidence);
  const parts = [
    `Match: ${r.name || 'symbol'} in ${r.file_path || '?'} (PR #${r.pr_number})`,
    r.decision ? `Decision: ${r.decision}` : '',
    r.reason ? `Reason: ${r.reason}` : '',
    r.tradeoff ? `Tradeoff: ${r.tradeoff}` : '',
    `Confidence: ${conf}%`,
  ].filter(Boolean);
  return parts.join('\n\n');
}
