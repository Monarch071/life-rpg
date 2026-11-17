import { addDays, gameDate } from './day';
import { adjustMultipliers } from './difficulty';
import { shadowXpForDay } from './shadow';
import { classFor, initialStats, STATS, tierFor } from './stats';
import type { AvatarParams, DayResult, GameEvent, GameState, HHMM, ISODate, Metric, Profile, Quest, Stat } from './types';
import { currencyFor, levelFromXp } from './xp';

export const DEFAULT_AVATAR: AvatarParams = { hair: 'short', hairColor: '#2b1d14', outfitColor: '#4f46e5', eyes: 'round' };

type DoneQuest = Quest & { done: boolean };
const STAT_KEYS = Object.keys(STATS) as Stat[];
const fill = (n: number) => Object.fromEntries(STAT_KEYS.map(s => [s, n])) as Record<Stat, number>;
const sum = (qs: DoneQuest[]) => qs.reduce((a, q) => a + q.xp, 0);

/** Сортировка по (ts, id) и отбрасывание дублей id — результат не зависит от порядка входного массива. */
function normalize(events: GameEvent[]): GameEvent[] {
  const seen = new Set<string>();
  return [...events]
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter(e => !seen.has(e.id) && !!seen.add(e.id));
}

/** Лучшее среднее шагов по 7‑дневным окнам за 28 дней до сегодня; null, если значений меньше 3. */
function bestSteps7(metrics: Map<ISODate, Partial<Record<Metric, number>>>, today: ISODate): number | null {
  const vals = Array.from({ length: 28 }, (_, i) => metrics.get(addDays(today, i - 28))?.steps);
  if (vals.filter(v => v !== undefined).length < 3) return null;
  let best: number | null = null;
  for (let i = 0; i + 7 <= vals.length; i++) {
    const w = vals.slice(i, i + 7).filter((v): v is number => v !== undefined);
    if (w.length) best = Math.max(best ?? -Infinity, w.reduce((a, b) => a + b, 0) / w.length);
  }
  return best;
}

export function replay(events: GameEvent[], now: number, cutoffHour = 4): GameState {
  const today = gameDate(now, cutoffHour);
  let profile: Profile | null = null;
  let avatar = DEFAULT_AVATAR;
  const issued = new Map<ISODate, DoneQuest[]>();
  const questById = new Map<string, DoneQuest>();
  const metrics = new Map<ISODate, Partial<Record<Metric, number>>>();
  let started: { work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM } | null = null;
  let busyUntil: HHMM | null = null, checkedIn = false, lastEnergy: number | null = null;

  for (const e of normalize(events)) {
    switch (e.type) {
      case 'onboarding_completed': profile = e.profile; break;
      case 'avatar_updated': avatar = e.params; break;
      case 'quests_issued': {
        if (issued.has(e.date)) break; // побеждает первый
        const qs = e.quests.map(q => ({ ...q, done: false }));
        issued.set(e.date, qs);
        for (const q of qs) questById.set(q.id, q);
        break;
      }
      case 'quest_completed': {
        const q = questById.get(e.questId);
        if (q && !q.done && gameDate(e.ts, cutoffHour) === q.date) q.done = true; // задним числом — нельзя
        break;
      }
      case 'metric_logged': {
        const m = metrics.get(e.date) ?? {};
        m[e.metric] = e.mode === 'add' ? (m[e.metric] ?? 0) + e.value : e.value;
        metrics.set(e.date, m);
        break;
      }
      case 'day_started': if (e.date === today && !started) started = { work: e.work, wakeAt: e.wakeAt }; break;
      case 'busy_until': if (e.date === today) busyUntil = e.until; break;
      case 'checkin':
        if (e.date === today) checkedIn = true;
        if (e.date <= today) lastEnergy = e.energy;
        break;
      // неизвестные типы игнорируются (совместимость вперёд)
    }
  }

  let totalXp = 0, currency = 0;
  const statPoints = fill(0);
  for (const q of questById.values()) if (q.done) {
    totalXp += q.xp; currency += currencyFor(q.xp); statPoints[q.stat] += q.difficulty;
  }

  // Финализация прошлых дней — ровно один раз, по порядку.
  const history: DayResult[] = [];
  const finalized: { stat: Stat; done: boolean }[][] = [];
  let streak = 0, wins = 0, multipliers = fill(1);
  const firstDate = [...issued.keys()].sort()[0];
  for (let d = firstDate; d !== undefined && d < today; d = addDays(d, 1)) {
    const qs = issued.get(d);
    if (!qs) { streak = 0; wins = 0; continue; }
    const xp = sum(qs.filter(q => q.done));
    const shadowXp = shadowXpForDay(history.slice(-14).map(h => h.xp), wins) + Math.round(0.5 * sum(qs.filter(q => !q.done)));
    const won = xp > shadowXp;
    if (won) {
      const bonus = Math.max(10, Math.round(0.15 * xp));
      totalXp += bonus; currency += currencyFor(bonus); wins++;
    } else wins = 0;
    const completed = qs.filter(q => q.done).length;
    streak = completed ? streak + 1 : 0;
    history.push({ date: d, xp, shadowXp, completed, issued: qs.length, won });
    finalized.push(qs.map(q => ({ stat: q.stat, done: q.done })));
    multipliers = adjustMultipliers(multipliers, finalized.slice(-7).flat());
  }

  const todayQuests = issued.get(today) ?? [];
  const initial = profile ? initialStats(profile) : fill(1);
  const stats = fill(0);
  for (const s of STAT_KEYS) stats[s] = initial[s] + Math.floor(statPoints[s] / 10);
  const { level, into, need } = levelFromXp(totalXp);
  const sleepDate = [...metrics.keys()].filter(d => d <= today && metrics.get(d)!.sleepHours !== undefined).sort().at(-1);

  return {
    profile, avatar, totalXp, level, xpInto: into, xpNeed: need, stats, statPoints, currency,
    streak: streak + (todayQuests.some(q => q.done) ? 1 : 0), shadowWinStreak: wins,
    className: classFor(stats), tier: tierFor(level), multipliers,
    today: {
      date: today, started: !!started, work: started?.work ?? null, wakeAt: started?.wakeAt ?? null,
      quests: todayQuests, xp: sum(todayQuests.filter(q => q.done)),
      shadowXp: shadowXpForDay(history.slice(-14).map(h => h.xp), wins),
      metrics: metrics.get(today) ?? {}, checkedIn, lastEnergy, busyUntil,
    },
    history,
    genInputs: {
      bestSteps7: bestSteps7(metrics, today),
      lastSleepHours: sleepDate ? metrics.get(sleepDate)!.sleepHours! : null,
      recentTemplateIds: [addDays(today, -2), addDays(today, -1)].flatMap(d => issued.get(d)?.map(q => q.templateId) ?? []),
    },
  };
}
