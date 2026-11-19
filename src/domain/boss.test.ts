import { expect, test } from 'vitest';
import { bossOptionsByRules, chainByRules, partHp, partWindows, validBossDraft, validChainSteps } from './boss';

test('HP части: 80 за шаги, 4 за удар, не больше 5', () => {
  expect(partHp(0, 3, 0)).toBe(100); expect(partHp(1, 3, 2)).toBe(65); expect(partHp(3, 3, 0)).toBe(20);
  expect(partHp(3, 3, 5)).toBe(0); expect(partHp(0, 3, 9)).toBe(80);
});
test('части = месяцы сезона', () => {
  expect(partWindows('2026-12-01', '2027-02-28')).toEqual([
    { start: '2026-12-01', end: '2026-12-31' }, { start: '2027-01-01', end: '2027-01-31' }, { start: '2027-02-01', end: '2027-02-28' }]);
});
test('варианты босса правилами: цели → легаси → цель года → тема, без дублей', () => {
  const o = bossOptionsByRules({ goals: [{ text: 'Прочитать 3 книги', stat: 'int' }, { text: 'Прочитать 3 книги', stat: 'int' }],
    legacy: [{ title: 'Пробежать 10 км', stat: 'end' }], yearGoal: 'Выучить основы языка', theme: 'mind_spirit' });
  expect(o.map(x => x.title)).toEqual(['Прочитать 3 книги', 'Пробежать 10 км', 'Выучить основы языка']);
  expect(o.map(x => x.skill)).toEqual(['reading', 'cardio', 'reading']);
  expect(o.every(x => x.parts.length === 3 && x.parts.every(p => p.steps.length === 3))).toBe(true);
  expect(bossOptionsByRules({ goals: [], legacy: [], yearGoal: null, theme: 'body' })).toHaveLength(3);
});
test('валидация черновиков', () => {
  const ok = bossOptionsByRules({ goals: [], legacy: [], yearGoal: null, theme: 'body' })[0];
  expect(validBossDraft(ok)).toEqual(ok);
  expect(validBossDraft({ ...ok, parts: ok.parts.slice(0, 2) })).toBeNull();
  expect(validBossDraft({ ...ok, skill: 'flying' })).toBeNull();
  expect(validBossDraft({ ...ok, parts: [{ title: 'a', steps: ['x'.repeat(81), 'y'] }, ok.parts[1], ok.parts[2]] })).toBeNull();
  expect(chainByRules('Запустить хобби-проект')).toHaveLength(4);
  expect(validChainSteps(['a', 'b'])).toBeNull(); expect(validChainSteps(Array(7).fill('шаг'))).toBeNull();
  expect(validChainSteps(chainByRules('x'))).toHaveLength(4);
});
test('мусор на входе не бросает', () => {
  for (const x of [null, undefined, 5, 'a', [], {}, { parts: 'x' }]) { expect(validBossDraft(x)).toBeNull(); expect(validChainSteps(x)).toBeNull(); }
  expect(partWindows('мусор', '')).toEqual([]);
  expect(bossOptionsByRules({ goals: null, legacy: undefined, yearGoal: 5, theme: null } as never)).toHaveLength(3);
});
