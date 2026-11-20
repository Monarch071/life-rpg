import { BALANCE } from './balance';
import { rankCap } from './progression';
import { STATS } from './stats';
import type { Stat, WeeklyCtx, WeeklyQuest } from './types';

export type { WeeklyCtx };
const ORDER = Object.keys(STATS) as Stat[];

/** Самая слабая характеристика; ничья — по порядку STATS. */
export const weakestStat = (stats: Record<Stat, number>): Stat => ORDER.reduce((a, s) => (stats[s] < stats[a] ? s : a));

/** XP недельного [S§6]: база ранга-потолка по уровню ×3; без уровня (старые вызовы) — фиксированные 150. */
export const weeklyXpFor = (level?: number): number =>
  level === undefined ? BALANCE.weeklyXp : BALANCE.rank.base[rankCap(level, BALANCE.skill.maxLevel)] * BALANCE.weeklyRankMult;

/** Ровно 3 недельных задания; без случайности. Без данных о шагах третье — по теме сезона (в Прологе — вторая по слабости). */
export function generateWeeklyQuests(c: WeeklyCtx): WeeklyQuest[] {
  const mk = (kind: WeeklyQuest['kind'], stat: Stat | null, target: number, title: string, id: string = kind): WeeklyQuest =>
    ({ id: `${c.weekStart}:w:${id}`, weekStart: c.weekStart, kind, stat, target, title, xp: weeklyXpFor(c.weekStart >= BALANCE.finishSince ? c.level : undefined) });
  const weak = weakestStat(c.stats);
  const E = BALANCE.week.easy;
  const days0 = Math.min(7, Math.max(3, c.prevActiveDays + 1));
  const days = c.easy ? Math.max(3, days0 - E.daysMinus) : days0;
  const n0 = Math.max(3, Math.round(c.prevStatQuests * 1.1));
  const n = c.easy ? Math.max(E.minQuests, Math.round(n0 * E.share)) : n0;
  const steps = c.bestSteps7 === null ? null : Math.ceil(Math.round(c.bestSteps7 * 7 * 1.05 * (c.easy ? E.share : 1) * 1e6) / 1e6 / 1000) * 1000;
  const other = c.themeStat && c.themeStat !== weak ? c.themeStat : weakestStat({ ...c.stats, [weak]: Infinity });
  return [
    mk('active_days', null, days, `Будь активен ${days} дней из 7`),
    mk('stat_quests', weak, n, `Выполни ${n} заданий: ${STATS[weak].name}`),
    c.budget ? mk('budget_week', 'fin', 1, 'Уложись в лимиты трат недели')
      : steps === null ? mk('stat_quests', other, 3, `Выполни 3 задания: ${STATS[other].name}`, 'stat_quests_2') : mk('steps_total', null, steps, `Пройди ${steps} шагов за неделю`),
  ];
}
