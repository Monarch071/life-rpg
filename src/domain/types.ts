import type { RewardEffect } from './balance';
import type { ThemeId } from './calendar';
import type { DayType } from './dayType';
import type { SkillId } from './skillCatalog';
export type Stat = 'str'|'end'|'int'|'dis'|'cha'|'fin'|'spi';
export type HHMM = string;            // '09:30'
export type ISODate = string;         // '2026-11-17' — игровая дата
export interface WorkTemplate { label: string; start: HHMM; end: HHMM }
export interface Profile {
  name: string;
  wake: HHMM; sleep: HHMM;                    // обычные подъём/отбой
  workTemplates: WorkTemplate[];
  goals: { text: string; months: number; stat: Stat }[];
  sportLevel: 0|1|2|3;                         // 0 — не занимаюсь … 3 — регулярно
  stepsUsual: number;
  badHabits: string[]; goodHabits: string[];   // id из списка анкеты
  energy: { morning: number; day: number; evening: number; night: number }; // 1–5
  selfRating: Record<Stat, number>;            // 1–10
}
export interface Quest {
  id: string; date: ISODate; title: string; stat: Stat;
  difficulty?: 1|2|3|4|5;                      // только легаси
  minutes: number;
  window: { start: HHMM; end: HHMM } | null;   // null — «в течение дня»
  xp: number;
  auto: { metric: AutoMetric; op: '>='|'<='; value: number } | null;
  templateId: string;
  rank?: Rank; skills?: [SkillId] | [SkillId, SkillId]; kind?: QuestKind; why?: string;
  link?: { kind: 'boss'; season: string; part: 0 | 1 | 2; step: number } | { kind: 'chain'; chainId: string; step: number };
}
export type Metric = 'steps'|'sleepHours'|'weightKg'|'screenMin'|'spend'|'mood'|'water'|'readPages'|'workoutMin';
export interface HealthData { steps?: number; sleepHours?: number; workoutMin?: number; activeKcal?: number; restingHR?: number; weightKg?: number;
  mindfulMin?: number; workouts?: { type: string; start?: number; end?: number; minutes: number }[] }
/** Метрики авто-засчёта (спека §4.4). */
export type AutoMetric = 'steps' | 'sleepHours' | 'weightKg' | 'workoutMin' | 'strengthMin' | 'mobilityMin' | 'cardioMin' | 'sportsMin'
  | 'mindfulMin' | 'focusMin' | 'readMin' | 'gymVisits' | 'socialMin' | 'gamesMin';
export type DataFlag = { metric: 'steps' | 'sleepHours' | 'workouts'; reason: 'too_many_steps' | 'too_long_sleep' | 'overlap' };
/** Данные авто-источников за игровую дату (без названий магазинов). */
export interface DayData {
  steps?: number; sleepHours?: number; restingHR?: number; mindfulMin?: number; weightKg?: number;
  workoutMin?: number; strengthMin?: number; mobilityMin?: number; cardioMin?: number; sportsMin?: number;
  focusMin?: number; readMin?: number; socialMin?: number; gamesMin?: number; gymVisits?: number; spendAuto?: number;
  flags: DataFlag[];
}
export type Signal =
  | { kind: 'arrive'; place: 'gym' | 'work' | 'home' }
  | { kind: 'app'; app: 'social' | 'games'; state: 'open' | 'close' }
  | { kind: 'focus'; state: 'on' | 'off' }
  | { kind: 'wallet'; amount: number; merchant: string };
export type Answers = Record<string, string | number | string[]>;
export interface Analysis { archetype: string; summary: string; strengths: string[]; weaknesses: string[]; stats: Record<Stat, number>; focus: string[]; questGuidance: string;
  scores?: Record<Stat, number>; startLevel?: number; levelWhy?: Partial<Record<Stat, string>>; skillLevels?: Partial<Record<SkillId, number>> }
