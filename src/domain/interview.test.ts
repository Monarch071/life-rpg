import { expect, test } from 'vitest';
import { cleanAnswers, QUESTIONS, ruleStats, SECTIONS, validAnalysis, validAnswer, type Answers } from './interview';
import { STATS } from './stats';

const STAT_KEYS = Object.keys(STATS);
const inRange = (r: Record<string, number>) => STAT_KEYS.every(k => Number.isInteger(r[k]) && r[k] >= 1 && r[k] <= 20);
const byKind = (k: string) => QUESTIONS.find(q => q.kind === k)!;

test('банк вопросов: уникальные id, 60–100, все разделы, корректные поля', () => {
  expect(new Set(QUESTIONS.map(q => q.id)).size).toBe(QUESTIONS.length);
  expect(QUESTIONS.length).toBeGreaterThanOrEqual(60); expect(QUESTIONS.length).toBeLessThanOrEqual(100);
  for (const s of SECTIONS) expect(QUESTIONS.some(q => q.section === s.id)).toBe(true);
  for (const q of QUESTIONS) {
    expect(SECTIONS.some(s => s.id === q.section)).toBe(true);
    if (q.kind === 'choice' || q.kind === 'multi') expect(q.options!.length).toBeGreaterThanOrEqual(2);
    if (q.kind === 'scale') expect(q.max! > q.min!).toBe(true);
  }
});

test('validAnswer по типам', () => {
  const ch = byKind('choice'), mu = byKind('multi'), sc = byKind('scale'), nu = byKind('number'), tx = byKind('text');
  expect(validAnswer(ch, ch.options![0])).toBe(true); expect(validAnswer(ch, 'нет такого')).toBe(false); expect(validAnswer(ch, 3)).toBe(false);
  expect(validAnswer(mu, [mu.options![0]])).toBe(true); expect(validAnswer(mu, ['x'])).toBe(false); expect(validAnswer(mu, 'a')).toBe(false);
  expect(validAnswer(sc, sc.min)).toBe(true); expect(validAnswer(sc, sc.max! + 1)).toBe(false); expect(validAnswer(sc, 2.5)).toBe(false);
  expect(validAnswer(nu, (nu.min ?? 0) + 1)).toBe(true); expect(validAnswer(nu, NaN)).toBe(false); expect(validAnswer(nu, -1)).toBe(false); expect(validAnswer(nu, '5')).toBe(false);
  expect(validAnswer(tx, 'привет')).toBe(true); expect(validAnswer(tx, 5)).toBe(false); expect(validAnswer(tx, 'я'.repeat(5000))).toBe(false);
});

test('ruleStats: атлет силён, сидячий слаб, пустые ответы не падают', () => {
  const athlete: Answers = { pushups: 50, pullups: 15, plank: 240, run_km: 10, steps: 12000 };
  const couch: Answers = { pushups: 0, pullups: 0, plank: 10, run_km: 0, steps: 1500 };
  expect(ruleStats(athlete).str).toBeGreaterThanOrEqual(14);
  expect(ruleStats(couch).str).toBeLessThanOrEqual(6);
  expect(inRange(ruleStats(athlete))).toBe(true); expect(inRange(ruleStats(couch))).toBe(true);
  expect(inRange(ruleStats({}))).toBe(true);
  expect(inRange(ruleStats({ pushups: 'много', plank: NaN, steps: [1] as any, sleep_hours: Infinity } as any))).toBe(true);
  expect(inRange(ruleStats(null as any))).toBe(true);
});

test('validAnalysis: обрезает и проверяет', () => {
  const stats = { str: 5, end: 6, int: 7, dis: 8, cha: 9, fin: 10, spi: 11 };
  const ok = validAnalysis({ archetype: 'А'.repeat(60), summary: 'ок', strengths: Array(9).fill('с'.repeat(200)), weaknesses: ['в'], stats, focus: ['ф'], questGuidance: 'г' })!;
  expect(ok.archetype.length).toBe(40); expect(ok.strengths.length).toBe(6); expect(ok.strengths[0].length).toBe(120);
  expect(validAnalysis({ archetype: 'x', summary: 's', strengths: [], weaknesses: [], stats: { ...stats, str: 99 }, focus: [], questGuidance: '' })).toBeNull();
  expect(validAnalysis({ archetype: 'x', summary: 's', strengths: [], weaknesses: [], stats: { ...stats, int: 1.5 }, focus: [], questGuidance: '' })).toBeNull();
  expect(validAnalysis(null)).toBeNull(); expect(validAnalysis('x')).toBeNull(); expect(validAnalysis({ archetype: 1 })).toBeNull();
});

test('cleanAnswers отбрасывает мусор', () => {
  expect(cleanAnswers({ a: 'x', b: 2, c: ['y'], d: {}, e: NaN, f: [1], g: null })).toEqual({ a: 'x', b: 2, c: ['y'] });
  expect(cleanAnswers([1, 2])).toEqual({}); expect(cleanAnswers(undefined)).toEqual({});
});

test('пустые ответы → все 1; только телесные ответы поднимают только str/end', () => {
  expect(Object.values(ruleStats({}))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  const r = ruleStats({ pushups: 30, pullups: 8, plank: 120, run_km: 5, steps: 8000 });
  expect(r.str).toBeGreaterThan(1); expect(r.end).toBeGreaterThan(1);
  expect([r.int, r.dis, r.cha, r.fin, r.spi]).toEqual([1, 1, 1, 1, 1]);
  expect(ruleStats({ pushups: 40 }).str).toBe(20); // частичные ответы: среднее только по имеющимся
});
