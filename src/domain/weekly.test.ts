import { expect, test } from 'vitest';
import { generateWeeklyQuests, type WeeklyCtx } from './weekly';

const fill = (n: number) => ({ str: n, end: n, int: n, dis: n, cha: n, fin: n, spi: n });
const ctx = (o: Partial<WeeklyCtx> = {}): WeeklyCtx =>
  ({ weekStart: '2026-11-16', stats: fill(5), multipliers: fill(1), prevActiveDays: 0, prevStatQuests: 0, bestSteps7: null, ...o });

test('3 задания, без шагов — shadow_wins', () => {
  const w = generateWeeklyQuests(ctx());
  expect(w.map(x => x.kind)).toEqual(['active_days', 'stat_quests', 'shadow_wins']);
  expect(w.map(x => x.id)).toEqual(['2026-11-16:w:active_days', '2026-11-16:w:stat_quests', '2026-11-16:w:shadow_wins']);
  expect(w[0].target).toBe(3); expect(w[1].target).toBe(3); expect(w[2].target).toBe(3);
  expect(w.every(x => x.xp === 150)).toBe(true);
});

test('цели растут от прошлой недели, шаги округляются вверх до тысячи', () => {
  const w = generateWeeklyQuests(ctx({ prevActiveDays: 6, prevStatQuests: 10, bestSteps7: 7000 }));
  expect(w[0].target).toBe(7);
  expect(w[1].target).toBe(11);
  expect(w[2]).toMatchObject({ kind: 'steps_total', target: 52000 });
  expect(generateWeeklyQuests(ctx({ prevActiveDays: 9 }))[0].target).toBe(7);
});

test('stat_quests — слабейшая характеристика, ничья по порядку, XP по множителю; детерминированность', () => {
  const c = ctx({ stats: { ...fill(5), int: 2, fin: 2 }, multipliers: { ...fill(1), int: 1.2 } });
  const w = generateWeeklyQuests(c);
  expect(w[1].stat).toBe('int'); expect(w[1].title).toContain('Интеллект'); expect(w[1].xp).toBe(180);
  expect(generateWeeklyQuests(c)).toEqual(w);
});
