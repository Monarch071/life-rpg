import { expect, test } from 'vitest';
import { adjustMultipliers } from './difficulty';
import type { Stat } from './types';

const ones = (): Record<Stat, number> => ({ str: 1, end: 1, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 });
const mixed = [
  ...Array(7).fill({ stat: 'str', done: true }),
  { stat: 'int', done: true }, ...Array(3).fill({ stat: 'int', done: false }),
];

test('multipliers: дневной шаг = корень 7‑й степени из недельного', () => {
  const m = adjustMultipliers(ones(), mixed);
  expect(m.str).toBeCloseTo(1.1 ** (1 / 7), 6);
  expect(m.int).toBeCloseTo(0.85 ** (1 / 7), 6);
  expect(m.end).toBe(1); // нет заданий — без изменений
  expect(adjustMultipliers({ ...ones(), str: 2.99 }, [{ stat: 'str', done: true }]).str).toBe(3);
  expect(adjustMultipliers({ ...ones(), int: 0.501 }, [{ stat: 'int', done: false }]).int).toBe(0.5);
});

test('multipliers: недельный шаг (step = 1)', () => {
  const m = adjustMultipliers(ones(), mixed, 1);
  expect(m.str).toBeCloseTo(1.1); expect(m.int).toBeCloseTo(0.85);
  expect(adjustMultipliers({ ...ones(), str: 2.9 }, [{ stat: 'str', done: true }], 1).str).toBe(3);
});

test('multipliers: доля между 0.5 и 0.85 — без изменений', () => {
  const m = adjustMultipliers(ones(), [{ stat: 'dis', done: true }, { stat: 'dis', done: false }]);
  expect(m.dis).toBe(1);
});
