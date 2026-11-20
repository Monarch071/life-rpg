import { ACHIEVEMENTS, earnAchievements, type Delta } from './achievements';
import { BALANCE, RANKS, type RewardEffect } from './balance';
import { seasonOf, THEMES, themeBonusApplies, type ThemeId } from './calendar';
import { addDays, gameDate, weekStart } from './day';
import { closeMinutes, closesAtTs, DEFAULT_DAY_TYPES, gameDateAt, isHM, legacyDayType, validDayType, type DayType } from './dayType';
import { adjustMultipliers } from './difficulty';
import { cleanAnswers, validAnalysis } from './interview';
import { ladderAfterWindow, requiredIn, ritualXp, step5Relapse, validLadderSteps } from './ladder';
import { AUTO_METRIC_INFO, METRIC_INFO } from './metricInfo';
import { baseFromXp, fatiguePenalty, formNorm, formOf, formStatus, goldFor, questReward, rankCap, skillFromXp, streakBonus } from './progression';
import { DEFAULT_SKILL_BY_STAT, LEGACY_SKILL_BY_TEMPLATE, legacyRank } from './questBank';
import { isSkillId, primaryStat, SKILL_IDS, splitXp, type SkillId } from './skillCatalog';
import { bossOptionsByRules, partHp, partWindows, validBossDraft, validChainSteps } from './boss';
import { banished, battleOutcome, facetDay, isSerious, lastSunday, masterPlan } from './shadow';
import { startProfile } from './startProfile';
import { dayOutcome, nextStreak } from './streak';
import { CLASSES, classWeights, passivePower, pickClass, questBonuses, TRAINING } from './classes';
import { flatPerks, isRusty, mainSkillPerks, PERKS, perkPower, skillForm } from './perks';
import { avgPrev, chestPick, leagueAfter, leagueTier, softReset, weekRank } from './rivalry';
import { stepRewards, stepXpFor } from './seasonPath';
import { cosmeticById, trophyItemId } from './cosmetics';
import { isStat, STATS, tierFor } from './stats';
import { budgetVerdict, DEFAULT_CATEGORIES, limitFor, matchRule, normText, otherOf, periodTotals, validAmount, weekLimit } from './finance';
import { matchWallet } from './csvImport';
import { cleanText } from './text';
import type { Analysis, Answers, BossDraft, AutoMetric, ClassId, ClassState, PerkView, FacetKind, AvatarParams, LadderKind, LadderStep, Boss, DayData, DayQuest, DayResult, GameEvent, GameState, HealthData, HHMM, ISODate, LedgerEntry, Metric, Profile, Quest, QuestKind, Rank, SkillState, Stat, StatInfo, Vitals, FinKind, FinPeriod, ImportRow, WeeklyQuest, WeekResult, WeekScore } from './types';
import { weakestStat } from './weekly';
import { energyScore, fatigueNext, focusScore, hpScore, intFocusMult, sessionMinutes, unionMinutes, workoutKind } from './vitals';
import { levelFromXp } from './xp';

export const DEFAULT_AVATAR: AvatarParams = { hair: 'short', hairColor: '#2b1d14', outfitColor: '#4f46e5', eyes: 'round' };

const STAT_KEYS = Object.keys(STATS) as Stat[];
const ABILITY_IDS: readonly string[] = Object.values(CLASSES).map(c => c.ability);
const SLOTS: readonly string[] = ['head', 'neck', 'cloak', 'emblem', 'background', 'frame', 'look'];
const fill = (n: number) => Object.fromEntries(STAT_KEYS.map(s => [s, n])) as Record<Stat, number>;
const WEEKLY_KINDS = ['active_days', 'stat_quests', 'steps_total', 'shadow_wins', 'budget_week'];
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
const QUEST_KINDS: readonly string[] = ['daily', 'challenge', 'restore', 'custom', 'boss', 'chain'];
const ID = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64;
/** Связь шага с боссом/цепочкой (граница доверия): вид совпадает с видом задания, иначе null. */
function linkOf(a: any, kind: unknown): Quest['link'] | null {
  if (!a || typeof a !== 'object' || a.kind !== kind || !Number.isInteger(a.step) || a.step < 0 || a.step >= (a.kind === 'boss' ? BALANCE.boss : BALANCE.chain).stepsMax) return null;
  if (a.kind === 'boss') return ID(a.season) && [0, 1, 2].includes(a.part) ? { kind: 'boss', season: a.season, part: a.part, step: a.step } : null;
  return ID(a.chainId) ? { kind: 'chain', chainId: a.chainId, step: a.step } : null;
}
const FACET_KINDS: readonly string[] = ['games', 'social', 'late', 'junk', 'smoke', 'procr', 'alcohol', 'custom'];
const FB = BALANCE.finance, FIN_KINDS: readonly string[] = ['expense', 'income', 'saving'];
const FIN_PREFIX = /^(wallet|import|legacy):/;   // id ручной записи не совпадает с id Wallet/импорта/старых трат
/** Запись финансов до правок; cat null — категория по правилам магазинов. */
type FinRaw = { id: string; ts: number; date: ISODate; kind: FinKind; amount: number; cat: string | null; text: string;
  source: GameState['finance']['entries'][number]['source']; keyDup?: boolean };
type FinEntry = GameState['finance']['entries'][number] & { ts: number };
type FinCat = GameState['finance']['categories'][number];
const lastDayOf = (m: string): ISODate => addDays(`${addDays(`${m}-28`, 4).slice(0, 7)}-01`, -1);
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
  // шаг босса/цепочки без валидной связи — обычное задание
  const link = r.kind === 'boss' || r.kind === 'chain' ? linkOf(r.link, r.kind) : null;
  const kind: QuestKind = QUEST_KINDS.includes(r.kind) && (link || (r.kind !== 'boss' && r.kind !== 'chain')) ? r.kind : 'daily';
  const auto: Quest['auto'] = a && typeof a === 'object' && Object.hasOwn(AUTO_METRIC_INFO, a.metric) && (a.op === '>=' || a.op === '<=') && Number.isFinite(a.value)
    ? { metric: a.metric, op: a.op, value: a.value } : null;
  return {
    id: r.id, date, title: r.title, stat: primaryStat(skills),
    ...(legacy && [1, 2, 3, 4, 5].includes(r.difficulty) ? { difficulty: r.difficulty } : {}),
    minutes: Number.isFinite(r.minutes) ? r.minutes : 0,
    window: w && typeof w === 'object' && typeof w.start === 'string' && typeof w.end === 'string' ? { start: w.start, end: w.end } : null,
    xp: clampXp(r.xp), auto, templateId: typeof r.templateId === 'string' ? r.templateId : '',
    rank, skills, kind, ...(link ? { link } : {}),
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

/** Шаги дня выше plausible.stepsMax (Команды или вручную) — как отсутствие данных. */
const plausibleSteps = (v: number | undefined) => (v !== undefined && v <= BALANCE.plausible.stepsMax ? v : undefined);

/** Лучшее (максимум или минимум при lower) среднее по 7‑дневным окнам за 28 дней до сегодня; окно считается при ≥3 значениях, иначе null. */
function best7(metrics: Map<ISODate, Partial<Record<Metric, number>>>, today: ISODate, metric: Metric, lower = false): number | null {
  const vals = Array.from({ length: 28 }, (_, i) => { const v = metrics.get(addDays(today, i - 28))?.[metric]; return metric === 'steps' ? plausibleSteps(v) : v; });
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

const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const MIN_MS = 60_000;
type Workout = { type: string; start?: number; end?: number; minutes: number };
/** Тренировка из пакета (граница доверия): тип-строка, минуты 0–сутки или из end − start; иначе null. */
function workoutOf(x: unknown): Workout | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || typeof o.type !== 'string') return null;
  const start = fin(o.start) ? o.start : undefined, end = start !== undefined && fin(o.end) && o.end > start ? o.end : undefined;
  const minutes = fin(o.minutes) ? o.minutes : end !== undefined ? (end - start!) / MIN_MS : NaN;
  if (!(minutes >= 0 && minutes <= BALANCE.day.minutesPerDay)) return null;
  return { type: o.type.slice(0, 60), start, end, minutes };
}
/** Минуты тренировок дня по видам; overlap — два интервала пересекаются. */
function workoutStats(ws: Workout[]): { mins: Partial<Record<AutoMetric, number>>; overlap: boolean } {
  const mins: Partial<Record<AutoMetric, number>> = {};
  for (const w of ws) {
    mins.workoutMin = (mins.workoutMin ?? 0) + w.minutes;
    const k = workoutKind(w.type);
    if (k !== 'other') mins[`${k}Min`] = (mins[`${k}Min`] ?? 0) + w.minutes;
  }
  const iv = ws.filter(w => w.end !== undefined).sort((a, b) => a.start! - b.start!);
  let overlap = false, maxEnd = -Infinity;
  for (const w of iv) { if (w.start! < maxEnd) overlap = true; maxEnd = Math.max(maxEnd, w.end!); }
  return { mins, overlap };
}
const PLACES: readonly string[] = ['gym', 'work', 'home'], APPS = ['social', 'games'] as const;
type SigBody = { kind: 'arrive'; place: string } | { kind: 'app'; app: string; state: 'open' | 'close' } | { kind: 'focus'; state: 'on' | 'off' } | { kind: 'wallet'; amount: number };
type Sig = { at: number; ts: number; d: ISODate } & SigBody;
/** Сигнал (граница доверия) без названия магазина; ключ дедупликации — с ним. */
function signalOf(x: unknown): { s: SigBody; key: string; merchant: string } | null {
  const o = x as Record<string, any> | null;
  if (!o || typeof o !== 'object') return null;
  const s: SigBody | null = o.kind === 'arrive' && PLACES.includes(o.place) ? { kind: 'arrive', place: o.place }
    : o.kind === 'app' && (APPS as readonly string[]).includes(o.app) && (o.state === 'open' || o.state === 'close') ? { kind: 'app', app: o.app, state: o.state }
    : o.kind === 'focus' && (o.state === 'on' || o.state === 'off') ? { kind: 'focus', state: o.state }
    : o.kind === 'wallet' && fin(o.amount) ? { kind: 'wallet', amount: o.amount } : null;
  const merchant = s?.kind === 'wallet' && typeof o.merchant === 'string' ? o.merchant : '';   // только во внутренний финансовый вход, не в DayData
  return s && { s, key: JSON.stringify([s, merchant]), merchant };
}

/** Строка леджера без навыка (босс, недельное): 100% в характеристику, если она есть. */
const flatRow = (id: string, ts: number, date: ISODate, source: LedgerEntry['source'], xp: number, stat: Stat | null): LedgerEntry =>
  ({ id, ts, date, source, base: xp, k: 1, bonus: 0, penalty: 0, mult: 1, xp, gold: goldFor(xp), skills: [], stats: stat ? { [stat]: xp } : {}, verified: false });