export type GameEvent = { id: string; ts: number; deviceId: string } & (
  | { type: 'onboarding_completed'; profile: Profile }
  | { type: 'day_started'; date: ISODate; work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM; dayType?: DayType; energy?: number /* 1–10 */ }
  | { type: 'day_types_set'; types: DayType[] }
  | { type: 'day_changed'; date: ISODate; dayType: DayType; at: HHMM }
  | { type: 'busy_until'; date: ISODate; until: HHMM }
  | { type: 'quests_issued'; date: ISODate; quests: Quest[] }
  | { type: 'quest_completed'; date: ISODate; questId: string; verify?: 'photo'; photo?: string }
  | { type: 'metric_logged'; date: ISODate; metric: Metric; value: number; mode: 'set'|'add' }
  | { type: 'checkin'; date: ISODate; went: string; notWent: string; energy: number }
  | { type: 'health_packet'; date: ISODate; kind: 'morning'|'evening'|'other'; health: HealthData; calendar: { title: string; start: string; end: string }[] }
  | { type: 'avatar_updated'; params: AvatarParams }
  | { type: 'reward_created'; rewardId: string; title: string; price: number; effect?: RewardEffect }
  | { type: 'quest_rerolled'; date: ISODate; questId: string; replacement: Quest }
  | { type: 'custom_quest_added'; date: ISODate; quest: Quest }
  | { type: 'reward_deleted'; rewardId: string }
  | { type: 'reward_purchased'; rewardId: string }
  | { type: 'skill_unlocked'; skillId: string }
  | { type: 'weekly_issued'; weekStart: ISODate; quests: WeeklyQuest[] }
  | { type: 'boss_created'; bossId: string; title: string; stat: Stat; stages: string[] }
  | { type: 'boss_stage_done'; bossId: string; stage: number }
  | { type: 'boss_abandoned'; bossId: string }
  | { type: 'ai_tuning'; date: ISODate; factors: Partial<Record<Stat, number>>; note: string }
  | { type: 'ai_report'; weekStart: ISODate; text: string }
  | { type: 'avatar_image'; tier: 1|2|3|4; blob: string }
  | { type: 'interview_completed'; answers: Answers; followups: { q: string; a: string }[]; analysis: Analysis | null }
  | { type: 'season_theme_set'; theme: ThemeId }
  | { type: 'signal_logged'; at: number; signal: Signal }
  | { type: 'timer_logged'; timer: 'focus' | 'reading'; start: number; end: number }
  | { type: 'recovery_started'; date: ISODate; quests: 0 | 1 | 2 }
  | { type: 'recovery_ended'; date: ISODate }
  | { type: 'ladder_created'; ladderId: string; title: string; kind: LadderKind; skill: SkillId; steps: LadderStep[]; suitable?: 'all' | 'workdays'; facetId?: string }
  | { type: 'ladder_updated'; ladderId: string; title?: string; steps?: LadderStep[] }
  | { type: 'ladder_removed'; ladderId: string }
  | { type: 'ritual_done'; ladderId: string; date: ISODate }
  | { type: 'facet_added'; facetId: string; name: string; kind: FacetKind; start: number }
  | { type: 'facet_removed'; facetId: string }
  | { type: 'shadow_relapse'; facetId: string; date: ISODate }
  | { type: 'season_boss_set'; seasonId: string; boss: BossDraft }
  | { type: 'season_boss_abandoned'; seasonId: string }
  | { type: 'chain_started'; chainId: string; title: string; skill: SkillId; steps: string[] }
  | { type: 'chain_abandoned'; chainId: string }
);
export type WeeklyKind = 'active_days' | 'stat_quests' | 'steps_total' | 'shadow_wins';
export interface WeeklyQuest { id: string; weekStart: ISODate; kind: WeeklyKind; stat: Stat | null; target: number; title: string; xp: number }
export interface Boss { id: string; title: string; stat: Stat; stages: string[]; done: number; defeated: boolean; abandoned: boolean }
export interface WeeklyCtx { weekStart: ISODate; stats: Record<Stat, number>; multipliers: Record<Stat, number>; prevActiveDays: number; prevStatQuests: number; bestSteps7: number | null; themeStat: Stat | null; easy?: boolean }
export interface AvatarParams { hair: string; hairColor: string; outfitColor: string; eyes: string }
/** HP, Energy, Фокус, Усталость дня (спека §5, §14). */
export interface Vitals { hp: number | null; energy: number | null; focus: number | null; fatigue: number;
  parts: { hp: Partial<Record<'sleep' | 'steps' | 'rhr' | 'feel', number>>; focus: Partial<Record<'focus' | 'social', number>> };
  energyInputs: { sleep: number | null; hp: number | null; weekMorning: number | null } }
