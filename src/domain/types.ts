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
  auto: { metric: 'steps'|'sleepHours'|'weightKg'; op: '>='|'<='; value: number } | null;
  templateId: string;
}
export type Metric = 'steps'|'sleepHours'|'weightKg'|'screenMin'|'spend'|'mood'|'water'|'readPages'|'workoutMin';
export type GameEvent = { id: string; ts: number; deviceId: string } & (
  | { type: 'onboarding_completed'; profile: Profile }
  | { type: 'day_started'; date: ISODate; work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM }
  | { type: 'busy_until'; date: ISODate; until: HHMM }
  | { type: 'quests_issued'; date: ISODate; quests: Quest[] }
  | { type: 'quest_completed'; date: ISODate; questId: string }
  | { type: 'metric_logged'; date: ISODate; metric: Metric; value: number; mode: 'set'|'add' }
  | { type: 'checkin'; date: ISODate; went: string; notWent: string; energy: number }
  | { type: 'avatar_updated'; params: AvatarParams }
);
export interface AvatarParams { hair: string; hairColor: string; outfitColor: string; eyes: string }
export interface DayResult { date: ISODate; xp: number; shadowXp: number; completed: number; issued: number; won: boolean }
export interface GameState {
  profile: Profile | null; avatar: AvatarParams;
  totalXp: number; level: number; xpInto: number; xpNeed: number;
  stats: Record<Stat, number>; statPoints: Record<Stat, number>;
  currency: number; streak: number; shadowWinStreak: number;
  className: string; tier: 1|2|3|4;
  multipliers: Record<Stat, number>;
  today: { date: ISODate; started: boolean; work: {start:HHMM;end:HHMM}|null; wakeAt: HHMM|null;
           quests: (Quest & { done: boolean })[]; xp: number; shadowXp: number;
           metrics: Partial<Record<Metric, number>>; checkedIn: boolean; lastEnergy: number|null;
           busyUntil: HHMM|null };
  history: DayResult[];   // финализированные дни, по возрастанию
  genInputs: { bestSteps7: number|null; lastSleepHours: number|null; recentTemplateIds: string[] };
    // для generateDailyQuests: лучший 7‑дневный средний по шагам (из metric_logged steps), сон за последний день с данными, templateId заданий за 2 прошлых дня
}
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