export function replay(events: GameEvent[], now: number): GameState {
  const evs = normalize(events);
  // Проход 1: старт/смена дня и отбой профиля → закрытие каждого дня → игровые даты.
  let sleep: HHMM | null = null; // отбой последнего валидного профиля — для синтеза типа старых day_started
  for (const e of evs) if (e.type === 'onboarding_completed' && validProfile(e.profile)) sleep = isHM(e.profile.sleep) ? e.profile.sleep : null;
  const dayStart = new Map<ISODate, { ts: number; work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM; dayType: DayType | null; energy: number | null }>();
  const dayChange = new Map<ISODate, { type: DayType; ts: number }>();
  let dayTypes: DayType[] = DEFAULT_DAY_TYPES;
  // Тип дня: последний принятый day_changed, иначе day_started (старый — синтез).
  const typeNow = (d: ISODate): DayType | null => {
    const st = dayStart.get(d);
    return st ? dayChange.get(d)?.type ?? st.dayType ?? legacyDayType(st.work, st.wakeAt, sleep) : null;
  };
  for (const e of evs) {
    if (e.type === 'day_started') {
      // побеждает первый; старт задним числом для дня, уже закрытого по своему типу (без типа — по 04:00), отбрасывается
      if (!isDate(e.date) || dayStart.has(e.date) || !isHM(e.wakeAt) || !nearTs(e.date, e.ts) || e.ts >= closesAtTs(e.date, closeMinutes(validDayType(e.dayType)))) continue;
      const w = e.work as { start?: unknown; end?: unknown } | null;
      dayStart.set(e.date, { ts: e.ts, work: w && typeof w === 'object' && isHM(w.start) && isHM(w.end) ? { start: w.start, end: w.end } : null, wakeAt: e.wakeAt,
        dayType: validDayType(e.dayType), energy: Number.isInteger(e.energy) && e.energy! >= 1 && e.energy! <= 10 ? e.energy! : null });
    } else if (e.type === 'day_changed') {
      // только после старта и до закрытия дня и по типу до смены, и по новому (события идут по ts) — иначе устаревшее устройство
      // или смена задним числом закрыла бы день раньше уже принятых событий
      const t = validDayType(e.dayType), cur = isDate(e.date) ? typeNow(e.date) : null;
      if (t && isHM(e.at) && cur && e.ts < closesAtTs(e.date, Math.min(closeMinutes(cur), closeMinutes(t))))
        dayChange.set(e.date, { type: t, ts: dayChange.get(e.date)?.ts ?? e.ts }); // тип — последний, ts строки XP — первый
    } else if (e.type === 'day_types_set' && Array.isArray(e.types)) {
      const ts = e.types.map(validDayType).filter((t): t is DayType => !!t);
      dayTypes = ts.length ? ts : DEFAULT_DAY_TYPES; // последний по ts
    }
  }
  // Тип дня: последний day_changed, иначе day_started (старый — синтез); смена без старта не действует.
  const types = new Map<ISODate, DayType>();
  for (const d of dayStart.keys()) types.set(d, typeNow(d)!);
  /** Не начатый день, чей следующий уже начат, закрывается в момент того старта (не раньше полуночи, не позже 04:00): события до старта остаются в нём. */
  const closeOf = (d: ISODate) => {
    const t = types.get(d), next = t ? undefined : dayStart.get(addDays(d, 1));
    if (!next) return closeMinutes(t ?? null);
    const cal = gameDate(next.ts, 0), at = new Date(next.ts);
    return cal < addDays(d, 1) ? 0 : cal > addDays(d, 1) ? BALANCE.day.closeDefaultMin : Math.min(BALANCE.day.closeDefaultMin, at.getHours() * 60 + at.getMinutes());
  };
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
  const reports = new Map<ISODate, { text: string; final: boolean }>();
  const bossEvents: Extract<GameEvent, { type: 'boss_created' | 'boss_stage_done' | 'boss_abandoned' }>[] = [];
  const shopEvents: Extract<GameEvent, { type: 'reward_created' | 'reward_deleted' | 'reward_purchased' | 'cosmetic_bought' }>[] = [];
  const equips: Extract<GameEvent, { type: 'cosmetic_equipped' }>[] = [];
  const days = new Map<ISODate, Delta>(); // счётчики достижений по игровым датам
  const dayOf = (d: ISODate) => { const x = days.get(d) ?? {}; days.set(d, x); return x; };
  const bump = (d: ISODate, k: Exclude<keyof Delta, 'steps' | 'streak'>, n = 1) => { const x = dayOf(d); x[k] = (x[k] ?? 0) + n; };
  const checkinDates = new Set<ISODate>();
  const checkins = new Map<ISODate, { ts: number; energy: number }[]>(); // вечерняя энергия — самочувствие HP и Усталость
  // Платные траты (переброс, покупка с эффектом) принимаются в цикле дней по золоту прошлых дней.
  type ShopItem = { id: string; title: string; price: number; effect: RewardEffect | null; deleted: boolean; cosmetic?: boolean };
  // способности (кроме «Прозрения») — в той же очереди по ts: «Сделка» освобождает следующие перебросы, «Рывок» видит замену
  type Spend = { id: string; ts: number; date: ISODate } & ({ orig: string; repl: DayQuest; insight?: boolean } | { reward: ShopItem }
    | { ab: Extract<GameEvent, { type: 'ability_used' }> });
  const spends: Spend[] = [];
  /** Замена задания (переброс, «Прозрение»): только невыполненное daily/challenge этой даты; тот же ранг, другой шаблон. Принятие — в цикле дней. */
  const swapOf = (questId: unknown, raw: unknown, date: ISODate): { orig: string; repl: DayQuest } | null => {
    const q0 = typeof questId === 'string' ? questById.get(questId) : undefined, r = normQuest(raw, date);
    if (!q0 || !r || r.legacy || q0.date !== date || q0.done || questById.has(r.id) || r.rank !== q0.rank
      || r.templateId === q0.templateId || [q0.kind, r.kind].some(k => k !== 'daily' && k !== 'challenge')) return null;
    questById.set(r.id, r);   // повтор уже заменённого — отказ в цикле дней (исходного нет в списке дня)
    return { orig: q0.id, repl: r };
  };
  const customs = new Map<ISODate, DayQuest[]>();
  // Авто-источники: здоровье по датам пакета; hi/lo — max/min незафлаженных значений по каждому пакету (засчёт монотонен).
  type Acc = { steps?: number; sleep?: number; rhr?: number; weight?: number; mindful?: number; legacyW?: number;
    w: Map<string, Workout>; hi: Partial<Record<AutoMetric, number>>; lo: Partial<Record<AutoMetric, number>>;
    t: { hi: Partial<Record<AutoMetric, number>>; lo: Partial<Record<AutoMetric, number>> }; // только пакеты до закрытия дня (лестницы)
    pk: { ts: number; sleep?: number; steps?: number; rhr?: number; mindful?: number }[] }; // pk — пакеты с ts: параметры закрытого дня
  const health = new Map<ISODate, Acc>();
  const sigs: Sig[] = [], sigKeys = new Set<string>();
  // Интервалы фокуса/чтения: ts — событие, которое интервал завершило (off или таймер). Только добавляются — минуты не убывают.
  const ivList: { k: 'focusMin' | 'readMin'; start: number; end: number; ts: number }[] = [];
  let pendingOn: number | null = null; // последний on «Фокусирования», ещё не закрытый принятым off
  const sync: GameState['sync'] = { last: null, bySource: {} };
  const seen = (k: keyof GameState['sync']['bySource'], t: number) => { sync.bySource[k] = Math.max(sync.bySource[k] ?? -Infinity, t); };
  // Режим восстановления: recOn — активный (с даты since), recSpans — завершённые [from, to) с хотя бы одним днём.
  let recOn: { since: ISODate; quests: 0 | 1 | 2 } | null = null;
  const recSpans: { from: ISODate; to: ISODate }[] = [];
  // Лестницы привычек (спека §3): status 'new' — ещё не дошли до даты создания в цикле дней, 'gone' — удалена.
  type Lad = { id: string; title: string; kind: LadderKind; skill: SkillId; suitable: 'all' | 'workdays'; facetId: string | null; steps: LadderStep[];
    created: ISODate; createdTs: number; removed: ISODate | null; upd: { date: ISODate; steps: LadderStep[] }[]; rit: Map<ISODate, number>;
    status: 'new' | 'active' | 'queued' | 'auto' | 'gone'; step: number; attempt: 1 | 2; windowStart: ISODate | null;
    win: boolean[]; done: number; ask: boolean; askFrom: ISODate; weekRates: number[]; mastered: boolean };
  const lads = new Map<string, Lad>();
  // Враг-тень (спека §4): грани принимаются (лимит) и снимаются в цикле дней — операции по игровой дате в порядке событий.
  const S = BALANCE.shadow;
  type Facet = { id: string; name: string; kind: FacetKind; added: ISODate; strength: number; cleanRun: number; banished: boolean; status: 'new' | 'on' | 'gone' };
  const facetMap = new Map<string, Facet>(), facetOps = new Map<ISODate, { f: Facet; add: boolean; ts: number }[]>();
  const facetOp = (d: ISODate, f: Facet, add: boolean, ts: number) => facetOps.set(d, [...(facetOps.get(d) ?? []), { f, add, ts }]);
  const relapseAt = new Map<string, number>(); // `${facetId}|${date}` → ts первой честной отметки
  // Сезонный босс и цепочка (спека §5, §6): выбор/сдача/старт принимаются в цикле дней — «активен ли» зависит от побед по датам.
  type GameOp = { ts: number } & ({ k: 'boss'; seasonId: string; draft: BossDraft } | { k: 'boss_off'; seasonId: string }
    | { k: 'chain'; id: string; title: string; skill: SkillId; steps: string[] } | { k: 'chain_off'; id: string });
  const gameOps = new Map<ISODate, GameOp[]>();
  // Финансы (спека §7): события по ts; записи, правки, правила и лимиты — срезом по ts в отдельном проходе.
  const finRaw: FinRaw[] = [], finIds = new Set<string>(), finCatIds = new Set<string>(), finRuleIds = new Set<string>();
  const finCats: (FinCat & { ts: number; month: string })[] = [], finRules: { ts: number; id: string; pattern: string; categoryId: string | null }[] = [];
  const finEdits: { ts: number; id: string; cat?: string; amount?: number; date?: ISODate; removed?: boolean }[] = [];
  const finImports = new Map<string, { ts: number; rows: ImportRow[] }>(), finRemoved = new Map<string, number>();
  const gameOp = (ts: number, op: GameOp) => { const d = gd(ts); if (d >= MIN_ISSUE_DATE) gameOps.set(d, [...(gameOps.get(d) ?? []), op]); };

  for (const e of evs) {
    if (e.deviceId === 'shortcuts') sync.last = e.ts; // события по возрастанию ts
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
        // до закрытия своего дня (по его типу)
        if (q && !q.done && e.ts < closesAtTs(q.date, closeOf(q.date)) && q.date <= gameDate(e.ts, 0)) {
          q.done = true; completedAt.set(q.id, e.ts);
          if (e.verify === 'photo' && typeof e.photo === 'string' && BLOB.test(e.photo)) photoOk.add(q.id);
        }
        break;
      }
      case 'quest_rerolled': {
        const sw = isDate(e.date) && e.date === gd(e.ts) ? swapOf(e.questId, e.replacement, e.date) : null;
        if (sw) spends.push({ id: e.id, ts: e.ts, date: e.date, ...sw });
        break;
      }
      case 'ability_used': {
        // граница доверия: дата — игровая дата ts, не раньше выхода «Глубины»; класс, неделя и цель — в цикле дней (класс по датам)
        if (!isDate(e.date) || e.date !== gd(e.ts) || e.date < BALANCE.depthSince || e.date > today || !ABILITY_IDS.includes(e.ability)) break;
        if (e.ability !== 'insight') { spends.push({ id: e.id, ts: e.ts, date: e.date, ab: e }); break; }
        // «Прозрение» — переброс без цены и вне счёта перебросов дня
        const sw = swapOf(e.questId, e.replacement, e.date);
        if (sw) spends.push({ id: e.id, ts: e.ts, date: e.date, ...sw, insight: true });
        break;
      }
      case 'custom_quest_added': {
        const c = isDate(e.date) && e.date >= MIN_ISSUE_DATE && e.date === gd(e.ts) ? normQuest(e.quest, e.date) : null;
        const list = c ? customs.get(c.date) ?? [] : [];
        if (!c || c.legacy || questById.has(c.id) || list.length >= BALANCE.custom.perDay) break; // третье за день — игнор
        c.kind = 'custom'; delete c.link; list.push(c); customs.set(c.date, list); questById.set(c.id, c);
        if (!issuedTs.has(c.date)) issuedTs.set(c.date, e.ts);
        break;
      }
      case 'metric_logged': {
        if (!isDate(e.date) || !Object.hasOwn(METRIC_INFO, e.metric) || typeof e.value !== 'number' || !Number.isFinite(e.value)) break;
        const m = metrics.get(e.date) ?? {};
        const lim = BALANCE.metricAbsMax;
        m[e.metric] = e.mode === 'add' ? Math.min(lim, Math.max(-lim, (m[e.metric] ?? 0) + e.value)) : e.value;
        metrics.set(e.date, m);
        const amount = e.metric === 'spend' && e.mode === 'add' ? validAmount(e.value) : null;   // старые траты — записи «Прочее»
        if (amount !== null) finRaw.push({ id: `legacy:${e.id}`, ts: e.ts, date: e.date, kind: 'expense', amount, cat: 'default:other', text: '', source: 'legacy' });
        break;
      }
      case 'health_packet': {
        if (!isDate(e.date)) break;
        const h = (e.health ?? {}) as HealthData;
        const m = metrics.get(e.date) ?? {};
        const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0; // отрицательное — как отсутствие
        if (ok(h.steps)) m.steps = Math.max(m.steps ?? -Infinity, h.steps);
        if (ok(h.workoutMin)) m.workoutMin = Math.max(m.workoutMin ?? -Infinity, h.workoutMin);
        if (ok(h.sleepHours)) m.sleepHours = h.sleepHours;
        if (ok(h.weightKg)) m.weightKg = h.weightKg;
        const a: Acc = health.get(e.date) ?? { w: new Map(), hi: {}, lo: {}, t: { hi: {}, lo: {} }, pk: [] };
        const timely = e.date >= today || e.ts < closesAtTs(e.date, closeOf(e.date));
        health.set(e.date, a); seen('health', e.ts);
        const v = (x: unknown) => (ok(x) ? x : undefined);
        a.pk.push({ ts: e.ts, sleep: v(h.sleepHours), steps: v(h.steps), rhr: v(h.restingHR), mindful: v(h.mindfulMin) });
        const up = (k: AutoMetric, v: number) => {
          a.hi[k] = Math.max(a.hi[k] ?? -Infinity, v); a.lo[k] = Math.min(a.lo[k] ?? Infinity, v);
          if (timely) { a.t.hi[k] = Math.max(a.t.hi[k] ?? -Infinity, v); a.t.lo[k] = Math.min(a.t.lo[k] ?? Infinity, v); }
        };
        const P = BALANCE.plausible;
        if (ok(h.steps)) { a.steps = Math.max(a.steps ?? -Infinity, h.steps); if (h.steps <= P.stepsMax) up('steps', h.steps); }
        if (ok(h.sleepHours)) { a.sleep = h.sleepHours; if (h.sleepHours <= P.sleepMaxH) up('sleepHours', h.sleepHours); }
        if (ok(h.weightKg)) { a.weight = h.weightKg; up('weightKg', h.weightKg); }
        if (ok(h.restingHR)) a.rhr = h.restingHR;
        if (ok(h.mindfulMin)) { a.mindful = Math.max(a.mindful ?? -Infinity, h.mindfulMin); up('mindfulMin', h.mindfulMin); }
        if (ok(h.workoutMin)) { a.legacyW = Math.max(a.legacyW ?? -Infinity, h.workoutMin); if (!Array.isArray(h.workouts)) up('workoutMin', h.workoutMin); } // при списке — только его (проверка пересечений)
        if (Array.isArray(h.workouts) && h.workouts.length) {
          // одна тренировка в нескольких пакетах — один раз (ключ start|end|type, без start — type|minutes)
          for (const x of h.workouts) { const w = workoutOf(x); if (w) a.w.set(w.start !== undefined ? `${w.start}|${w.end}|${w.type}` : `${w.type}|${w.minutes}`, w); }
          const ws = workoutStats([...a.w.values()]);
          if (!ws.overlap) for (const [k, v] of Object.entries(ws.mins) as [AutoMetric, number][]) up(k, v);
          if (ws.mins.workoutMin !== undefined) m.workoutMin = Math.max(m.workoutMin ?? -Infinity, ws.mins.workoutMin);
        }
        metrics.set(e.date, m);
        lastHealth = { ts: e.ts, date: e.date,
          health: Object.fromEntries(Object.entries(typeof h === 'object' ? h : {}).filter(([, v]) => ok(v))) as HealthData };
        if (e.date === today) calendar = calendarOf(e.calendar, today);
        break;
      }
      case 'signal_logged': {
        const x = fin(e.at) ? signalOf(e.signal) : null, d = x ? gd(e.at) : '';
        if (!x || !isDate(d) || sigKeys.has(`${e.at}|${x.key}`)) break; // повтор от «Команд» — один сигнал
        sigKeys.add(`${e.at}|${x.key}`); sigs.push({ ...x.s, at: e.at, ts: e.ts, d }); seen(x.s.kind, e.at);
        const wa = x.s.kind === 'wallet' ? validAmount(x.s.amount) : null;   // > 0 — трата, < 0 — возврат
        if (wa !== null) finRaw.push({ id: `wallet:${e.id}`, ts: e.ts, date: d, kind: 'expense', amount: wa, cat: null, text: cleanText(x.merchant, FB.textMax) ?? '', source: 'wallet' });
        // ждёт только последний on (потерянный off не раздувает минуты); его закрывает первый пришедший (по ts) off позже него;
        // запоздавший off с ранним at уже закрытый интервал не укорачивает
        if (x.s.kind === 'focus' && x.s.state === 'on') pendingOn = Math.max(pendingOn ?? -Infinity, e.at);
        else if (x.s.kind === 'focus' && pendingOn !== null && pendingOn < e.at) {
          ivList.push({ k: 'focusMin', start: pendingOn, end: e.at, ts: e.ts }); pendingOn = null;
        }
        break;
      }
      case 'timer_logged': {
        const T = BALANCE.timer;
        if ((e.timer !== 'focus' && e.timer !== 'reading') || !fin(e.start) || !fin(e.end) || e.end <= e.start
          || e.end - e.start > T.maxMin * MIN_MS || e.end > e.ts + T.skewMin * MIN_MS || !isDate(gd(e.start))) break;
        ivList.push({ k: e.timer === 'focus' ? 'focusMin' : 'readMin', start: e.start, end: e.end, ts: e.ts }); seen('timer', e.ts);
        break;
      }
      case 'recovery_started': case 'recovery_ended': {
        // только на игровую дату самого события: задним числом закрытые дни не меняются, будущее — игнор
        if (!isDate(e.date) || e.date !== gd(e.ts) || e.date > today) break;
        if (e.type === 'recovery_started') {
          if (e.quests !== 0 && e.quests !== 1 && e.quests !== 2) break;
          if (recOn) recOn.quests = e.quests; else recOn = { since: e.date, quests: e.quests }; // повторный старт меняет только quests
        } else if (recOn) { // конец без начала — игнор; день выхода — обычный
          if (e.date > recOn.since) recSpans.push({ from: recOn.since, to: e.date });
          recOn = null;
        }
        break;
      }
      case 'ladder_created': {
        const title = cleanText(e.title, 40), steps = validLadderSteps(e.steps), d = gd(e.ts);
        // первый с данным id побеждает; дата создания раньше MIN_ISSUE_DATE — мусор (плотный цикл дней)
        if (typeof e.ladderId !== 'string' || lads.has(e.ladderId) || !title || (e.kind !== 'do' && e.kind !== 'dont') || !isSkillId(e.skill) || !steps || d < MIN_ISSUE_DATE) break;
        lads.set(e.ladderId, { id: e.ladderId, title, kind: e.kind, skill: e.skill, suitable: e.suitable === 'workdays' ? 'workdays' : 'all',
          facetId: typeof e.facetId === 'string' && e.facetId.length <= 64 ? e.facetId : null, steps, created: d, createdTs: e.ts, removed: null, upd: [], rit: new Map(),
          status: 'new', step: 1, attempt: 1, windowStart: null, win: [], done: 0, ask: false, askFrom: d, weekRates: [], mastered: false });
        break;
      }
      case 'ladder_updated': {
        const l = lads.get(e.ladderId);
        if (!l || l.removed) break;
        const title = cleanText(e.title, 40), steps = e.steps === undefined ? null : validLadderSteps(e.steps);
        if (title) l.title = title; // название — сразу; ступени — со следующего окна
        if (steps) l.upd.push({ date: gd(e.ts), steps });
        break;
      }
      case 'ladder_removed': { const l = lads.get(e.ladderId); if (l && !l.removed) l.removed = gd(e.ts); break; }
      case 'ritual_done': {
        // только за сегодня (до закрытия), один раз на лестницу в дату; активность лестницы — в цикле дней
        const l = lads.get(e.ladderId);
        if (l && isDate(e.date) && e.date === gd(e.ts) && !l.rit.has(e.date)) l.rit.set(e.date, e.ts);
        break;
      }
      case 'facet_added': {
        const name = cleanText(e.name, 40), d = gd(e.ts);
        // частота — из стартовой силы; серьёзная зависимость — карточка безопасности, не грань (решение контролёра)
        const freq = (['daily', 'often', 'sometimes', 'rare'] as const).find(k => e.start >= S.start[k]);
        if (typeof e.facetId !== 'string' || e.facetId.length > 64 || facetMap.has(e.facetId) || !name || !FACET_KINDS.includes(e.kind)
          || !Number.isInteger(e.start) || e.start < S.startMin || e.start > S.startMax || d < MIN_ISSUE_DATE || isSerious(name, e.kind, null, freq)) break;
        const f: Facet = { id: e.facetId, name, kind: e.kind, added: d, strength: e.start, cleanRun: 0, banished: false, status: 'new' };
        facetMap.set(f.id, f); facetOp(d, f, true, e.ts);
        break;
      }
      case 'facet_removed': { const f = facetMap.get(e.facetId); if (f) facetOp(gd(e.ts), f, false, e.ts); break; }
      case 'shadow_relapse': {
        // только за сегодня (поздняя отметка за закрытый день — игнор); повтор в ту же дату — та же отметка
        const k = `${e.facetId}|${e.date}`;
        if (facetMap.has(e.facetId) && isDate(e.date) && e.date === gd(e.ts) && !relapseAt.has(k)) relapseAt.set(k, e.ts);
        break;
      }
      case 'season_boss_set': case 'season_boss_abandoned': {
        // сезон — игровой даты события, не Пролог
        const sn = seasonOf(gd(e.ts)), draft = e.type === 'season_boss_set' ? validBossDraft(e.boss) : null;
        if (sn.kind === 'prologue' || e.seasonId !== sn.id) break;
        if (draft) gameOp(e.ts, { ts: e.ts, k: 'boss', seasonId: sn.id, draft });
        else if (e.type === 'season_boss_abandoned') gameOp(e.ts, { ts: e.ts, k: 'boss_off', seasonId: sn.id });
        break;
      }
      case 'chain_started': {
        const title = cleanText(e.title, 60), steps = validChainSteps(e.steps);
        if (ID(e.chainId) && title && isSkillId(e.skill) && steps) gameOp(e.ts, { ts: e.ts, k: 'chain', id: e.chainId, title, skill: e.skill, steps });
        break;
      }
      case 'chain_abandoned': if (ID(e.chainId)) gameOp(e.ts, { ts: e.ts, k: 'chain_off', id: e.chainId }); break;
      case 'busy_until': if (e.date === today && isHM(e.until)) busyUntil = e.until; break;
      case 'checkin': {
        if (!isDate(e.date)) break;
        if (e.date === today) checkedIn = true;
        const en = Number.isInteger(e.energy) && e.energy >= 1 && e.energy <= 10; // как day_started
        if (en) checkins.set(e.date, [...(checkins.get(e.date) ?? []), { ts: e.ts, energy: e.energy }]);
        if (e.date <= today) { if (en) lastEnergy = e.energy; if (!checkinDates.has(e.date)) { checkinDates.add(e.date); bump(e.date, 'checkins'); } }
        break;
      }
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
        const final = e.final === true;
        if (reports.get(e.weekStart)?.final && !final) break; // финальный не затираем предварительным
        reports.set(e.weekStart, { text: e.text.slice(0, 4000), final }); // иначе последний по ts
        break;
      }
      case 'fin_category_set': {
        const def = DEFAULT_CATEGORIES.find(c => c.id === e.categoryId), title = cleanText(e.title, FB.titleMax), limit = e.limit === null ? null : validAmount(e.limit);
        if (!ID(e.categoryId) || !title || !FIN_KINDS.includes(e.kind) || (def ? def.kind !== e.kind : e.categoryId.startsWith('default:'))
          || (e.limit !== null && (limit === null || limit < 0))) break;
        if (!def && !finCatIds.has(e.categoryId)) { if (finCatIds.size >= FB.categoriesMax) break; finCatIds.add(e.categoryId); }
        finCats.push({ ts: e.ts, month: gd(e.ts).slice(0, 7), id: e.categoryId, title, kind: e.kind, limit: e.kind === 'expense' ? limit : null, archived: e.archived === true });
        break;
      }
      case 'fin_rule_set': {
        if (!ID(e.ruleId)) break;
        if (e.categoryId === null) { finRuleIds.delete(e.ruleId); finRules.push({ ts: e.ts, id: e.ruleId, pattern: '', categoryId: null }); break; }
        const pattern = normText(typeof e.pattern === 'string' ? e.pattern : '');
        if (!ID(e.categoryId) || pattern.length < FB.patternMin || pattern.length > FB.patternMax || (!finRuleIds.has(e.ruleId) && finRuleIds.size >= FB.rulesMax)) break;
        finRuleIds.add(e.ruleId); finRules.push({ ts: e.ts, id: e.ruleId, pattern, categoryId: e.categoryId });
        break;
      }
      case 'fin_entry_added': {
        const amount = validAmount(e.amount);
        if (!ID(e.entryId) || FIN_PREFIX.test(e.entryId) || finIds.has(e.entryId) || !isDate(e.date) || !FIN_KINDS.includes(e.kind) || amount === null) break;
        finIds.add(e.entryId);   // первая побеждает
        finRaw.push({ id: e.entryId, ts: e.ts, date: e.date, kind: e.kind, amount, cat: typeof e.categoryId === 'string' ? e.categoryId : '', text: cleanText(e.note, FB.textMax) ?? '', source: 'manual' });
        break;
      }
      case 'fin_entry_edited': {
        if (!ID(e.entryId)) break;
        const amount = validAmount(e.amount);
        finEdits.push({ ts: e.ts, id: e.entryId, ...(ID(e.categoryId) ? { cat: e.categoryId } : {}), ...(amount !== null ? { amount } : {}),
          ...(isDate(e.date) ? { date: e.date } : {}), ...(typeof e.removed === 'boolean' ? { removed: e.removed } : {}) });
        break;
      }
      case 'fin_imported': {
        if (!ID(e.importId) || finImports.has(e.importId) || !Array.isArray(e.rows)) break;
        const keys = new Set<string>(), rows: ImportRow[] = [];
        for (const r of e.rows.slice(0, FB.importRowsMax) as Partial<ImportRow>[]) {   // граница доверия: ≤ importRowsMax строк на событие
          const amount = validAmount(r?.amount);
          if (!r || !ID(r.key) || keys.has(r.key) || !isDate(r.date) || amount === null) continue;
          keys.add(r.key); rows.push({ key: r.key, date: r.date, amount, text: cleanText(r.text, FB.textMax) ?? '' });
        }
        finImports.set(e.importId, { ts: e.ts, rows });
        break;
      }
      case 'fin_import_removed': if (finImports.has(e.importId) && !finRemoved.has(e.importId)) finRemoved.set(e.importId, e.ts); break;
      case 'boss_created': case 'boss_stage_done': case 'boss_abandoned': bossEvents.push(e); break;
      case 'reward_created': case 'reward_deleted': case 'reward_purchased': case 'cosmetic_bought': shopEvents.push(e); break;
      case 'cosmetic_equipped': equips.push(e); break;
      // skill_unlocked (легаси) и неизвестные типы игнорируются
    }
  }

  // Данные дня по игровым датам (после всех событий: типы дней и закрытия известны).
  const data = new Map<ISODate, DayData>();
  const dd = (d: ISODate) => { let x = data.get(d); if (!x) data.set(d, x = { flags: [] }); return x; };
  const addTo = (d: ISODate, k: 'socialMin' | 'gamesMin' | 'focusMin' | 'readMin' | 'gymVisits' | 'spendAuto' | 'finEntries', v: number) => { const x = dd(d); x[k] = (x[k] ?? 0) + v; };
  for (const [d, a] of health) {
    const x = dd(d), ws = workoutStats([...a.w.values()]), P = BALANCE.plausible;
    const vals = { steps: a.steps, sleepHours: a.sleep, restingHR: a.rhr, weightKg: a.weight, mindfulMin: a.mindful, ...ws.mins };
    for (const [k, v] of Object.entries(vals)) if (v !== undefined) (x as unknown as Record<string, number>)[k] = v;
    if (a.legacyW !== undefined) x.workoutMin = Math.max(x.workoutMin ?? 0, a.legacyW);
    if (a.steps !== undefined && a.steps > P.stepsMax) x.flags.push({ metric: 'steps', reason: 'too_many_steps' });
    if (a.sleep !== undefined && a.sleep > P.sleepMaxH) x.flags.push({ metric: 'sleepHours', reason: 'too_long_sleep' });
    if (ws.overlap) x.flags.push({ metric: 'workouts', reason: 'overlap' });
  }
  const appSigs = (app: string, list: Sig[]) => list.flatMap(s => (s.kind === 'app' && s.app === app ? [{ at: s.at, state: s.state }] : []));
  for (const app of APPS) for (const { start, min } of sessionMinutes(appSigs(app, sigs))) addTo(gd(start), `${app}Min`, min);
  // Закрытый день считает только события, принятые до его закрытия: позднее данные дня (и засчёт) не меняют.
  const inTime = (d: ISODate, ts: number) => d >= today || ts < closesAtTs(d, closeOf(d));
  // Фокус и чтение: объединение интервалов (режим + таймеры) по игровой дате начала.
  const ivs = new Map<string, { start: number; end: number }[]>();
  for (const iv of ivList) {
    const d = gd(iv.start), key = `${iv.k}|${d}`;
    if (!inTime(d, iv.ts)) continue;
    const list = ivs.get(key); if (list) list.push(iv); else ivs.set(key, [iv]);
  }
  // «Записать траты»: записи расходов, принятые до закрытия своего дня; правки и удаления засчёт не отнимают (монотонно).
  // shortcut: строка импорта, совпавшая с Wallet того же дня, считается дважды — импорт обычно приходит после закрытия дня
  const finKeys = new Set<string>();
  for (const r of finRaw) if (r.kind === 'expense' && inTime(r.date, r.ts)) addTo(r.date, 'finEntries', 1);
  for (const im of finImports.values()) {
    for (const r of im.rows) if (r.amount < 0 && !finKeys.has(r.key) && inTime(r.date, im.ts)) addTo(r.date, 'finEntries', 1);
    for (const r of im.rows) finKeys.add(r.key);
  }
  for (const [key, iv] of ivs) { const [k, d] = key.split('|') as ['focusMin' | 'readMin', ISODate]; addTo(d, k, unionMinutes(iv, BALANCE.vitals.focus.intervalMaxMin)); }
  for (const s of sigs) {
    if (s.kind === 'arrive' && s.place === 'gym' && inTime(s.d, s.ts)) addTo(s.d, 'gymVisits', 1);
    if (s.kind === 'wallet') { addTo(s.d, 'spendAuto', s.amount); dd(s.d).spendAuto = Math.round(dd(s.d).spendAuto! * 100) / 100; } // копейки без хвоста float
  }
  /** «Без соцсетей/игр»: источник жив за autoLeSourceDays до даты; сигналы — только принятые до закрытия дня (позднее решение не меняют). */
  const appMin = (d: ISODate, app: string): number | null => {
    const close = closesAtTs(d, closeOf(d)), from = addDays(d, 1 - BALANCE.autoLeSourceDays), next = addDays(d, 1);
    const sg = appSigs(app, sigs.filter(s => s.ts < close && s.d >= from && s.d <= next));
    if (!sigs.some(s => s.kind === 'app' && s.app === app && s.ts < close && s.d >= from && s.d <= d)) return null; // источник не жив
    return sessionMinutes(sg).reduce((a, x) => a + (gd(x.start) === d ? x.min : 0), 0);
  };
  const leOk = (d: ISODate, app: string, value: number) => { const m = appMin(d, app); return m !== null && m <= value; };
  // Параметры дня (спека §5): каждая дата — по событиям, принятым до её закрытия, как данные дня выше.
  const V = BALANCE.vitals;
  const hvMemo = new Map<ISODate, { sleep?: number; steps?: number; rhr?: number; mindful?: number; feel?: number }>();
  const hv = (d: ISODate) => {
    let x = hvMemo.get(d);
    if (x) return x;
    x = {};
    for (const p of health.get(d)?.pk ?? []) if (inTime(d, p.ts)) {
      if (p.sleep !== undefined) x.sleep = p.sleep;
      if (p.rhr !== undefined) x.rhr = p.rhr;
      if (p.steps !== undefined) x.steps = Math.max(x.steps ?? -Infinity, p.steps);
      if (p.mindful !== undefined) x.mindful = Math.max(x.mindful ?? -Infinity, p.mindful);
    }
    for (const c of checkins.get(d) ?? []) if (inTime(d, c.ts)) x.feel = c.energy;
    if (x.sleep !== undefined && x.sleep > BALANCE.plausible.sleepMaxH) delete x.sleep; // зафлаженное не участвует
    if (x.steps !== undefined && x.steps > BALANCE.plausible.stepsMax) delete x.steps;
    hvMemo.set(d, x);
    return x;
  };
  const avg = (xs: (number | null | undefined)[]) => { const v = xs.filter(fin); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const span = (d: ISODate, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => addDays(d, from + i));
  const sigsOn = new Map<ISODate, Sig[]>(), focusIvOn = new Map<ISODate, number[]>();
  for (const s of sigs) sigsOn.set(s.d, [...(sigsOn.get(s.d) ?? []), s]);
  for (const iv of ivList) if (iv.k === 'focusMin') { const d = gd(iv.start); focusIvOn.set(d, [...(focusIvOn.get(d) ?? []), iv.ts]); }
  const focusOn = (d: ISODate) => {
    if (!sigsOn.size && !focusIvOn.size) return focusScore({ focusMin: null, socialMin: null }); // плотный цикл без сигналов — без перебора окна
    const ok = (ts: number) => inTime(d, ts), win = span(d, 1 - V.focus.sourceDays, 0);
    const hasFocus = win.some(x => sigsOn.get(x)?.some(s => s.kind === 'focus' && ok(s.ts)) || focusIvOn.get(x)?.some(ok));
    const hasSocial = win.some(x => sigsOn.get(x)?.some(s => s.kind === 'app' && s.app === 'social' && ok(s.ts)));
    const social = !hasSocial ? null : sessionMinutes(appSigs('social', [d, addDays(d, 1)].flatMap(x => sigsOn.get(x) ?? []).filter(s => ok(s.ts))))
      .reduce((a, x) => a + (gd(x.start) === d ? x.min : 0), 0);
    return focusScore({ focusMin: hasFocus ? data.get(d)?.focusMin ?? 0 : null, socialMin: social });
  };
  const vitalsOn = (d: ISODate, fatigue: number): Vitals => {
    const win = health.size || checkins.size ? span(d, 1 - V.hp.windowDays, 0).map(hv) : []; // без данных — без перебора окна (плотный цикл)
    const rhr = avg(win.map(x => x.rhr));
    const rhrPast = rhr === null ? [] : span(d, 1 - V.hp.windowDays - V.hp.rhrDays, -V.hp.windowDays).map(x => hv(x).rhr).filter(fin);
    const h = hpScore({ sleepAvg: avg(win.map(x => x.sleep)), stepsAvg: avg(win.map(x => x.steps)), stepsGoal: profile?.stepsUsual ?? 0,
      rhr, rhrMean: rhrPast.length >= V.hp.rhrMinSamples ? avg(rhrPast) : null, feel: avg(win.map(x => x.feel)) });
    const weekMorning = dayStart.size ? avg(span(d, -V.energy.weekDays, -1).map(x => dayStart.get(x)?.energy)) : null;
    const sleep = hv(d).sleep ?? null, f = focusOn(d);
    return { hp: h.hp, energy: energyScore({ sleepLast: sleep, morning: dayStart.get(d)?.energy ?? null, weekMorning, hp: h.hp }), focus: f.focus, fatigue,
      parts: { hp: h.parts, focus: f.parts }, energyInputs: { sleep, hp: h.hp, weekMorning } };
  };
  /** timely — только пакеты здоровья, принятые до закрытия даты (лестницы: итог окна монотонен). */
  const autoOk = (a: Quest['auto'], date: ISODate, timely = false) => {
    if (!a) return false;
    if (a.metric === 'socialMin' || a.metric === 'gamesMin') return a.op === '<=' && date < today && leOk(date, a.metric === 'socialMin' ? 'social' : 'games', a.value);
    // здоровье — по каждому пакету (hi/lo); фокус, чтение, зал только растут — итог дня
    const hs = health.get(date), h = (timely ? hs?.t : hs)?.[a.op === '>=' ? 'hi' : 'lo'][a.metric];
    const v = h ?? (a.metric === 'focusMin' || a.metric === 'readMin' || a.metric === 'gymVisits' || a.metric === 'finEntries' ? data.get(date)?.[a.metric] : undefined);
    return v !== undefined && (a.op === '>=' ? v >= a.value : v <= a.value);
  };
  const autoOkOf = (q: DayQuest) => autoOk(q.auto, q.date);
  // Проверка: авто — данные авто-источников выполнили цель (в том числе после ручной галочки и за прошлые дни), фото, иначе честное слово.
  // Ручной metric_logged — честное слово (спека §4.1).
  for (const q of questById.values()) {
    const autoOk = autoOkOf(q);
    if (autoOk) q.done = true;
    if (q.done) q.verify = autoOk ? 'auto' : photoOk.has(q.id) ? 'photo' : 'honest';
  }
  // Свои задания — в конец списка дня (выдача той же даты по-прежнему «побеждает первая»).
  for (const [d, cs] of customs) issued.set(d, [...(issued.get(d) ?? []), ...cs]);
  const dayOff = new Set<ISODate>(); // купленный «день без заданий» — нейтрален, как отдых
  const ritualsOn = new Map<ISODate, { due: number; done: number }>(); // ритуалы дня: показано / засчитано (цикл дней)
  /** Итог дня; свои задания не в знаменателе 60%. */
  const outcomeOf = (d: ISODate) => {
    const qs = (issued.get(d) ?? []).filter(q => q.kind !== 'custom');
    return dayOutcome({ issued: qs.length, done: qs.filter(q => q.done).length, dropped: qs.filter(q => q.dropped).length, rest: restDays.has(d) || dayOff.has(d),
      rituals: ritualsOn.get(d) });
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

  // Финансы — отдельный проход: вид на момент cut (события ts < cut). Вердикты недели/месяца — срезом на закрытие их последнего дня (монотонно).
  const finMemo = new Map<number, { entries: FinEntry[]; cats: Map<string, FinCat> }>();
  const finAt = (cut: number) => {
    const hit = finMemo.get(cut);
    if (hit) return hit;
    const cats = new Map<string, FinCat>(DEFAULT_CATEGORIES.map(c => [c.id, { ...c, limit: null, archived: false }]));
    for (const c of finCats) if (c.ts < cut) cats.set(c.id, { id: c.id, title: c.title, kind: c.kind, limit: c.limit, archived: c.archived });
    const rm = new Map<string, { pattern: string; categoryId: string; ts: number }>();
    for (const r of finRules) if (r.ts < cut) { if (r.categoryId === null) rm.delete(r.id); else rm.set(r.id, { pattern: r.pattern, categoryId: r.categoryId, ts: r.ts }); }
    const rules = [...rm.values()], ed = new Map<string, (typeof finEdits)[number]>();
    for (const x of finEdits) if (x.ts < cut) ed.set(x.id, { ...ed.get(x.id), ...x });   // последнее по ts побеждает (по полю)
    const raws: FinRaw[] = finRaw.filter(r => r.ts < cut), keys = new Set<string>();
    for (const [iid, im] of finImports) {
      if (im.ts >= cut || (finRemoved.get(iid) ?? Infinity) < cut) continue;
      // строка с ключом из более раннего импорта — дубль; поступление → «Прочий доход», списание → по правилам
      for (const r of im.rows) raws.push({ id: `import:${iid}:${r.key}`, ts: im.ts, date: r.date, kind: r.amount < 0 ? 'expense' : 'income', amount: Math.abs(r.amount),
        cat: r.amount < 0 ? null : 'default:income_other', text: r.text, source: 'import', keyDup: keys.has(r.key) });
      for (const r of im.rows) keys.add(r.key);
    }
    const entries: FinEntry[] = [], debits: { id: string; date: ISODate; amount: number }[] = [], wallets: { id: string; date: ISODate; amount: number; ts: number }[] = [];
    for (const r of raws) {
      const x = ed.get(r.id);
      if (x?.removed) continue;
      // категория: правка → правило → «Без категории»; правка в категорию другого вида меняет вид (перенос в «Отложено»)
      let kind = r.kind, cid = x?.cat ?? r.cat, uncategorized = false;
      if (x?.cat && cats.has(x.cat)) kind = cats.get(x.cat)!.kind;
      else if (cid === null) {
        const m = matchRule(r.text, rules);
        if (m && cats.has(m)) { cid = m; kind = cats.get(m)!.kind; } else uncategorized = true;
      }
      const e: FinEntry = { id: r.id, ts: r.ts, date: x?.date ?? r.date, kind, amount: x?.amount ?? r.amount, categoryId: cats.get(cid ?? '')?.kind === kind ? cid! : otherOf(kind),
        text: r.text, source: r.source, dup: !!r.keyDup, uncategorized };
      entries.push(e);
      if (r.source === 'wallet') wallets.push({ id: e.id, date: e.date, amount: e.amount, ts: e.ts });
      else if (r.source === 'import' && r.cat === null && !e.dup) debits.push({ id: e.id, date: e.date, amount: -e.amount });
    }
    const dup = matchWallet(debits, wallets, FB.dedupeDays);
    for (const e of entries) if (dup.has(e.id)) e.dup = true;
    entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ts - a.ts || (a.id < b.id ? 1 : -1)));
    const v = { entries, cats };
    finMemo.set(cut, v);
    return v;
  };
  const limSets = (cut: number, id: string) => finCats.filter(c => c.ts < cut && c.id === id).map(c => ({ month: c.month, limit: c.limit }));
  /** Лимиты активных категорий расходов на срезе cut: lim — от истории значений категории. */
  const limitsAt = (cut: number, cats: Map<string, FinCat>, lim: (sets: { month: string; limit: number | null }[]) => number | null) =>
    Object.fromEntries([...cats.values()].filter(c => c.kind === 'expense' && !c.archived).map(c => [c.id, lim(limSets(cut, c.id))]));
  const weekLim = (ws: ISODate) => (s: { month: string; limit: number | null }[]) => weekLimit(m => limitFor(s, m), ws);
  const budgetWeeks = new Map<ISODate, boolean>();
  /** «Неделя в лимите»: только закрытое воскресенье ≥ rivalSince. */
  const budgetWeekOk = (ws: ISODate) => {
    const sun = addDays(ws, 6);
    if (sun < BALANCE.rivalSince || sun >= today) return false;
    let r = budgetWeeks.get(ws);
    if (r === undefined) {
      const cut = closesAtTs(sun, closeOf(sun)), v = finAt(cut), t = periodTotals(v.entries, ws, sun);
      budgetWeeks.set(ws, r = budgetVerdict(t.byCat, limitsAt(cut, v.cats, weekLim(ws)), t.loggedDays, FB.weekMinDays) === true);
    }
    return r;
  };
  const budgetMonths = new Map<string, { inLimit: boolean | null; t: ReturnType<typeof periodTotals>; verify: 'auto' | 'honest' }>();
  const budgetMonth = (m: string) => {
    let r = budgetMonths.get(m);
    if (r) return r;
    const end = lastDayOf(m), cut = closesAtTs(end, closeOf(end)), v = finAt(cut), t = periodTotals(v.entries, `${m}-01`, end);
    let all = 0, auto = 0;   // доля расходов месяца из Wallet/импорта → проверка auto
    for (const e of v.entries) if (!e.dup && e.kind === 'expense' && e.date.startsWith(m)) {
      const c = Math.round(e.amount * 100);
      all += c; if (e.source === 'wallet' || e.source === 'import') auto += c;
    }
    budgetMonths.set(m, r = { inLimit: budgetVerdict(t.byCat, limitsAt(cut, v.cats, s => limitFor(s, m)), t.loggedDays, FB.monthMinDays), t,
      verify: all > 0 && auto >= FB.autoShare * all ? 'auto' : 'honest' });
    return r;
  };
  const finMonths = new Set([...finRaw.map(r => r.date), ...finEdits.flatMap(x => (x.date ? [x.date] : [])), ...[...finImports.values()].flatMap(im => im.rows.map(r => r.date))]
    .map(d => d.slice(0, 7)));
  const budgetRow = (id: string, d: ISODate, rank: Rank, skill: SkillId, v: 'auto' | 'honest'): LedgerEntry => {
    const base = BALANCE.rank.base[rank], k = BALANCE.verify[v], xp = Math.round(base * k), sp = splitXp(xp, [skill]);
    return { id, ts: closesAtTs(d, closeOf(d)), date: d, source: 'budget', base, k, bonus: 0, penalty: 0, mult: 1, xp, gold: goldFor(xp), skills: sp.skills, stats: sp.stats, verified: v === 'auto' };
  };

  // Недельные: прогресс за 7 дней недели; XP — один раз за выполненное, в том числе за прошлые недели.
  const doneOn = (d: ISODate) => issued.get(d)?.filter(q => q.done && q.kind !== 'custom') ?? []; // свои дают только свой XP
  const weekProgress = (w: WeeklyQuest, upTo?: ISODate) => {
    let n = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(w.weekStart, i), dq = doneOn(d);
      if (upTo && d > upTo) break;
      if (w.kind === 'stat_quests') n += dq.filter(q => q.stat === w.stat).length;
      else if (w.kind === 'steps_total') n += plausibleSteps(metrics.get(d)?.steps) ?? 0;
      else if (w.kind === 'shadow_wins') n += outcomeOf(d).counted ? 1 : 0; // легаси — засчитанные в серию дни
      else if (w.kind === 'budget_week') n += i === 6 && budgetWeekOk(w.weekStart) ? 1 : 0;
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
    if (e.type === 'cosmetic_bought') {
      const c = typeof e.itemId === 'string' ? cosmeticById(e.itemId) : null;
      if (c && c.price !== null) buys.push({ id: e.id, ts: e.ts, r: { id: c.id, title: c.title, price: c.price, effect: null, deleted: false, cosmetic: true } });   // уже есть — отказ при приёме
      continue;
    }
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
  const seasonXpBy = new Map<string, number>();   // XP строк по сезону даты строки
  for (const [d, m] of metrics) if (plausibleSteps(m.steps) !== undefined) dayOf(d).steps = plausibleSteps(m.steps); // до цикла: золото достижений прошлых дней
  let goldSoFar = 0, xpSoFar = 0; // цикл идёт по датам: на начало дня d — строки с датой < d
  const statByDate = new Map<ISODate, Record<Stat, number>>(); // XP характеристик по датам — для «Перекоса» и Формы
  const rawXp = new Map<ISODate, number>(); // XP дня без штрафов — «большой день» Усталости (без строк Тени: победа не утомляет)
  const add = (r: LedgerEntry) => {
    ledger.push(r); if (r.source !== 'shadow') rawXp.set(r.date, (rawXp.get(r.date) ?? 0) + r.xp / (1 - r.penalty)); bump(r.date, 'xp', r.xp); goldSoFar += r.gold; xpSoFar += r.xp;
    const sd = statByDate.get(r.date) ?? fill(0);
    for (const k of STAT_KEYS) { statXp[k] += r.stats[k] ?? 0; sd[k] += r.stats[k] ?? 0; }
    statByDate.set(r.date, sd);
    if (r.xp) { const sid = seasonOf(r.date).id; seasonXpBy.set(sid, (seasonXpBy.get(sid) ?? 0) + r.xp); }
    for (const [id, v] of r.skills) {
      const before = skillFromXp(start.skills[id], skillXp[id]).level;
      skillXp[id] += v; if (r.source === 'quest' || r.source === 'ritual') skillLast[id] = r.date;   // практика: задание или ритуал (спека §3.3)
      if (before < 2 && skillFromXp(start.skills[id], skillXp[id]).level >= 2) bump(r.date, 'skills');
    }
  };
  const achGoldBefore = (d: ISODate) => BALANCE.achievementGold * earnAchievements(days, addDays(d, -1), startLevel).filter(a => a.id !== 'first_purchase').length;
  const skillLevels = () => Object.fromEntries(SKILL_IDS.map(id => [id, skillFromXp(start.skills[id], skillXp[id]).level])) as Record<SkillId, number>;
  // Лестницы: слоты, очередь, засчёт дня, окна и недели ступени 5 (спека §3.4). Вызывается по каждой дате от первой лестницы до сегодня.
  // порядок создания: ts, при равенстве — ladderId
  const L = BALANCE.ladder, ladList = [...lads.values()].sort((a, b) => a.createdTs - b.createdTs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), queue: Lad[] = [], trophies: GameState['trophies'] = [];
  const ladToday = new Map<string, 'auto' | 'honest'>();
  const activeN = () => ladList.reduce((n, l) => n + (l.status === 'active' ? 1 : 0), 0);
  const startWindow = (l: Lad, from: ISODate) => {
    l.windowStart = from; l.win = []; l.done = 0;
    for (const u of l.upd) if (u.date < from) l.steps = u.steps; // правка — со следующего окна
  };
  const isSuitable = (l: Lad, d: ISODate) => l.suitable === 'all' || types.get(d)?.kind === 'day' || types.get(d)?.kind === 'evening';
  /** Нужно за окно (k = 2, 14 дней) или неделю (k = 1, 7 дней); per7 = 7 — подходящие дни, ещё не прожитые считаются подходящими. */
  const reqOf = (per7: number, win: boolean[], span: number, k: number) => (per7 < 7 ? k * per7 : win.filter(Boolean).length + span - win.length);
  const ladRow = (id: string, ts: number, d: ISODate, source: 'ritual' | 'ladder' | 'shadow', xp: number, skill: SkillId, verified: boolean): LedgerEntry => {
    const sp = splitXp(xp, [skill]);
    return { id, ts, date: d, source, base: xp, k: 1, bonus: 0, penalty: 0, mult: 1, xp, gold: goldFor(xp), skills: sp.skills, stats: sp.stats, verified };
  };
  const ladderDay = (d: ISODate) => {
    // слот, освобождённый вчера и раньше, — первой в очереди (окно с сегодня); затем удаления и новые лестницы дня
    while (queue.length && activeN() < L.maxActive) {
      const l = queue.shift()!;
      if (l.removed !== null && l.removed <= d) { l.status = 'gone'; continue; } // снятая сегодня слот не занимает
      l.status = 'active'; startWindow(l, d);
    }
    for (const l of ladList) if (l.removed !== null && l.removed <= d && l.status !== 'gone') {
      if (l.status === 'queued') queue.splice(queue.indexOf(l), 1);
      l.status = 'gone';
    }
    for (const l of ladList) if (l.status === 'new' && l.created <= d) {
      if (!queue.length && activeN() < L.maxActive) { l.status = 'active'; startWindow(l, d); } else { l.status = 'queued'; queue.push(l); }
    }
    const frozen = restDays.has(d) || dayOff.has(d), close = closesAtTs(d, closeOf(d));
    let due = 0, done = 0;
    for (const l of ladList) {
      if (l.status !== 'active' && l.status !== 'auto') continue;
      due++;
      const a = l.steps[l.step - 1].auto ?? null, auto = autoOk(a, d, true), ok = auto || l.rit.has(d);
      if (ok) {
        done++;
        add(ladRow(`ritual:${l.id}:${d}`, l.rit.get(d) ?? close, d, 'ritual', ritualXp(l.step), l.skill, auto));
        if (d === today) ladToday.set(l.id, auto ? 'auto' : 'honest');
        if (l.kind === 'dont' && l.facetId) assist.add(`${l.facetId}|${d}`);
      }
      if (d >= today || frozen) continue; // окно — только по закрытым незамороженным дням
      // per7 = 7: нужны только подходящие дни — ритуал в неподходящий окно не добирает
      const per7 = l.steps[(l.status === 'auto' ? L.steps - 1 : l.step) - 1].per7;
      l.win.push(isSuitable(l, d)); if (ok && (per7 < 7 || isSuitable(l, d))) l.done++;
      if (l.status === 'active' && l.win.length === L.windowDays) {
        const req = requiredIn(l.steps[l.step - 1], l.win.map(suitable => ({ suitable })));
        const res = ladderAfterWindow({ step: l.step, attempt: l.attempt }, Math.min(1, l.done / req));
        if (res.bonus) add(ladRow(`ladder:${l.id}:${d}`, close, d, 'ladder', res.bonus, l.skill, false));
        l.step = res.step; l.attempt = res.attempt; l.ask = res.ask; l.askFrom = addDays(d, 1);
        if (l.step === L.steps) {
          l.status = 'auto'; l.weekRates = []; // слот свободен со следующего дня
          if (!l.mastered) { l.mastered = true; bump(d, 'laddersMastered'); trophies.push({ id: `ladder:${l.id}`, kind: 'avatar', title: BALANCE.trophies.avatar, date: d }); }
        }
        startWindow(l, addDays(d, 1));
      } else if (l.status === 'auto' && l.win.length === 7) {
        // ступень 5: недели по 7 незамороженных дней, нужно — по частоте ступени 4
        const req = reqOf(l.steps[L.steps - 2].per7, l.win, 7, 1);
        if (req > 0) l.weekRates.push(Math.min(1, l.done / req));
        if (step5Relapse(l.weekRates)) { l.step = L.steps - 1; l.attempt = 1; l.weekRates = []; l.status = 'queued'; queue.unshift(l); }
        startWindow(l, addDays(d, 1));
      }
    }
    ritualsOn.set(d, { due, done });
  };
  // Тень: по каждой дате от первой грани до сегодня — приём/снятие, честная отметка (XP), закрытие дня граней, битва.
  const assist = new Set<string>(), relapsesOn = new Map<ISODate, number>(), facetList: Facet[] = [];
  let lastBattle: GameState['shadow']['lastBattle'] = null;
  const liveFacets = () => facetList.filter(f => f.status === 'on' && !f.banished);
  const shadowStrength = (fs: Facet[]) => (fs.length ? Math.round(fs.reduce((a, f) => a + f.strength, 0) / fs.length) : null);
  const honestRow = (f: Facet, d: ISODate, ts: number) => add(ladRow(`shadow:${f.id}:${d}`, ts, d, 'shadow', S.honestXp, 'habits', false));
  const shadowDay = (d: ISODate) => {
    for (const { f, add, ts } of facetOps.get(d) ?? []) {
      if (!add) {
        // отметка до снятия в тот же день сохраняет свой XP (XP не отнимается)
        const h = relapseAt.get(`${f.id}|${d}`);
        if (f.status === 'on' && !f.banished && h !== undefined && h < ts) honestRow(f, d, h);
        f.status = 'gone'; // не принятая (лимит) тоже не вернётся
      }
      else if (f.status === 'new' && liveFacets().length < S.maxFacets) { f.status = 'on'; facetList.push(f); }
    }
    const fs = liveFacets(); // живые на начало дня — битва идёт и при изгнании в этот же день
    for (const f of fs) {
      const honest = relapseAt.get(`${f.id}|${d}`);
      if (honest !== undefined) honestRow(f, d, honest);
      if (d >= today) continue;
      // срыв: честная отметка или данные группы приложений (те же правила, что у «<=»-заданий)
      const m = f.kind === 'social' || f.kind === 'games' ? appMin(d, f.kind) : null;
      const relapse = honest !== undefined || (m !== null && m > S.dataRelapseMin);
      Object.assign(f, facetDay(f, relapse, assist.has(`${f.id}|${d}`), snap?.flat.relapse));
      if (relapse) relapsesOn.set(d, (relapsesOn.get(d) ?? 0) + 1);
      if (banished(f)) { f.banished = true; bump(d, 'facetsBanished'); }
    }
    const month = d.slice(0, 7);
    if (d >= today || d !== lastSunday(month) || !fs.length) return;
    // битва — при закрытии последнего воскресенья, и в замороженный день тоже
    const strength = shadowStrength(fs)!, o = battleOutcome(strength)!;
    if (o.xp) add(ladRow(`battle:${month}`, closesAtTs(d, closeOf(d)), d, 'shadow', o.xp, 'habits', false));
    if (o.trophy) trophies.push({ id: `battle:${month}`, kind: o.trophy, title: BALANCE.trophies.rare, date: d });
    if (o.result === 'crush' || o.result === 'win') bump(d, 'shadowWins');
    const top = fs.reduce((a, b) => (b.strength > a.strength ? b : a));
    const hasDont = ladList.some(l => l.kind === 'dont' && l.facetId === top.id && l.status !== 'gone' && l.status !== 'new');
    lastBattle = { date: d, strength, result: o.result, xp: o.xp, plan: o.plan ? masterPlan(fs, hasDont) : null };
  };
  // Сезонный босс (спека §5) и цепочка (§6): операции дня до выдачи → шаги и удары по выполненным → операции после выдачи.
  const BS = BALANCE.boss;
  type Part = { title: string; start: ISODate; end: ISODate; steps: { title: string; done: boolean }[]; hits: number; won: boolean };
  type SBoss = { seasonId: string; title: string; skill: SkillId; stat: Stat; defeated: boolean; parts: Part[] };
  type Chain = NonNullable<GameState['chain']>;
  let sboss = null as SBoss | null, chain = null as Chain | null, chainsDone = 0; // as — присваиваются в замыканиях
  const chainIds = new Set<string>(), paid = new Set<string>();
  const applyOp = (op: GameOp, d: ISODate) => {
    if (op.k === 'boss') {
      if (sboss?.seasonId === op.seasonId) return; // у сезона уже есть босс (активный или побеждённый) — повтор игнор
      const sn = seasonOf(d), ws = partWindows(sn.start, sn.end);
      sboss = { seasonId: op.seasonId, title: op.draft.title, skill: op.draft.skill, stat: primaryStat([op.draft.skill]), defeated: false,
        parts: op.draft.parts.map((p, i) => ({ title: p.title, ...ws[i], steps: p.steps.map(title => ({ title, done: false })), hits: 0, won: false })) };
    } else if (op.k === 'boss_off') { if (sboss?.seasonId === op.seasonId && !sboss.defeated) sboss = null; }
    else if (op.k === 'chain') {
      if (chain || chainIds.has(op.id)) return; // одна активная; повтор id — игнор
      chainIds.add(op.id);
      chain = { id: op.id, title: op.title, skill: op.skill, stat: primaryStat([op.skill]), steps: op.steps.map(title => ({ title, done: false })), current: 0 };
    } else if (chain?.id === op.id) chain = null;
  };
  /** Шаг босса на дату: первый несделанный самой ранней начавшейся части (недоделанное прошлого месяца — первым). */
  const bossNext = (d: ISODate) => {
    if (!sboss || seasonOf(d).id !== sboss.seasonId) return null;
    for (const [i, p] of sboss.parts.entries()) { if (p.start > d) break; const j = p.steps.findIndex(x => !x.done); if (j >= 0) return { i, j }; }
    return null;
  };
  const gameDay = (d: ISODate, qs: DayQuest[]) => {
    const ops = gameOps.get(d) ?? [], cut = issuedTs.get(d) ?? Infinity;
    for (const op of ops) if (op.ts < cut) applyOp(op, d);
    // шаг продвигается, только если link совпадает с текущим на дату выдачи; иначе — обычное задание без урона
    const b = sboss && seasonOf(d).id === sboss.seasonId ? sboss : null, ch = chain;
    let next = bossNext(d), cStep = ch ? ch.current : -1, bt = 0, ct = 0;
    for (const q of qs) {
      if (!q.done) continue;
      const l = q.link, t = completedAt.get(q.id) ?? issuedTs.get(d) ?? 0;
      if (b && next && q.kind === 'boss' && l?.kind === 'boss' && l.season === b.seasonId && l.part === next.i && l.step === next.j) {
        b.parts[next.i].steps[next.j].done = true; next = null; bt = Math.max(bt, t);
      } else if (b && (q.kind === 'daily' || q.kind === 'challenge') && q.stat === b.stat) {
        const p = b.parts.find(p => p.start <= d && p.hits < BS.hitCap); // удар — самой ранней начавшейся части с ударами < 5
        if (p) { p.hits++; bt = Math.max(bt, t); }
      } else if (ch && q.kind === 'chain' && l?.kind === 'chain' && l.chainId === ch.id && l.step === cStep) {
        ch.steps[cStep].done = true; ch.current++; cStep = -1; ct = Math.max(ct, t);
      }
    }
    if (b) {
      b.parts.forEach((p, i) => {
        if (p.won || partHp(p.steps.filter(x => x.done).length, p.steps.length, p.hits) > 0) return;
        p.won = true;
        const id = `boss:part:${b.seasonId}:${i}`; // награда — одна на сезон, и после сдачи и нового выбора
        if (!paid.has(id)) { paid.add(id); add(flatRow(id, bt, d, 'boss', BS.partXp, b.stat)); bump(d, 'bossesDefeated'); }
      });
      const id = `boss:season:${b.seasonId}`;
      if (!b.defeated && b.parts.every(p => p.won)) {
        b.defeated = true;
        if (!paid.has(id)) {
          paid.add(id); add(flatRow(id, bt, d, 'boss', BS.seasonXp, b.stat)); bump(d, 'seasonBosses');
          trophies.push({ id, kind: 'legendary', title: BALANCE.trophies.legendary, date: d });
        }
      }
    }
    if (ch && ch.current === ch.steps.length) {
      add(flatRow(`chain:${ch.id}`, ct, d, 'chain', BALANCE.chain.doneXp, ch.stat)); bump(d, 'chainsDone'); chainsDone++; chain = null;
    }
    for (const op of ops) if (op.ts >= cut) applyOp(op, d);
  };
  // Инвентарь: вещи пути и сундуков — в цикле дней (сундук не повторяет полученное), магазин и трофеи — после.
  const owned: GameState['cosmetics']['owned'] = [], ownedIds = new Set<string>();
  const own = (id: string, date: ISODate, source: GameState['cosmetics']['owned'][number]['source']) => { if (!ownedIds.has(id)) { ownedIds.add(id); owned.push({ id, date, source }); } };
  // Путь сезона (спека §6): в конце дня d ≥ depthSince — новые ступени сезона даты d; пройденные раньше depthSince — датой первого такого дня.
  const pathGot = new Map<string, GameState['season']['rewards']>(), pathTitles: { t: string; date: ISODate; sid: string }[] = [];
  const pathDay = (d: ISODate) => {
    const sn = seasonOf(d);
    if (d < BALANCE.depthSince || d > today || sn.kind === 'prologue') return;
    const got = pathGot.get(sn.id) ?? [], price = stepXpFor(sn, firstDay ?? null);
    const step = Math.min(BALANCE.season.steps, Math.floor((seasonXpBy.get(sn.id) ?? 0) / price));
    for (let k = got.length + 1; k <= step; k++) {
      const rw = stepRewards(sn.kind, k);
      add({ ...flatRow(`path:${sn.id}:${k}`, ledger.at(-1)?.ts ?? closesAtTs(d, closeOf(d)), d, 'season_step', 0, null), gold: rw.gold });
      for (const it of rw.items) own(it, d, 'path');
      if (rw.title) pathTitles.push({ t: rw.title, date: d, sid: sn.id });
      got.push({ step: k, gold: rw.gold, items: rw.items, date: d });
    }
    pathGot.set(sn.id, got);
  };
  // Ранг недели (спека §5): доля — без своих, перенесённых и замороженных дней; XP — строки дат недели; среднее — 4 прошлые недели с выдачей.
  const WK = BALANCE.week, weekResults: WeekResult[] = [];
  const league = { points: 0, seasonId: null as string | null };
  const realOn = (x: ISODate) => (issued.get(x) ?? []).filter(q => q.kind !== 'custom' && !q.dropped);
  const weekXp = (ws: ISODate): number | null => {
    let xp = 0, any = false;
    for (let i = 0; i < 7; i++) { const x = addDays(ws, i); any ||= realOn(x).length > 0; xp += days.get(x)?.xp ?? 0; }
    return any ? xp : null;
  };
  const weekScore = (ws: ISODate, upTo: ISODate): WeekScore => {
    let n = 0, all = 0, ok = 0, xp = 0;
    for (let i = 0; i < 7; i++) {
      const x = addDays(ws, i);
      if (x > upTo) break;
      xp += days.get(x)?.xp ?? 0;
      const qs = realOn(x);
      if (restDays.has(x) || dayOff.has(x) || !qs.length) continue;
      n++; all += qs.length; ok += qs.filter(q => q.done).length;
    }
    const share = all ? ok / all : 0, avg4 = avgPrev(Array.from({ length: WK.avgWeeks }, (_, k) => weekXp(addDays(ws, -7 * (k + 1)))));
    return { share, xp, avg4, days: n, rank: n >= WK.minDays ? weekRank(share, xp, avg4) : null };
  };
  /** Закрытие воскресенья d: награда, сундук, очки лиги (мягкий сброс перед первой неделей нового сезона; восстановление гасит минус). */
  const rankWeek = (d: ISODate) => {
    const ws = addDays(d, -6), sc = weekScore(ws, d), sn = seasonOf(d);
    let gold = sc.rank ? WK.gold[sc.rank] : 0, chest: string | null = null, points = 0;
    if (sc.rank === 'S') { chest = chestPick(ws, ownedIds); if (chest) own(chest, d, 'chest'); else gold += WK.chestFallbackGold; }
    if (sn.kind !== 'prologue') {
      if (league.seasonId !== sn.id) { league.points = softReset(league.points); league.seasonId = sn.id; }
      const before = league.points;
      league.points = leagueAfter(before, sc.rank, recAll.some(p => p.from <= d && p.to > ws));
      points = league.points - before;
    }
    if (gold > 0) add({ ...flatRow(`week:${ws}`, closesAtTs(d, closeOf(d)), d, 'week_rank', 0, null), gold });
    weekResults.push({ ...sc, weekStart: ws, points, gold, chest });
  };
  let dayStartCaps: GameState['today']['dayStart'] | null = null; // потолки рангов сегодня (переброс, своё задание) — на начало дня
  const history: DayResult[] = [], statHistory: GameState['statHistory'] = [];
  const finalized: { stat: Stat; done: boolean }[][] = [];
  const closed: { date: ISODate; done: number; rest: boolean }[] = []; // все закрытые дни от первого дня с заданиями (пустые тоже)
  let fatigue = 0, todayVit: Vitals | null = null; // Усталость рекуррентно от первого дня с заданиями
  let streak = 0, idleRun = 0, multipliers = fill(1); // idleRun — подряд закрытых не-отдыхающих дней без выполненного
  // Даты: каждый день от первого дня с заданиями до сегодня (пропуски тоже закрываются) + выдачи и строки вне его.
  const firstLadder = ladList.map(l => l.created).filter(d => d <= today).sort()[0] as ISODate | undefined;
  // от первого дня с заданиями или первой лестницы (день только с ритуалами тоже закрывается в серию)
  const firstDay = [...issued.keys(), ...(firstLadder ? [firstLadder] : [])].sort()[0] as ISODate | undefined;
  // закрытие месяца с финансами (≥ rivalSince) — бюджетные проверки и без заданий
  const monthEnds = [...finMonths].map(lastDayOf).filter(d => d < today && d >= BALANCE.rivalSince);
  const dates = new Set([...issued.keys(), ...extra.keys(), ...weeklyAt.keys(), ...spendsOn.keys(), ...restTyped, ...gameOps.keys(), ...monthEnds]);
  if (firstDay) for (let d = firstDay; d <= today; d = addDays(d, 1)) dates.add(d);
  const firstFacet = [...facetMap.values()].map(f => f.added).filter(d => d <= today).sort()[0] as ISODate | undefined;
  if (firstFacet) for (let d = firstFacet; d <= today; d = addDays(d, 1)) dates.add(d);
  const recAll = [...recSpans, ...(recOn ? [{ from: recOn.since, to: addDays(today, 1) }] : [])];
  // Форма по закрытым дням без отдыха (на момент вызова — все < at): окно 14; норма — из плана первые 30 дней, потом из факта за 60 дней.
  const workDays: ISODate[] = [];
  const xpOn = (ds: ISODate[], k: Stat) => ds.reduce((a, d) => a + (statByDate.get(d)?.[k] ?? 0), 0);
  const formsAt = (at: ISODate): Record<Stat, { form: number | null; norm: number; xp14: number }> => {
    const win = workDays.slice(-BALANCE.form.window), past = workDays.slice(-BALANCE.form.normDays);
    const plan = !!firstDay && at < addDays(firstDay, BALANCE.form.planDays), planXp = fill(0);
    if (plan) for (const d of workDays) for (const q of issued.get(d) ?? []) if (!q.dropped)
      for (const [k, v] of Object.entries(splitXp(q.xp, q.skills).stats)) planXp[k as Stat] += v ?? 0;
    return Object.fromEntries(STAT_KEYS.map(k => {
      const avg = plan ? (workDays.length ? planXp[k] / workDays.length : 0) : past.length ? xpOn(past, k) / past.length : 0;
      const norm = formNorm(avg), xp14 = xpOn(win, k);
      return [k, { form: formOf(xp14, win.length, norm), norm, xp14 }];
    })) as Record<Stat, { form: number | null; norm: number; xp14: number }>;
  };
  const formMap = (f: ReturnType<typeof formsAt>) => Object.fromEntries(STAT_KEYS.map(k => [k, f[k].form])) as Record<Stat, number | null>;
  // Простой навыка: незамороженные дни строго между lastDate и at; frozenList растёт по датам (отдых, восстановление, день без заданий).
  const frozenList: ISODate[] = [];
  const freezeDay = (d: ISODate) => { if (frozenList.at(-1) !== d) frozenList.push(d); };
  const dayNum = (d: ISODate) => { const [y, m, x] = d.split('-').map(Number); return Date.UTC(y, m - 1, x) / BALANCE.day.msPerDay; };
  const idleOf = (last: ISODate | undefined, at: ISODate): number | null => {
    if (!last) return null;
    let n = Math.max(0, dayNum(at) - dayNum(last) - 1);
    for (let i = frozenList.length - 1; i >= 0 && frozenList[i] > last; i--) if (frozenList[i] < at) n--;
    return Math.max(0, n);
  };
  // Класс: первый — на firstDay без гистерезиса, пересчёт — на начало каждого 1-го числа; история смен — по датам.
  let cls: { id: ClassId; pair: [Stat, Stat] | null } | null = null;
  const clsHist: { date: ISODate; id: ClassId; pair: [Stat, Stat] | null }[] = [];
  // Снимок на начало дня d ≥ depthSince: Форма, навыки (уровень, ржавчина), сила пассива, постоянные перки.
  type Snap = { forms: Record<Stat, number | null>; skills: Record<SkillId, { level: number; rusty: boolean }>; power: 0 | 0.5 | 1;
    flat: ReturnType<typeof flatPerks> };
  let snap: Snap | null = null;
  // Способности (спека §4.4): одна на класс-способность за игровую неделю; первая валидная по ts побеждает, невалидная не тратит неделю.
  const CL = BALANCE.classes;
  const abUsed = new Map<string, ISODate>();   // `${weekStart}|${ability}` → дата принятия
  let abToday: GameState['today']['ability'] = { rush: null, shield: false, inspire: false, march: false, freeRerolls: 0 };
  for (const p of recAll) for (let d = p.from; d < p.to && d <= today; d = addDays(d, 1)) dates.add(d);
  if (today >= BALANCE.depthSince) dates.add(today);   // путь сезона догоняется и без событий сегодня
  for (const d of [...dates].sort()) {
    const qs = issued.get(d) ?? [];
    // платные траты дня: золото строк прошлых дней − обычные покупки раньше по ts − ранее принятые платные траты ≥ цена
    // день отдыха — только пока принятых отдыхов и дней без заданий раньше d в месяце меньше лимита; сверх — обычный день
    const rm = d.slice(0, 7);
    if (d <= today && types.get(d)?.kind === 'rest' && (restInMonth.get(rm) ?? 0) < BALANCE.streak.restDaysPerMonth) {
      restDays.add(d); restInMonth.set(rm, (restInMonth.get(rm) ?? 0) + 1);
    }
    // день восстановления — замороженный день отдыха, пока в месяце (по датам раньше d) меньше лимита; сверх — обычный.
    // До трат дня: день без заданий на замороженный день отклоняется без списания, как на день отдыха.
    if (d <= today && recAll.some(p => d >= p.from && d < p.to) && !restDays.has(d) && (restInMonth.get(rm) ?? 0) < BALANCE.streak.restDaysPerMonth) {
      restDays.add(d); restInMonth.set(rm, (restInMonth.get(rm) ?? 0) + 1);
    }
    if (restDays.has(d)) freezeDay(d);
    snap = null;
    if (firstDay && d >= firstDay && d <= today && (d >= BALANCE.depthSince || d === firstDay || d.endsWith('-01'))) {
      const forms = formMap(formsAt(d));
      if (!cls || d.endsWith('-01')) {
        const next = pickClass(classWeights(baseNow(), forms), cls);
        if (next.id !== cls?.id) clsHist.push({ date: d, ...next });
        cls = next;
      }
      if (d >= BALANCE.depthSince) {
        const sk = Object.fromEntries(SKILL_IDS.map(id => [id, { level: skillFromXp(start.skills[id], skillXp[id]).level, rusty: isRusty(idleOf(skillLast[id], d)) }])) as Snap['skills'];
        snap = { forms, skills: sk, power: passivePower(cls, forms), flat: flatPerks(sk, forms) };
      }
    }
    // HP/Energy/Фокус/Усталость дня — до его строк леджера; Усталость: F(d) = f(F(d−1), день d−1, ночь d)
    let vit: Vitals | null = null;
    if (firstDay && d >= firstDay && d <= today) {
      const F = V.fatigue, y = d > firstDay ? closed.at(-1) : undefined; // дни от firstDay идут подряд: последний закрытый — d−1
      let day: Parameters<typeof fatigueNext>[1] = null;
      if (y) {
        const usual = closed.slice(-1 - F.bigDayWindow, -1).filter(c => !c.rest), yh = hv(y.date);
        const norm = usual.length >= F.bigDayMinDays ? usual.reduce((a, c) => a + (rawXp.get(c.date) ?? 0), 0) / usual.length : 0;
        day = { bigDay: norm > 0 && (rawXp.get(y.date) ?? 0) > F.bigDayShare * norm, rest: y.rest,
          calm: (issued.get(y.date) ?? []).some(q => q.done && (q.skills.some(s => s === 'mindfulness' || s === 'rest') || q.templateId === 'stretch'))
            || (yh.mindful ?? 0) >= F.calmMindfulMin,
          lowEvening: yh.feel !== undefined && yh.feel <= F.lowEveningMax, relapses: relapsesOn.get(y.date) ?? 0 };
      }
      // до старта Автоматики Усталость 0, штрафа и множителя Фокуса нет: закрытые дни старого журнала не меняются
      fatigue = d < BALANCE.automationSince ? 0 : fatigueNext(fatigue, day, hv(d).sleep ?? null, snap?.flat.fatigueDecay ?? 0);
      vit = vitalsOn(d, fatigue);
      if (d === today) todayVit = vit;
    }
    // потолок ранга: уровень и навык на начало дня
    const lvl = levelFromXp(xpSoFar, startLevel).level;
    if (d === today) dayStartCaps = { level: lvl, skills: skillLevels() };
    const capOf = (q: DayQuest) => RANKS.indexOf(rankCap(lvl, skillFromXp(start.skills[q.skills[0]], skillXp[q.skills[0]]).level));
    // золото достижений дат < d: их счётчики к этому моменту окончательны; first_purchase — нет (покупки решаются после цикла)
    const achGold = spendsOn.has(d) ? achGoldBefore(d) : 0;
    const ab: GameState['today']['ability'] = { rush: null, shield: false, inspire: false, march: false, freeRerolls: 0 };
    if (d === today) abToday = ab;
    const wkKey = (a: string) => `${weekStart(d)}|${a}`;
    const canUse = (a: string) => !!cls && CLASSES[cls.id].ability === a && !abUsed.has(wkKey(a));
    /** «План»: невыполненные (на дату d) недельные этой недели заменяются присланными валидными, не больше заменённых. */
    const planWeek = (raw: unknown): boolean => {
      const ws = weekStart(d), wk = weeklyIssued.get(ws);
      if (!wk || !Array.isArray(raw)) return false;
      const keep = wk.qs.filter(w => weekProgress({ ...w, weekStart: ws }, d) >= w.target), ids = new Set(keep.map(w => w.id));
      const fresh = raw.filter(w => validWeekly(w) && !ids.has(w.id) && !!ids.add(w.id)).slice(0, wk.qs.length - keep.length)
        .map(w => ({ ...w, weekStart: ws, xp: Math.min(BALANCE.legacy.weeklyXpMax, Math.max(0, Math.round(w.xp))) }));
      if (!fresh.length) return false;
      wk.qs = [...keep, ...fresh];
      const wd = ws === thisWeek ? today : addDays(ws, 6);   // строки недели — на wd ≥ d
      weeklyAt.set(wd, [...(weeklyAt.get(wd) ?? []).filter(x => x.ws !== ws), ...wk.qs.map(w => ({ ws, ts: wk.ts, w }))]);
      return true;
    };
    let marchTs = 0;
    const useAbility = (e: Extract<GameEvent, { type: 'ability_used' }>) => {
      if (!canUse(e.ability)) return;
      const q = typeof e.questId === 'string' ? qs.find(x => x.id === e.questId) : undefined;
      const target = !!q && !q.legacy && q.kind !== 'custom' && q.kind !== 'boss' && q.kind !== 'chain';
      if (e.ability === 'rush') { if (!target || !TRAINING.includes(q.skills[0])) return; ab.rush = q.id; }
      else if (e.ability === 'universal') { if (!target || !isStat(e.stat) || e.stat === q.stat) return; q.skills = [DEFAULT_SKILL_BY_STAT[e.stat]]; q.stat = e.stat; }
      else if (e.ability === 'plan') { if (!planWeek(e.quests)) return; }
      else if (e.ability === 'deal') ab.freeRerolls = CL.dealRerolls;
      else if (e.ability === 'shield' || e.ability === 'inspire' || e.ability === 'march') { ab[e.ability] = true; if (e.ability === 'march') marchTs = e.ts; }
      else return;
      abUsed.set(wkKey(e.ability), d);
    };
    for (const s of spendsOn.get(d) ?? []) {
      if ('ab' in s) { useAbility(s.ab); continue; }
      // shortcut: обычные покупки — все кандидаты (принятие решается после цикла); расходится со spendable только после отклонённой
      // обычной покупки, т. е. когда золота и так не хватало
      const avail = goldSoFar + achGold - ordinaryBuys.reduce((a, b) => a + (b.ts < s.ts ? b.r.price : 0), 0) - paidSum;
      if ('orig' in s) {
        const i = qs.findIndex(q => q.id === s.orig), used = rerollsOn.get(d) ?? 0;
        const price = s.insight || used < BALANCE.reroll.free + ab.freeRerolls ? 0 : BALANCE.reroll.cost;
        // замена не выше потолка своего навыка (+1, только если заменяется вызов) — журнал недоверенный
        // замена не дублирует шаблон, уже стоящий в этом дне (два устройства / недоверенный журнал)
        if (i < 0 || qs.some(q => q.templateId === s.repl.templateId) || (price > 0 && avail < price) || RANKS.indexOf(s.repl.rank) > capOf(s.repl) + (qs[i].kind === 'challenge' ? 1 : 0)
          || qs[i].id === ab.rush || (s.insight && !canUse('insight'))) continue;   // задание под «Рывком» не меняется
        qs[i] = s.repl;
        if (s.insight) abUsed.set(wkKey('insight'), d); else rerollsOn.set(d, used + 1);
        if (price) { rerollPaid.push({ ts: s.ts, price }); paidSum += price; }
      } else {
        const r = s.reward, m = d.slice(0, 7), nf = freezeMonth.get(m) ?? 0;
        const nr = restInMonth.get(m) ?? 0;
        // день без заданий: в лимите дней отдыха месяца; повтор на ту же дату или на день отдыха — отказ без списания
        if (r.effect === 'streak_freeze' ? nf >= BALANCE.shop.freezePerMonth
          : restDays.has(d) || dayOff.has(d) || nr >= BALANCE.streak.restDaysPerMonth) continue;
        if (avail < r.price) continue;
        acceptedFx.add(s.id); paidSum += r.price;
        if (r.effect === 'streak_freeze') { freezes++; freezeMonth.set(m, nf + 1); } else { dayOff.add(d); freezeDay(d); restInMonth.set(m, nr + 1); }
      }
    }
    // «Марш»: цели шагов авто-заданий дня × march, награда прежняя
    if (ab.march) for (const q of qs) {
      const goal = q.auto?.metric === 'steps' && q.auto.op === '>=' ? Math.round(q.auto.value * CL.march * 1e9) / 1e9 : null;
      if (goal === null || q.verify === 'auto' || !autoOk({ ...q.auto!, value: goal }, d)) continue;
      q.done = true; q.verify = 'auto';
      // выполнено, когда есть и «Марш», и пакет со сниженной целью
      const pk = health.get(d)?.pk.find(x => x.steps !== undefined && x.steps >= goal && x.steps <= BALANCE.plausible.stepsMax);
      if (!completedAt.has(q.id)) completedAt.set(q.id, Math.max(marchTs, pk?.ts ?? 0));
    }
    // «День изменился»: при меньшем числе слотов последние по выдаче невыполненные — dropped (вне знаменателя 60%); свои не трогаются.
    const ch = dayChange.get(d);
    if (ch && dayStart.has(d)) {
      let left = qs.filter(q => q.kind !== 'custom').length;
      for (let i = qs.length - 1; i >= 0 && left > ch.type.slots; i--) if (!qs[i].done && qs[i].kind !== 'custom') { qs[i].dropped = true; left--; }
    }
    // свои задания: ранг не выше потолка (уровень и главный навык на начало дня)
    for (const q of qs) if (q.kind === 'custom' && RANKS.indexOf(q.rank) > capOf(q)) q.rank = RANKS[capOf(q)];
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
      // ржавчина: +bonus первому по времени выполнения заданию дня с тегом ржавого навыка; ритуал этого навыка раньше — снимает без бонуса
      const rustFirst = new Set<string>();
      if (snap) {
        const byTime = qs.filter(q => q.done && !q.legacy).map((q, i) => ({ q, t: completedAt.get(q.id) ?? issuedTs.get(d) ?? 0, i })).sort((a, b) => a.t - b.t || a.i - b.i);
        const ritTs = (id: SkillId) => Math.min(...ladList.filter(l => l.skill === id && l.status !== 'gone' && l.status !== 'queued' && l.created <= d && l.rit.has(d)).map(l => l.rit.get(d)!));
        for (const id of SKILL_IDS) if (snap.skills[id].rusty) { const x = byTime.find(x => x.q.skills.includes(id)); if (x && x.t < ritTs(id)) rustFirst.add(x.q.id); }
      }
      const rows = qs.filter(q => q.done).map(q => {
        if (q.legacy) return { q, gb: 0, r: { base: q.xp, k: 1, bonus: 0, penalty: 0, mult: 1, xp: q.xp, gold: goldFor(q.xp) } };
        const themeOk = themeBonusApplies(theme, q.stat, q.skills), main = q.skills[0];
        const b = snap ? questBonuses({ skills: q.skills, stat: q.stat, verify: q.verify!, streak, theme: themeOk, weakest: q.stat === weak,
          cls: cls && { id: cls.id, power: snap.power },
          perk: mainSkillPerks(main, snap.skills[main].level, skillForm(main, snap.forms), snap.skills[main].rusty), rust: rustFirst.has(q.id), inspire: ab.inspire })
          : { bonuses: [streakBonus(streak), themeOk ? BALANCE.bonus.theme : 0, q.stat === weak ? BALANCE.bonus.weakest : 0], goldBonus: 0 };   // до depthSince — прежний набор
        return { q, gb: b.goldBonus, r: questReward({ rank: q.rank, verify: q.verify!, bonuses: b.bonuses, goldBonus: b.goldBonus,
          mult: (q.kind === 'restore' ? BALANCE.restore.mult : 1) * (ab.rush === q.id ? CL.rushMult : 1) * (q.stat === 'int' && d >= BALANCE.automationSince ? intFocusMult(vit?.focus ?? null) : 1),
          penalties: [weakening ? BALANCE.penalty.weakening : 0, imbalance && q.stat === strong ? BALANCE.penalty.imbalance : 0,
            fatiguePenalty(vit?.fatigue ?? 0)] }) };
      });
      // свои ≤ dayShare XP дня: min(Σ своих, round(Σ остальных × share / (1 − share))); урезание пропорционально, остаток — последней строке
      const own = rows.filter(x => x.q.kind === 'custom'), ownXp = own.reduce((a, x) => a + x.r.xp, 0);
      const share = BALANCE.custom.dayShare;
      const allowed = Math.min(ownXp, Math.round(rows.reduce((a, x) => a + (x.q.kind === 'custom' ? 0 : x.r.xp), 0) * share / (1 - share)));
      let left = allowed;
      if (allowed < ownXp) own.forEach((x, i) => {
        const v = i === own.length - 1 ? left : Math.floor(x.r.xp * allowed / ownXp);
        left -= v; x.r = { ...x.r, xp: v, gold: goldFor(v, x.gb) };
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
    if (d < today && d >= BALANCE.rivalSince && addDays(d, 1).endsWith('-01')) {
      // «Месяц в лимите» (Бюджет) и «Отложить 10% дохода» (Накопления) — по событиям до закрытия последнего дня месяца
      const m = d.slice(0, 7), b = budgetMonth(m), cents = (x: number) => Math.round(x * 100);
      if (b.inLimit) add(budgetRow(`budget:month:${m}`, d, FB.monthRank, 'budget', b.verify));
      if (b.t.income > 0 && cents(b.t.saving) >= cents(b.t.income) * FB.saveShare) add(budgetRow(`budget:save:${m}`, d, FB.saveRank, 'savings', b.verify));
    }
    if (d <= today) gameDay(d, qs);
    if (firstLadder && d >= firstLadder && d <= today) ladderDay(d);
    if (firstFacet && d >= firstFacet && d <= today) shadowDay(d);
    if (!firstDay || d < firstDay || d >= today) { pathDay(d); continue; }
    // закрытие дня: серия (заморозка гасит ближайший пропуск), идеальный день; история — для дней с выдачей
    const o = outcomeOf(d), rest = restDays.has(d) || dayOff.has(d), dq = qs.filter(q => q.done);
    const real = qs.filter(q => q.kind !== 'custom'), realDone = real.filter(q => q.done).length;
    // «Щит» — как заморозка, без траты заморозки; при нулевой серии заморозка не тратится
    const freeze = !ab.shield && !o.neutral && !o.counted && freezes > 0 && streak > 0;
    if (freeze) freezes--;
    streak = nextStreak(streak, o, freeze || ab.shield, snap?.flat.streakMiss);
    if (o.perfect) add(flatRow(`perfect:${d}`, closesAtTs(d, closeOf(d)), d, 'perfect_day', BALANCE.streak.perfectXp, null));
    // порядок конца дня: задания → недельные → ступени пути → ранг недели (золото — в goldSoFar следующего дня)
    pathDay(d);
    if (addDays(d, -6) >= BALANCE.depthSince && addDays(weekStart(d), 6) === d) rankWeek(d);   // с первого понедельника ≥ depthSince
    closed.push({ date: d, done: dq.length, rest }); if (!rest) workDays.push(d);
    if (!rest) idleRun = realDone || (ritualsOn.get(d)?.done ?? 0) > 0 ? 0 : idleRun + 1; // ритуал — тоже активность
    dayOf(d).streak = streak;
    if (!qs.length) continue;
    history.push({ date: d, xp: dq.reduce((a, q) => a + q.xpFinal!, 0), completed: dq.length, issued: qs.length, counted: o.counted, perfect: o.perfect, rest, streak,
      hp: vit!.hp, energy: vit!.energy, focus: vit!.focus, fatigue: vit!.fatigue });
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
  // Золото достижений учитывается при покупках по дате покупки; first_purchase зависит от покупок, поэтому считаем дважды
  // (золото самого first_purchase на проверку покупок не влияет — баланс не уходит в минус).
  let achs = earnAchievements(days, today, startLevel);

  // Магазин: покупки — после всех строк леджера, когда известен весь заработок.
  const earned = ledger.reduce((a, r) => a + r.gold, 0);
  const purchases: GameState['purchases'] = [];
  let spent = 0, ri = 0, cosSpent = 0;
  for (const { id, ts, r } of buys) {
    while (ri < rerollPaid.length && rerollPaid[ri].ts <= ts) spent += rerollPaid[ri++].price;
    if (r.cosmetic) {
      if (!ownedIds.has(r.id) && earned + BALANCE.achievementGold * (achs.length + (purchases.length ? 1 : 0)) - spent >= r.price) {
        spent += r.price; cosSpent += r.price; own(r.id, gd(ts), 'shop');
      }
      continue;
    }
    // весь заработок + золото first_purchase (если покупка уже была) − потраченное = то, что показывается в gold;
    // покупки с эффектом приняты в цикле дней и здесь не перепроверяются
    const bonus = BALANCE.achievementGold * (achs.length + (purchases.length ? 1 : 0));
    if (r.effect ? acceptedFx.has(id) : earned + bonus - spent >= r.price) { spent += r.price; purchases.push({ rewardId: r.id, title: r.title, price: r.price, ts }); bump(gd(ts), 'purchases'); }
  }
  for (; ri < rerollPaid.length; ri++) spent += rerollPaid[ri].price;
  achs = earnAchievements(days, today, startLevel);
  const gold = earned + BALANCE.achievementGold * achs.length - spent;
  // титул — самый поздний по дате из достижений и пути сезона
  const titles = [...achs.flatMap(x => { const t = ACHIEVEMENTS.find(d => d.id === x.id)!.titleReward; return t ? [{ t, date: x.date }] : []; }), ...pathTitles];
  const title = titles.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).at(-1)?.t ?? 'Новичок';
  for (const t of trophies) own(trophyItemId(t.id), t.date, 'trophy');
  owned.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  // надеть: по ts, только своё и в свой слот; null — снять
  const equipped: GameState['cosmetics']['equipped'] = {};
  for (const e of equips) {
    if (!SLOTS.includes(e.slot)) continue;
    if (e.itemId === null) { delete equipped[e.slot]; continue; }
    const c = typeof e.itemId === 'string' && ownedIds.has(e.itemId) ? cosmeticById(e.itemId) : null;
    if (c && c.slot === e.slot) equipped[e.slot] = c.id;
  }

  const totalXp = ledger.reduce((a, r) => a + r.xp, 0);
  const { level, into, need } = levelFromXp(totalXp, startLevel);
  const season = seasonOf(today), theme = themeOn(today);
  const seasonXp = season.kind === 'prologue' ? 0 : ledger.filter(r => seasonOf(r.date).id === season.id).reduce((a, r) => a + r.xp, 0);
  const stepXp = season.kind === 'prologue' ? BALANCE.season.stepXp : stepXpFor(season, firstDay ?? null);
  const lastRestore: Partial<Record<Stat, ISODate>> = {};
  for (const [d, qs] of issued) if (d <= today) for (const q of qs) if (q.kind === 'restore' && !(lastRestore[q.stat]! >= d)) lastRestore[q.stat] = d;
  const formsNow = formsAt(today), forms = formMap(formsNow);
  const statInfo = Object.fromEntries(STAT_KEYS.map(k => {
    const b = baseFromXp(start.base[k], statXp[k]), { form, norm, xp14 } = formsNow[k];
    return [k, { base: b.value, into: b.into, need: b.need, xp: statXp[k], form, status: formStatus(form), norm, xp14, lastRestore: lastRestore[k] ?? null } satisfies StatInfo];
  })) as Record<Stat, StatInfo>;
  const st = dayStart.get(today);
  const vitals = todayVit ?? vitalsOn(today, 0);
  const R = BALANCE.recovery;
  let afterLeft = 0; // дни возвращения: с даты выхода, afterDays дней
  const lastEnd = recOn ? undefined : recSpans.at(-1)?.to;
  if (lastEnd) for (let i = 0; i < R.afterDays; i++) if (addDays(lastEnd, i) === today) afterLeft = R.afterDays - i;
  const suggest: GameState['today']['suggest'] =
    !recOn && !afterLeft && (vitals.fatigue >= V.fatigue.suggestAt || (vitals.hp !== null && vitals.hp < R.enterHp)) ? 'recovery_enter'
    : recOn && span(today, 1 - R.exitDays, 0).every(x => ((x === today ? vitals.hp : vitalsOn(x, 0).hp) ?? 0) > R.exitHp) ? 'recovery_exit'
    : !recOn && (types.get(today)?.kind === 'off' || types.get(today)?.kind === 'rest') && sigs.some(x => x.kind === 'arrive' && x.place === 'work' && x.d === today) ? 'day_change_work'
    : null;
  const skills = Object.fromEntries(SKILL_IDS.map(id => {
    const sk = skillFromXp(start.skills[id], skillXp[id]), idle = idleOf(skillLast[id], today), rusty = isRusty(idle), f = skillForm(id, forms);
    const perks = PERKS.filter(p => p.skill === id && p.level <= sk.level).map((p): PerkView => {
      const power = perkPower(p, f, rusty);
      return { id: p.id, level: p.level, title: p.title, desc: p.desc, kind: p.kind, power, why: rusty ? 'rust' : power < 1 ? 'form' : null };
    });
    return [id, { ...sk, xp: skillXp[id], start: start.skills[id], lastDate: skillLast[id] ?? null, idleDays: idle, rusty, perks } satisfies SkillState];
  })) as Record<SkillId, SkillState>;
  const rewards = [...shop.values()].filter(r => !r.deleted).map(({ id, title, price, effect }) => ({ id, title, price, effect }));
  const rerollsUsed = rerollsOn.get(today) ?? 0;
  const metricHistory = [...metrics].filter(([d]) => d <= today).sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, m]) => ({ date, metrics: { ...m } }));
  const sleepDate = [...metrics.keys()].filter(d => d <= today && metrics.get(d)!.sleepHours !== undefined).sort().at(-1);

  // Босс текущего сезона, шаги на сегодня (не в «день без заданий» и восстановление; отдых — в сборке), терм P.
  const sbNow = sboss && sboss.seasonId === season.id ? sboss : null, bn = bossNext(today), noSteps = dayOff.has(today) || !!recOn;
  const bossStep: GameState['genInputs']['bossStep'] = !noSteps && sboss && bn
    ? { title: sboss.parts[bn.i].steps[bn.j].title, skill: sboss.skill, link: { kind: 'boss', season: sboss.seasonId, part: bn.i as 0 | 1 | 2, step: bn.j } } : null;
  const chainStep: GameState['genInputs']['chainStep'] = !noSteps && chain
    ? { title: chain.steps[chain.current].title, skill: chain.skill, link: { kind: 'chain', chainId: chain.id, step: chain.current } } : null;
  const legacyBosses = [...bossMap.values()].filter(b => !b.defeated && !b.abandoned);
  const bossStats = [...new Set([...(sbNow && sbNow.parts.some(p => p.start <= today && !p.won) ? [sbNow.stat] : []), ...(chain ? [chain.stat] : []),
    ...legacyBosses.map(b => b.stat)])];
  const yearGoal = interview?.answers.year_goal;
  const bossOptions = bossOptionsByRules({ goals: profile?.goals ?? [], legacy: legacyBosses, yearGoal: typeof yearGoal === 'string' ? yearGoal : null, theme });

  // Финансы на сейчас: все события; месяцы — закрытые, вердикт — принятый при закрытии.
  const finNow = finAt(Infinity);
  const finPeriod = (from: ISODate, to: ISODate, lim: (s: { month: string; limit: number | null }[]) => number | null): FinPeriod => {
    const t = periodTotals(finNow.entries, from, to);
    const byCat = [...finNow.cats.values()].filter(c => c.kind === 'expense').flatMap(c => {
      const limit = c.archived ? null : lim(limSets(Infinity, c.id)), spent = t.byCat[c.id];
      return spent !== undefined || limit !== null ? [{ id: c.id, spent: spent ?? 0, limit }] : [];
    });
    return { start: from, end: to, income: t.income, expense: t.expense, saving: t.saving, loggedDays: t.loggedDays, byCat };
  };
  const finance: GameState['finance'] = {
    categories: [...finNow.cats.values()], rules: [...new Map(finRules.map(r => [r.id, r])).values()].flatMap(r => (r.categoryId === null ? [] : [{ id: r.id, pattern: r.pattern, categoryId: r.categoryId }])),
    entries: finNow.entries.map(({ ts: _, ...e }) => e),
    month: finPeriod(`${today.slice(0, 7)}-01`, lastDayOf(today.slice(0, 7)), s => limitFor(s, today.slice(0, 7))),
    week: finPeriod(thisWeek, addDays(thisWeek, 6), weekLim(thisWeek)),
    months: [...new Set(finNow.entries.map(e => e.date.slice(0, 7)))].filter(m => lastDayOf(m) < today).sort().reverse().slice(0, 24).map(m => {
      const t = periodTotals(finNow.entries, `${m}-01`, lastDayOf(m));
      return { month: m, income: t.income, expense: t.expense, saving: t.saving, inLimit: budgetMonth(m).inLimit };
    }),
    uncategorized: finNow.entries.filter(e => e.uncategorized && !e.dup).length,
  };
  const c0 = cls ?? pickClass(classWeights(stats, forms), null), cdef = CLASSES[c0.id], last = clsHist.at(-1), prevCls = clsHist.at(-2);
  const clsState: ClassState = { id: c0.id, name: cdef.name, pair: c0.pair, since: last?.date ?? null, weights: classWeights(stats, forms),
    passive: { text: cdef.passive, power: passivePower(c0, forms) },
    ability: { id: cdef.ability, name: cdef.abilityName, desc: cdef.abilityDesc, target: cdef.target, usedOn: abUsed.get(`${thisWeek}|${cdef.ability}`) ?? null,
      available: today >= BALANCE.depthSince && !abUsed.has(`${thisWeek}|${cdef.ability}`) },
    nextRecalc: `${addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, changedFrom: prevCls && last ? { id: prevCls.id, date: last.date } : null };
  const className = clsState.name;
  const a = interview?.analysis;
  const character: GameState['character'] = interview && {
    archetype: a?.archetype ?? className, summary: a?.summary ?? '', strengths: a?.strengths ?? [], weaknesses: a?.weaknesses ?? [],
    focus: a?.focus ?? [], questGuidance: a?.questGuidance ?? '', date: interview.date, ai: !!a,
  };

  return {
    profile, avatar, avatarImages, totalXp, level, xpInto: into, xpNeed: need, startLevel,
    start: { source: start.source, scores: start.scores, levelWhy: start.levelWhy },
    stats, statInfo, gold, streak: streakNow,
    className, cls: clsState, tier: tierFor(level), multipliers,
    today: {
      date: today, started: !!st, work: st?.work ?? null, wakeAt: st?.wakeAt ?? null,
      closesAt: closesAtTs(today, closeOf(today)), dayType: types.get(today) ?? null, energy: vitals.energy ?? BALANCE.energy.fallback, changed: !!st && dayChange.has(today),
      restDaysLeft: Math.max(0, BALANCE.streak.restDaysPerMonth - (restInMonth.get(today.slice(0, 7)) ?? 0)),
      // то же правило, что у платных трат: золото строк и достижений прошлых дней − принятые обычные покупки − принятые платные траты
      spendable: Math.max(0, ledger.reduce((a, r) => a + (r.date < today ? r.gold : 0), 0) + achGoldBefore(today)
        - purchases.reduce((a, p) => a + (shop.get(p.rewardId)?.effect ? 0 : p.price), 0) - cosSpent - paidSum),
      freezesLeft: Math.max(0, BALANCE.shop.freezePerMonth - (freezeMonth.get(today.slice(0, 7)) ?? 0)), dayOff: dayOff.has(today),
      data: data.get(today) ?? { flags: [] }, vitals, suggest,
      dayStart: dayStartCaps ?? { level, skills: skillLevels() }, // сегодня не в цикле — сегодняшних строк нет
      rerollsUsed, nextRerollCost: rerollsUsed >= BALANCE.reroll.free + abToday.freeRerolls ? BALANCE.reroll.cost : 0, ability: abToday, customCount: customs.get(today)?.length ?? 0,
      quests: todayQuests, xp: todayQuests.reduce((s, q) => s + (q.done ? q.xpFinal ?? 0 : 0), 0),
      metrics: metrics.get(today) ?? {}, checkedIn, lastEnergy, busyUntil, calendar,
      aiNote: (tunings.get(today) ?? tunings.get(addDays(today, -1)))?.note || null,
    },
    recovery: { active: !!recOn, since: recOn?.since ?? null, quests: recOn?.quests ?? 0,
      frozenToday: !!recOn && (restDays.has(today) || dayOff.has(today)), afterLeft },
    character, interviewAnswers: interview?.answers ?? null,
    lastHealth, sync,
    dataFlags: [...data].filter(([d]) => d > addDays(today, -30) && d <= today).sort(([a], [b]) => (a < b ? -1 : 1))
      .flatMap(([date, x]) => x.flags.map(flag => ({ date, flag }))),
    skills, rewards, purchases,
    weekly: { weekStart: thisWeek, quests: weeklyNow },
    bosses: [...bossMap.values()].filter(b => !b.abandoned),
    reports: [...reports].map(([weekStart, r]) => ({ weekStart, text: r.text, ...(r.final ? { final: true as const } : {}) })).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
    genWeekly: { weekStart: thisWeek, stats, multipliers, prevActiveDays, prevStatQuests, bestSteps7: best7(metrics, today, 'steps'), themeStat: theme ? THEMES[theme].stats[0] : null,
      easy: weekResults.find(r => r.weekStart === addDays(thisWeek, -7))?.rank === 'D',
      budget: Object.values(limitsAt(Infinity, finNow.cats, weekLim(thisWeek))).some(l => l !== null) },
    season: { id: season.id, kind: season.kind, name: season.name, start: season.start, end: season.end, theme, xp: seasonXp,
      step: Math.min(BALANCE.season.steps, Math.floor(seasonXp / stepXp)), stepXp, joined: firstDay ?? null,
      rewards: pathGot.get(season.id) ?? [], title: pathTitles.filter(x => x.sid === season.id).at(-1)?.t ?? null },
    week: { start: thisWeek, preview: weekScore(thisWeek, today), results: weekResults.slice(-12).reverse() },
    league: { tier: leagueTier(league.points), name: BALANCE.league.names[leagueTier(league.points)], points: league.points, seasonId: league.seasonId ?? season.id },
    cosmetics: { owned, equipped },
    finance, 
    dayTypes, ledger, history, achievements: achs, title, statHistory, metricHistory,
    ladders: ladList.filter(l => l.status === 'active' || l.status === 'queued' || l.status === 'auto').map(l => {
      const st = l.steps[l.step - 1], wk = l.status === 'auto';
      return { id: l.id, title: l.title, kind: l.kind, skill: l.skill, status: l.status as 'active' | 'queued' | 'auto', step: l.step as 1 | 2 | 3 | 4 | 5, attempt: l.attempt,
        windowStart: l.status === 'queued' ? null : l.windowStart, windowDays: l.win.length, done: l.done,
        required: wk ? reqOf(l.steps[L.steps - 2].per7, l.win, 7, 1) : reqOf(st.per7, l.win, L.windowDays, 2),
        todayDone: ladToday.has(l.id), todayVerify: ladToday.get(l.id) ?? null, label: st.label, xp: ritualXp(l.step),
        ask: l.ask && !l.upd.some(u => u.date >= l.askFrom), facetId: l.facetId, // «что мешает?» снимается правкой ступеней
        autoLe: st.auto?.op === '<=', steps: (l.upd.length ? l.upd[l.upd.length - 1].steps : l.steps).map(x => ({ ...x, ...(x.auto ? { auto: { ...x.auto } } : {}) })) };
    }),
    trophies,
    seasonBoss: sbNow && { seasonId: sbNow.seasonId, title: sbNow.title, skill: sbNow.skill, stat: sbNow.stat, defeated: sbNow.defeated,
      parts: sbNow.parts.map(p => ({ title: p.title, start: p.start, end: p.end, steps: p.steps.map(x => ({ ...x })), hits: p.hits,
        hp: partHp(p.steps.filter(x => x.done).length, p.steps.length, p.hits),
        status: p.won ? 'defeated' : today < p.start ? 'upcoming' : today > p.end ? 'late' : 'active' })) },
    bossOptions, chainsDone,
    chain: chain && { ...chain, steps: chain.steps.map(x => ({ ...x })) },
    shadow: {
      strength: shadowStrength(liveFacets()),
      facets: facetList.filter(f => f.status === 'on').map(f => ({ id: f.id, name: f.name, kind: f.kind, strength: f.strength, cleanRun: f.cleanRun,
        banished: f.banished, relapsedToday: relapseAt.has(`${f.id}|${today}`) })),
      nextBattle: today <= lastSunday(today.slice(0, 7)) ? lastSunday(today.slice(0, 7)) : lastSunday(addDays(`${today.slice(0, 7)}-28`, 7).slice(0, 7)),
      lastBattle,
    },
    genInputs: {
      bestSteps7: best7(metrics, today, 'steps'), bossStats, bossStep, chainStep,
      lastSleepHours: sleepDate ? metrics.get(sleepDate)!.sleepHours! : null, fatigue: vitals.fatigue,
      recovery: recOn ? { quests: recOn.quests } : null, afterRecovery: afterLeft > 0,
      recentTemplateIds: [addDays(today, -2), addDays(today, -1)].flatMap(d => issued.get(d)?.map(q => q.templateId) ?? []),
      recent: Array.from({ length: BALANCE.assembly.statEveryDays - 1 }, (_, i) => addDays(today, i + 1 - BALANCE.assembly.statEveryDays)).filter(d => issued.get(d)?.length)
        .map(date => { const qs = issued.get(date)!; return { date, stats: [...new Set(qs.map(q => q.stat))], templateIds: qs.map(q => q.templateId) }; }),
    },
  };
}

