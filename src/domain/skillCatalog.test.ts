import { expect, test } from 'vitest';
import { isSkillId, SKILL_CATALOG, splitXp, primaryStat, skillStatShares } from './skillCatalog';
import { STATS } from './stats';
import type { Stat } from './types';

const STAT_KEYS = Object.keys(STATS) as Stat[];

test('24 навыка: по 3 на характеристику + 3 рабочих, без Наставничества', () => {
  expect(SKILL_CATALOG).toHaveLength(24);
  for (const s of STAT_KEYS) expect(SKILL_CATALOG.filter(k => k.stat === s)).toHaveLength(3);
  expect(SKILL_CATALOG.filter(k => k.stat === 'team').map(k => k.id)).toEqual(['leadership', 'delegation', 'teamwork']);
  expect(isSkillId('mentoring')).toBe(false); expect(isSkillId(['reading'])).toBe(false);
});
test('доли XP [S§1]', () => {
  expect(splitXp(92, ['strength'])).toEqual({ skills: [['strength', 92]], stats: { str: 92 } });
  expect(splitXp(100, ['strength', 'cardio'])).toEqual({ skills: [['strength', 60], ['cardio', 40]], stats: { str: 60, end: 40 } });
  expect(splitXp(49, ['reading', 'tech'])).toEqual({ skills: [['reading', 29], ['tech', 20]], stats: { int: 49 } });
  expect(splitXp(51, ['leadership']).stats).toEqual({ cha: 26, dis: 25 });
  expect(splitXp(100, ['reading', 'teamwork']).stats).toEqual({ int: 60, cha: 20, dis: 20 });
});
test('главная характеристика и доли', () => {
  expect(primaryStat(['teamwork'])).toBe('cha');
  expect(primaryStat(['cardio', 'sleep'])).toBe('end');
  expect(skillStatShares('delegation')).toEqual({ cha: 0.5, dis: 0.5 });
});
