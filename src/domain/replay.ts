import { ACHIEVEMENTS, earnAchievements, type Delta } from './achievements';
import { BALANCE, RANKS, type RewardEffect } from './balance';
import { seasonOf, THEMES, themeBonusApplies, type ThemeId } from './calendar';
import { addDays, gameDate, weekStart } from './day';
import { closeMinutes, closesAtTs, DEFAULT_DAY_TYPES, gameDateAt, isHM, legacyDayType, validDayType, type DayType } from './dayType';
import { adjustMultipliers } from './difficulty';
import { cleanAnswers, validAnalysis } from './interview';
import { METRIC_INFO } from './metricInfo';
import { baseFromXp, formNorm, formOf, formStatus, goldFor, questReward, rankCap, skillFromXp, streakBonus } from './progression';
import { DEFAULT_SKILL_BY_STAT, LEGACY_SKILL_BY_TEMPLATE, legacyRank } from './questBank';
import { isSkillId, primaryStat, SKILL_CATALOG, splitXp, type SkillId } from './skillCatalog';
import { startProfile } from './startProfile';
import { dayOutcome, nextStreak } from './streak';
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
// shortcut: дни от первой выдачи идут плотным циклом; выдачи раньше этой даты — мусор (иначе 1900 год = 46 тыс. итераций)
const MIN_ISSUE_DATE = '2020-01-01';
/** Дата дневного события — в пределах ±1 дня от календарной даты его ts (плохие часы устройства, мусор). */
const nearTs = (date: ISODate, ts: number) => { const c = gameDate(ts, 0); return date >= addDays(c, -1) && date <= addDays(c, 1); };
const validProfile = (p: any): p is Profile => !!p && typeof p === 'object' && !!p.selfRating && typeof p.selfRating === 'object'
  && STAT_KEYS.every(k => typeof p.selfRating[k] === 'number' && Number.isFinite(p.selfRating[k]));
const validAvatar = (p: any): p is AvatarParams => !!p && typeof p === 'object' && (['hair', 'hairColor', 'outfitColor', 'eyes'] as const).every(k => typeof p[k] === 'string');
const strongestStat = (st: Record<Stat, number>): Stat => STAT_KEYS.reduce((a, k) => (st[k] > st[a] ? k : a)); // ничья — по порядку STATS
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

