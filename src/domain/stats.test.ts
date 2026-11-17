import { expect, test } from 'vitest';
import { classFor, initialStats, tierFor } from './stats';
import { seededRng } from './rng';
import type { Profile, Stat } from './types';

const rating = (n: number) => ({ str: n, end: n, int: n, dis: n, cha: n, fin: n, spi: n }) as Record<Stat, number>;
const prof = (sportLevel: Profile['sportLevel'], selfRating: Record<Stat, number>) =>
  ({ sportLevel, selfRating }) as Profile;

test('initialStats: rating*2 + бонусы, в пределах 1–20', () => {
  expect(initialStats(prof(0, rating(5)))).toEqual(rating(10));
  expect(initialStats(prof(3, rating(5)))).toEqual({ ...rating(10), str: 12, end: 12 });
  expect(initialStats(prof(2, rating(10)))).toEqual({ ...rating(20), str: 20, end: 20 }); // clamp сверху
  expect(initialStats(prof(0, rating(0))).int).toBe(1); // clamp снизу
});
test('classFor берёт две старшие характеристики', () => {
  expect(classFor({ str: 15, end: 14, int: 3, dis: 3, cha: 3, fin: 3, spi: 3 })).toBe('Воин');
  expect(classFor({ str: 3, end: 3, int: 3, dis: 14, cha: 3, fin: 15, spi: 3 })).toBe('Торговец');
});
test('classFor: ничья — по порядку STATS; нет пары — Искатель', () => {
  expect(classFor(rating(5))).toBe('Воин'); // str, end
  expect(classFor({ str: 3, end: 3, int: 3, dis: 3, cha: 15, fin: 3, spi: 3 })).toBe('Искатель (Харизма)');
});
test('tierFor', () => { expect([1, 4, 5, 14, 15, 29, 30].map(tierFor)).toEqual([1, 1, 2, 2, 3, 3, 4]); });
test('seededRng детерминирован', () => {
  const a = seededRng('x'), b = seededRng('x');
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  expect(sa).toEqual(sb);
  expect(sa.every(v => v >= 0 && v < 1)).toBe(true);
  expect(seededRng('y')()).not.toBe(sa[0]);
});
