import { STATS } from './stats';
import type { Stat, WeeklyCtx, WeeklyQuest } from './types';

export type { WeeklyCtx };
const ORDER = Object.keys(STATS) as Stat[];

/** Самая слабая характеристика; ничья — по порядку STATS. */
export const weakestStat = (stats: Record<Stat, number>): Stat => ORDER.reduce((a, s) => (stats[s] < stats[a] ? s : a));

/** Ровно 3 недельных задания; без случайности. */
export function generateWeeklyQuests(c: WeeklyCtx): WeeklyQuest[] {
  const mk = (kind: WeeklyQuest['kind'], stat: Stat | null, target: number, title: string): WeeklyQuest =>
    ({ id: `${c.weekStart}:w:${kind}`, weekStart: c.weekStart, kind, stat, target, title, xp: Math.round(150 * (stat ? c.multipliers[stat] : 1)) });
  const weak = weakestStat(c.stats);
  const days = Math.min(7, Math.max(3, c.prevActiveDays + 1));
  const n = Math.max(3, Math.round(c.prevStatQuests * 1.1));
  const steps = c.bestSteps7 === null ? null : Math.ceil(c.bestSteps7 * 7 * 1.05 / 1000) * 1000;
  return [
    mk('active_days', null, days, `Будь активен ${days} дней из 7`),
    mk('stat_quests', weak, n, `Выполни ${n} заданий: ${STATS[weak].name}`),
    steps === null ? mk('shadow_wins', null, 3, 'Победи Тень 3 раза') : mk('steps_total', null, steps, `Пройди ${steps} шагов за неделю`),
  ];
}
