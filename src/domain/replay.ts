import { addDays, gameDate } from './day';
import { adjustMultipliers } from './difficulty';
import { shadowXpForDay } from './shadow';
import { classFor, initialStats, STATS, tierFor } from './stats';
import type { AvatarParams, DayResult, GameEvent, GameState, HealthData, HHMM, ISODate, Metric, Profile, Quest, Stat } from './types';
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

/** Лучшее среднее шагов по 7‑дневным окнам за 28 дней до сегодня; окно считается при ≥3 значениях, иначе null. */
function bestSteps7(metrics: Map<ISODate, Partial<Record<Metric, number>>>, today: ISODate): number | null {
  const vals = Array.from({ length: 28 }, (_, i) => metrics.get(addDays(today, i - 28))?.steps);
  let best: number | null = null;
  for (let i = 0; i + 7 <= vals.length; i++) {
    const w = vals.slice(i, i + 7).filter((v): v is number => v !== undefined);
    if (w.length >= 3) best = Math.max(best ?? -Infinity, w.reduce((a, b) => a + b, 0) / w.length);
  }
  return best;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Календарь пакета → локальные HH:MM; без «весь день» (≥20 ч) и без событий другой локальной даты. Вход — граница доверия. */
function calendarOf(raw: unknown, date: ISODate): GameState['today']['calendar'] {
  if (!Array.isArray(raw)) return [];
  const out: GameState['today']['calendar'] = [];
  for (const c of raw) {
    const s = new Date(c?.start), e = new Date(c?.end);
    if (isNaN(+s) || isNaN(+e) || +e <= +s || +e - +s >= 20 * 3600e3) continue;
    if (gameDate(+s, 0) !== date) continue;
    out.push({ title: String(c.title ?? ''), start: hhmm(s), end: hhmm(e) });
  }
  return out;
}

export function replay(events: GameEvent[], now: number, cutoffHour = 4): GameState {
  const today = gameDate(now, cutoffHour);
  let profile: Profile | null = null;
  let initial: Record<Stat, number> | null = null; // поэлементный максимум по всем анкетам
  let avatar = DEFAULT_AVATAR;
  const issued = new Map<ISODate, DoneQuest[]>();
  const questById = new Map<string, DoneQuest>();
  const metrics = new Map<ISODate, Partial<Record<Metric, number>>>();
  let started: { work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM } | null = null;
  let lastHealth: GameState['lastHealth'] = null, calendar: GameState['today']['calendar'] = [];
  let busyUntil: HHMM | null = null, checkedIn = false, lastEnergy: number | null = null;

  for (const e of normalize(events)) {
    switch (e.type) {
      case 'onboarding_completed': {
        profile = e.profile;
        const st = initialStats(e.profile);
        if (initial) for (const k of STAT_KEYS) initial[k] = Math.max(initial[k], st[k]);
        else initial = st;
        break;
      }
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
        // окно не зависит от настройки cutoffHour (0–6), иначе её смена переоценивала бы историю
        if (q && !q.done && gameDate(e.ts, 6) <= q.date && q.date <= gameDate(e.ts, 0)) q.done = true;
        break;
      }
      case 'metric_logged': {
        const m = metrics.get(e.date) ?? {};
        m[e.metric] = e.mode === 'add' ? (m[e.metric] ?? 0) + e.value : e.value;
        metrics.set(e.date, m);
        break;
      }
      case 'health_packet': {
        const h = (e.health ?? {}) as HealthData;
        const m = metrics.get(e.date) ?? {};
        const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
        if (ok(h.steps)) m.steps = Math.max(m.steps ?? -Infinity, h.steps);
        if (ok(h.workoutMin)) m.workoutMin = Math.max(m.workoutMin ?? -Infinity, h.workoutMin);
        if (ok(h.sleepHours)) m.sleepHours = h.sleepHours;
        if (ok(h.weightKg)) m.weightKg = h.weightKg;
        metrics.set(e.date, m);
        lastHealth = { ts: e.ts, date: e.date, health: h };
        if (e.date === today) calendar = calendarOf(e.calendar, today);
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

  // автозачёт по метрикам — в том числе за прошлые дни (пакет мог прийти позже)
  for (const q of questById.values()) {
    const v = q.auto ? metrics.get(q.date)?.[q.auto.metric] : undefined;
    if (q.auto && v !== undefined && (q.auto.op === '>=' ? v >= q.auto.value : v <= q.auto.value)) q.done = true;
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
  // одна формула и для финализации, и для живого счёта сегодня: показанное = записанному
  const shadowOf = (qs: DoneQuest[]) => shadowXpForDay(history.slice(-14).map(h => h.xp), wins) + Math.round(0.5 * sum(qs.filter(q => !q.done)));
  const firstDate = [...issued.keys()].sort()[0];
  for (let d = firstDate; d !== undefined && d < today; d = addDays(d, 1)) {
    const qs = issued.get(d);
    if (!qs) { streak = 0; wins = 0; continue; }
    const xp = sum(qs.filter(q => q.done));
    const shadowXp = shadowOf(qs);
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
  initial ??= fill(1);
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
      shadowXp: shadowOf(todayQuests),
      metrics: metrics.get(today) ?? {}, checkedIn, lastEnergy, busyUntil, calendar,
    },
    lastHealth,
    history,
    genInputs: {
      bestSteps7: bestSteps7(metrics, today),
      lastSleepHours: sleepDate ? metrics.get(sleepDate)!.sleepHours! : null,
      recentTemplateIds: [addDays(today, -2), addDays(today, -1)].flatMap(d => issued.get(d)?.map(q => q.templateId) ?? []),
    },
  };
}
