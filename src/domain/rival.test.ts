import { expect, test } from 'vitest';
import { ghostAt, ghostWeek, growthIndex, monthReview, prevMonthSameDay, recordStep, RECORDS, streakRecord } from './rival';

test('день-призрак: тот же день прошлого месяца, несуществующий — нет', () => {
  expect(prevMonthSameDay('2027-01-05')).toBe('2026-12-05');
  expect(prevMonthSameDay('2027-03-28')).toBe('2027-02-28');
  expect(prevMonthSameDay('2027-03-29')).toBeNull(); expect(prevMonthSameDay('2027-03-31')).toBeNull();
});
test('призрак: «впереди на 340 XP» [P§5]', () => {
  const xp: Record<string, number> = { '2026-12-01': 200, '2026-12-02': 100, '2027-01-01': 300, '2027-01-02': 340 };
  const x = (d: string) => xp[d] ?? 0, has = (d: string) => d >= '2027-01-01';
  expect(ghostAt(x, '2027-01-02', has)).toEqual({ available: true, you: 640, ghost: 300, lead: 340 });
  expect(ghostAt(x, '2026-12-02', has).available).toBe(false);
  expect(ghostWeek(x, '2026-12-28', has)).toBeNull();   // 28–31 декабря без призрака
  expect(ghostWeek(x, '2027-01-04', has)).toEqual({ you: 0, ghost: 0 });
});
test('индекс роста [P§5]: по дню, база 150 при < 14 днях прошлого', () => {
  expect(growthIndex({ xp: 6000, days: 30 }, { xp: 5000, days: 30 })).toEqual({ index: 120, xpPerDay: 200, base: 'prev' });
  expect(growthIndex({ xp: 4800, days: 24 }, { xp: 6200, days: 31 })).toEqual({ index: 100, xpPerDay: 200, base: 'prev' });   // 6 дней восстановления не штрафуют
  expect(growthIndex({ xp: 4650, days: 31 }, { xp: 1300, days: 13 })).toEqual({ index: 100, xpPerDay: 150, base: 'base' });
  expect(growthIndex({ xp: 0, days: 0 }, null).index).toBeNull();
  expect(growthIndex({ xp: 3000, days: 20 }, { xp: 0, days: 20 })).toMatchObject({ index: 100, base: 'base' });   // нулевой прошлый — база, без деления на 0
});
test('рекорды: первое значение без награды, строго больше', () => {
  expect(recordStep(null, 8000)).toEqual({ best: 8000, beaten: false });
  expect(recordStep(0, 5)).toEqual({ best: 5, beaten: false });
  expect(recordStep(8000, 8000)).toEqual({ best: 8000, beaten: false });
  expect(recordStep(8000, 8001)).toEqual({ best: 8001, beaten: true });
  expect(recordStep(8000, null)).toEqual({ best: 8000, beaten: false });
  expect(RECORDS.map(r => r.id)).toEqual(['streak', 'steps_day', 'week_xp', 'pages_week', 'focus_day', 'savings_month']);
});
test('рекорд серии — раз за серию', () => {
  let s = { best: 10, armed: true };
  const seen = [9, 10, 11, 12, 13, 0, 5, 14].map(v => { const r = streakRecord(s, v); s = { best: r.best, armed: r.armed }; return r.beaten; });
  expect(seen).toEqual([false, false, true, false, false, false, false, true]);
  expect(s.best).toBe(14);
  expect(streakRecord({ best: 0, armed: true }, 1)).toEqual({ best: 1, armed: false, beaten: false });   // первая серия — без награды
});
test('итоги месяца [P§8]: 25/31, 60%, хоть один сдвиг', () => {
  expect(monthReview({ days: 31, opened: 25, issued: 100, done: 60, shifts: ['saving'] })).toMatchObject({ opened: true, completion: true, shift: true, pass: true });
  expect(monthReview({ days: 31, opened: 24, issued: 100, done: 90, shifts: ['ladder'] }).pass).toBe(false);
  expect(monthReview({ days: 28, opened: 23, issued: 0, done: 0, shifts: [] })).toMatchObject({ opened: true, completion: false, shift: false });   // 23 ≥ 28 × 25/31
});
