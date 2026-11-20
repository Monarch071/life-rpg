import { expect, test } from 'vitest';
import { ADVANCED, advancedBonuses, pathsOf, pledgeReward, trialOpen, trialStep, type AdvancedId } from './advanced';
import type { ClassId } from './types';

test('каталог: 15 классов, по 2 пути у базовых, 1 у Странника, соло-способности [P§3]', () => {
  expect(Object.keys(ADVANCED)).toHaveLength(15);
  for (const b of ['warrior', 'paladin', 'sage', 'strategist', 'merchant', 'bard', 'ranger'] as ClassId[]) expect(pathsOf(b)).toHaveLength(2);
  expect(pathsOf('wanderer')).toEqual(['harmony']);
  expect(ADVANCED.keeper).toMatchObject({ ability: 'wall', mech: 'guard', days: 3 });
  expect(ADVANCED.leader).toMatchObject({ ability: 'gather', mech: 'quest_mult', k: 2 });
  expect(ADVANCED.diplomat).toMatchObject({ ability: 'alliance', mech: 'quest_mult', k: 2 });
  expect(ADVANCED.treasurer.mech).toBe('day_mult');   // «Аудит» без ИИ
});
test('доступ: уровень 20, 15-й день, 7 дней после провала, только свой путь', () => {
  const i = { level: 20, date: '2027-01-15', firstDay: '2027-01-01', lastFail: null, active: false, base: 'warrior' as ClassId, classId: 'champion' as AdvancedId };
  expect(trialOpen(i)).toBe(true);
  expect(trialOpen({ ...i, level: 19 })).toBe(false);
  expect(trialOpen({ ...i, date: '2027-01-14' })).toBe(false);
  expect(trialOpen({ ...i, lastFail: '2027-01-09' })).toBe(false); expect(trialOpen({ ...i, lastFail: '2027-01-08' })).toBe(true);
  expect(trialOpen({ ...i, classId: 'hermit' })).toBe(false); expect(trialOpen({ ...i, active: true })).toBe(false);
});
test('испытание: 10 засчитанных из 14 и 8 заданий фокуса; отдых продлевает окно', () => {
  let t = { day: 0, counted: 0, focusDone: 0 }, r: ReturnType<typeof trialStep> | null = null;
  for (let i = 0; i < 14; i++) { r = trialStep(t, { frozen: i === 3, counted: i < 11, focusDone: 1 }); t = r; }
  expect(r).toMatchObject({ day: 13, result: null });
  r = trialStep(t, { frozen: false, counted: true, focusDone: 0 });
  expect(r).toMatchObject({ day: 14, counted: 11, focusDone: 13, result: 'pass' });
  expect(trialStep({ day: 13, counted: 9, focusDone: 20 }, { frozen: false, counted: false, focusDone: 0 }).result).toBe('fail');
  expect(trialStep({ day: 13, counted: 12, focusDone: 7 }, { frozen: false, counted: true, focusDone: 0 }).result).toBe('fail');
});
test('доп. пассивы и Магнат', () => {
  expect(advancedBonuses('diplomat', { skills: ['social'], stat: 'cha', verify: 'honest' }, 1)).toEqual({ xp: 0.2, gold: 0, mult: 1 });
  expect(advancedBonuses('treasurer', { skills: ['reading'], stat: 'int', verify: 'auto' }, 0.5)).toEqual({ xp: 0, gold: 0.075, mult: 1 });
  expect(advancedBonuses('magnate', { skills: ['earning'], stat: 'fin', verify: 'photo' }, 1).mult).toBe(2.5);
  expect(advancedBonuses('magnate', { skills: ['earning'], stat: 'fin', verify: 'honest' }, 1).mult).toBe(1);
  expect(pledgeReward(70, 7, 2)).toBe(490); expect(pledgeReward(70, 3, 3)).toBe(420);
});
test('доп. пассив без силы — ноль; невалидный id не бросает', () => {
  expect(advancedBonuses('harmony', { skills: ['reading'], stat: 'int', verify: 'auto' }, 0)).toEqual({ xp: 0, gold: 0, mult: 1 });
  expect(advancedBonuses('nope' as AdvancedId, { skills: ['reading'], stat: 'int', verify: 'auto' }, 1)).toEqual({ xp: 0, gold: 0, mult: 1 });
  expect(trialOpen({ level: 30, date: '2027-01-15', firstDay: null, lastFail: null, active: false, base: 'warrior', classId: 'champion' })).toBe(false);
});