export interface DayResult { date: ISODate; xp: number; completed: number; issued: number; counted: boolean; perfect: boolean; rest: boolean; streak: number;
  hp: number | null; energy: number | null; focus: number | null; fatigue: number }
export interface StatInfo { base: number; into: number; need: number; xp: number; form: number | null; status: 'new' | 'in_form' | 'sagging' | 'abandoned'; norm: number; xp14: number; lastRestore: ISODate | null }
export interface SkillState { level: number; into: number; need: number; xp: number; start: number; lastDate: ISODate | null;
  idleDays: number | null; rusty: boolean; perks: PerkView[] }   // perks — открытые; idleDays — незамороженные дни простоя на начало сегодня
export interface PerkView { id: string; level: 3 | 6 | 10; title: string; desc: string; kind: 'pct' | 'flat'; power: 0 | 0.5 | 1; why: 'rust' | 'form' | null }
/** Класс (спека §4): pair — пара, давшая класс (у Странника null); since — дата присвоения. */
export interface ClassState { id: ClassId; name: string; pair: [Stat, Stat] | null; since: ISODate | null; weights: Record<Stat, number>;
  passive: { text: string; power: 0 | 0.5 | 1 };
  ability: { id: AbilityId; name: string; desc: string; target: 'quest' | 'day' | 'week'; usedOn: ISODate | null; available: boolean };
  nextRecalc: ISODate; changedFrom: { id: ClassId; date: ISODate } | null }
export interface LedgerEntry { id: string; ts: number; date: ISODate; source: 'quest' | 'perfect_day' | 'day_changed' | 'weekly' | 'boss' | 'ritual' | 'ladder' | 'shadow' | 'chain';
  questId?: string; base: number; k: number; bonus: number; penalty: number; mult: number; xp: number; gold: number;
  skills: [SkillId, number][]; stats: Partial<Record<Stat, number>>; verified: boolean }
