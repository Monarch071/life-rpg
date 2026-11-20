import { BALANCE as B } from './balance';
import { streakBonus } from './progression';
import { SKILL_CATALOG, type SkillId } from './skillCatalog';
import type { AbilityId, AdvancedId, ClassId, Stat, Verify } from './types';

export type { AbilityId, ClassId };
const C = B.classes;
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const STAT_ORDER: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];

/** Таблица классов по парам характеристик [S§5]; fin = WLT. Покрывает все 21 пару. */
export const CLASS_PAIRS: Record<Exclude<ClassId, 'wanderer'>, [Stat, Stat][]> = {
  warrior: [['str', 'end'], ['str', 'int']],
  paladin: [['str', 'dis'], ['str', 'cha'], ['dis', 'cha']],
  ranger: [['end', 'dis'], ['end', 'spi'], ['str', 'spi']],
  sage: [['int', 'spi'], ['end', 'int'], ['dis', 'spi']],
  strategist: [['int', 'fin'], ['int', 'dis'], ['dis', 'fin']],
  merchant: [['cha', 'fin'], ['end', 'fin'], ['str', 'fin'], ['fin', 'spi']],
  bard: [['cha', 'spi'], ['int', 'cha'], ['end', 'cha']],
};

export const CLASSES: Record<ClassId, { name: string; passive: string; ability: AbilityId; abilityName: string; abilityDesc: string; target: 'quest' | 'day' | 'week' }> = {
  warrior: { name: 'Воин', passive: '+10% XP за тренировки', ability: 'rush', abilityName: 'Рывок', abilityDesc: 'Задание-тренировка дня даёт ×2 XP', target: 'quest' },
  paladin: { name: 'Паладин', passive: 'Серия даёт +3% в день вместо +2%', ability: 'shield', abilityName: 'Щит', abilityDesc: 'День не уменьшает серию', target: 'day' },
  ranger: { name: 'Следопыт', passive: '+10% XP за задания с автопроверкой', ability: 'march', abilityName: 'Марш', abilityDesc: 'Цели по шагам на сегодня ×0,8, награда прежняя', target: 'day' },
  sage: { name: 'Мудрец', passive: '+10% XP за чтение и рефлексию', ability: 'insight', abilityName: 'Прозрение', abilityDesc: 'Бесплатная замена задания на выбор из 3', target: 'quest' },
  strategist: { name: 'Стратег', passive: '+10% XP за финансовые и учебные задания', ability: 'plan', abilityName: 'План', abilityDesc: 'Невыполненные недельные задания заменяются на выбранный фокус', target: 'week' },
  merchant: { name: 'Торговец', passive: '+10% золота', ability: 'deal', abilityName: 'Сделка', abilityDesc: '3 бесплатных переброса сегодня', target: 'day' },
  bard: { name: 'Бард', passive: '+15% XP за социальные задания', ability: 'inspire', abilityName: 'Вдохновение', abilityDesc: '+20% к бонусам всех заданий дня', target: 'day' },
  wanderer: { name: 'Странник', passive: '+5% ко всему XP', ability: 'universal', abilityName: 'Универсал', abilityDesc: 'Задание переходит в выбранную характеристику', target: 'quest' },
};

/** Название класса по Основе без Формы (первый класс, до накопления данных). */
export const classNameOf = (base: Record<Stat, number>): string =>
  CLASSES[pickClass(classWeights(base, Object.fromEntries(STAT_ORDER.map(s => [s, null])) as Record<Stat, null>), null).id].name;

/** «Тренировка» для пассива Воина и «Рывка». */
export const TRAINING: readonly SkillId[] = ['strength', 'mobility', 'sports', 'cardio'];

type Forms = Record<Stat, number | null>;

/** Вес характеристики: Основа × (0,5 + 0,5 × Форма); Форма null = 1. */
export const classWeights = (base: Record<Stat, number>, forms: Forms): Record<Stat, number> =>
  Object.fromEntries(STAT_ORDER.map(s => [s, r9(base[s] * (0.5 + 0.5 * (forms[s] ?? 1)))])) as Record<Stat, number>;

