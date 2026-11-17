import { expect, test } from 'vitest';
import { adjustMultipliers } from './difficulty';
import type { Stat } from './types';

const ones = (): Record<Stat, number> => ({ str: 1, end: 1, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 });

test('multipliers', () => {
  const m = adjustMultipliers(ones(), [
    ...Array(7).fill({ stat: 'str', done: true }),
    { stat: 'int', done: true }, ...Array(3).fill({ stat: 'int', done: false }),
  ]);
  expect(m.str).toBeCloseTo(1.1);
  expect(m.int).toBeCloseTo(0.85);
  expect(m.end).toBe(1); // нет заданий — без изменений
  expect(adjustMultipliers({ ...ones(), str: 2.9 }, [{ stat: 'str', done: true }]).str).toBe(3);
  expect(adjustMultipliers({ ...ones(), int: 0.55 }, [{ stat: 'int', done: false }]).int).toBe(0.5);
});

test('multipliers: доля между 0.5 и 0.85 — без изменений', () => {
  const m = adjustMultipliers(ones(), [{ stat: 'dis', done: true }, { stat: 'dis', done: false }]);
  expect(m.dis).toBe(1);
});
