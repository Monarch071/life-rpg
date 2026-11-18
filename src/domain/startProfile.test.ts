import { expect, test } from 'vitest';
import { ruleSkillLevels, ruleStartLevel, scoreFrom20, startProfile } from './startProfile';
import { validAnalysis } from './interview';
import type { Analysis, Stat } from './types';

const fill = (n: number) => ({ str: n, end: n, int: n, dis: n, cha: n, fin: n, spi: n }) as Record<Stat, number>;
const OLD_ANALYSIS: Analysis = { archetype: 'А', summary: 'с', strengths: [], weaknesses: [], stats: fill(10), focus: [], questGuidance: '' };
const MAXED_ANSWERS = { pushups: 100, run_km: 42, sleep_hours: 8, regular: 5, books: 20, languages: 'английский', study_hours: 40, focus: 5,
  circle: 'Широкий круг', speaking_fear: 1, tracking: 'Веду регулярно', cushion: 24, income_sources: ['Свой бизнес'], meditation: 'Регулярно' };

test('старые 1–20 → 0–100', () => { expect([1, 10, 20].map(scoreFrom20)).toEqual([0, 47, 100]); });
test('правила: уровень = среднее/2 в пределах 1–50 (моё решение)', () => {
  expect(ruleStartLevel(fill(40))).toBe(20); expect(ruleStartLevel(fill(0))).toBe(1); expect(ruleStartLevel(fill(100))).toBe(50);
});
test('правила навыков из ответов', () => {
  expect(ruleSkillLevels({ pushups: 25, books: 4, meditation: 'Иногда', tracking: 'Веду регулярно' }))
    .toMatchObject({ strength: 3, reading: 4, mindfulness: 3, budget: 4 });
  expect(Math.max(...Object.values(ruleSkillLevels(MAXED_ANSWERS)))).toBeLessThanOrEqual(4);
});
test('ИИ-разбор нового формата', () => {
  const p = startProfile([{ analysis: { ...OLD_ANALYSIS, scores: fill(60), startLevel: 24, levelWhy: { str: 'зал 3 года' }, skillLevels: { strength: 6 } }, answers: {}, profile: null }]);
  expect(p).toMatchObject({ source: 'ai', level: 24, base: fill(44) });
  expect(p.skills.strength).toBe(6); expect(p.skills.reading).toBe(1);
  expect(p.levelWhy.str).toBe('зал 3 года');
});
test('старый ИИ-разбор (stats 1–20) → правила уровня', () => {
  const p = startProfile([{ analysis: OLD_ANALYSIS, answers: {}, profile: null }]);
  expect(p).toMatchObject({ source: 'rules', level: 24, base: fill(36) });
});
test('нет ничего → уровень 1, Основа 5', () => { expect(startProfile([])).toMatchObject({ source: 'none', level: 1, base: fill(5) }); });
test('validAnalysis: плохие новые поля отбрасываются по одному', () => {
  for (const bad of [0, 101, '20', 2.5]) expect(validAnalysis({ ...OLD_ANALYSIS, startLevel: bad })?.startLevel).toBeUndefined();
  expect(validAnalysis({ ...OLD_ANALYSIS, startLevel: 61 })?.startLevel).toBeUndefined();
  expect(validAnalysis({ ...OLD_ANALYSIS, scores: { ...fill(50), str: 140 } })?.scores).toBeUndefined();
  expect(validAnalysis({ ...OLD_ANALYSIS, skillLevels: { strength: 8, reading: 3, mentoring: 5 } })?.skillLevels).toEqual({ reading: 3 });
  expect(validAnalysis({ ...OLD_ANALYSIS, stats: null })).toBeNull();
});