/** legacy — задание без ранга (старый журнал): XP как сохранено, без проверки и бонусов. */
export type DayQuest = Quest & { rank: Rank; skills: NonNullable<Quest['skills']>; kind: QuestKind; done: boolean; verify: Verify | null; xpFinal: number | null; dropped: boolean; legacy: boolean }
export interface GameState {
  profile: Profile | null; avatar: AvatarParams;
  avatarImages: Partial<Record<1|2|3|4, string>>;   // имя блоба аватара по тирам
  totalXp: number; level: number; xpInto: number; xpNeed: number;   // totalXp — сумма строк леджера; уровень от startLevel
  startLevel: number;
  start: { source: 'ai' | 'rules' | 'none'; scores: Record<Stat, number>; levelWhy: Partial<Record<Stat, string>> };
  stats: Record<Stat, number>;          // Основа 1–100
  statInfo: Record<Stat, StatInfo>;
  gold: number; streak: number;
  className: string; tier: 1|2|3|4;   // className = cls.name
  cls: ClassState;
  multipliers: Record<Stat, number>;
  today: { date: ISODate; started: boolean; work: {start:HHMM;end:HHMM}|null; wakeAt: HHMM|null;
           quests: DayQuest[]; xp: number;
           metrics: Partial<Record<Metric, number>>; checkedIn: boolean; lastEnergy: number|null;
           busyUntil: HHMM|null; aiNote: string|null; calendar: { title: string; start: HHMM; end: HHMM }[];
           closesAt: number;              // ts закрытия игрового дня (по отбою его типа)
           dayType: DayType | null;       // из последнего day_changed, иначе day_started; день не начат — null
           energy: number | null;         // 0–100: утренняя оценка ×10 → чек-ин ×10 → fallback; день не начат — null
           changed: boolean;              // был «День изменился»
           restDaysLeft: number;          // дней отдыха в этом календарном месяце осталось
           dayStart: { level: number; skills: Record<SkillId, number> };   // уровень и навыки на начало дня — потолки рангов для переброса и своих
           rerollsUsed: number; nextRerollCost: number;   // принятые перебросы сегодня; цена следующего (0 | 50)
           customCount: number;           // своих заданий сегодня
           spendable: number;             // золото для платных трат (переброс, покупки с эффектом)
           freezesLeft: number;           // заморозок можно купить в этом месяце
           dayOff: boolean;               // сегодня — купленный «день без заданий»
           data: DayData;                 // сегодняшние данные авто-источников
           vitals: Vitals;
           suggest: 'recovery_enter' | 'recovery_exit' | 'day_change_work' | null };   // баннер Главной (не больше одного)
  /** Режим восстановления: frozenToday — сегодня день заморожен (в лимите отдыха месяца); afterLeft — дней «возвращения» осталось, включая сегодня. */
  recovery: { active: boolean; since: ISODate | null; quests: 0 | 1 | 2; frozenToday: boolean; afterLeft: number };
  character: { archetype: string; summary: string; strengths: string[]; weaknesses: string[]; focus: string[]; questGuidance: string; date: ISODate; ai: boolean } | null;   // по последней валидной анкете
  interviewAnswers: Answers | null;   // последние ответы анкеты (для промпта заданий)
  lastHealth: { ts: number; date: ISODate; health: HealthData } | null;
  sync: { last: number | null; bySource: Partial<Record<'health' | 'arrive' | 'app' | 'focus' | 'wallet' | 'timer', number>> };
  dataFlags: { date: ISODate; flag: DataFlag }[];   // за 30 дней до сегодня включительно
  skills: Record<SkillId, SkillState>;
  rewards: { id: string; title: string; price: number; effect: RewardEffect | null }[];   // не удалённые, в порядке создания
  purchases: { rewardId: string; title: string; price: number; ts: number }[];
  weekly: { weekStart: ISODate; quests: (WeeklyQuest & { progress: number; done: boolean })[] };   // неделя сегодняшней игровой даты; без выдачи — []
  bosses: Boss[];         // кроме брошенных
  reports: { weekStart: ISODate; text: string }[];   // недельные отчёты ИИ, по убыванию недели
  genWeekly: WeeklyCtx;   // контекст для generateWeeklyQuests текущей недели
  season: { id: string; kind: 'prologue' | 'winter' | 'spring' | 'summer' | 'autumn'; name: string; start: ISODate; end: ISODate; theme: ThemeId | null; xp: number; step: number };
  dayTypes: DayType[];    // шаблоны дней: последний day_types_set, иначе умолчания
  ledger: LedgerEntry[];  // начисления XP/золота, по дате
  history: DayResult[];   // финализированные дни, по возрастанию
  achievements: { id: string; date: ISODate }[];   // в порядке получения
  /** Лестницы привычек (кроме удалённых), в порядке создания; windowDays/done/required — текущее окно (ступень 5 — текущая неделя). */
  ladders: { id: string; title: string; kind: LadderKind; skill: SkillId; status: 'active' | 'queued' | 'auto';
    step: 1 | 2 | 3 | 4 | 5; attempt: 1 | 2; windowStart: ISODate | null; windowDays: number; done: number; required: number;
    todayDone: boolean; todayVerify: 'auto' | 'honest' | null; label: string; xp: number; ask: boolean; facetId: string | null;
    /** засчитывается при закрытии дня сам (авто «<=»); иначе — отметка вручную */ autoLe: boolean;
    /** ступени последней правки (для «Что мешает?») */ steps: LadderStep[] }[];
  trophies: { id: string; kind: 'avatar' | 'rare' | 'legendary'; title: string; date: ISODate }[];   // спека §8.3, по дате
  /** Босс текущего сезона (спека §5.6); части — календарные месяцы сезона. */
  seasonBoss: { seasonId: string; title: string; skill: SkillId; stat: Stat; defeated: boolean;
    parts: { title: string; start: ISODate; end: ISODate; steps: { title: string; done: boolean }[]; hits: number; hp: number;
      status: 'upcoming' | 'active' | 'late' | 'defeated' }[] } | null;
  bossOptions: BossDraft[];   // правилами; UI заменяет на ИИ-варианты, если есть ключ
  chain: { id: string; title: string; skill: SkillId; stat: Stat; steps: { title: string; done: boolean }[]; current: number } | null;
  chainsDone: number;
  /** Враг-тень (спека §4): strength — среднее неизгнанных граней, нет — null; названия граней — только на экране владельца, не в ИИ. */
  shadow: { strength: number | null;
    facets: { id: string; name: string; kind: FacetKind; strength: number; cleanRun: number; banished: boolean; relapsedToday: boolean }[];   // серьёзная зависимость гранью не становится
    nextBattle: ISODate; lastBattle: { date: ISODate; strength: number; result: 'crush' | 'win' | 'draw' | 'lost'; xp: number; plan: string | null } | null };
  title: string;          // titleReward последнего достижения с титулом, иначе 'Новичок'
  statHistory: { date: ISODate; stats: Record<Stat, number> }[];   // Основа на конец каждого финализированного дня
  metricHistory: { date: ISODate; metrics: Partial<Record<Metric, number>> }[];   // даты ≤ сегодня с метриками, по возрастанию
  genInputs: { bestSteps7: number|null; bossStats: Stat[]; bossStep: QuestStep | null; chainStep: QuestStep | null; lastSleepHours: number|null; recentTemplateIds: string[]; fatigue: number;
    recovery: { quests: 0 | 1 | 2 } | null; afterRecovery: boolean;
    recent: { date: ISODate; stats: Stat[]; templateIds: string[] }[] };
    // для сборки дня: лучший 7‑дневный средний по шагам (из metric_logged steps), сон за последний день с данными,
    // templateId заданий за 2 прошлых дня; recent — те же 2 дня (только с выдачей): характеристики и шаблоны
}
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Verify = 'auto' | 'photo' | 'honest';
export type ClassId = 'warrior' | 'paladin' | 'ranger' | 'sage' | 'strategist' | 'merchant' | 'bard' | 'wanderer';
export type AbilityId = 'rush' | 'shield' | 'insight' | 'plan' | 'deal' | 'inspire' | 'march' | 'universal';
export type SeasonKind = 'prologue' | 'winter' | 'spring' | 'summer' | 'autumn';
export type QuestKind = 'daily' | 'challenge' | 'restore' | 'custom' | 'boss' | 'chain';
export interface LadderStep { label: string; per7: 1 | 2 | 3 | 4 | 5 | 6 | 7; auto?: { metric: AutoMetric; op: '>=' | '<='; value: number } }
export type LadderKind = 'do' | 'dont';
export type FacetKind = 'games' | 'social' | 'late' | 'junk' | 'smoke' | 'procr' | 'alcohol' | 'custom';
/** Шаг босса/цепочки для сборки дня. */
export type QuestStep = { title: string; skill: SkillId; link: NonNullable<Quest['link']> };
export type BossDraft = { title: string; skill: SkillId; parts: { title: string; steps: string[] }[] };
