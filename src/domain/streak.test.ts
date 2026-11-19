import { expect, test } from 'vitest';
import { dayOutcome, nextStreak } from './streak';

test('итог дня [S§6]', () => {
  expect(dayOutcome({ issued: 5, done: 3, dropped: 0, rest: false })).toMatchObject({ counted: true, perfect: false });
  expect(dayOutcome({ issued: 5, done: 2, dropped: 0, rest: false }).counted).toBe(false);
  expect(dayOutcome({ issued: 4, done: 3, dropped: 1, rest: false })).toMatchObject({ counted: true, perfect: true });
  expect(dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false }).counted).toBe(false);
  expect(nextStreak(10, dayOutcome({ issued: 5, done: 2, dropped: 0, rest: false }), false)).toBe(5);
  expect(nextStreak(7, dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false }), false)).toBe(3);
  expect(nextStreak(7, dayOutcome({ issued: 1, done: 0, dropped: 0, rest: true }), false)).toBe(7);
  expect(nextStreak(7, dayOutcome({ issued: 3, done: 0, dropped: 0, rest: false }), true)).toBe(7);
  expect(nextStreak(7, dayOutcome({ issued: 3, done: 3, dropped: 0, rest: false }), false)).toBe(8);
  expect(dayOutcome({ issued: 1, done: 0, dropped: 0, rest: true })).toMatchObject({ neutral: true, counted: false });
});

test('итог дня: все ритуалы ИЛИ 60% [S§6]', () => {
  expect(dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false, rituals: { due: 2, done: 2 } }).counted).toBe(true);
  expect(dayOutcome({ issued: 2, done: 0, dropped: 0, rest: false, rituals: { due: 2, done: 1 } }).counted).toBe(false);
  expect(dayOutcome({ issued: 2, done: 0, dropped: 0, rest: true, rituals: { due: 2, done: 2 } })).toMatchObject({ neutral: true, counted: false });
  expect(dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false, rituals: { due: 0, done: 0 } }).counted).toBe(false);
  expect(dayOutcome({ issued: 2, done: 0, dropped: 0, rest: false, rituals: { due: 2, done: 2 } }).perfect).toBe(false);
});
