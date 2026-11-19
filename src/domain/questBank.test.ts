import { expect, test } from 'vitest';
import { DEFAULT_SKILL_BY_STAT, legacyRank, LEGACY_SKILL_BY_TEMPLATE, paramFor, QUEST_TEMPLATES } from './questBank';
import { isSkillId, SKILL_CATALOG } from './skillCatalog';

test('банк: каждый шаблон с валидными навыками, каждый навык покрыт', () => {
  for (const t of QUEST_TEMPLATES) { expect(t.skills.length).toBeGreaterThan(0); expect(t.skills.every(isSkillId)).toBe(true); }
  const used = new Set(QUEST_TEMPLATES.flatMap(t => t.skills));
  expect(SKILL_CATALOG.filter(s => !used.has(s.id))).toEqual([]);
  expect(QUEST_TEMPLATES.find(t => t.id === 'sleep')!.auto!(1)).toEqual({ metric: 'sleepHours', op: '>=', value: 7.5 });
  expect(QUEST_TEMPLATES.find(t => t.id === 'workout')!.auto!(30)).toEqual({ metric: 'strengthMin', op: '>=', value: 30 });
});
test('авто-метрики банка: зал, чтение, без соцсетей', () => {
  const t = (id: string) => QUEST_TEMPLATES.find(x => x.id === id)!;
  expect(t('gym').auto!(1)).toEqual({ metric: 'gymVisits', op: '>=', value: 1 });
  expect(t('gym').skills).toEqual(['strength']);
  expect(t('read').auto!(paramFor(t('read'), 'E', 1))).toEqual({ metric: 'readMin', op: '>=', value: 23 });
  expect(t('no_social').auto!(1)).toEqual({ metric: 'socialMin', op: '<=', value: 5 });
});
test('легаси-карты покрывают все старые templateId', () => {
  for (const id of ['pushups','steps','read','words','plan','focus','compliments','expenses','save','meditate','no_games','no_custom','ai'])
    expect(isSkillId(LEGACY_SKILL_BY_TEMPLATE[id] ?? DEFAULT_SKILL_BY_STAT.str)).toBe(true);
  expect([1, 2, 3, 4, 5, 0, 'x', undefined].map(legacyRank)).toEqual(['E', 'E', 'D', 'C', 'B', 'E', 'E', 'E']);
  expect(['constructor', '__proto__', 'toString', 'hasOwnProperty'].map(legacyRank)).toEqual(['E', 'E', 'E', 'E']);
});
test('параметр по рангу', () => {
  const steps = QUEST_TEMPLATES.find(t => t.id === 'steps')!;
  expect(paramFor(steps, 'C', 1)).toBe(Math.round(steps.base * 1.5));
  const read = QUEST_TEMPLATES.find(t => t.id === 'read')!;
  expect(paramFor(read, 'D', 1)).toBe(read.base * 2);
});
