import { ACHIEVEMENTS, earnAchievements, type Delta } from './achievements';
import { BALANCE, RANKS } from './balance';
import { seasonOf, THEMES, themeBonusApplies, type ThemeId } from './calendar';
import { addDays, gameDate, weekStart } from './day';
import { adjustMultipliers } from './difficulty';
import { cleanAnswers, validAnalysis } from './interview';
import { METRIC_INFO } from './metricInfo';
import { baseFromXp, formStatus, goldFor, questReward, skillFromXp } from './progression';
import { DEFAULT_SKILL_BY_STAT, LEGACY_SKILL_BY_TEMPLATE, legacyRank } from './questBank';
import { isSkillId, primaryStat, SKILL_CATALOG, splitXp, type SkillId } from './skillCatalog';
import { startProfile } from './startProfile';
import { classFor, isStat, STATS, tierFor } from './stats';
import type { Analysis, Answers, AvatarParams, Boss, DayQuest, DayResult, GameEvent, GameState, HealthData, HHMM, ISODate, LedgerEntry, Metric, Profile, Quest, QuestKind, Rank, SkillState, Stat, StatInfo, WeeklyQuest } from './types';
import { weakestStat } from './weekly';
import { levelFromXp } from './xp';

export const DEFAULT_AVATAR: AvatarParams = { hair: 'short', hairColor: '#2b1d14', outfitColor: '#4f46e5', eyes: 'round' };

const STAT_KEYS = Object.keys(STATS) as Stat[];
const SKILL_IDS = SKILL_CATALOG.map(s => s.id);
const fill = (n: number) => Object.fromEntries(STAT_KEYS.map(s => [s, n])) as Record<Stat, number>;
const WEEKLY_KINDS = ['active_days', 'stat_quests', 'steps_total', 'shadow_wins'];
const validWeekly = (w: any): w is WeeklyQuest => !!w && typeof w.id === 'string' && typeof w.title === 'string' && w.title.length >= 1 && w.title.length <= 120 && WEEKLY_KINDS.includes(w.kind)
  && Number.isFinite(w.target) && w.target > 0 && w.target <= 10_000_000 && Number.isFinite(w.xp) && (w.stat === null || isStat(w.stat));
const validStages = (st: unknown): st is string[] => Array.isArray(st) && st.length >= 2 && st.length <= 8
  && st.every(x => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= 80);
const isDate = (x: unknown): x is ISODate => typeof x === 'string' && /^\d{4}-\d\d-\d\d$/.test(x) && addDays(x, 0) === x;
const BLOB = /^[a-z0-9-]{1,64}$/;
const AUTO_METRICS: readonly string[] = ['steps', 'sleepHours', 'weightKg', 'workoutMin'];
const QUEST_KINDS: readonly string[] = ['daily', 'challenge', 'restore', 'custom'];
const clampXp = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(BALANCE.legacy.questXpMax, Math.max(0, v))) : 0);

