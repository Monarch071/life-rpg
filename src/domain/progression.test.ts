import { expect, test } from 'vitest';
import { baseFromXp, fatiguePenalty, formNorm, formOf, formStatus, goldFor, questReward, rankCap, rankShift, skillFromXp, startBase, statPointCost, streakBonus } from './progression';

test('«Зал 45 минут»: 92 XP и 18 золота [S§1]', () => {
  const r = questReward({ rank: 'C', verify: 'auto', bonuses: [streakBonus(10), 0.1, 0.1], penalties: [fatiguePenalty(20)] });
  expect(r).toMatchObject({ base: 70, k: 1, bonus: 0.4, penalty: 0.06, xp: 92, gold: 18 });
});
test('потолки бонусов и штрафов', () => {
  expect(questReward({ rank: 'E', verify: 'honest', bonuses: [0.5, 0.25, 0.2, 0.2], penalties: [] }).bonus).toBe(1);
  expect(questReward({ rank: 'E', verify: 'auto', bonuses: [], penalties: [0.2, 0.2, 0.2] }).penalty).toBe(0.5);
  expect(questReward({ rank: 'C', verify: 'honest', bonuses: [], penalties: [] }).xp).toBe(49);
  expect(questReward({ rank: 'C', verify: 'photo', bonuses: [], penalties: [] }).xp).toBe(63);
  expect(questReward({ rank: 'E', verify: 'honest', bonuses: [], penalties: [], mult: 2 }).xp).toBe(28);
  expect(streakBonus(30)).toBe(0.5); expect(goldFor(37)).toBe(7);
});
test('Основа: старт и цена очка [S§2]', () => {
  expect([0, 40, 50, 100].map(startBase)).toEqual([5, 31, 38, 70]);
  expect(statPointCost(20)).toBe(150);
  expect(baseFromXp(20, 1725)).toEqual({ value: 30, into: 0, need: 200 });
  expect(baseFromXp(20, 1724).value).toBe(29);
  expect(baseFromXp(50, 3225).value).toBe(60);
  expect(baseFromXp(1, 29700)).toMatchObject({ value: 100, need: 0 });
});
test('Форма: пример «болел две недели» → 38% [S§2]', () => {
  const norm = formNorm(40);
  expect(norm).toBe(28);
  expect(Math.round(formOf(150, 14, norm)! * 100)).toBe(38);
  expect(formStatus(formOf(150, 14, norm))).toBe('abandoned');
  expect(formNorm(10)).toBe(15);
  expect(formOf(999, 14, 28)).toBe(1); expect(formOf(0, 0, 28)).toBeNull();
  expect([0.8, 0.79, 0.4, 0.39].map(formStatus)).toEqual(['in_form', 'sagging', 'sagging', 'abandoned']);
});
test('навыки 100·n, 1→10 = 4 500 [S§4]', () => {
  expect(skillFromXp(1, 4500)).toMatchObject({ level: 10, need: 0 });
  expect(skillFromXp(2, 199)).toEqual({ level: 2, into: 199, need: 200 });
});
test('потолок ранга [S§6]', () => {
  expect(rankCap(55, 2)).toBe('D'); expect(rankCap(55, 8)).toBe('A');
  expect(rankCap(1, 9)).toBe('E'); expect(rankCap(20, 3)).toBe('C'); expect(rankCap(70, 10)).toBe('S');
  expect(rankShift('E', -1)).toBe('E'); expect(rankShift('S', 1)).toBe('S'); expect(rankShift('C', 1)).toBe('B');
});
