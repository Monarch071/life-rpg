import { ACHIEVEMENTS, earnAchievements, type Delta } from './achievements';
import { addDays, gameDate, weekStart } from './day';
import { adjustMultipliers } from './difficulty';
import { shadowXpForDay } from './shadow';
import { SKILLS, skillEffects } from './skills';
import { classFor, initialStats, STATS, tierFor } from './stats';
import type { AvatarParams, Boss, DayResult, GameEvent, GameState, HealthData, HHMM, ISODate, Metric, Profile, Quest, Stat, WeeklyQuest } from './types';
import { weakestStat } from './weekly';
import { currencyFor, levelFromXp } from './xp';

export const DEFAULT_AVATAR: AvatarParams = { hair: 'short', hairColor: '#2b1d14', outfitColor: '#4f46e5', eyes: 'round' };

type DoneQuest = Quest & { done: boolean };
const STAT_KEYS = Object.keys(STATS) as Stat[];
const fill = (n: number) => Object.fromEntries(STAT_KEYS.map(s => [s, n])) as Record<Stat, number>;
const WEEKLY_KINDS = ['active_days', 'stat_quests', 'steps_total', 'shadow_wins'];
const validWeekly = (w: any): w is WeeklyQuest => !!w && typeof w.id === 'string' && typeof w.title === 'string' && w.title.length >= 1 && w.title.length <= 120 && WEEKLY_KINDS.includes(w.kind)
  && Number.isFinite(w.target) && w.target > 0 && w.target <= 10_000_000 && Number.isFinite(w.xp) && (w.stat === null || Object.hasOwn(STATS, w.stat));
const validStages = (st: unknown): st is string[] => Array.isArray(st) && st.length >= 2 && st.length <= 8
  && st.every(x => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 80);
const sum = (qs: DoneQuest[]) => qs.reduce((a, q) => a + q.xp, 0);

/** Сортировка по (ts, id) и отбрасывание дублей id — результат не зависит от порядка входного массива. */
function normalize(events: GameEvent[]): GameEvent[] {
  const seen = new Set<string>();
  return [...events]
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .filter(e => !seen.has(e.id) && !!seen.add(e.id));
}

