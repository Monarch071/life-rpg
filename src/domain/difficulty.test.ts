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

test('multipliers: пороги [S§6] 0,85 / 0,6 из BALANCE.calibration', () => {
  const rate = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ stat: 'dis' as Stat, done: i < done }));
  expect(adjustMultipliers(ones(), rate(6, 10), 1).dis).toBe(1);      // 60% — без изменений
  expect(adjustMultipliers(ones(), rate(8, 10), 1).dis).toBe(1);      // 80% — без изменений
  expect(adjustMultipliers(ones(), rate(11, 20), 1).dis).toBeCloseTo(0.85); // 55% — вниз (раньше порог был 50%)
  expect(adjustMultipliers(ones(), rate(17, 20), 1).dis).toBeCloseTo(1.1);  // 85% — вверх
});
