import type { DayType } from './dayType';
import type { Rank } from './types';

const DEFAULT_DAY_TYPES: DayType[] = [
  { id: 'day',     kind: 'day',     label: 'Дневная смена',   wake: '08:00', busy: { start: '10:00', end: '19:00' }, bed: '00:00', slots: 4 },
  { id: 'evening', kind: 'evening', label: 'Вечерняя смена',  wake: '11:00', busy: { start: '16:00', end: '02:00' }, bed: '03:00', slots: 3 },
  { id: 'off',     kind: 'off',     label: 'Выходной',        wake: '11:00', busy: null, bed: '01:00', slots: 5 },
  { id: 'rest',    kind: 'rest',    label: 'Отдых',           wake: null,    busy: null, bed: null,    slots: 1 },
];

export type RewardEffect = 'streak_freeze' | 'day_off';
/** Стартовый набор магазина (спека §7.6): rewardId = 'default:<slug>'. */
export const DEFAULT_REWARDS: { slug: string; title: string; price: number; effect?: RewardEffect }[] = [
  { slug: 'episode',   title: 'Серия аниме или сериала',    price: 50 },
  { slug: 'games',     title: 'Вечер игр без чувства вины', price: 150 },
  { slug: 'match',     title: 'Посмотреть матч',            price: 200 },
  { slug: 'cheatmeal', title: 'Читмил',                     price: 200 },
  { slug: 'freeze',    title: 'Заморозка серии',            price: 300, effect: 'streak_freeze' },
  { slug: 'book',      title: 'Новая книга',                price: 400 },
  { slug: 'dayoff',    title: 'День без заданий',           price: 600, effect: 'day_off' },
  { slug: 'treat',     title: 'Покупка для себя',           price: 1000 },
];

// Все числа баланса живут здесь.
export const BALANCE = {
  level:   { max: 100, costK: 100, costPow: 1.5, startRulesDiv: 2, startRulesMax: 50, startAiMax: 60 },
  rank: {
    base:      { E: 20, D: 40, C: 70, B: 120, A: 200, S: 350 },
    levelCap:  { E: 1, D: 10, C: 20, B: 35, A: 50, S: 70 },
    skillCap:  { E: 1, D: 1, C: 3, B: 5, A: 7, S: 9 },
    paramScale:{ E: 1, D: 2, C: 3.5, B: 6, A: 10, S: 16 },
    ownShare: 0.6,
  },
  verify:  { auto: 1.0, photo: 0.9, honest: 0.7 },
  bonus:   { cap: 1.0, streakPerDay: 0.02, streakMax: 0.5, theme: 0.2, weakest: 0.25 },
  penalty: { cap: 0.5, fatiguePerPoint: 0.003, weakening: 0.2, weakeningIdleDays: 3,
             imbalance: 0.2, imbalanceShare: 0.5, imbalanceMinXp: 200, imbalanceWindow: 7 },
  goldShare: 0.2,
  stat:    { max: 100, startBase: 5, startK: 0.65, startMax: 70, pointBase: 50, pointK: 5 },
  form:    { window: 14, normShare: 0.7, normMin: 15, normDays: 60, planDays: 30, inForm: 0.8, sagging: 0.4 },
  restore: { mult: 2, cooldownDays: 7 },
  startLevel: { rulesMax: 50, aiMax: 60, scoreDiv: 2 },
  skill:   { maxLevel: 10, costK: 100, rulesStartMax: 4, aiStartMax: 7, mainShare: 0.6, nearRustDays: 23 },
  day:     { noonMin: 720, minutesPerDay: 1440, legacyEarlyStartMin: 360, labelMax: 40, closeAfterBedMin: 60, closeLatestMin: 240, closeDefaultMin: 240, maxSlots: 7, minWindowMin: 20, workoutBeforeBedMin: 120 },
  energy:  { low: 40, high: 70, fallback: 50 },
  assembly:{ maxPerStat: 2, statEveryDays: 3, p: { boss: 3, form: 2, theme: 1.5, idle: 1, idleDays: 7, repeat: -2 } },
  streak:  { countShare: 0.6, missFactor: 0.5, perfectXp: 50, restDaysPerMonth: 14 },
  reroll:  { free: 1, cost: 50 },
  custom:  { perDay: 2, dayShare: 0.25 },
  dayChangedXp: 20,
  season:  { prologueEnd: '2026-11-30', stepXp: 600, steps: 30 },
  calibration: { up: 0.85, down: 0.6, upK: 1.1, downK: 0.85, startK: 1.1 },
  shop:    { freezePerMonth: 2 },
  achievementGold: 25, weeklyXp: 150,
  metricAbsMax: 1e9,   // предел накопительной суммы metric_logged 'add'
  dayTypes: DEFAULT_DAY_TYPES,
  rewards: DEFAULT_REWARDS,
  legacyRank: { 1: 'E', 2: 'E', 3: 'D', 4: 'C', 5: 'B' },
  legacy:  { questXpMax: 10_000, weeklyXpMax: 1000, bossStageXp: 100, bossDefeatXp: 200 },   // старый журнал: XP как сохранено, в пределах
} as const;

export const RANKS: readonly Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];
