import { BALANCE } from './balance';

/** Итог дня [S§6]: засчитан при всех показанных ритуалах ИЛИ ≥60% выданных (без «перенесённых» dropped); идеален — все задания; день отдыха нейтрален. */
export function dayOutcome(d: { issued: number; done: number; dropped: number; rest: boolean; rituals?: { due: number; done: number } }): { counted: boolean; perfect: boolean; neutral: boolean } {
  const n = d.issued - d.dropped, r = d.rituals;
  const byRituals = !!r && r.due > 0 && r.done >= r.due;
  return { counted: !d.rest && (byRituals || (n > 0 && d.done >= BALANCE.streak.countShare * n)), perfect: n > 0 && d.done >= n, neutral: d.rest };
}

/** Серия после дня: засчитан +1, отдых — без изменений, пропуск ×0,5 вниз (заморозка гасит пропуск). */
export function nextStreak(prev: number, o: ReturnType<typeof dayOutcome>, freeze: boolean): number {
  if (o.neutral) return prev;
  if (o.counted) return prev + 1;
  return freeze ? prev : Math.floor(prev * BALANCE.streak.missFactor);
}
