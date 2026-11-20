import { BALANCE as B } from './balance';
import { RARE_POOL } from './cosmetics';
import { seededRng } from './rng';
import type { ISODate } from './types';

export type WeekRank = 'S' | 'A' | 'B' | 'C' | 'D';
const W = B.week, L = B.league;
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const pts = (p: number) => Math.min(L.maxPoints, Math.max(0, Number.isFinite(p) ? p : 0));

/** Ранг недели по доле выполненных и XP против среднего 4 прошлых недель [P§5]. */
export function weekRank(share: number, xp: number, avg4: number): WeekRank {
  const s = r9(share);
  if (s >= W.s && xp >= r9(W.sXp * avg4)) return 'S';
  return s >= W.a ? 'A' : s >= W.b ? 'B' : s >= W.c ? 'C' : 'D';
}

/** Среднее XP прошлых недель; null — неделя без выдачи; нет данных — baseDayXp × 7. */
export function avgPrev(weeks: (number | null)[]): number {
  const v = weeks.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : W.baseDayXp * 7;
}

export const leagueTier = (points: number): 0 | 1 | 2 | 3 | 4 | 5 => Math.floor(pts(points) / L.perTier) as 0 | 1 | 2 | 3 | 4 | 5;

/** Очки после недели; rank null — неделя без ранга; восстановление гасит минус. */
export function leagueAfter(points: number, rank: WeekRank | null, recovery: boolean): number {
  if (!rank) return pts(points);
  const d = W.points[rank];
  return pts(pts(points) + (recovery && d < 0 ? 0 : d));
}

export const softReset = (points: number): number => Math.max(0, (leagueTier(points) - 1) * L.perTier);

/** Первая не полученная редкая вещь в порядке, заданном хэшем недели; все получены — null. */
export function chestPick(weekStart: ISODate, owned: ReadonlySet<string>): string | null {
  const rng = seededRng(weekStart), a = [...RARE_POOL];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.find(id => !owned.has(id)) ?? null;
}
