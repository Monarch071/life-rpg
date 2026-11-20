import { expect, test } from 'vitest';
import { avgPrev, chestPick, leagueAfter, leagueTier, softReset, weekRank } from './rivalry';
import { RARE_POOL } from './cosmetics';

test('ранг недели [P§5]', () => {
  expect(weekRank(0.9, 1260, 1050)).toBe('S'); expect(weekRank(0.9, 1259, 1050)).toBe('A');
  expect([0.8, 0.79, 0.65, 0.6499, 0.5, 0.49].map(s => weekRank(s, 0, 1050))).toEqual(['A', 'B', 'B', 'C', 'C', 'D']);
  expect(avgPrev([null, null, null, null])).toBe(1050); expect(avgPrev([1200, null, 800, null])).toBe(1000);
});
test('лига: 6 очков на ступень, 0–35, восстановление гасит минус, мягкий сброс [P§5, S§8]', () => {
  expect(leagueAfter(5, 'B', false)).toBe(6); expect(leagueTier(6)).toBe(1);
  expect(leagueAfter(6, 'D', false)).toBe(5); expect(leagueAfter(6, 'D', true)).toBe(6);
  expect(leagueAfter(0, 'D', false)).toBe(0); expect(leagueAfter(34, 'S', false)).toBe(35); expect(leagueTier(35)).toBe(5);
  expect(leagueAfter(7, null, false)).toBe(7);
  expect(softReset(14)).toBe(6); expect(softReset(3)).toBe(0); expect(softReset(35)).toBe(24);
});
test('сундук детерминирован и не повторяется', () => {
  const a = chestPick('2026-12-21', new Set()); expect(a).toBe(chestPick('2026-12-21', new Set()));
  expect(RARE_POOL).toContain(a); expect(chestPick('2026-12-21', new Set(RARE_POOL))).toBeNull();
  expect(chestPick('2026-12-21', new Set([a!]))).not.toBe(a);
});
test('среднее ≤ 0 или NaN — база baseDayXp × 7; NaN не ломает ранг и лигу', () => {
  expect(weekRank(0.95, 100, 0)).toBe('A'); expect(weekRank(0.95, 1260, 0)).toBe('S');
  expect(weekRank(0.95, 1260, NaN)).toBe('S'); expect(weekRank(0.95, 100, -5)).toBe('A');
  expect(weekRank(NaN, 5000, 1050)).toBe('D'); expect(weekRank(0.95, NaN, 1050)).toBe('A');
  expect(avgPrev([0, 0, null, null])).toBe(1050); expect(avgPrev([NaN, Infinity, null])).toBe(1050);
  expect(leagueTier(NaN)).toBe(0); expect(leagueTier(-3)).toBe(0); expect(leagueTier(1e9)).toBe(5);
  expect(leagueAfter(NaN, 'S', false)).toBe(3); expect(leagueAfter(NaN, null, false)).toBe(0);
  expect(softReset(NaN)).toBe(0);
});
