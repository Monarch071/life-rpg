import type { Stat } from './types';

/**
 * Адаптивная сложность: доля выполненных ≥ 0.85 → ×1.10^step, < 0.5 → ×0.85^step; clamp 0.5–3.0.
 * step = 1/7, т.к. replay применяет её каждый финализированный день: за неделю набегает ровно ×1.10 / ×0.85.
 */
export function adjustMultipliers(m: Record<Stat, number>, last7: { stat: Stat; done: boolean }[], step = 1 / 7): Record<Stat, number> {
  const out = { ...m };
  for (const s of Object.keys(m) as Stat[]) {
    const qs = last7.filter(q => q.stat === s);
    if (!qs.length) continue;
    const rate = qs.filter(q => q.done).length / qs.length;
    const k = rate >= 0.85 ? 1.1 ** step : rate < 0.5 ? 0.85 ** step : 1;
    out[s] = Math.min(3, Math.max(0.5, m[s] * k));
  }
  return out;
}