/** Лучшее (максимум или минимум при lower) среднее по 7‑дневным окнам за 28 дней до сегодня; окно считается при ≥3 значениях, иначе null. */
function best7(metrics: Map<ISODate, Partial<Record<Metric, number>>>, today: ISODate, metric: Metric, lower = false): number | null {
  const vals = Array.from({ length: 28 }, (_, i) => metrics.get(addDays(today, i - 28))?.[metric]);
  let best: number | null = null;
  for (let i = 0; i + 7 <= vals.length; i++) {
    const w = vals.slice(i, i + 7).filter((v): v is number => v !== undefined);
    if (w.length >= 3) { const avg = w.reduce((a, b) => a + b, 0) / w.length; best = best === null ? avg : lower ? Math.min(best, avg) : Math.max(best, avg); }
  }
  return best;
}
const SHADOW_METRICS: [Metric, boolean][] = [['steps', false], ['sleepHours', false], ['readPages', false], ['water', false], ['screenMin', true]];
const ACHIEVEMENT_COINS = 25;

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
  const skillEvents: { skillId: string; ts: number }[] = [];
  const weeklyIssued = new Map<ISODate, WeeklyQuest[]>();
  const tunings = new Map<ISODate, { factors: Partial<Record<Stat, number>>; note: string }>();
  const reports = new Map<ISODate, string>();
  const bossEvents: Extract<GameEvent, { type: 'boss_created' | 'boss_stage_done' | 'boss_abandoned' }>[] = [];
  const shopEvents: Extract<GameEvent, { type: 'reward_created' | 'reward_deleted' | 'reward_purchased' }>[] = [];
  const days = new Map<ISODate, Delta>(); // счётчики достижений по игровым датам
  const dayOf = (d: ISODate) => { const x = days.get(d) ?? {}; days.set(d, x); return x; };
  const bump = (d: ISODate, k: Exclude<keyof Delta, 'steps' | 'streak' | 'shadowWinStreak'>, n = 1) => { const x = dayOf(d); x[k] = (x[k] ?? 0) + n; };
  const checkinDates = new Set<ISODate>(), bossPts: { date: ISODate; stat: Stat }[] = [];

  for (const e of normalize(events)) {
    switch (e.type) {
      case 'onboarding_completed': {
        if (!e.profile || typeof e.profile !== 'object' || !e.profile.selfRating || typeof e.profile.selfRating !== 'object') break; // из сети
        profile = e.profile;
        const st = initialStats(e.profile);
        if (initial) for (const k of STAT_KEYS) initial[k] = Math.max(initial[k], st[k]);
        else initial = st;
        break;
      }
      case 'avatar_updated': avatar = e.params; break;
      case 'quests_issued': {
        if (issued.has(e.date)) break; // побеждает первый
        if (!Array.isArray(e.quests)) break;
        const qs = e.quests.filter((q: any) => !!q && typeof q === 'object' && typeof q.id === 'string' && typeof q.title === 'string'
          && Object.hasOwn(STATS, q.stat) && Number.isFinite(q.xp)).map(q => ({ ...q, done: false }));
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
        lastHealth = { ts: e.ts, date: e.date,
          health: Object.fromEntries(Object.entries(typeof h === 'object' ? h : {}).filter(([, v]) => ok(v))) as HealthData };
        if (e.date === today) calendar = calendarOf(e.calendar, today);
        break;
      }
      case 'day_started': if (e.date === today && !started) started = { work: e.work, wakeAt: e.wakeAt }; break;
      case 'busy_until': if (e.date === today) busyUntil = e.until; break;
      case 'checkin':
        if (e.date === today) checkedIn = true;
        if (e.date <= today) { lastEnergy = e.energy; if (!checkinDates.has(e.date)) { checkinDates.add(e.date); bump(e.date, 'checkins'); } }
        break;
      case 'skill_unlocked': skillEvents.push({ skillId: e.skillId, ts: e.ts }); break;
      case 'weekly_issued': {
        if (typeof e.weekStart !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(e.weekStart) || weekStart(e.weekStart) !== e.weekStart || weeklyIssued.has(e.weekStart)) break;
        const seenIds = new Set<string>();
        const qs = (Array.isArray(e.quests) ? e.quests : []).filter(w => validWeekly(w) && !seenIds.has(w.id) && !!seenIds.add(w.id))
          .slice(0, 5).map(w => ({ ...w, xp: Math.min(1000, Math.max(0, Math.round(w.xp))) }));
        if (qs.length) weeklyIssued.set(e.weekStart, qs); // побеждает первый
        break;
      }
      case 'ai_tuning': {
        if (typeof e.date !== 'string' || tunings.has(e.date) || !e.factors || typeof e.factors !== 'object') break; // побеждает первый
        tunings.set(e.date, { factors: e.factors, note: typeof e.note === 'string' ? e.note.slice(0, 200) : '' });
        break;
      }
      case 'ai_report': {
        if (typeof e.weekStart !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(e.weekStart) || weekStart(e.weekStart) !== e.weekStart || typeof e.text !== 'string') break;
        reports.set(e.weekStart, e.text.slice(0, 4000)); // последний по ts
        break;
      }
      case 'boss_created': case 'boss_stage_done': case 'boss_abandoned': bossEvents.push(e); break;
      case 'reward_created': case 'reward_deleted': case 'reward_purchased': shopEvents.push(e); break;
      // неизвестные типы игнорируются (совместимость вперёд)
    }
  }

  // автозачёт по метрикам — в том числе за прошлые дни (пакет мог прийти позже)
  for (const q of questById.values()) {
    const v = q.auto ? metrics.get(q.date)?.[q.auto.metric] : undefined;
    if (q.auto && v !== undefined && (q.auto.op === '>=' ? v >= q.auto.value : v <= q.auto.value)) q.done = true;
  }

  // Навыки: валидность — по базовому уровню (XP без бонусов), иначе круг «навык → XP → уровень → навык».
  const baseLevel = levelFromXp([...questById.values()].reduce((a, q) => a + (q.done ? q.xp : 0), 0)).level;
  const unlockedAt = new Map<string, ISODate>(); // skillId → игровая дата открытия
  let spent = 0;
  for (const { skillId, ts } of skillEvents) {
    const n = SKILLS.find(k => k.id === skillId);
    if (!n || unlockedAt.has(skillId) || (n.requires && !unlockedAt.has(n.requires)) || n.cost > baseLevel - 1 - spent) continue;
    unlockedAt.set(skillId, gameDate(ts, cutoffHour)); spent += n.cost;
  }
  const effectsAt = (date: ISODate) => skillEffects([...unlockedAt].filter(([, d]) => d <= date).map(([id]) => id));
  for (const q of questById.values()) q.xp = Math.round(q.xp * (1 + effectsAt(q.date).xpBonus[q.stat]));

  const coins = (xp: number, date: ISODate) => Math.floor(currencyFor(xp) * (1 + effectsAt(date).coinBonus));
  let totalXp = 0, currency = 0;
  const statPoints = fill(0);
  for (const q of questById.values()) if (q.done) {
    totalXp += q.xp; currency += coins(q.xp, q.date); statPoints[q.stat] += q.difficulty;
    bump(q.date, 'xp', q.xp); bump(q.date, 'questsDone');
  }
  for (const d of unlockedAt.values()) bump(d, 'skills');

  const todayQuests = issued.get(today) ?? [];

  // Финализация прошлых дней — ровно один раз, по порядку.
  const history: DayResult[] = [];
  const finalized: { stat: Stat; done: boolean }[][] = [];
  const dayPoints: { date: ISODate; pts: Record<Stat, number> }[] = [], cumPts = fill(0);
  let streak = 0, wins = 0, multipliers = fill(1);
  // одна формула и для финализации, и для живого счёта сегодня: показанное = записанному
  const shadowOf = (qs: DoneQuest[], date: ISODate) => shadowXpForDay(history.slice(-14).map(h => h.xp), wins)
    + Math.round((effectsAt(date).calmShadow ? 0.25 : 0.5) * sum(qs.filter(q => !q.done)));
  const firstDate = [...issued.keys()].sort()[0];
  const freezeWeeks = new Set<ISODate>(); // недели, где заморозка уже сработала
  /** Заморозка: пустой день не обнуляет серию, раз в календарную неделю. */
  const frozen = (d: ISODate) => {
    if (streak === 0 || !effectsAt(d).streakFreeze || freezeWeeks.has(weekStart(d))) return false;
    freezeWeeks.add(weekStart(d)); return true;
  };
  for (let d = firstDate; d !== undefined && d < today; d = addDays(d, 1)) {
    const qs = issued.get(d);
    if (!qs) { if (!frozen(d)) streak = 0; wins = 0; continue; }
    const xp = sum(qs.filter(q => q.done));
    const shadowXp = shadowOf(qs, d);
    const won = xp > shadowXp;
    if (won) {
      const bonus = Math.max(10, Math.round(0.15 * xp));
      totalXp += bonus; currency += currencyFor(bonus); wins++;
      bump(d, 'xp', bonus); bump(d, 'shadowWins');
    } else wins = 0;
    const completed = qs.filter(q => q.done).length;
    if (completed) streak++; else if (!frozen(d)) streak = 0;
    for (const q of qs) if (q.done) cumPts[q.stat] += q.difficulty;
    dayPoints.push({ date: d, pts: { ...cumPts } });
    const dd = dayOf(d); dd.streak = streak; dd.shadowWinStreak = wins;
    if (qs.length >= 3 && completed === qs.length) bump(d, 'perfectDays');
    history.push({ date: d, xp, shadowXp, completed, issued: qs.length, won });
    finalized.push(qs.map(q => ({ stat: q.stat, done: q.done })));
    multipliers = adjustMultipliers(multipliers, finalized.slice(-7).flat());
    for (const [s, f] of Object.entries(tunings.get(d)?.factors ?? {}))
      if (Object.hasOwn(STATS, s) && typeof f === 'number' && Number.isFinite(f))
        multipliers[s as Stat] = Math.min(3, Math.max(0.5, multipliers[s as Stat] * Math.min(1.1, Math.max(0.9, f))));
  }

  // Боссы: этапы строго по порядку; XP и очки характеристики — как у обычных заданий.
  const bossMap = new Map<string, Boss>();
  for (const e of bossEvents) {
    if (e.type === 'boss_created') {
      const title = typeof e.title === 'string' ? e.title.trim() : '';
      if (!bossMap.has(e.bossId) && title.length > 0 && title.length <= 80 && Object.hasOwn(STATS, e.stat) && validStages(e.stages))
        bossMap.set(e.bossId, { id: e.bossId, title, stat: e.stat, stages: e.stages.map(x => x.trim()), done: 0, defeated: false, abandoned: false });
      continue;
    }
    const b = bossMap.get(e.bossId);
    if (!b || b.defeated || b.abandoned) continue;
    if (e.type === 'boss_abandoned') b.abandoned = true;
    else if (e.stage === b.done) {
      b.done++; b.defeated = b.done === b.stages.length;
      const xp = 100 + (b.defeated ? 200 : 0);
      const bd = gameDate(e.ts, cutoffHour);
      totalXp += xp; currency += coins(xp, bd); statPoints[b.stat] += 5;
      bump(bd, 'xp', xp); bossPts.push({ date: bd, stat: b.stat }); if (b.defeated) bump(bd, 'bossesDefeated');
    }
  }

  initial ??= fill(1);
  const stats = fill(0);
  for (const s of STAT_KEYS) stats[s] = initial[s] + Math.floor(statPoints[s] / 10);

  // Недельные: прогресс за 7 дней недели; XP и монеты — один раз за выполненное, в том числе за прошлые недели.
  const wonDates = new Set(history.filter(h => h.won).map(h => h.date));
  const weekProgress = (w: WeeklyQuest) => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w.weekStart, i), dq = issued.get(d)?.filter(q => q.done) ?? [];
      if (w.kind === 'active_days') n += dq.length ? 1 : 0;
      else if (w.kind === 'stat_quests') n += dq.filter(q => q.stat === w.stat).length;
      else if (w.kind === 'steps_total') n += metrics.get(d)?.steps ?? 0;
      else n += wonDates.has(d) || (d === today && sum(todayQuests.filter(q => q.done)) > shadowOf(todayQuests, today)) ? 1 : 0;
    }
    return n;
  };
  const thisWeek = weekStart(today);
  const weeklyNow: GameState['weekly']['quests'] = [];
  for (const [ws, qs] of weeklyIssued) for (const w of qs) {
    const progress = weekProgress({ ...w, weekStart: ws }), done = progress >= w.target;
    if (done) {
      const wd = ws === thisWeek ? today : addDays(ws, 6);
      totalXp += w.xp; currency += coins(w.xp, wd); bump(wd, 'xp', w.xp); bump(wd, 'weeklyDone');
    }
    if (ws === thisWeek) weeklyNow.push({ ...w, weekStart: ws, progress, done });
  }
  const prev = addDays(thisWeek, -7), weak = weakestStat(stats);
  let prevActiveDays = 0, prevStatQuests = 0;
  for (let i = 0; i < 7; i++) {
    const dq = issued.get(addDays(prev, i))?.filter(q => q.done) ?? [];
    prevActiveDays += dq.length ? 1 : 0; prevStatQuests += dq.filter(q => q.stat === weak).length;
  }

  // Сегодня: серия и Тень на текущий момент; шаги по всем датам.
  const streakNow = streak + (todayQuests.some(q => q.done) ? 1 : 0);
  const td = dayOf(today); td.streak = streakNow; td.shadowWinStreak = wins;
  if (todayQuests.length >= 3 && todayQuests.every(q => q.done)) bump(today, 'perfectDays');
  for (const [d, m] of metrics) if (m.steps !== undefined) dayOf(d).steps = m.steps;
  // Монеты за достижения учитываются при покупках по дате покупки; first_purchase зависит от покупок, поэтому считаем дважды
  // (монеты самого first_purchase на проверку покупок не влияют — баланс не уходит в минус).
  let achs = earnAchievements(days, today);

  // Магазин: покупки — после финализации, когда известен весь заработок.
  const shop = new Map<string, { id: string; title: string; price: number; deleted: boolean }>();
  const purchases: GameState['purchases'] = [];
  let coinsSpent = 0;
  for (const e of shopEvents) {
    if (e.type === 'reward_created') {
      const title = typeof e.title === 'string' ? e.title.trim() : '';
      if (!shop.has(e.rewardId) && title.length > 0 && title.length <= 60
        && Number.isInteger(e.price) && e.price >= 1 && e.price <= 100000)
        shop.set(e.rewardId, { id: e.rewardId, title, price: e.price, deleted: false });
    } else {
      const r = shop.get(e.rewardId);
      if (!r || r.deleted) continue;
      if (e.type === 'reward_deleted') r.deleted = true;
      else {
        const pd = gameDate(e.ts, cutoffHour);
        // весь заработок + монеты first_purchase (если покупка уже была) − потраченное = то, что показывается в currency
        const bonus = ACHIEVEMENT_COINS * (achs.length + (purchases.length ? 1 : 0));
        if (currency + bonus - coinsSpent >= r.price) { coinsSpent += r.price; purchases.push({ rewardId: r.id, title: r.title, price: r.price, ts: e.ts }); bump(pd, 'purchases'); }
      }
    }
  }
  achs = earnAchievements(days, today);
  currency += ACHIEVEMENT_COINS * achs.length - coinsSpent;
  const title = achs.map(x => ACHIEVEMENTS.find(d => d.id === x.id)!.titleReward).filter((t): t is string => !!t).at(-1) ?? 'Новичок';

  const { level, into, need } = levelFromXp(totalXp);
  const rewards = [...shop.values()].filter(r => !r.deleted).map(({ id, title, price }) => ({ id, title, price }));
  const statHistory = dayPoints.map(({ date, pts }) => {
    const p = { ...pts };
    for (const b of bossPts) if (b.date <= date) p[b.stat] += 5;
    return { date, stats: Object.fromEntries(STAT_KEYS.map(k => [k, initial![k] + Math.floor(p[k] / 10)])) as Record<Stat, number> };
  });
  const metricHistory = [...metrics].filter(([d]) => d <= today).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, m]) => ({ date, metrics: { ...m } }));
  const shadowMetrics: GameState['today']['shadowMetrics'] = [];
  for (const [metric, lowerIsBetter] of SHADOW_METRICS) {
    const best = best7(metrics, today, metric, lowerIsBetter);
    if (best === null) continue;
    const t = best * (lowerIsBetter ? 0.95 : 1.05);
    shadowMetrics.push({ metric, you: metrics.get(today)?.[metric] ?? null, target: metric === 'steps' ? Math.round(t) : Math.round(t * 10) / 10, lowerIsBetter });
  }
  const sleepDate = [...metrics.keys()].filter(d => d <= today && metrics.get(d)!.sleepHours !== undefined).sort().at(-1);

  return {
    profile, avatar, totalXp, level, xpInto: into, xpNeed: need, stats, statPoints, currency,
    streak: streakNow, shadowWinStreak: wins,
    className: classFor(stats), tier: tierFor(level), multipliers,
    today: {
      date: today, started: !!started, work: started?.work ?? null, wakeAt: started?.wakeAt ?? null,
      quests: todayQuests, xp: sum(todayQuests.filter(q => q.done)),
      shadowXp: shadowOf(todayQuests, today),
      metrics: metrics.get(today) ?? {}, checkedIn, lastEnergy, busyUntil, calendar, shadowMetrics,
      aiNote: (tunings.get(today) ?? tunings.get(addDays(today, -1)))?.note || null,
    },
    lastHealth,
    skills: { unlocked: [...unlockedAt.keys()], points: Math.max(0, baseLevel - 1 - spent) }, rewards, purchases,
    weekly: { weekStart: thisWeek, quests: weeklyNow },
    bosses: [...bossMap.values()].filter(b => !b.abandoned),
    reports: [...reports].map(([weekStart, text]) => ({ weekStart, text })).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
    genWeekly: { weekStart: thisWeek, stats, multipliers, prevActiveDays, prevStatQuests, bestSteps7: best7(metrics, today, 'steps') },
    history, achievements: achs, title, statHistory, metricHistory,
    genInputs: {
      bestSteps7: best7(metrics, today, 'steps'),
      lastSleepHours: sleepDate ? metrics.get(sleepDate)!.sleepHours! : null,
      recentTemplateIds: [addDays(today, -2), addDays(today, -1)].flatMap(d => issued.get(d)?.map(q => q.templateId) ?? []),
    },
  };
}
