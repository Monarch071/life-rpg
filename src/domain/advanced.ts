// Продвинутые классы (спека §8): каталог (соло), доступ и испытание, доп. пассивы. Чистые функции без журнала.
import { BALANCE } from './balance';
import { TRAINING } from './classes';
import { addDays } from './day';
import { SKILL_CATALOG, type SkillId } from './skillCatalog';
import type { AbilityId2, AdvancedId, ClassId, ISODate, Stat, Verify } from './types';

export type { AbilityId2, AdvancedId };
/** Закрытый словарь механик второй способности (спека §8.3). */
export type Mech = 'quest_mult' | 'day_mult' | 'guard' | 'pledge' | 'invest' | 'chain' | 'card';
export interface AdvancedDef { name: string; from: ClassId; focus: readonly SkillId[] | 'all'; passive: string; ability: AbilityId2;
  abilityName: string; abilityDesc: string; mech: Mech; k: number; days: number }

const A = BALANCE.advanced, M = A.mult, r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const ofStat = (st: Stat | 'team') => SKILL_CATALOG.filter(s => s.stat === st).map(s => s.id);
export const INT_SKILLS = ofStat('int');
const TEAM = ofStat('team');

// тексты и фокусы — на ревью владельца
export const ADVANCED: Record<AdvancedId, AdvancedDef> = {
  champion:    { name: 'Чемпион', from: 'warrior', focus: TRAINING, passive: 'Рекорд зала славы — ещё +100 XP', ability: 'record', abilityName: 'Рекорд',
                 abilityDesc: 'Задание-тренировка дня ×3', mech: 'quest_mult', k: M.record, days: 1 },
  guard:       { name: 'Страж', from: 'warrior', focus: ['sleep', 'cardio'], passive: 'HP +10 (не выше 100)', ability: 'bastion', abilityName: 'Бастион',
                 abilityDesc: '7 дней короткая ночь не добавляет Усталость', mech: 'guard', k: 1, days: A.guard.bastion },
  crusader:    { name: 'Крестоносец', from: 'paladin', focus: ['routine', 'habits'], passive: 'Серия +3% в день, потолок бонуса серии +60%', ability: 'vow', abilityName: 'Обет',
                 abilityDesc: '7 дней подряд задание выбранного навыка — бонус ×2', mech: 'pledge', k: A.pledge.vow.k, days: A.pledge.vow.days },
  keeper:      { name: 'Хранитель', from: 'paladin', focus: ['routine'], passive: '+1 заморозка серии в месяц', ability: 'wall', abilityName: 'Стена',
                 abilityDesc: '3 дня серия и лестницы не падают', mech: 'guard', k: 1, days: A.guard.wall },
  archmage:    { name: 'Архимаг', from: 'sage', focus: INT_SKILLS, passive: 'Навыки Интеллекта качаются на 15% быстрее', ability: 'explore', abilityName: 'Исследование',
                 abilityDesc: 'Цепочка, начатая сегодня, — финал ×2', mech: 'chain', k: M.chain, days: 1 },
  hermit:      { name: 'Отшельник', from: 'sage', focus: ['mindfulness', 'reflection'], passive: 'Усталость спадает вдвое быстрее', ability: 'silence', abilityName: 'Тишина',
                 abilityDesc: 'День без соцсетей и игр — XP заданий дня ×2', mech: 'day_mult', k: M.silence, days: 1 },
  architect:   { name: 'Архитектор', from: 'strategist', focus: ['budget', 'savings', 'earning', ...INT_SKILLS], passive: 'Финал цепочки +20%', ability: 'blueprint', abilityName: 'Чертёж',
                 abilityDesc: 'Цепочка по своей цели, начатая сегодня, — финал ×2', mech: 'chain', k: M.chain, days: 1 },
  treasurer:   { name: 'Казначей', from: 'strategist', focus: ['budget', 'savings'], passive: '+15% золота', ability: 'audit', abilityName: 'Аудит',
                 abilityDesc: 'Разбор трат на устройстве; задания Финансов дня ×2', mech: 'day_mult', k: M.audit, days: 1 },
  magnate:     { name: 'Магнат', from: 'merchant', focus: ['earning'], passive: 'Задания Заработка ×2,5 (авто или фото)', ability: 'invest', abilityName: 'Инвестиция',
                 abilityDesc: 'Вложить 300 золота — через 7 дней 450 при доле недели от 70%', mech: 'invest', k: A.invest.payout / A.invest.stake, days: A.invest.days },
  diplomat:    { name: 'Дипломат', from: 'merchant', focus: ['social', 'negotiation'], passive: '+20% XP заданиям Общения', ability: 'alliance', abilityName: 'Союз',
                 abilityDesc: 'Задание на новое полезное знакомство ×2', mech: 'quest_mult', k: M.alliance, days: 1 },
  leader:      { name: 'Лидер', from: 'bard', focus: TEAM, passive: '+10% XP рабочим навыкам', ability: 'gather', abilityName: 'Сбор',
                 abilityDesc: 'Задание организовать встречу друзей ×2', mech: 'quest_mult', k: M.gather, days: 1 },
  storyteller: { name: 'Рассказчик', from: 'bard', focus: ['speaking'], passive: '+25% XP заданиям Выступлений', ability: 'saga', abilityName: 'Сага',
                 abilityDesc: 'Карточка-история недели 9:16, без XP', mech: 'card', k: 1, days: 1 },
  rover:       { name: 'Рейнджер', from: 'ranger', focus: ['cardio'], passive: '+15% XP Кардио', ability: 'expedition', abilityName: 'Экспедиция',
                 abilityDesc: 'В выходной задания Кардио дня ×2', mech: 'day_mult', k: M.expedition, days: 1 },
  ascetic:     { name: 'Аскет', from: 'ranger', focus: ['habits'], passive: 'Тень слабеет вдвое быстрее', ability: 'fast', abilityName: 'Пост',
                 abilityDesc: '3 дня без срыва выбранной грани — бонус ×3', mech: 'pledge', k: A.pledge.fast.k, days: A.pledge.fast.days },
  harmony:     { name: 'Аватар гармонии', from: 'wanderer', focus: 'all', passive: '+10% ко всему XP', ability: 'balance', abilityName: 'Равновесие',
                 abilityDesc: 'Задания всех 7 характеристик за день — XP дня ×2', mech: 'day_mult', k: M.balance, days: 1 },
};
export const ADVANCED_IDS = Object.keys(ADVANCED) as AdvancedId[];
export const ABILITY2_IDS: readonly string[] = ADVANCED_IDS.map(id => ADVANCED[id].ability);
export const isAdvancedId = (x: unknown): x is AdvancedId => typeof x === 'string' && Object.hasOwn(ADVANCED, x);

