import { expect, test } from 'vitest';
import { currencyFor, levelFromXp, questXp, xpToNext } from './xp';

test('xp', () => {
  expect(xpToNext(1)).toBe(100); expect(xpToNext(4)).toBe(800);
  expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 100 });
  expect(levelFromXp(383)).toEqual({ level: 3, into: 0, need: 520 }); // 100+283
  expect(levelFromXp(382)).toEqual({ level: 2, into: 282, need: 283 });
  expect(questXp(3, 1.1)).toBe(39); expect(currencyFor(39)).toBe(3);
});
