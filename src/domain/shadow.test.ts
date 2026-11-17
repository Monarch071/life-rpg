import { expect, test } from 'vitest';
import { shadowXpForDay } from './shadow';

test('shadow', () => {
  expect(shadowXpForDay([], 0)).toBe(40);
  expect(shadowXpForDay([10, 20, 30, 40], 5)).toBe(36);
});

test('shadow: только последние 14 значений, порядок не важен', () => {
  expect(shadowXpForDay([1000, ...Array(14).fill(50)], 0)).toBe(50);
  expect(shadowXpForDay([40, 10, 30, 20], 0)).toBe(33); // 32.5 → 33
});