export function classOfPair(a: Stat, b: Stat): Exclude<ClassId, 'wanderer'> {
  const hit = (Object.keys(CLASS_PAIRS) as (keyof typeof CLASS_PAIRS)[]).find(c => CLASS_PAIRS[c].some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
  return hit ?? 'warrior';   // недостижимо: таблица покрывает все пары
}

export function pickClass(w: Record<Stat, number>, cur: { id: ClassId } | null): { id: ClassId; pair: [Stat, Stat] | null } {
  const v = STAT_ORDER.map(s => w[s]);
  const mean = v.reduce((a, b) => a + b, 0) / v.length, spread = Math.max(...v) - Math.min(...v);
  const k = !cur ? 1 : cur.id === 'wanderer' ? 1 + C.hysteresis : 1 - C.hysteresis;   // гистерезис порога Странника
  if (r9(spread) <= r9(C.wandererSpread * k * mean)) return { id: 'wanderer', pair: null };
  const [a, b] = [...STAT_ORDER].sort((x, y) => w[y] - w[x]);   // sort стабилен: ничья — порядок STATS
  const top = classOfPair(a, b);
  if (!cur || cur.id === 'wanderer' || cur.id === top) return { id: top, pair: [a, b] };
  const strength = ([x, y]: [Stat, Stat]) => r9(w[x] + w[y]);
  const best = CLASS_PAIRS[cur.id].reduce((p, q) => (strength(q) > strength(p) ? q : p));
  return r9(strength([a, b])) >= r9((1 + C.hysteresis) * strength(best)) ? { id: top, pair: [a, b] } : { id: cur.id, pair: [...best] as [Stat, Stat] };
}

/** Сила пассива по средней Форме пары (Странник — всех 7). */
export function passivePower(c: { id: ClassId; pair: [Stat, Stat] | null }, forms: Forms): 0 | 0.5 | 1 {
  const st = c.id === 'wanderer' || !c.pair ? STAT_ORDER : c.pair;
  const f = r9(st.reduce((a, s) => a + (forms[s] ?? 1), 0) / st.length);
  return f >= C.passiveFull ? 1 : f >= C.passiveHalf ? 0.5 : 0;
}

export function questBonuses(i: { skills: readonly SkillId[]; stat: Stat; verify: Verify; streak: number; theme: boolean; weakest: boolean;
  cls: { id: ClassId; power: 0 | 0.5 | 1; adv?: AdvancedId | null } | null; perk: { xp: number; gold: number }; rust: boolean; inspire: boolean }): { bonuses: number[]; goldBonus: number } {
  const main = i.skills[0], pw = i.cls?.power ?? 0, id = i.cls?.id, P = C.passive, A = B.advanced;
  const m = i.cls?.adv ? A.passiveMult : 1;   // продвинутый: пассив базового ×2 (спека §8.2)
  const team = SKILL_CATALOG.find(s => s.id === main)?.stat === 'team';
  const classXp =
    id === 'warrior' ? (TRAINING.includes(main) ? P.warrior : 0)
    : id === 'sage' ? (main === 'reading' || main === 'reflection' ? P.sage : 0)
    : id === 'strategist' ? (i.stat === 'fin' || i.stat === 'int' ? P.strategist : 0)
    : id === 'bard' ? (i.stat === 'cha' || team ? P.bard : 0)
    : id === 'ranger' ? (i.verify === 'auto' ? P.ranger : 0)
    : id === 'wanderer' ? P.wanderer : 0;
  // Крестоносец — своя серия: до perDay в день и потолок cap (по силе пассива)
  const crusader = id === 'paladin' && i.cls?.adv === 'crusader';
  const perDay = crusader ? B.bonus.streakPerDay + (A.crusader.perDay - B.bonus.streakPerDay) * pw : B.bonus.streakPerDay + (id === 'paladin' ? P.paladinStreak * pw * m : 0);
  const streakB = crusader ? Math.min(r9(B.bonus.streakMax + (A.crusader.cap - B.bonus.streakMax) * pw), r9(perDay * i.streak)) : streakBonus(i.streak, r9(perDay));
  const bonuses = [streakB, i.theme ? B.bonus.theme : 0, i.weakest ? B.bonus.weakest : 0,
    r9(classXp * pw * m), i.perk.xp, i.rust ? B.rust.bonus : 0, i.inspire ? C.inspire : 0];
  return { bonuses, goldBonus: r9(i.perk.gold + (id === 'merchant' ? P.merchantGold * pw * m : 0)) };
}
