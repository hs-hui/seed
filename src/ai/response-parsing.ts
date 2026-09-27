import type { GrowthInputIntent } from './input-intent.js';

export function parseJsonObject(response: string): Record<string, unknown> | undefined {
  const trimmed = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(trimmed) as Record<string, unknown>; } catch { /* try a conversational response */ }
  const start = trimmed.indexOf('{'); const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try { return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>; } catch { return undefined; }
}

/**
 * Providers are asked for JSON, but account-backed models occasionally return
 * a short label or a one-line explanation instead. Normalize those harmless
 * variations so a formatting hiccup does not turn a help request into idea
 * evidence. Long, unrelated prose is deliberately ignored and lets the
 * caller reuse its local safety net (unknown text remains an `answer`).
 */
export function normalizeGrowthInputIntent(response: string): GrowthInputIntent | undefined {
  const parsed = parseJsonObject(response);
  const raw = typeof parsed?.intent === 'string' ? parsed.intent : response;
  const normalized = raw.trim().toLocaleLowerCase().replace(/[_\s]+/g, '-').replace(/["'`.,!?]+/g, '');
  if (['change-question', 'change', 'clarify', 'help', 'rephrase', 'rephrase-question'].includes(normalized)) return 'change-question';
  if (['pause', 'stop', 'later', 'hold', 'pause-for-now'].includes(normalized)) return 'pause';
  if (['answer', 'content', 'idea'].includes(normalized)) return 'answer';

  // Be tolerant of a short natural-language label while avoiding accidental
  // matches in a full model explanation or echoed prompt.
  if (response.trim().length <= 120) {
    if (/(?:change[- ]question|rephrase|clarif|ask[- ]again|질문.{0,8}(?:바꿔|다시|쉽게)|다시 물어)/i.test(response)) return 'change-question';
    if (/(?:\bpause\b|\bstop\b|\blater\b|\bhold\b|나중에|잠깐|멈춰|그만)/i.test(response)) return 'pause';
  }
  return undefined;
}

const maturityDimensionNames = ['problem', 'user', 'core value', 'differentiation', 'scope', 'feasibility', 'motivation', 'confidence'];
export function canonicalMaturityDimension(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLocaleLowerCase().replace(/[_-]+/g, ' ');
  return maturityDimensionNames.find((name) => name === normalized);
}