export function replay(events: GameEvent[], now: number): GameState {
  const evs = normalize(events);
  // Проход 1: старт/смена дня и отбой профиля → закрытие каждого дня → игровые даты.
  let sleep: HHMM | null = null; // отбой последнего валидного профиля — для синтеза типа старых day_started
  for (const e of evs) if (e.type === 'onboarding_completed' && validProfile(e.profile)) sleep = isHM(e.profile.sleep) ? e.profile.sleep : null;
  const dayStart = new Map<ISODate, { work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM; dayType: DayType | null; energy: number | null }>();
  const dayChange = new Map<ISODate, { type: DayType; ts: number }>();
  let dayTypes: DayType[] = DEFAULT_DAY_TYPES;
  // Тип дня: последний принятый day_changed, иначе day_started (старый — синтез).
  const typeNow = (d: ISODate): DayType | null => {
    const st = dayStart.get(d);
    return st ? dayChange.get(d)?.type ?? st.dayType ?? legacyDayType(st.work, st.wakeAt, sleep) : null;
  };
  for (const e of evs) {
    if (e.type === 'day_started') {
      // побеждает первый; старт задним числом для уже закрытого (даже по позднему 04:00) дня отбрасывается
      if (!isDate(e.date) || dayStart.has(e.date) || !isHM(e.wakeAt) || !nearTs(e.date, e.ts) || e.ts >= closesAtTs(e.date, BALANCE.day.closeLatestMin)) continue;
      const w = e.work as { start?: unknown; end?: unknown } | null;
      dayStart.set(e.date, { work: w && typeof w === 'object' && isHM(w.start) && isHM(w.end) ? { start: w.start, end: w.end } : null, wakeAt: e.wakeAt,
        dayType: validDayType(e.dayType), energy: Number.isInteger(e.energy) && e.energy! >= 1 && e.energy! <= 10 ? e.energy! : null });
    } else if (e.type === 'day_changed') {
      // только после старта и до закрытия дня по типу, действующему до смены (события идут по ts) — иначе устаревшее устройство
      const t = validDayType(e.dayType), cur = isDate(e.date) ? typeNow(e.date) : null;
      if (t && isHM(e.at) && cur && e.ts < closesAtTs(e.date, closeMinutes(cur)))
        dayChange.set(e.date, { type: t, ts: dayChange.get(e.date)?.ts ?? e.ts }); // тип — последний, ts строки XP — первый
    } else if (e.type === 'day_types_set' && Array.isArray(e.types)) {
      const ts = e.types.map(validDayType).filter((t): t is DayType => !!t);
      dayTypes = ts.length ? ts : DEFAULT_DAY_TYPES; // последний по ts
    }
  }
  // Тип дня: последний day_changed, иначе day_started (старый — синтез); смена без старта не действует.
  const types = new Map<ISODate, DayType>();
  for (const d of dayStart.keys()) types.set(d, typeNow(d)!);
  const closeOf = (d: ISODate) => closeMinutes(types.get(d) ?? null);
  const gd = (ts: number) => gameDateAt(ts, closeOf);
  const today = gd(now);
  // Дни отдыха и купленные дни без заданий: один счётчик на месяц, решается в цикле дней по датам (позднее не меняет раннее).
  const restDays = new Set<ISODate>(), restInMonth = new Map<string, number>();
  const restTyped = [...types.keys()].filter(d => types.get(d)!.kind === 'rest' && d <= today);

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
  // Платные траты (переброс, покупка с эффектом) принимаются в цикле дней по золоту прошлых дней.
  type ShopItem = { id: string; title: string; price: number; effect: RewardEffect | null; deleted: boolean };
  type Spend = { id: string; ts: number; date: ISODate } & ({ orig: string; repl: DayQuest } | { reward: ShopItem });
  const spends: Spend[] = [];
  const rerolledFrom = new Set<string>(); // исходные questId: повтор переброса игнорируется
  const customs = new Map<ISODate, DayQuest[]>();

  for (const e of evs) {
    switch (e.type) {
      case 'onboarding_completed': {
        if (!validProfile(e.profile)) break; // из сети
        profile = e.profile;
        starts.push({ analysis: null, answers: null, profile: e.profile });
        break;
      }
      case 'interview_completed': {
        if (!e.answers || typeof e.answers !== 'object' || Array.isArray(e.answers)) break; // из сети
        const answers = cleanAnswers(e.answers), analysis = validAnalysis(e.analysis); // анализ мог прийти с другого устройства — только через validAnalysis
        starts.push({ analysis, answers, profile: null });
        interview = { answers, analysis, date: gd(e.ts) }; // последняя валидная анкета
        break;
      }
      case 'avatar_updated': if (validAvatar(e.params)) avatar = { hair: e.params.hair, hairColor: e.params.hairColor, outfitColor: e.params.outfitColor, eyes: e.params.eyes }; break;
      case 'avatar_image':
        if (Number.isInteger(e.tier) && e.tier >= 1 && e.tier <= 4 && typeof e.blob === 'string' && BLOB.test(e.blob)) avatarImages[e.tier] = e.blob; // последний по ts
        break;
      case 'quests_issued': {
        if (!isDate(e.date) || e.date < MIN_ISSUE_DATE || !nearTs(e.date, e.ts) || issued.has(e.date) || !Array.isArray(e.quests)) break; // побеждает первый
        const qs: DayQuest[] = [];
        for (const raw of e.quests) { const q = normQuest(raw, e.date); if (q && !questById.has(q.id)) { qs.push(q); questById.set(q.id, q); } }
        issued.set(e.date, qs); issuedTs.set(e.date, e.ts);
        break;
      }
      case 'quest_completed': {
        const q = questById.get(e.questId);
        // окно 00:00–06:00 следующих суток не зависит от закрытия дня (оно в пределах 00:00–04:00)
        if (q && !q.done && gameDate(e.ts, 6) <= q.date && q.date <= gameDate(e.ts, 0)) {
          q.done = true; completedAt.set(q.id, e.ts);
          if (e.verify === 'photo' && typeof e.photo === 'string' && BLOB.test(e.photo)) photoOk.add(q.id);
        }
        break;
      }
      case 'quest_rerolled': {
        // только сегодняшнее невыполненное, не restore/custom; замена — тот же ранг, другой шаблон; принятие (золото) — в цикле дней
        const q0 = questById.get(e.questId), r = isDate(e.date) && e.date === gd(e.ts) ? normQuest(e.replacement, e.date) : null;
        if (!q0 || !r || r.legacy || q0.date !== e.date || q0.done || rerolledFrom.has(q0.id) || questById.has(r.id) || r.rank !== q0.rank
          || r.templateId === q0.templateId || [q0.kind, r.kind].some(k => k === 'restore' || k === 'custom')) break;
        rerolledFrom.add(q0.id); questById.set(r.id, r);
        spends.push({ id: e.id, ts: e.ts, date: e.date, orig: q0.id, repl: r });
        break;
      }
      case 'custom_quest_added': {
        const c = isDate(e.date) && e.date >= MIN_ISSUE_DATE && e.date === gd(e.ts) ? normQuest(e.quest, e.date) : null;
        const list = c ? customs.get(c.date) ?? [] : [];
        if (!c || c.legacy || questById.has(c.id) || list.length >= BALANCE.custom.perDay) break; // третье за день — игнор
        c.kind = 'custom'; list.push(c); customs.set(c.date, list); questById.set(c.id, c);
        if (!issuedTs.has(c.date)) issuedTs.set(c.date, e.ts);
        break;
      }
      case 'metric_logged': {
        if (!isDate(e.date) || !Object.hasOwn(METRIC_INFO, e.metric) || typeof e.value !== 'number' || !Number.isFinite(e.value)) break;
        const m = metrics.get(e.date) ?? {};
        const lim = BALANCE.metricAbsMax;
        m[e.metric] = e.mode === 'add' ? Math.min(lim, Math.max(-lim, (m[e.metric] ?? 0) + e.value)) : e.value;
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
      case 'busy_until': if (e.date === today && isHM(e.until)) busyUntil = e.until; break;
      case 'checkin':
        if (!isDate(e.date)) break;
        if (e.date === today) checkedIn = true;
        if (e.date <= today) { if (typeof e.energy === 'number' && Number.isFinite(e.energy)) lastEnergy = e.energy; if (!checkinDates.has(e.date)) { checkinDates.add(e.date); bump(e.date, 'checkins'); } }
        break;
      case 'season_theme_set':
        if (typeof e.theme === 'string' && Object.hasOwn(THEMES, e.theme)) themeSets.push({ date: gd(e.ts), theme: e.theme });
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
  // Свои задания — в конец списка дня (выдача той же даты по-прежнему «побеждает первая»).
  for (const [d, cs] of customs) issued.set(d, [...(issued.get(d) ?? []), ...cs]);
  const dayOff = new Set<ISODate>(); // купленный «день без заданий» — нейтрален, как отдых
  /** Итог дня; свои задания не в знаменателе 60%. */
  const outcomeOf = (d: ISODate) => {
    const qs = (issued.get(d) ?? []).filter(q => q.kind !== 'custom');
    return dayOutcome({ issued: qs.length, done: qs.filter(q => q.done).length, dropped: qs.filter(q => q.dropped).length, rest: restDays.has(d) || dayOff.has(d) });
  };

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
      const bd = gd(e.ts);
      pushExtra(flatRow(`boss:${b.id}:${e.stage}`, e.ts, bd, 'boss', BALANCE.legacy.bossStageXp + (b.defeated ? BALANCE.legacy.bossDefeatXp : 0), b.stat));
      if (b.defeated) bump(bd, 'bossesDefeated');
    }
  }

  // Недельные: прогресс за 7 дней недели; XP — один раз за выполненное, в том числе за прошлые недели.
  const doneOn = (d: ISODate) => issued.get(d)?.filter(q => q.done && q.kind !== 'custom') ?? []; // свои дают только свой XP
  const weekProgress = (w: WeeklyQuest) => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w.weekStart, i), dq = doneOn(d);
      if (w.kind === 'stat_quests') n += dq.filter(q => q.stat === w.stat).length;
      else if (w.kind === 'steps_total') n += metrics.get(d)?.steps ?? 0;
      else if (w.kind === 'shadow_wins') n += outcomeOf(d).counted ? 1 : 0; // легаси — засчитанные в серию дни
      else n += dq.length ? 1 : 0; // active_days
    }
    return n;
  };
  const thisWeek = weekStart(today);
  // строка недельного — в цикле дней на дату wd, когда дни недели уже разрешены (перебросы, «день без заданий»)
  const weeklyAt = new Map<ISODate, { ws: ISODate; ts: number; w: WeeklyQuest }[]>();
  for (const [ws, { ts, qs }] of weeklyIssued) for (const w of qs) {
    const wd = ws === thisWeek ? today : addDays(ws, 6);
    weeklyAt.set(wd, [...(weeklyAt.get(wd) ?? []), { ws, ts, w }]);
  }

  // Магазин: создание/удаление по ts; покупки — кандидаты; с эффектом — ещё и платная трата дня.
  const shop = new Map<string, ShopItem>();
  const buys: { id: string; ts: number; r: ShopItem }[] = [];
  for (const e of shopEvents) {
    if (e.type === 'reward_created') {
      const title = typeof e.title === 'string' ? e.title.trim() : '';
      if (typeof e.rewardId === 'string' && !shop.has(e.rewardId) && title.length > 0 && title.length <= 60
        && Number.isInteger(e.price) && e.price >= 1 && e.price <= 100000)
      {
        // эффект и цена — только у стартовых наград и только из BALANCE; своя награда эффекта не имеет
        const def = e.rewardId.startsWith('default:') ? BALANCE.rewards.find(x => `default:${x.slug}` === e.rewardId) : undefined;
        shop.set(e.rewardId, { id: e.rewardId, title, price: def ? def.price : e.price, effect: def?.effect ?? null, deleted: false });
      }
      continue;
    }
    const r = shop.get(e.rewardId);
    if (!r || r.deleted) continue;
    if (e.type === 'reward_deleted') { r.deleted = true; continue; }
    buys.push({ id: e.id, ts: e.ts, r });
    if (r.effect) spends.push({ id: e.id, ts: e.ts, date: gd(e.ts), reward: r });
  }
  const spendsOn = new Map<ISODate, Spend[]>();
  for (const s of spends.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))) spendsOn.set(s.date, [...(spendsOn.get(s.date) ?? []), s]);
  const ordinaryBuys = buys.filter(b => !b.r.effect);
  const acceptedFx = new Set<string>(), rerollPaid: { ts: number; price: number }[] = [], rerollsOn = new Map<ISODate, number>();
  const freezeMonth = new Map<string, number>();
  let freezes = 0, paidSum = 0;

  // «День изменился»: +20 один раз за дату (только у начатого дня), без навыка и характеристики.
  for (const [d, c] of dayChange) if (dayStart.has(d) && d <= today) pushExtra(flatRow(`day_changed:${d}`, c.ts, d, 'day_changed', BALANCE.dayChangedXp, null));

  // Один проход по датам: снимок Основы на начало дня → строки леджера → закрытие прошедшего дня.
  const statXp = fill(0);
  const skillXp = Object.fromEntries(SKILL_IDS.map(id => [id, 0])) as Record<SkillId, number>;
  const skillLast: Partial<Record<SkillId, ISODate>> = {};
  const baseNow = () => Object.fromEntries(STAT_KEYS.map(k => [k, baseFromXp(start.base[k], statXp[k]).value])) as Record<Stat, number>;
  const ledger: LedgerEntry[] = [];
  let goldSoFar = 0, xpSoFar = 0; // цикл идёт по датам: на начало дня d — строки с датой < d
  const statByDate = new Map<ISODate, Record<Stat, number>>(); // XP характеристик по датам — для «Перекоса» и Формы
  const add = (r: LedgerEntry) => {
    ledger.push(r); bump(r.date, 'xp', r.xp); goldSoFar += r.gold; xpSoFar += r.xp;
    const sd = statByDate.get(r.date) ?? fill(0);
    for (const k of STAT_KEYS) { statXp[k] += r.stats[k] ?? 0; sd[k] += r.stats[k] ?? 0; }
    statByDate.set(r.date, sd);
    for (const [id, v] of r.skills) {
      const before = skillFromXp(start.skills[id], skillXp[id]).level;
      skillXp[id] += v; skillLast[id] = r.date;
      if (before < 2 && skillFromXp(start.skills[id], skillXp[id]).level >= 2) bump(r.date, 'skills');
    }
  };
  const history: DayResult[] = [], statHistory: GameState['statHistory'] = [];
  const finalized: { stat: Stat; done: boolean }[][] = [];
  const closed: { date: ISODate; done: number; rest: boolean }[] = []; // все закрытые дни от первого дня с заданиями (пустые тоже)
  let streak = 0, idleRun = 0, multipliers = fill(1); // idleRun — подряд закрытых не-отдыхающих дней без выполненного
  // Даты: каждый день от первого дня с заданиями до сегодня (пропуски тоже закрываются) + выдачи и строки вне его.
  const firstDay = [...issued.keys()].sort()[0] as ISODate | undefined;
  const dates = new Set([...issued.keys(), ...extra.keys(), ...weeklyAt.keys(), ...spendsOn.keys(), ...restTyped]);
  if (firstDay) for (let d = firstDay; d <= today; d = addDays(d, 1)) dates.add(d);
  for (const d of [...dates].sort()) {
    const qs = issued.get(d) ?? [];
    // платные траты дня: золото строк прошлых дней − обычные покупки раньше по ts − ранее принятые платные траты ≥ цена
    // день отдыха — только пока принятых отдыхов и дней без заданий раньше d в месяце меньше лимита; сверх — обычный день
    const rm = d.slice(0, 7);
    if (d <= today && types.get(d)?.kind === 'rest' && (restInMonth.get(rm) ?? 0) < BALANCE.streak.restDaysPerMonth) {
      restDays.add(d); restInMonth.set(rm, (restInMonth.get(rm) ?? 0) + 1);
    }
    for (const s of spendsOn.get(d) ?? []) {
      const avail = goldSoFar - ordinaryBuys.reduce((a, b) => a + (b.ts < s.ts ? b.r.price : 0), 0) - paidSum;
      if ('orig' in s) {
        const i = qs.findIndex(q => q.id === s.orig), used = rerollsOn.get(d) ?? 0;
        const price = used >= BALANCE.reroll.free ? BALANCE.reroll.cost : 0;
        if (i < 0 || (price > 0 && avail < price)) continue;
        qs[i] = s.repl; rerollsOn.set(d, used + 1);
        if (price) { rerollPaid.push({ ts: s.ts, price }); paidSum += price; }
      } else {
        const r = s.reward, m = d.slice(0, 7), nf = freezeMonth.get(m) ?? 0;
        const nr = restInMonth.get(m) ?? 0;
        // день без заданий: в лимите дней отдыха месяца; повтор на ту же дату или на день отдыха — отказ без списания
        if (r.effect === 'streak_freeze' ? nf >= BALANCE.shop.freezePerMonth
          : restDays.has(d) || dayOff.has(d) || nr >= BALANCE.streak.restDaysPerMonth) continue;
        if (avail < r.price) continue;
        acceptedFx.add(s.id); paidSum += r.price;
        if (r.effect === 'streak_freeze') { freezes++; freezeMonth.set(m, nf + 1); } else { dayOff.add(d); restInMonth.set(m, nr + 1); }
      }
    }
    // «День изменился»: при меньшем числе слотов последние по выдаче невыполненные — dropped (вне знаменателя 60%); свои не трогаются.
    const ch = dayChange.get(d);
    if (ch && dayStart.has(d)) {
      let left = qs.filter(q => q.kind !== 'custom').length;
      for (let i = qs.length - 1; i >= 0 && left > ch.type.slots; i--) if (!qs[i].done && qs[i].kind !== 'custom') { qs[i].dropped = true; left--; }
    }
    // свои задания: ранг не выше потолка (уровень и главный навык на начало дня)
    const lvl = levelFromXp(xpSoFar, startLevel).level;
    for (const q of qs) if (q.kind === 'custom') {
      const cap = rankCap(lvl, skillFromXp(start.skills[q.skills[0]], skillXp[q.skills[0]]).level);
      if (RANKS.indexOf(q.rank) > RANKS.indexOf(cap)) q.rank = cap;
    }
    if (qs.some(q => q.done)) {
      // снимок на начало дня
      const base = baseNow(), weak = weakestStat(base), strong = strongestStat(base), theme = themeOn(d);
      const weakening = idleRun >= BALANCE.penalty.weakeningIdleDays;
      let total = 0, top = 0;
      for (let i = 1; i <= BALANCE.penalty.imbalanceWindow; i++) {
        const sd = statByDate.get(addDays(d, -i));
        if (sd) { top += sd[strong]; for (const k of STAT_KEYS) total += sd[k]; }
      }
      const imbalance = total >= BALANCE.penalty.imbalanceMinXp && top > BALANCE.penalty.imbalanceShare * total;
      const rows = qs.filter(q => q.done).map(q => ({ q, r: q.legacy
        ? { base: q.xp, k: 1, bonus: 0, penalty: 0, mult: 1, xp: q.xp, gold: goldFor(q.xp) }
        : questReward({ rank: q.rank, verify: q.verify!, mult: q.kind === 'restore' ? BALANCE.restore.mult : 1,
          bonuses: [streakBonus(streak), themeBonusApplies(theme, q.stat, q.skills) ? BALANCE.bonus.theme : 0, q.stat === weak ? BALANCE.bonus.weakest : 0],
          penalties: [weakening ? BALANCE.penalty.weakening : 0, imbalance && q.stat === strong ? BALANCE.penalty.imbalance : 0] }) }));
      // свои ≤ dayShare XP дня: min(Σ своих, round(Σ остальных × share / (1 − share))); урезание пропорционально, остаток — последней строке
      const own = rows.filter(x => x.q.kind === 'custom'), ownXp = own.reduce((a, x) => a + x.r.xp, 0);
      const share = BALANCE.custom.dayShare;
      const allowed = Math.min(ownXp, Math.round(rows.reduce((a, x) => a + (x.q.kind === 'custom' ? 0 : x.r.xp), 0) * share / (1 - share)));
      let left = allowed;
      if (allowed < ownXp) own.forEach((x, i) => {
        const v = i === own.length - 1 ? left : Math.floor(x.r.xp * allowed / ownXp);
        left -= v; x.r = { ...x.r, xp: v, gold: goldFor(v) };
      });
      for (const { q, r } of rows) {
        const split = splitXp(r.xp, q.skills);
        add({ id: `quest:${q.id}`, ts: completedAt.get(q.id) ?? issuedTs.get(d)!, date: d, source: 'quest', questId: q.id, ...r,
          skills: split.skills, stats: split.stats, verified: !q.legacy && q.verify === 'auto' });
        q.xpFinal = r.xp; if (q.kind !== 'custom') bump(d, 'questsDone');
      }
    }
    for (const { ws, ts, w } of weeklyAt.get(d) ?? []) if (weekProgress({ ...w, weekStart: ws }) >= w.target) {
      add(flatRow(`weekly:${ws}:${w.id}`, ts, d, 'weekly', w.xp, w.stat)); bump(d, 'weeklyDone');
    }
    for (const r of extra.get(d) ?? []) add(r);
    if (!firstDay || d < firstDay || d >= today) continue;
    // закрытие дня: серия (заморозка гасит ближайший пропуск), идеальный день; история — для дней с выдачей
    const o = outcomeOf(d), rest = restDays.has(d) || dayOff.has(d), dq = qs.filter(q => q.done);
    const real = qs.filter(q => q.kind !== 'custom'), realDone = real.filter(q => q.done).length;
    const freeze = !o.neutral && !o.counted && freezes > 0 && streak > 0; // при нулевой серии заморозка не тратится
    if (freeze) freezes--;
    streak = nextStreak(streak, o, freeze);
    if (o.perfect) add(flatRow(`perfect:${d}`, closesAtTs(d, closeOf(d)), d, 'perfect_day', BALANCE.streak.perfectXp, null));
    closed.push({ date: d, done: dq.length, rest });
    if (!rest) idleRun = realDone ? 0 : idleRun + 1;
    if (!qs.length) continue;
    history.push({ date: d, xp: dq.reduce((a, q) => a + q.xpFinal!, 0), completed: dq.length, issued: qs.length, counted: o.counted, perfect: o.perfect, rest, streak });
    dayOf(d).streak = streak;
    if (real.length >= 3 && realDone === real.length) bump(d, 'perfectDays');
    statHistory.push({ date: d, stats: baseNow() });
    finalized.push(qs.map(q => ({ stat: q.stat, done: q.done })));
    multipliers = adjustMultipliers(multipliers, finalized.slice(-7).flat());
    for (const [s, f] of Object.entries(tunings.get(d)?.factors ?? {}))
      if (isStat(s) && typeof f === 'number' && Number.isFinite(f))
        multipliers[s as Stat] = Math.min(3, Math.max(0.5, multipliers[s as Stat] * Math.min(1.1, Math.max(0.9, f))));
  }

  const weeklyNow: GameState['weekly']['quests'] = (weeklyIssued.get(thisWeek)?.qs ?? []).map(w => {
    const progress = weekProgress({ ...w, weekStart: thisWeek });
    return { ...w, weekStart: thisWeek, progress, done: progress >= w.target };
  });
  const stats = baseNow(), weak = weakestStat(stats);
  const prev = addDays(thisWeek, -7);
  let prevActiveDays = 0, prevStatQuests = 0;
  for (let i = 0; i < 7; i++) {
    const dq = doneOn(addDays(prev, i));
    prevActiveDays += dq.length ? 1 : 0; prevStatQuests += dq.filter(q => q.stat === weak).length;
  }

  // Сегодня: серия на текущий момент; шаги по всем датам.
  const todayQuests = issued.get(today) ?? [];
  const streakNow = streak + (outcomeOf(today).counted ? 1 : 0);
  dayOf(today).streak = streakNow;
  const todayReal = todayQuests.filter(q => q.kind !== 'custom');
  if (todayReal.length >= 3 && todayReal.every(q => q.done)) bump(today, 'perfectDays');
  for (const [d, m] of metrics) if (m.steps !== undefined) dayOf(d).steps = m.steps;
  // Золото достижений учитывается при покупках по дате покупки; first_purchase зависит от покупок, поэтому считаем дважды
  // (золото самого first_purchase на проверку покупок не влияет — баланс не уходит в минус).
  let achs = earnAchievements(days, today, startLevel);

  // Магазин: покупки — после всех строк леджера, когда известен весь заработок.
  const earned = ledger.reduce((a, r) => a + r.gold, 0);
  const purchases: GameState['purchases'] = [];
  let spent = 0, ri = 0;
  for (const { id, ts, r } of buys) {
    while (ri < rerollPaid.length && rerollPaid[ri].ts <= ts) spent += rerollPaid[ri++].price;
    // весь заработок + золото first_purchase (если покупка уже была) − потраченное = то, что показывается в gold;
    // покупки с эффектом приняты в цикле дней и здесь не перепроверяются
    const bonus = BALANCE.achievementGold * (achs.length + (purchases.length ? 1 : 0));
    if (r.effect ? acceptedFx.has(id) : earned + bonus - spent >= r.price) { spent += r.price; purchases.push({ rewardId: r.id, title: r.title, price: r.price, ts }); bump(gd(ts), 'purchases'); }
  }
  for (; ri < rerollPaid.length; ri++) spent += rerollPaid[ri].price;
  achs = earnAchievements(days, today, startLevel);
  const gold = earned + BALANCE.achievementGold * achs.length - spent;
  const title = achs.map(x => ACHIEVEMENTS.find(d => d.id === x.id)!.titleReward).filter((t): t is string => !!t).at(-1) ?? 'Новичок';

  const totalXp = ledger.reduce((a, r) => a + r.xp, 0);
  const { level, into, need } = levelFromXp(totalXp, startLevel);
  const season = seasonOf(today), theme = themeOn(today);
  const seasonXp = season.kind === 'prologue' ? 0 : ledger.filter(r => seasonOf(r.date).id === season.id).reduce((a, r) => a + r.xp, 0);
  // Форма по закрытым дням без отдыха: окно 14; норма — из плана первые 30 дней, потом из фактического за 60 дней.
  const work = closed.filter(c => !c.rest), win = work.slice(-BALANCE.form.window), past = work.slice(-BALANCE.form.normDays);
  const plan = !!firstDay && today < addDays(firstDay, BALANCE.form.planDays);
  const planXp = fill(0), lastRestore: Partial<Record<Stat, ISODate>> = {};
  if (plan) for (const c of work) for (const q of issued.get(c.date) ?? []) if (!q.dropped)
    for (const [k, v] of Object.entries(splitXp(q.xp, q.skills).stats)) planXp[k as Stat] += v ?? 0;
  for (const [d, qs] of issued) if (d <= today) for (const q of qs) if (q.kind === 'restore' && !(lastRestore[q.stat]! >= d)) lastRestore[q.stat] = d;
  const xpOn = (cs: typeof closed, k: Stat) => cs.reduce((a, c) => a + (statByDate.get(c.date)?.[k] ?? 0), 0);
  const statInfo = Object.fromEntries(STAT_KEYS.map(k => {
    const b = baseFromXp(start.base[k], statXp[k]);
    const avg = plan ? (work.length ? planXp[k] / work.length : 0) : past.length ? xpOn(past, k) / past.length : 0;
    const norm = formNorm(avg), xp14 = xpOn(win, k), form = formOf(xp14, win.length, norm);
    return [k, { base: b.value, into: b.into, need: b.need, xp: statXp[k], form, status: formStatus(form), norm, xp14, lastRestore: lastRestore[k] ?? null } satisfies StatInfo];
  })) as Record<Stat, StatInfo>;
  const st = dayStart.get(today);
  const energy = !st ? null : st.energy !== null ? st.energy * 10
    : lastEnergy !== null ? Math.min(100, Math.max(0, lastEnergy * 10)) : BALANCE.energy.fallback;
  const skills = Object.fromEntries(SKILL_IDS.map(id => [id,
    { ...skillFromXp(start.skills[id], skillXp[id]), xp: skillXp[id], start: start.skills[id], lastDate: skillLast[id] ?? null } satisfies SkillState])) as Record<SkillId, SkillState>;
  const rewards = [...shop.values()].filter(r => !r.deleted).map(({ id, title, price, effect }) => ({ id, title, price, effect }));
  const rerollsUsed = rerollsOn.get(today) ?? 0;
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
      date: today, started: !!st, work: st?.work ?? null, wakeAt: st?.wakeAt ?? null,
      closesAt: closesAtTs(today, closeOf(today)), dayType: types.get(today) ?? null, energy, changed: !!st && dayChange.has(today),
      restDaysLeft: Math.max(0, BALANCE.streak.restDaysPerMonth - (restInMonth.get(today.slice(0, 7)) ?? 0)),
      // то же правило, что у платных трат: золото прошлых дней − все обычные покупки − принятые платные траты
      spendable: Math.max(0, ledger.reduce((a, r) => a + (r.date < today ? r.gold : 0), 0) - ordinaryBuys.reduce((a, b) => a + b.r.price, 0) - paidSum),
      freezesLeft: Math.max(0, BALANCE.shop.freezePerMonth - (freezeMonth.get(today.slice(0, 7)) ?? 0)), dayOff: dayOff.has(today),
      rerollsUsed, nextRerollCost: rerollsUsed >= BALANCE.reroll.free ? BALANCE.reroll.cost : 0, customCount: customs.get(today)?.length ?? 0,
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
    dayTypes, ledger, history, achievements: achs, title, statHistory, metricHistory,
    genInputs: {
      bestSteps7: best7(metrics, today, 'steps'),
      lastSleepHours: sleepDate ? metrics.get(sleepDate)!.sleepHours! : null,
      recentTemplateIds: [addDays(today, -2), addDays(today, -1)].flatMap(d => issued.get(d)?.map(q => q.templateId) ?? []),
      recent: [addDays(today, -2), addDays(today, -1)].filter(d => issued.get(d)?.length)
        .map(date => { const qs = issued.get(date)!; return { date, stats: [...new Set(qs.map(q => q.stat))], templateIds: qs.map(q => q.templateId) }; }),
    },
  };
}
