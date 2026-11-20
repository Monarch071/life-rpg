import { expect, test } from 'vitest';
import { flatPerks, isRusty, mainSkillPerks, perkPower, PERKS, skillForm } from './perks';
import { SKILL_IDS, type SkillId } from './skillCatalog';
import { questReward, streakBonus } from './progression';
import { facetDay } from './shadow';
import { fatigueNext } from './vitals';
import { nextStreak } from './streak';

test('каталог: 24 навыка × 3 уровня, особые перки [S§3, S§6, S§7]', () => {
  expect(PERKS).toHaveLength(72);
  const p = (s: SkillId, l: number) => PERKS.find(x => x.skill === s && x.level === l)!;
  expect(p('strength', 3).effect).toEqual({ kind: 'xp', pct: 0.1 });
  expect(p('habits', 3)).toMatchObject({ kind: 'flat', effect: { kind: 'relapse', value: 5 } });
  expect(p('routine', 10)).toMatchObject({ kind: 'flat', effect: { kind: 'streakMiss', factor: 0.75 } });
  expect(['mobility', 'sleep', 'mindfulness'].map(s => p(s as SkillId, 6).effect)).toEqual(Array(3).fill({ kind: 'fatigueDecay', points: 3 }));
  expect(p('savings', 6).effect).toEqual({ kind: 'gold', pct: 0.1 });
});
test('сила перка по форме [S§4]: pct 80%+/40–79%/ниже; flat 40%+; ржавчина выключает', () => {
  const pct = PERKS.find(x => x.id === 'strength:3')!, flat = PERKS.find(x => x.id === 'habits:3')!;
  expect([0.8, 0.79, 0.4, 0.39].map(f => perkPower(pct, f, false))).toEqual([1, 0.5, 0.5, 0]);
  expect([0.4, 0.39].map(f => perkPower(flat, f, false))).toEqual([1, 0]);
  expect(perkPower(pct, 1, true)).toBe(0);
  expect(mainSkillPerks('strength', 6, 0.85, false)).toEqual({ xp: 0.2, gold: 0 });
  expect(mainSkillPerks('strength', 6, 0.5, false)).toEqual({ xp: 0.1, gold: 0 });
  expect(mainSkillPerks('strength', 2, 1, false)).toEqual({ xp: 0, gold: 0 });
  expect(skillForm('leadership', { str: null, end: null, int: null, dis: 0.6, cha: 1, fin: null, spi: null })).toBe(0.8);
});
test('постоянные перки суммируются', () => {
  const lv = (o: Partial<Record<SkillId, number>>) => Object.fromEntries(SKILL_IDS.map(id => [id, { level: o[id] ?? 1, rusty: false }])) as any;
  const F = { str: 1, end: 1, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 };
  expect(flatPerks(lv({ mobility: 6, sleep: 7, mindfulness: 10, habits: 3, routine: 10 }), F)).toEqual({ relapse: 5, streakMiss: 0.75, fatigueDecay: 9 });
  expect(flatPerks(lv({}), F)).toEqual({ relapse: 8, streakMiss: 0.5, fatigueDecay: 0 });
});
test('ржавчина [S§4]: с 30 дней простоя; никогда не качался — нет', () => {
  expect(isRusty(29)).toBe(false); expect(isRusty(30)).toBe(true); expect(isRusty(null)).toBe(false);
});
test('хуки: золото с бонусом, серия Паладина, срыв 5, спад усталости, Режим 10', () => {
  expect(questReward({ rank: 'C', verify: 'auto', bonuses: [], penalties: [], goldBonus: 0.1 })).toMatchObject({ xp: 70, gold: 15 });
  expect(streakBonus(10, 0.03)).toBe(0.3); expect(streakBonus(30, 0.03)).toBe(0.5);
  expect(facetDay({ strength: 50, cleanRun: 3 }, true, false, 5).strength).toBe(55);
  expect(fatigueNext(20, null, null, 3)).toBe(12);
  expect(nextStreak(8, { counted: false, perfect: false, neutral: false }, false, 0.75)).toBe(6);
});
