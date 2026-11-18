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
  difficulty: 1|2|3|4|5; minutes: number;
  window: { start: HHMM; end: HHMM } | null;   // null — «в течение дня»
  xp: number;
  auto: { metric: 'steps'|'sleepHours'|'weightKg'|'workoutMin'; op: '>='|'<='; value: number } | null;
  templateId: string;
}
export type Metric = 'steps'|'sleepHours'|'weightKg'|'screenMin'|'spend'|'mood'|'water'|'readPages'|'workoutMin';
export interface HealthData { steps?: number; sleepHours?: number; workoutMin?: number; activeKcal?: number; restingHR?: number; weightKg?: number }
export type Answers = Record<string, string | number | string[]>;
export interface Analysis { archetype: string; summary: string; strengths: string[]; weaknesses: string[]; stats: Record<Stat, number>; focus: string[]; questGuidance: string;
  scores?: Record<Stat, number>; startLevel?: number; levelWhy?: Partial<Record<Stat, string>>; skillLevels?: Partial<Record<SkillId, number>> }
export type GameEvent = { id: string; ts: number; deviceId: string } & (
  | { type: 'onboarding_completed'; profile: Profile }
  | { type: 'day_started'; date: ISODate; work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM }
  | { type: 'busy_until'; date: ISODate; until: HHMM }
  | { type: 'quests_issued'; date: ISODate; quests: Quest[] }
  | { type: 'quest_completed'; date: ISODate; questId: string }
  | { type: 'metric_logged'; date: ISODate; metric: Metric; value: number; mode: 'set'|'add' }
  | { type: 'checkin'; date: ISODate; went: string; notWent: string; energy: number }
  | { type: 'health_packet'; date: ISODate; kind: 'morning'|'evening'|'other'; health: HealthData; calendar: { title: string; start: string; end: string }[] }
  | { type: 'avatar_updated'; params: AvatarParams }
  | { type: 'reward_created'; rewardId: string; title: string; price: number }
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
);
export type WeeklyKind = 'active_days' | 'stat_quests' | 'steps_total' | 'shadow_wins';
export interface WeeklyQuest { id: string; weekStart: ISODate; kind: WeeklyKind; stat: Stat | null; target: number; title: string; xp: number }
export interface Boss { id: string; title: string; stat: Stat; stages: string[]; done: number; defeated: boolean; abandoned: boolean }
export interface WeeklyCtx { weekStart: ISODate; stats: Record<Stat, number>; multipliers: Record<Stat, number>; prevActiveDays: number; prevStatQuests: number; bestSteps7: number | null }
export interface AvatarParams { hair: string; hairColor: string; outfitColor: string; eyes: string }
export interface DayResult { date: ISODate; xp: number; shadowXp: number; completed: number; issued: number; won: boolean }
export interface GameState {
  profile: Profile | null; avatar: AvatarParams;
  avatarImages: Partial<Record<1|2|3|4, string>>;   // имя блоба аватара по тирам
  totalXp: number; level: number; xpInto: number; xpNeed: number;
  stats: Record<Stat, number>; statPoints: Record<Stat, number>;
  currency: number; streak: number; shadowWinStreak: number;
  className: string; tier: 1|2|3|4;
  multipliers: Record<Stat, number>;
  today: { date: ISODate; started: boolean; work: {start:HHMM;end:HHMM}|null; wakeAt: HHMM|null;
           quests: (Quest & { done: boolean })[]; xp: number; shadowXp: number;
           metrics: Partial<Record<Metric, number>>; checkedIn: boolean; lastEnergy: number|null;
           busyUntil: HHMM|null; aiNote: string|null; calendar: { title: string; start: HHMM; end: HHMM }[];
           shadowMetrics: { metric: Metric; you: number|null; target: number; lowerIsBetter: boolean }[] };
  character: { archetype: string; summary: string; strengths: string[]; weaknesses: string[]; focus: string[]; questGuidance: string; date: ISODate; ai: boolean } | null;   // по последней валидной анкете
  interviewAnswers: Answers | null;   // последние ответы анкеты (для промпта заданий)
  lastHealth: { ts: number; date: ISODate; health: HealthData } | null;
  skills: { unlocked: string[]; points: number };   // points = доступно сейчас
  rewards: { id: string; title: string; price: number }[];   // не удалённые, в порядке создания
  purchases: { rewardId: string; title: string; price: number; ts: number }[];
  weekly: { weekStart: ISODate; quests: (WeeklyQuest & { progress: number; done: boolean })[] };   // неделя сегодняшней игровой даты; без выдачи — []
  bosses: Boss[];         // кроме брошенных
  reports: { weekStart: ISODate; text: string }[];   // недельные отчёты ИИ, по убыванию недели
  genWeekly: WeeklyCtx;   // контекст для generateWeeklyQuests текущей недели
  history: DayResult[];   // финализированные дни, по возрастанию
  achievements: { id: string; date: ISODate }[];   // в порядке получения
  title: string;          // titleReward последнего достижения с титулом, иначе 'Новичок'
  statHistory: { date: ISODate; stats: Record<Stat, number> }[];   // на конец каждого финализированного дня
  metricHistory: { date: ISODate; metrics: Partial<Record<Metric, number>> }[];   // даты ≤ сегодня с метриками, по возрастанию
  genInputs: { bestSteps7: number|null; lastSleepHours: number|null; recentTemplateIds: string[] };
    // для generateDailyQuests: лучший 7‑дневный средний по шагам (из metric_logged steps), сон за последний день с данными, templateId заданий за 2 прошлых дня
}
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Verify = 'auto' | 'photo' | 'honest';
export type QuestKind = 'daily' | 'challenge' | 'restore' | 'custom';
