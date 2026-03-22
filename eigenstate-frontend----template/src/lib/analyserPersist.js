import { ANALYSER_BOOTSTRAP_KEY } from './analyserSessionBridge';

const KEY = 'eigenstate_analyser_v1';

/**
 * @typedef {{ id: string, owner: string, repo: string, name: string, time: string, lastMessage: string, isAnalysing: boolean }} AnalyserSession
 * @typedef {{ id: number, role: 'ai'|'user', content: string, time: string }} ChatMessage
 * @typedef {{ complexity: number, risks: string[], insights: string[] }} AnalyserInsights
 */

/** @returns {{ sessions: AnalyserSession[], messages: Record<string, ChatMessage[]>, insights: Record<string, AnalyserInsights>, activeId: string | null }} */
export function loadAnalyserState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return { sessions: [], messages: {}, insights: {}, activeId: null };
    }
    const o = JSON.parse(raw);
    return {
      sessions: Array.isArray(o.sessions) ? o.sessions : [],
      messages: o.messages && typeof o.messages === 'object' ? o.messages : {},
      insights: o.insights && typeof o.insights === 'object' ? o.insights : {},
      activeId: typeof o.activeId === 'string' || o.activeId === null ? o.activeId : null,
    };
  } catch {
    return { sessions: [], messages: {}, insights: {}, activeId: null };
  }
}

/** @param {{ sessions: AnalyserSession[], messages: Record<string, ChatMessage[]>, insights: Record<string, AnalyserInsights>, activeId: string | null }} state */
export function saveAnalyserState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearAnalyserLocalState() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(ANALYSER_BOOTSTRAP_KEY);
  } catch {
    /* ignore */
  }
}
