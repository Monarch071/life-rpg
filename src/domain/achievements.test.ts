import { expect, test } from 'vitest';
import { ACHIEVEMENTS } from './achievements';

test('ACHIEVEMENTS: 23 уникальных id; streak_7 верен на 7 и неверен на 6', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  expect(ids.length).toBe(23);
  expect(new Set(ids).size).toBe(23);
  const base = { questsDone: 0, streak: 0, shadowWinStreak: 0, shadowWins: 0, level: 1, maxStepsDay: 0, perfectDays: 0, checkins: 0, purchases: 0, skills: 0, weeklyDone: 0, bossesDefeated: 0 };
  const s7 = ACHIEVEMENTS.find(a => a.id === 'streak_7')!;
  expect(s7.test({ ...base, streak: 7 })).toBe(true);
  expect(s7.test({ ...base, streak: 6 })).toBe(false);
  expect(s7.titleReward).toBe('Упорный');
});
