import { describe, expect, test } from 'vitest';
import { generateDailyQuests, type GenCtx } from './generate';
import { QUEST_TEMPLATES } from './questBank';
import { STATS } from './stats';
import { toMin, addDays } from './day';
import type { Profile, Stat } from './types';

const stats = (o: Partial<Record<Stat, number>> = {}) => ({ str: 8, end: 8, int: 8, dis: 8, cha: 8, fin: 8, spi: 8, ...o });
const mult = { str: 1, end: 1, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 };
const profile: Profile = {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [{ text: 'x', months: 3, stat: 'int' }],
  sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 4, day: 3, evening: 3, night: 1 }, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 },
};
const ctx = (o: Partial<GenCtx> = {}): GenCtx => ({
  date: '2026-11-17', profile, stats: stats(), multipliers: mult, wakeAt: '08:00', work: null, busy: [],
  yesterday: null, lastEnergy: null, lastSleepHours: null, bestSteps7: null, recentTemplateIds: [], ...o,
});
const yd = (completed: number, issued: number) => ({ date: '2026-11-16', xp: 0, shadowXp: 0, completed, issued, won: false });

describe('банк', () => {
  test('≥6 на характеристику, привычки покрыты', () => {
    for (const s of Object.keys(STATS) as Stat[]) expect(QUEST_TEMPLATES.filter(t => t.stat === s).length).toBeGreaterThanOrEqual(6);
    for (const h of ['games', 'social', 'late', 'junk', 'smoke', 'procr']) expect(QUEST_TEMPLATES.some(t => t.badHabit === h)).toBe(true);
  });
});

describe('generateDailyQuests', () => {
  test('весь день занят → задания без окна', () => {
    const q = generateDailyQuests(ctx({ work: { start: '08:00', end: '23:00' } }));
    expect(q.length).toBeGreaterThanOrEqual(3);
    expect(q.every(x => x.window === null)).toBe(true);
  });
  test('не пересекается с работой', () => {
    for (let i = 0; i < 20; i++) {
      const q = generateDailyQuests(ctx({ date: addDays('2026-11-17', i), work: { start: '11:00', end: '20:00' } }));
      for (const x of q) if (x.window) {
        const s = toMin(x.window.start), e = toMin(x.window.end);
        expect(e <= 660 || s >= 1200).toBe(true);
      }
    }
  });
  test('количество', () => {
    expect(generateDailyQuests(ctx()).length).toBe(4);
    expect(generateDailyQuests(ctx({ yesterday: yd(5, 5), lastEnergy: 8 })).length).toBe(6);
    const low = generateDailyQuests(ctx({ yesterday: yd(2, 4), lastEnergy: 3 }));
    expect(low.length).toBe(3);
    expect(low.every(x => x.difficulty < 4)).toBe(true);
  });
  test('слабая характеристика и шаги', () => {
    const q = generateDailyQuests(ctx({ stats: stats({ fin: 2 }), bestSteps7: 7000 }));
    expect(q.some(x => x.stat === 'fin')).toBe(true);
    const s = q.find(x => x.templateId === 'steps')!;
    expect(s.auto).toEqual({ metric: 'steps', op: '>=', value: 7500 });
    expect(s.window).toBeNull();
  });
  test('вредная привычка', () => {
    const q = generateDailyQuests(ctx({ profile: { ...profile, badHabits: ['smoke'] } }));
    expect(q.some(x => QUEST_TEMPLATES.find(t => t.id === x.templateId)?.badHabit === 'smoke')).toBe(true);
    const c = generateDailyQuests(ctx({ profile: { ...profile, badHabits: ['кофе'] } }));
    expect(c.some(x => x.title.includes('кофе'))).toBe(true);
  });
  test('детерминизм', () => {
    expect(generateDailyQuests(ctx())).toEqual(generateDailyQuests(ctx()));
  });
  test('сон < 6 ч → physical сложность ≤ 2', () => {
    for (let i = 0; i < 20; i++) {
      const q = generateDailyQuests(ctx({ date: addDays('2026-11-17', i), lastSleepHours: 5, yesterday: yd(4, 4), lastEnergy: 9 }));
      for (const x of q) if (QUEST_TEMPLATES.find(t => t.id === x.templateId)?.physical) expect(x.difficulty).toBeLessThanOrEqual(2);
    }
  });
});
