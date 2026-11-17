import { questXp } from './xp';
import { seededRng } from './rng';
import { STATS } from './stats';
import { freeWindows, placeQuests, type Win } from './schedule';
import { QUEST_TEMPLATES, genericBadHabit, type QuestTemplate } from './questBank';
import type { DayResult, HHMM, ISODate, Profile, Quest, Stat } from './types';

export interface GenCtx {
  date: ISODate; profile: Profile; stats: Record<Stat, number>; multipliers: Record<Stat, number>;
  wakeAt: HHMM; work: Win | null; busy: Win[]; yesterday: DayResult | null; lastEnergy: number | null;
  lastSleepHours: number | null; bestSteps7: number | null; recentTemplateIds: string[];
}

const ORDER = Object.keys(STATS) as Stat[];
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export function generateDailyQuests(ctx: GenCtx): Quest[] {
  const { date, profile, stats, multipliers } = ctx;
  const rng = seededRng(date);
  const energy = ctx.lastEnergy ?? 5;
  const rate = ctx.yesterday && ctx.yesterday.issued > 0 ? ctx.yesterday.completed / ctx.yesterday.issued : 0;
  const count = ctx.yesterday
    ? clamp(3 + Math.round(rate * 2) + (energy >= 7 ? 1 : 0) - (energy <= 4 ? 1 : 0), 3, 7)
    : 4;

  const build = (t: QuestTemplate, n: number): Omit<Quest, 'window'> => {
    const tired = ctx.lastSleepHours !== null && ctx.lastSleepHours < 6 && t.physical;
    const difficulty = (tired ? Math.min(t.difficulty, 2) : t.difficulty) as Quest['difficulty'];
    return {
      id: `${date}:${t.id}`, date, title: t.title(n), stat: t.stat, difficulty, minutes: t.allDay ? 0 : t.minutes(n),
      xp: questXp(difficulty, multipliers[t.stat]), auto: t.auto?.(n) ?? null, templateId: t.id,
    };
  };
  const qty = (t: QuestTemplate) => Math.max(1, Math.round(t.base * multipliers[t.stat]));
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];

  const chosen: Omit<Quest, 'window'>[] = [];
  const used = new Set<string>();
  const add = (t: QuestTemplate, n = qty(t)) => { used.add(t.id); chosen.push(build(t, n)); };

  // 1. шаги
  const steps = QUEST_TEMPLATES.find(t => t.id === 'steps')!;
  add(steps, ctx.bestSteps7 ? Math.ceil((ctx.bestSteps7 * 1.05) / 500) * 500 : Math.max(3000, profile.stepsUsual));

  // пул обычных заданий: без привычек и шагов, по энергии, без недавних
  let pool = QUEST_TEMPLATES.filter(t => !t.badHabit && t.id !== 'steps' && (energy > 4 || t.difficulty < 4));
  const fresh = pool.filter(t => !ctx.recentTemplateIds.includes(t.id));
  if (fresh.length >= 8) pool = fresh;

  // 2. самая слабая характеристика (ничья — по порядку STATS)
  const weakest = ORDER.reduce((a, s) => (stats[s] < stats[a] ? s : a));
  add(pick(pool.filter(t => t.stat === weakest)));

  // 3. вредная привычка
  if (profile.badHabits.length) {
    const h = pick(profile.badHabits);
    const ts = QUEST_TEMPLATES.filter(t => t.badHabit === h);
    add(ts.length ? pick(ts) : genericBadHabit(h), 1);
  }

  // 4. остальное — взвешенно
  const goalStats = new Set(profile.goals.map(g => g.stat));
  while (chosen.length < count) {
    const left = pool.filter(t => !used.has(t.id));
    if (!left.length) break;
    const w = left.map(t => 1 + (goalStats.has(t.stat) ? 2 : 0) + 10 / Math.max(1, stats[t.stat]));
    let r = rng() * w.reduce((a, b) => a + b, 0), i = 0;
    while (i < left.length - 1 && (r -= w[i]) > 0) i++;
    add(left[i]);
  }

  const busy = [...(ctx.work ? [ctx.work] : []), ...ctx.busy];
  return placeQuests(chosen, freeWindows(ctx.wakeAt, profile.sleep, busy), profile.energy, ctx.wakeAt);
}
