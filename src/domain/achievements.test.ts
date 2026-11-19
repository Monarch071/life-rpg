import { expect, test } from 'vitest';
import { ACHIEVEMENTS, earnAchievements } from './achievements';

test('ACHIEVEMENTS: 21 уникальный id без shadow_*; streak_7 верен на 7 и неверен на 6', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  expect(ids.length).toBe(21);
  expect(new Set(ids).size).toBe(21);
  expect(ids.some(id => id.startsWith('shadow'))).toBe(false);
  const base = { questsDone: 0, streak: 0, level: 1, maxStepsDay: 0, perfectDays: 0, checkins: 0, purchases: 0, skills: 0, weeklyDone: 0, bossesDefeated: 0, laddersMastered: 0 };
  const s7 = ACHIEVEMENTS.find(a => a.id === 'streak_7')!;
  expect(s7.test({ ...base, streak: 7 })).toBe(true);
  expect(s7.test({ ...base, streak: 6 })).toBe(false);
  expect(s7.titleReward).toBe('Упорный');
});

test('earnAchievements: уровень считается от стартового', () => {
  const days = new Map([['2026-11-17', { xp: 0 }]]);
  expect(earnAchievements(days, '2026-11-17').map(a => a.id)).toEqual([]);
  expect(earnAchievements(days, '2026-11-17', 10).map(a => a.id)).toEqual(['level_5', 'level_10']);
});
