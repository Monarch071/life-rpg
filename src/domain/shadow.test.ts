import { expect, test } from 'vitest';
import { banished, battleOutcome, facetDay, facetStart, facetSuggestions, isSerious, lastSunday, masterPlan } from './shadow';
import type { Profile } from './types';

test('сила грани [S§7]: +8 / −2 / неделя −5, клэмп', () => {
  let f = { strength: 50, cleanRun: 0 };
  for (let i = 0; i < 6; i++) f = facetDay(f, false, false);
  expect(f).toEqual({ strength: 38, cleanRun: 6 });
  f = facetDay(f, true, false); expect(f).toEqual({ strength: 46, cleanRun: 0 });
  for (let i = 0; i < 7; i++) f = facetDay(f, false, false);
  expect(f.strength).toBe(27);
  expect(facetDay({ strength: 98, cleanRun: 3 }, true, false).strength).toBe(100);
  expect(facetDay({ strength: 50, cleanRun: 0 }, false, true)).toEqual({ strength: 47, cleanRun: 1 });
});
test('изгнание: сила 0 и 30 чистых дней', () => {
  let f = { strength: 30, cleanRun: 0 };
  for (let i = 0; i < 13; i++) f = facetDay(f, false, false);
  expect(f.strength).toBe(0);
  for (let i = 13; i < 29; i++) f = facetDay(f, false, false);
  expect(banished(f)).toBe(false);
  expect(banished(facetDay(f, false, false))).toBe(true);
});
test('битва [S§7]', () => {
  expect(battleOutcome(27)).toEqual({ result: 'crush', xp: 400, trophy: 'rare', plan: false });
  expect([30, 49].map(s => battleOutcome(s)!.xp)).toEqual([250, 250]);
  expect(battleOutcome(50)).toEqual({ result: 'draw', xp: 50, trophy: null, plan: true });
  expect(battleOutcome(69)!.result).toBe('draw');
  expect(battleOutcome(70)).toEqual({ result: 'lost', xp: 0, trophy: null, plan: false });
  expect(battleOutcome(null)).toBeNull();
  expect(['2026-11', '2026-12', '2027-01', '2027-02'].map(lastSunday)).toEqual(['2026-11-29', '2026-12-27', '2027-01-31', '2027-02-28']);
});
test('старт из анкеты, безопасность, предложения', () => {
  expect(facetStart('smoke', { smoking: 'Регулярно' })).toBe(80);
  expect(facetStart('alcohol', { alcohol: 'Пару раз в месяц' })).toBe(30);
  expect(facetStart('games', { games_hours: 3 })).toBe(65);
  expect(facetStart('social', { screen_hours: 1 })).toBe(30);
  expect(facetStart('procr', null)).toBe(50);
  expect(facetStart('custom', null, 'daily')).toBe(80);
  expect(isSerious('Ставки на спорт', 'custom', null)).toBe(true);
  expect(isSerious('Сладкое', 'custom', null)).toBe(false);
  expect(isSerious('Пиво', 'alcohol', { alcohol: 'Несколько раз в неделю' })).toBe(true);
  expect(isSerious('Пиво', 'alcohol', { alcohol: 'Пару раз в месяц' })).toBe(false);
  const p = { badHabits: ['social', 'smoke'] } as unknown as Profile;
  expect(facetSuggestions(p, { smoking: 'Иногда', alcohol: 'Несколько раз в неделю', screen_hours: 5 }))
    .toEqual([{ kind: 'social', name: 'Соцсети', start: 65 }, { kind: 'smoke', name: 'Курение', start: 50 }]);
});
test('suggestions: свои строки, серьёзные и дубли отбрасываются; не бросает', () => {
  const p = { badHabits: ['social', 'social', 'Сладкое', 'Казино', 'Сладкое', 7] } as unknown as Profile;
  expect(facetSuggestions(p, null).map(s => s.name)).toEqual(['Соцсети', 'Сладкое']);
  expect(facetSuggestions(null, null)).toEqual([]);
  expect(masterPlan([], false)).toBe('');
  expect(masterPlan([{ name: 'А', strength: 40 }, { name: 'Б', strength: 60 }], false)).toContain('Б');
});
