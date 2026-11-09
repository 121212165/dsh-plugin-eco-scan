// Pure helpers shared by the dashboard builder and the unit tests.
import { TOPIC_STOP, TAX, MISC } from './taxonomy.mjs';

export const PRIOR = 50;

export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function upperBound(sorted, v) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return lo;
}

// Percentile of v inside an ascending array of signal-bearing values.
export function percentile(sorted, v) {
  return v > 0 && sorted.length ? (upperBound(sorted, v) / sorted.length) * 100 : 0;
}

// Coverage-weighted score: the four component weights are summed, then the
// missing share is filled with a neutral prior instead of a hard zero.
export function computeScore({ stars, weekly, growth, pushDays, starPct, reachPct, growthPct, activity }) {
  const scoreOld = +(0.40 * starPct + 0.30 * reachPct + 0.20 * growthPct + 0.10 * activity).toFixed(1);
  const coverage = +(((stars > 0 ? 0.40 : 0) + (weekly != null && weekly > 0 ? 0.30 : 0) + (growth != null ? 0.20 : 0) + (pushDays != null ? 0.10 : 0))).toFixed(2);
  const score = coverage > 0 ? +(scoreOld + (1 - coverage) * PRIOR).toFixed(1) : 0;
  return { score, scoreOld, coverage, lowSignal: coverage < 0.5 ? 1 : 0 };
}

export function cleanReadme(raw) {
  let t = String(raw || '');
  t = t.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ').replace(/[|]/g, ' ').replace(/\s+/g, ' ');
  return t.slice(0, 1200);
}

export function parseTopics(raw) {
  if (!raw) return [];
  try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
}

export function tagRepo(name, desc, topics) {
  const cleanTopics = (topics || []).filter((t) => !TOPIC_STOP.has(String(t).toLowerCase()));
  const text = (name + ' ' + (desc || '') + ' ' + cleanTopics.join(' ')).toLowerCase();
  const out = [];
  for (const t of TAX) if (t[3].test(text)) out.push(t[0]);
  if (!out.length) return [MISC[0]];
  return out.slice(0, 4);
}