/** Задание из журнала → задание дня. Граница доверия: без rank — легаси (ранг/навык по картам), с rank — 1–2 различных навыка, иначе null. */
export function normQuest(raw: unknown, date: ISODate): DayQuest | null {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== 'object' || Array.isArray(r) || typeof r.id !== 'string' || typeof r.title !== 'string') return null;
  const legacy = r.rank === undefined;
  let rank: Rank, skills: DayQuest['skills'];
  if (legacy) {
    const t = r.templateId;
    const sk = typeof t === 'string' && Object.hasOwn(LEGACY_SKILL_BY_TEMPLATE, t) ? LEGACY_SKILL_BY_TEMPLATE[t] : isStat(r.stat) ? DEFAULT_SKILL_BY_STAT[r.stat] : null;
    if (!sk) return null;
    rank = legacyRank(r.difficulty); skills = [sk];
  } else {
    const s = r.skills;
    if (!RANKS.includes(r.rank) || !Array.isArray(s) || s.length < 1 || s.length > 2 || !s.every(isSkillId) || new Set(s).size !== s.length) return null;
    rank = r.rank; skills = [...s] as DayQuest['skills'];
  }
  const a = r.auto, w = r.window;
  const auto: Quest['auto'] = a && typeof a === 'object' && AUTO_METRICS.includes(a.metric) && (a.op === '>=' || a.op === '<=') && Number.isFinite(a.value)
    ? { metric: a.metric, op: a.op, value: a.value } : null;
  return {
    id: r.id, date, title: r.title, stat: primaryStat(skills),
    ...(legacy && [1, 2, 3, 4, 5].includes(r.difficulty) ? { difficulty: r.difficulty } : {}),
    minutes: Number.isFinite(r.minutes) ? r.minutes : 0,
    window: w && typeof w === 'object' && typeof w.start === 'string' && typeof w.end === 'string' ? { start: w.start, end: w.end } : null,
    xp: clampXp(r.xp), auto, templateId: typeof r.templateId === 'string' ? r.templateId : '',
    rank, skills, kind: QUEST_KINDS.includes(r.kind) ? r.kind as QuestKind : 'daily',
    ...(typeof r.why === 'string' ? { why: r.why.trim().slice(0, 200) } : {}),
    done: false, verify: null, xpFinal: null, dropped: false, legacy,
  };
}

