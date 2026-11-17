import { describe, expect, test } from 'vitest';
import { addDays, fromMin, gameDate, toMin } from './day';

describe('day', () => {
  test('до 04:00 — ещё вчера', () => {
    expect(gameDate(new Date(2026, 10, 18, 1, 30).getTime())).toBe('2026-11-17');
    expect(gameDate(new Date(2026, 10, 18, 4, 0).getTime())).toBe('2026-11-18');
  });
  test('addDays через границы месяца', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('toMin/fromMin', () => {
    expect(toMin('09:30')).toBe(570);
    expect(fromMin(570)).toBe('09:30');
    expect(fromMin(1440 + 5)).toBe('00:05');
    expect(fromMin(-60)).toBe('23:00');
  });
});
