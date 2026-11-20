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
  skill:   { maxLevel: 10, costK: 100, rulesStartMax: 4, aiStartMax: 7, mainShare: 0.6 },
  day:     { noonMin: 720, minutesPerDay: 1440, msPerDay: 864e5, legacyEarlyStartMin: 360, labelMax: 40, closeAfterBedMin: 60, closeLatestMin: 240, closeDefaultMin: 240, maxSlots: 7, minWindowMin: 20, workoutBeforeBedMin: 120 },
  energy:  { low: 40, high: 70, fallback: 50 },
  assembly:{ maxPerStat: 2, statEveryDays: 3, p: { boss: 3, form: 2, theme: 1.5, idle: 1, idleDays: 7, repeat: -2 } },
  streak:  { countShare: 0.6, missFactor: 0.5, perfectXp: 50, restDaysPerMonth: 14 },
  reroll:  { free: 1, cost: 50 },
  custom:  { perDay: 2, dayShare: 0.25 },
  dayChangedXp: 20,
  season:  { prologueEnd: '2026-11-30', stepXp: 600, steps: 30, stepGold: 50, itemEvery: 3, bgStep: 10, frameStep: 20, lookStep: 30, minStepXp: 60, roundStep: 10 },
  cosmeticPrices: [100, 150, 200, 300, 400, 500, 650, 800],
  depthSince: '2026-12-16',   // игровая дата выхода этапа «Глубина»: раньше — без перков, пассивов, ржавчины, способностей, рангов недели
  perks:   { levels: [3, 6, 10], xpPct: 0.1, goldPct: 0.1, relapse: 5, streakMiss: 0.75, fatigueDecay: 3, pctFull: 0.8, flatMin: 0.4 },
  rust:    { days: 30, warnDays: 23, bonus: 0.5 },
  classes: { wandererSpread: 0.1, hysteresis: 0.05, passiveFull: 0.8, passiveHalf: 0.4,
             passive: { warrior: 0.1, paladinStreak: 0.01, sage: 0.1, strategist: 0.1, merchantGold: 0.1, bard: 0.15, ranger: 0.1, wanderer: 0.05 },
             rushMult: 2, dealRerolls: 3, inspire: 0.2, march: 0.8 },
  week:    { s: 0.9, a: 0.8, b: 0.65, c: 0.5, sXp: 1.2, baseDayXp: 150, minDays: 3, avgWeeks: 4,
             gold: { S: 500, A: 300, B: 150, C: 50, D: 0 }, points: { S: 3, A: 2, B: 1, C: 0, D: -1 }, chestFallbackGold: 200,
             easy: { daysMinus: 1, share: 0.8, minQuests: 2 } },
  league:  { names: ['Бронза', 'Серебро', 'Золото', 'Платина', 'Алмаз', 'Легенда'], perTier: 6, maxPoints: 35 },
  calibration: { up: 0.85, down: 0.6, upK: 1.1, downK: 0.85, startK: 1.1 },
  shop:    { freezePerMonth: 2 },
  achievementGold: 25, weeklyXp: 150,
  vitals: {
    hp:      { w: { sleep: 0.4, steps: 0.3, rhr: 0.2, feel: 0.1 }, windowDays: 3, sleepMin: 7, sleepMax: 9, sleepPerHour: 20,
               rhrPerBeat: 10, rhrDays: 30, rhrMinSamples: 5, feelFull: 8, stepsGoalDefault: 6000 },
    energy:  { w: { sleep: 0.6, morning: 0.25, hp: 0.15 }, weekDays: 7 },
    focus:   { w: { focus: 0.7, social: 0.3 }, fullMin: 90, socialOkMin: 30, socialZeroMin: 120, sourceDays: 14,
               intBase: 0.8, intSpan: 0.4, openTailMin: 15, sessionMaxMin: 180, intervalMaxMin: 240 },
    fatigue: { shortNightH: 6, shortNight: 15, longNightH: 7.5, longNight: -20, bigDayShare: 1.5, bigDay: 10, bigDayWindow: 14, bigDayMinDays: 7,
               rest: -15, calm: -10, calmMindfulMin: 10, lowEveningMax: 3, lowEvening: 5, nightly: -5, spiritAbove: 50, suggestAt: 70, relapse: 5 },
  },
  recovery:  { maxQuests: 2, exitHp: 60, exitDays: 2, enterHp: 40, afterDays: 2,
               skills: ['mindfulness', 'rest', 'reflection', 'sleep', 'mobility'] },
  plausible: { stepsMax: 50_000, sleepMaxH: 14 },
  autoLeMaxMin: 5, autoLeSourceDays: 3,
  timer:     { maxMin: 240, skewMin: 1 },
  automationSince: '2026-11-20',   // игровая дата старта Автоматики: раньше — без Усталости и множителя Фокуса
  freshnessStaleH: 36,
  metricAbsMax: 1e9,   // предел накопительной суммы metric_logged 'add'
  ladder: { maxActive: 3, steps: 5, windowDays: 14, pass: 0.8, repeat: 0.5, relapseShare: 0.6, relapseWeeks: 2,
            xp: [15, 20, 25, 30, 10], bonus: [100, 150, 200, 300], assist: 1 },
  shadow: { maxFacets: 3, startMin: 30, startMax: 80, start: { rare: 30, sometimes: 50, often: 65, daily: 80 },
            relapse: 8, clean: 2, cleanWeek: 5, cleanWeekDays: 7, honestXp: 5, banishDays: 30, dataRelapseMin: 120,
            battle: { crushBelow: 30, winBelow: 50, drawBelow: 70, crushXp: 400, winXp: 250, drawXp: 50 } },
  boss:   { parts: 3, stepsMin: 2, stepsMax: 5, stepsShare: 80, hitDamage: 4, hitCap: 5, partXp: 300, seasonXp: 1500 },
  chain:  { stepsMin: 3, stepsMax: 6, doneXp: 200 },
  trophies: { avatar: 'Знак привычки', rare: 'Осколок тени', legendary: 'Корона сезона' },
  dayTypes: DEFAULT_DAY_TYPES,
  rewards: DEFAULT_REWARDS,
  legacyRank: { 1: 'E', 2: 'E', 3: 'D', 4: 'C', 5: 'B' },
  legacy:  { questXpMax: 10_000, weeklyXpMax: 1000, bossStageXp: 100, bossDefeatXp: 200 },   // старый журнал: XP как сохранено, в пределах
} as const;

export const RANKS: readonly Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];
