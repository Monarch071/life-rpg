import { expect, test } from 'vitest';
import * as xp from './xp';
import { levelFromXp, xpToNext } from './xp';

test('xp', () => {
  expect(xpToNext(1)).toBe(100); expect(xpToNext(4)).toBe(800);
  expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 100 });
  expect(levelFromXp(383)).toEqual({ level: 3, into: 0, need: 520 }); // 100+283
  expect(levelFromXp(382)).toEqual({ level: 2, into: 282, need: 283 });
  expect('questXp' in xp || 'currencyFor' in xp).toBe(false); // старая XP по сложности удалена
});

test('цена уровня 100×L^1,5 [S§1]', () => {
  expect([3, 10, 20, 40, 55].map(xpToNext)).toEqual([520, 3162, 8944, 25298, 40789]);
  expect(levelFromXp(0, 20)).toEqual({ level: 20, into: 0, need: 8944 });
  expect(levelFromXp(8944, 20).level).toBe(21);
  expect(levelFromXp(1e9, 99)).toMatchObject({ level: 100, need: 0 });
});
