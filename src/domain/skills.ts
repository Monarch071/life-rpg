import { STATS } from './stats';
import type { Stat } from './types';

export interface SkillNode { id: string; stat: Stat; title: string; desc: string; cost: number; requires: string | null }
export interface SkillEffects { xpBonus: Record<Stat, number>; coinBonus: number; streakFreeze: boolean; calmShadow: boolean }

const STAT_KEYS = Object.keys(STATS) as Stat[];

export const SKILLS: SkillNode[] = [
  ...STAT_KEYS.flatMap((stat): SkillNode[] => [
    { id: `${stat}1`, stat, title: `${STATS[stat].name} I`, desc: `+10% XP за задания: ${STATS[stat].name}`, cost: 1, requires: null },
    { id: `${stat}2`, stat, title: `${STATS[stat].name} II`, desc: `ещё +15% XP за задания: ${STATS[stat].name}`, cost: 2, requires: `${stat}1` },
  ]),
  { id: 'freeze', stat: 'dis', title: 'Заморозка серии', desc: 'Раз в календарную неделю день без заданий не обнуляет серию', cost: 3, requires: 'dis1' },
  { id: 'coins', stat: 'fin', title: 'Монеты +25%', desc: 'Монеты за задания +25%', cost: 3, requires: 'fin1' },
  { id: 'calm', stat: 'spi', title: 'Спокойствие', desc: 'Штраф Тени за невыполненные задания 25% вместо 50%', cost: 3, requires: 'spi1' },
];

export function skillEffects(unlocked: string[]): SkillEffects {
  const has = (id: string) => unlocked.includes(id);
  const xpBonus = {} as Record<Stat, number>;
  // целые проценты, чтобы сумма не плавала (10 + 15 = 25 → 0.25)
  for (const s of STAT_KEYS) xpBonus[s] = ((has(`${s}1`) ? 10 : 0) + (has(`${s}2`) ? 15 : 0)) / 100;
  return { xpBonus, coinBonus: has('coins') ? 0.25 : 0, streakFreeze: has('freeze'), calmShadow: has('calm') };
}