/** Сортировка по (ts, id) и отбрасывание дублей id — результат не зависит от порядка входного массива. Конверт без id/ts — мусор. */
function normalize(events: GameEvent[]): GameEvent[] {
  const seen = new Set<string>();
  return (Array.isArray(events) ? events : [])
    .filter(e => !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.ts === 'number' && Number.isFinite(e.ts))
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

/** Строка леджера без навыка (босс, недельное): 100% в характеристику, если она есть. */
const flatRow = (id: string, ts: number, date: ISODate, source: LedgerEntry['source'], xp: number, stat: Stat | null): LedgerEntry =>
  ({ id, ts, date, source, base: xp, k: 1, bonus: 0, penalty: 0, mult: 1, xp, gold: goldFor(xp), skills: [], stats: stat ? { [stat]: xp } : {}, verified: false });

export function replay(events: GameEvent[], now: number, cutoffHour = 4): GameState {
  const today = gameDate(now, cutoffHour);
  let profile: Profile | null = null;
  const starts: Parameters<typeof startProfile>[0] = []; // все валидные анкеты: старт — поэлементный максимум
  let avatar = DEFAULT_AVATAR;
  let interview: { answers: Answers; analysis: Analysis | null; date: ISODate } | null = null;
  const avatarImages: GameState['avatarImages'] = {};
  const issued = new Map<ISODate, DayQuest[]>(), issuedTs = new Map<ISODate, number>();
  const questById = new Map<string, DayQuest>();
  const completedAt = new Map<string, number>(), photoOk = new Set<string>();
  const metrics = new Map<ISODate, Partial<Record<Metric, number>>>();
  const themeSets: { date: ISODate; theme: ThemeId }[] = [];
  let started: { work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM } | null = null;
  let lastHealth: GameState['lastHealth'] = null, calendar: GameState['today']['calendar'] = [];
  let busyUntil: HHMM | null = null, checkedIn = false, lastEnergy: number | null = null;
  const weeklyIssued = new Map<ISODate, { ts: number; qs: WeeklyQuest[] }>();
  const tunings = new Map<ISODate, { factors: Partial<Record<Stat, number>>; note: string }>();
  const reports = new Map<ISODate, string>();
  const bossEvents: Extract<GameEvent, { type: 'boss_created' | 'boss_stage_done' | 'boss_abandoned' }>[] = [];
  const shopEvents: Extract<GameEvent, { type: 'reward_created' | 'reward_deleted' | 'reward_purchased' }>[] = [];
  const days = new Map<ISODate, Delta>(); // счётчики достижений по игровым датам
  const dayOf = (d: ISODate) => { const x = days.get(d) ?? {}; days.set(d, x); return x; };
  const bump = (d: ISODate, k: Exclude<keyof Delta, 'steps' | 'streak'>, n = 1) => { const x = dayOf(d); x[k] = (x[k] ?? 0) + n; };
  const checkinDates = new Set<ISODate>();

  for (const e of normalize(events)) {
    switch (e.type) {
      case 'onboarding_completed': {
        const sr = e.profile?.selfRating as Record<string, unknown> | undefined;
        if (!e.profile || typeof e.profile !== 'object' || !sr || typeof sr !== 'object' || !STAT_KEYS.every(k => typeof sr[k] === 'number' && Number.isFinite(sr[k]))) break; // из сети
        profile = e.profile;
        starts.push({ analysis: null, answers: null, profile: e.profile });
        break;
      }
      case 'interview_completed': {
        if (!e.answers || typeof e.answers !== 'object' || Array.isArray(e.answers)) break; // из сети
        const answers = cleanAnswers(e.answers), analysis = validAnalysis(e.analysis); // анализ мог прийти с другого устройства — только через validAnalysis
        starts.push({ analysis, answers, profile: null });
        interview = { answers, analysis, date: gameDate(e.ts, cutoffHour) }; // последняя валидная анкета
        break;
      }
      case 'avatar_updated': avatar = e.params; break;
      case 'avatar_image':
        if (Number.isInteger(e.tier) && e.tier >= 1 && e.tier <= 4 && typeof e.blob === 'string' && BLOB.test(e.blob)) avatarImages[e.tier] = e.blob; // последний по ts
        break;
      case 'quests_issued': {
        if (!isDate(e.date) || issued.has(e.date) || !Array.isArray(e.quests)) break; // побеждает первый
        const qs: DayQuest[] = [];
        for (const raw of e.quests) { const q = normQuest(raw, e.date); if (q && !questById.has(q.id)) { qs.push(q); questById.set(q.id, q); } }
        issued.set(e.date, qs); issuedTs.set(e.date, e.ts);
        break;
      }
      case 'quest_completed': {
        const q = questById.get(e.questId);
        // окно не зависит от настройки cutoffHour (0–6), иначе её смена переоценивала бы историю
        if (q && !q.done && gameDate(e.ts, 6) <= q.date && q.date <= gameDate(e.ts, 0)) {
          q.done = true; completedAt.set(q.id, e.ts);
          if (e.verify === 'photo' && typeof e.photo === 'string' && BLOB.test(e.photo)) photoOk.add(q.id);
        }
        break;
      }
      case 'metric_logged': {
        if (!isDate(e.date) || !Object.hasOwn(METRIC_INFO, e.metric) || typeof e.value !== 'number' || !Number.isFinite(e.value)) break;
        const m = metrics.get(e.date) ?? {};
        m[e.metric] = e.mode === 'add' ? (m[e.metric] ?? 0) + e.value : e.value;
        metrics.set(e.date, m);
        break;
      }
      case 'health_packet': {
        if (!isDate(e.date)) break;
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
        if (!isDate(e.date)) break;
        if (e.date === today) checkedIn = true;
        if (e.date <= today) { lastEnergy = e.energy; if (!checkinDates.has(e.date)) { checkinDates.add(e.date); bump(e.date, 'checkins'); } }
        break;
      case 'season_theme_set':
        if (typeof e.theme === 'string' && Object.hasOwn(THEMES, e.theme)) themeSets.push({ date: gameDate(e.ts, cutoffHour), theme: e.theme });
        break;
      case 'weekly_issued': {
        if (!isDate(e.weekStart) || weekStart(e.weekStart) !== e.weekStart || weeklyIssued.has(e.weekStart)) break;
        const seenIds = new Set<string>();
        const qs = (Array.isArray(e.quests) ? e.quests : []).filter(w => validWeekly(w) && !seenIds.has(w.id) && !!seenIds.add(w.id))
          .slice(0, 5).map(w => ({ ...w, xp: Math.min(BALANCE.legacy.weeklyXpMax, Math.max(0, Math.round(w.xp))) }));
        if (qs.length) weeklyIssued.set(e.weekStart, { ts: e.ts, qs }); // побеждает первый
        break;
      }
      case 'ai_tuning': {
        if (!isDate(e.date) || tunings.has(e.date) || !e.factors || typeof e.factors !== 'object') break; // побеждает первый
        tunings.set(e.date, { factors: e.factors, note: typeof e.note === 'string' ? e.note.slice(0, 200) : '' });
        break;
      }
      case 'ai_report': {
        if (!isDate(e.weekStart) || weekStart(e.weekStart) !== e.weekStart || typeof e.text !== 'string') break;
        reports.set(e.weekStart, e.text.slice(0, 4000)); // последний по ts
        break;
      }
      case 'boss_created': case 'boss_stage_done': case 'boss_abandoned': bossEvents.push(e); break;
      case 'reward_created': case 'reward_deleted': case 'reward_purchased': shopEvents.push(e); break;
      // skill_unlocked (легаси) и неизвестные типы игнорируются
    }
  }

  // Проверка: авто — метрика выполнила цель (в том числе после ручной галочки и за прошлые дни), фото, иначе честное слово.
  for (const q of questById.values()) {
    const v = q.auto ? metrics.get(q.date)?.[q.auto.metric] : undefined;
    const autoOk = !!q.auto && v !== undefined && (q.auto.op === '>=' ? v >= q.auto.value : v <= q.auto.value);
    if (autoOk) q.done = true;
    if (q.done) q.verify = autoOk ? 'auto' : photoOk.has(q.id) ? 'photo' : 'honest';
  }

  const start = startProfile(starts);
  const startLevel = start.level;
  /** Тема на дату: последняя смена в этом сезоне до даты включительно, иначе тема сезона; в Прологе — нет. */
  const themeOn = (d: ISODate): ThemeId | null => {
    const s = seasonOf(d);
    if (s.kind === 'prologue') return null;
    let t = s.defaultTheme;
    for (const x of themeSets) if (x.date >= s.start && x.date <= d) t = x.theme;
    return t;
  };

  // Боссы (легаси): этапы строго по порядку; строки без навыка, 100% в характеристику босса.
  const extra = new Map<ISODate, LedgerEntry[]>();
  const pushExtra = (r: LedgerEntry) => extra.set(r.date, [...(extra.get(r.date) ?? []), r]);
  const bossMap = new Map<string, Boss>();
  for (const e of bossEvents) {
    if (e.type === 'boss_created') {
      const title = typeof e.title === 'string' ? e.title.trim() : '';
      if (typeof e.bossId === 'string' && !bossMap.has(e.bossId) && title.length > 0 && title.length <= 80 && isStat(e.stat) && validStages(e.stages))
        bossMap.set(e.bossId, { id: e.bossId, title, stat: e.stat, stages: e.stages.map(x => x.trim()), done: 0, defeated: false, abandoned: false });
      continue;
    }
    const b = bossMap.get(e.bossId);
    if (!b || b.defeated || b.abandoned) continue;
    if (e.type === 'boss_abandoned') b.abandoned = true;
    else if (e.stage === b.done) {
      b.done++; b.defeated = b.done === b.stages.length;
      const bd = gameDate(e.ts, cutoffHour);
      pushExtra(flatRow(`boss:${b.id}:${e.stage}`, e.ts, bd, 'boss', BALANCE.legacy.bossStageXp + (b.defeated ? BALANCE.legacy.bossDefeatXp : 0), b.stat));
      if (b.defeated) bump(bd, 'bossesDefeated');
    }
  }

  // Недельные: прогресс за 7 дней недели; XP — один раз за выполненное, в том числе за прошлые недели.
  const doneOn = (d: ISODate) => issued.get(d)?.filter(q => q.done) ?? [];
  const weekProgress = (w: WeeklyQuest) => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w.weekStart, i), dq = doneOn(d);
      if (w.kind === 'stat_quests') n += dq.filter(q => q.stat === w.stat).length;
      else if (w.kind === 'steps_total') n += metrics.get(d)?.steps ?? 0;
      else n += dq.length ? 1 : 0; // active_days; легаси shadow_wins — засчитанные дни (пока = дни с выполненным)
    }
    return n;
  };
  const thisWeek = weekStart(today);
  const weeklyNow: GameState['weekly']['quests'] = [];
  for (const [ws, { ts, qs }] of weeklyIssued) for (const w of qs) {
    const progress = weekProgress({ ...w, weekStart: ws }), done = progress >= w.target;
    if (done) {
      const wd = ws === thisWeek ? today : addDays(ws, 6);
      pushExtra(flatRow(`weekly:${ws}:${w.id}`, ts, wd, 'weekly', w.xp, w.stat)); bump(wd, 'weeklyDone');
    }
    if (ws === thisWeek) weeklyNow.push({ ...w, weekStart: ws, progress, done });
  }

  // Один проход по датам: снимок Основы на начало дня → строки леджера → закрытие прошедшего дня.
  const statXp = fill(0);
  const skillXp = Object.fromEntries(SKILL_IDS.map(id => [id, 0])) as Record<SkillId, number>;
  const skillLast: Partial<Record<SkillId, ISODate>> = {};
  const baseNow = () => Object.fromEntries(STAT_KEYS.map(k => [k, baseFromXp(start.base[k], statXp[k]).value])) as Record<Stat, number>;
  const ledger: LedgerEntry[] = [];
  const add = (r: LedgerEntry) => {
    ledger.push(r); bump(r.date, 'xp', r.xp);
    for (const k of STAT_KEYS) statXp[k] += r.stats[k] ?? 0;
    for (const [id, v] of r.skills) {
      const before = skillFromXp(start.skills[id], skillXp[id]).level;
      skillXp[id] += v; skillLast[id] = r.date;
      if (before < 2 && skillFromXp(start.skills[id], skillXp[id]).level >= 2) bump(r.date, 'skills');
    }
  };
  const history: DayResult[] = [], statHistory: GameState['statHistory'] = [];
  const finalized: { stat: Stat; done: boolean }[][] = [];
  let streak = 0, lastClosed: ISODate | null = null, multipliers = fill(1);
  for (const d of [...new Set([...issued.keys(), ...extra.keys()])].sort()) {
    const qs = issued.get(d) ?? [];
    if (qs.length) {
      const weak = weakestStat(baseNow()), theme = themeOn(d);
      for (const q of qs) if (q.done) {
        const r = q.legacy
          ? { base: q.xp, k: 1, bonus: 0, penalty: 0, mult: 1, xp: q.xp, gold: goldFor(q.xp) }
          : questReward({ rank: q.rank, verify: q.verify!, penalties: [],
            bonuses: [themeBonusApplies(theme, q.stat, q.skills) ? BALANCE.bonus.theme : 0, q.stat === weak ? BALANCE.bonus.weakest : 0] });
        const split = splitXp(r.xp, q.skills);
        add({ id: `quest:${q.id}`, ts: completedAt.get(q.id) ?? issuedTs.get(d)!, date: d, source: 'quest', questId: q.id, ...r,
          skills: split.skills, stats: split.stats, verified: !q.legacy && q.verify === 'auto' });
        q.xpFinal = r.xp; bump(d, 'questsDone');
      }
    }
    for (const r of extra.get(d) ?? []) add(r);
    if (d >= today || !qs.length) continue;
    // закрытие дня; пропуск дня без выдачи рвёт серию (правила серии v2 — T6)
    if (lastClosed !== null && lastClosed !== addDays(d, -1)) streak = 0;
    const dq = qs.filter(q => q.done), completed = dq.length;
    streak = completed ? streak + 1 : 0;
    history.push({ date: d, xp: dq.reduce((a, q) => a + q.xpFinal!, 0), completed, issued: qs.length, counted: completed > 0, perfect: completed === qs.length, rest: false, streak });
    dayOf(d).streak = streak;
    if (qs.length >= 3 && completed === qs.length) bump(d, 'perfectDays');
    statHistory.push({ date: d, stats: baseNow() });
    finalized.push(qs.map(q => ({ stat: q.stat, done: q.done })));
    multipliers = adjustMultipliers(multipliers, finalized.slice(-7).flat());
    for (const [s, f] of Object.entries(tunings.get(d)?.factors ?? {}))
      if (isStat(s) && typeof f === 'number' && Number.isFinite(f))
        multipliers[s as Stat] = Math.min(3, Math.max(0.5, multipliers[s as Stat] * Math.min(1.1, Math.max(0.9, f))));
    lastClosed = d;
  }

  const stats = baseNow(), weak = weakestStat(stats);
  const prev = addDays(thisWeek, -7);
  let prevActiveDays = 0, prevStatQuests = 0;
  for (let i = 0; i < 7; i++) {
    const dq = doneOn(addDays(prev, i));
    prevActiveDays += dq.length ? 1 : 0; prevStatQuests += dq.filter(q => q.stat === weak).length;
  }

  // Сегодня: серия на текущий момент; шаги по всем датам.
  const todayQuests = issued.get(today) ?? [];
  const streakNow = (lastClosed === addDays(today, -1) ? streak : 0) + (todayQuests.some(q => q.done) ? 1 : 0);
  dayOf(today).streak = streakNow;
  if (todayQuests.length >= 3 && todayQuests.every(q => q.done)) bump(today, 'perfectDays');
  for (const [d, m] of metrics) if (m.steps !== undefined) dayOf(d).steps = m.steps;
  // Золото достижений учитывается при покупках по дате покупки; first_purchase зависит от покупок, поэтому считаем дважды
  // (золото самого first_purchase на проверку покупок не влияет — баланс не уходит в минус).
  let achs = earnAchievements(days, today, startLevel);

  // Магазин: покупки — после всех строк леджера, когда известен весь заработок.
  const earned = ledger.reduce((a, r) => a + r.gold, 0);
  const shop = new Map<string, { id: string; title: string; price: number; deleted: boolean }>();
  const purchases: GameState['purchases'] = [];
  let spent = 0;
  for (const e of shopEvents) {
    if (e.type === 'reward_created') {
      const title = typeof e.title === 'string' ? e.title.trim() : '';
      if (typeof e.rewardId === 'string' && !shop.has(e.rewardId) && title.length > 0 && title.length <= 60
        && Number.isInteger(e.price) && e.price >= 1 && e.price <= 100000)
        shop.set(e.rewardId, { id: e.rewardId, title, price: e.price, deleted: false });
    } else {
      const r = shop.get(e.rewardId);
      if (!r || r.deleted) continue;
      if (e.type === 'reward_deleted') r.deleted = true;
      else {
        // весь заработок + золото first_purchase (если покупка уже была) − потраченное = то, что показывается в gold
        const bonus = BALANCE.achievementGold * (achs.length + (purchases.length ? 1 : 0));
        if (earned + bonus - spent >= r.price) { spent += r.price; purchases.push({ rewardId: r.id, title: r.title, price: r.price, ts: e.ts }); bump(gameDate(e.ts, cutoffHour), 'purchases'); }
      }
    }
  }
  achs = earnAchievements(days, today, startLevel);
  const gold = earned + BALANCE.achievementGold * achs.length - spent;
  const title = achs.map(x => ACHIEVEMENTS.find(d => d.id === x.id)!.titleReward).filter((t): t is string => !!t).at(-1) ?? 'Новичок';

  const totalXp = ledger.reduce((a, r) => a + r.xp, 0);
  const { level, into, need } = levelFromXp(totalXp, startLevel);
  const season = seasonOf(today), theme = themeOn(today);
  const seasonXp = season.kind === 'prologue' ? 0 : ledger.filter(r => seasonOf(r.date).id === season.id).reduce((a, r) => a + r.xp, 0);
  const statInfo = Object.fromEntries(STAT_KEYS.map(k => {
    const b = baseFromXp(start.base[k], statXp[k]);
    // форма — T6
    return [k, { base: b.value, into: b.into, need: b.need, xp: statXp[k], form: null, status: formStatus(null), norm: 0, xp14: 0, lastRestore: null } satisfies StatInfo];
  })) as Record<Stat, StatInfo>;
  const skills = Object.fromEntries(SKILL_IDS.map(id => [id,
    { ...skillFromXp(start.skills[id], skillXp[id]), xp: skillXp[id], start: start.skills[id], lastDate: skillLast[id] ?? null } satisfies SkillState])) as Record<SkillId, SkillState>;
  const rewards = [...shop.values()].filter(r => !r.deleted).map(({ id, title, price }) => ({ id, title, price }));
  const metricHistory = [...metrics].filter(([d]) => d <= today).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, m]) => ({ date, metrics: { ...m } }));
  const sleepDate = [...metrics.keys()].filter(d => d <= today && metrics.get(d)!.sleepHours !== undefined).sort().at(-1);

  const className = classFor(stats);
  const a = interview?.analysis;
  const character: GameState['character'] = interview && {
    archetype: a?.archetype ?? className, summary: a?.summary ?? '', strengths: a?.strengths ?? [], weaknesses: a?.weaknesses ?? [],
    focus: a?.focus ?? [], questGuidance: a?.questGuidance ?? '', date: interview.date, ai: !!a,
  };

  return {
    profile, avatar, avatarImages, totalXp, level, xpInto: into, xpNeed: need, startLevel,
    start: { source: start.source, scores: start.scores, levelWhy: start.levelWhy },
    stats, statInfo, gold, streak: streakNow,
    className, tier: tierFor(level), multipliers,
    today: {
      date: today, started: !!started, work: started?.work ?? null, wakeAt: started?.wakeAt ?? null,
      quests: todayQuests, xp: todayQuests.reduce((s, q) => s + (q.done ? q.xpFinal ?? 0 : 0), 0),
      metrics: metrics.get(today) ?? {}, checkedIn, lastEnergy, busyUntil, calendar,
      aiNote: (tunings.get(today) ?? tunings.get(addDays(today, -1)))?.note || null,
    },
    character, interviewAnswers: interview?.answers ?? null,
    lastHealth,
    skills, rewards, purchases,
    weekly: { weekStart: thisWeek, quests: weeklyNow },
    bosses: [...bossMap.values()].filter(b => !b.abandoned),
    reports: [...reports].map(([weekStart, text]) => ({ weekStart, text })).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
    genWeekly: { weekStart: thisWeek, stats, multipliers, prevActiveDays, prevStatQuests, bestSteps7: best7(metrics, today, 'steps'), themeStat: theme ? THEMES[theme].stats[0] : null },
    season: { id: season.id, kind: season.kind, name: season.name, start: season.start, end: season.end, theme, xp: seasonXp,
      step: Math.min(BALANCE.season.steps, Math.floor(seasonXp / BALANCE.season.stepXp)) },
    ledger, history, achievements: achs, title, statHistory, metricHistory,
    genInputs: {
      bestSteps7: best7(metrics, today, 'steps'),
      lastSleepHours: sleepDate ? metrics.get(sleepDate)!.sleepHours! : null,
      recentTemplateIds: [addDays(today, -2), addDays(today, -1)].flatMap(d => issued.get(d)?.map(q => q.templateId) ?? []),
    },
  };
}