export const pathsOf = (base: ClassId): AdvancedId[] => ADVANCED_IDS.filter(id => ADVANCED[id].from === base);
export const inFocus = (id: AdvancedId, skill: SkillId): boolean => { const f = ADVANCED[id].focus; return f === 'all' || f.includes(skill); };

/** Испытание можно начать: уровень на начало дня ≥ 20, ≥ 14 дней от первого дня, 7 дней после провала, путь своего базового, нет активного. */
export function trialOpen(i: { level: number; date: ISODate; firstDay: ISODate | null; lastFail: ISODate | null; active: boolean; base: ClassId; classId: AdvancedId }): boolean {
  return !i.active && i.level >= A.level && !!i.firstDay && i.date >= addDays(i.firstDay, A.delayDays) && i.date >= BALANCE.rivalSince
    && (!i.lastFail || i.date >= addDays(i.lastFail, A.retryDays)) && isAdvancedId(i.classId) && ADVANCED[i.classId].from === i.base;
}

/** День испытания; замороженный день не считается (окно продлевается). Итог — на 14-м незамороженном дне. */
export function trialStep(t: { day: number; counted: number; focusDone: number }, d: { frozen: boolean; counted: boolean; focusDone: number }):
  { day: number; counted: number; focusDone: number; result: 'pass' | 'fail' | null } {
  if (d.frozen) return { ...t, result: null };
  const n = { day: t.day + 1, counted: t.counted + (d.counted ? 1 : 0), focusDone: t.focusDone + d.focusDone };
  return { ...n, result: n.day < A.trialDays ? null : n.counted >= A.passDays && n.focusDone >= A.passQuests ? 'pass' : 'fail' };
}

/** Доп. пассив продвинутого к заданию: xp — в бонусы, gold — к бонусу золота, mult — множитель вне потолка. Сила — по форме пары базового. */
export function advancedBonuses(id: AdvancedId, q: { skills: readonly SkillId[]; stat: Stat; verify: Verify }, power: 0 | 0.5 | 1): { xp: number; gold: number; mult: number } {
  const main = q.skills[0];
  const xp = id === 'diplomat' ? (main === 'social' ? A.diplomat : 0) : id === 'leader' ? (TEAM.includes(main) ? A.leader : 0)
    : id === 'storyteller' ? (main === 'speaking' ? A.storyteller : 0) : id === 'rover' ? (main === 'cardio' ? A.rangerCardio : 0)
    : id === 'harmony' ? A.harmony : 0;
  const mult = id === 'magnate' && main === 'earning' && q.verify !== 'honest' ? 1 + (A.magnateMult - 1) * power : 1;
  return { xp: r9(xp * power), gold: r9((id === 'treasurer' ? A.treasurerGold : 0) * power), mult: r9(mult) };
}

/** Награда обета/поста: база ранга-потолка навыка × дни × (k − 1). */
export const pledgeReward = (rankBase: number, days: number, k: number): number => Math.round(rankBase * days * (k - 1));
