import type { ISODate } from './types';
import { levelFromXp } from './xp';

export interface AchievementCounters { questsDone: number; streak: number; level: number;
  maxStepsDay: number; perfectDays: number; checkins: number; purchases: number; skills: number; weeklyDone: number; bossesDefeated: number;
  laddersMastered: number }
export interface AchievementDef { id: string; icon: string; title: string; desc: string; titleReward: string | null; test: (c: AchievementCounters) => boolean }

const a = (id: string, icon: string, title: string, desc: string, titleReward: string | null, test: AchievementDef['test']): AchievementDef =>
  ({ id, icon, title, desc, titleReward, test });

export const ACHIEVEMENTS: AchievementDef[] = [
  a('first_quest', '🌱', 'Первый шаг', 'Выполни первое задание', null, c => c.questsDone >= 1),
  a('quests_10', '📋', 'Десяток', 'Выполни 10 заданий', null, c => c.questsDone >= 10),
  a('quests_50', '📚', 'Полсотни', 'Выполни 50 заданий', null, c => c.questsDone >= 50),
  a('quests_100', '💯', 'Сотня', 'Выполни 100 заданий', null, c => c.questsDone >= 100),
  a('quests_500', '🏛️', 'Пятьсот', 'Выполни 500 заданий', null, c => c.questsDone >= 500),
  a('streak_3', '🔥', 'Разгон', 'Серия 3 дня', null, c => c.streak >= 3),
  a('streak_7', '🔥', 'Неделя огня', 'Серия 7 дней', 'Упорный', c => c.streak >= 7),
  a('streak_30', '🌋', 'Месяц огня', 'Серия 30 дней', 'Несгибаемый', c => c.streak >= 30),
  a('streak_100', '☄️', 'Сотня дней', 'Серия 100 дней', 'Легенда', c => c.streak >= 100),
  a('level_5', '⭐', 'Уровень 5', 'Достигни 5 уровня', null, c => c.level >= 5),
  a('level_10', '🌟', 'Уровень 10', 'Достигни 10 уровня', 'Опытный', c => c.level >= 10),
  a('level_15', '💫', 'Уровень 15', 'Достигни 15 уровня', null, c => c.level >= 15),
  a('level_30', '🏆', 'Уровень 30', 'Достигни 30 уровня', 'Мастер', c => c.level >= 30),
  a('steps_10k', '👟', '10 000 шагов', 'Пройди 10 000 шагов за день', null, c => c.maxStepsDay >= 10000),
  a('perfect_day', '✅', 'Идеальный день', 'Выполни все задания дня (от 3 заданий)', null, c => c.perfectDays >= 1),
  a('checkin_7', '🧭', 'Внимание к себе', '7 чек-инов', null, c => c.checkins >= 7),
  a('first_purchase', '🎁', 'Заслуженная награда', 'Купи первую награду', null, c => c.purchases >= 1),
  a('first_skill', '🧠', 'Первый навык', 'Подними любой навык до 2 уровня', null, c => c.skills >= 1),
  a('weekly_first', '📅', 'Недельный рубеж', 'Выполни недельное задание', null, c => c.weeklyDone >= 1),
  a('boss_first', '🐉', 'Босс повержен', 'Победи босса', 'Победитель боссов', c => c.bossesDefeated >= 1),
  a('ladder_master', '🪜', 'Мастер привычки', 'Пройди 4-ю ступень лестницы привычки', null, c => c.laddersMastered >= 1),
];

/** Приращения счётчиков по игровой дате. xp — для уровня; steps — максимум; streak — значение на конец дня. */
export type Delta = Partial<Omit<AchievementCounters, 'level' | 'maxStepsDay'>> & { xp?: number; steps?: number };
const ADDITIVE = ['questsDone', 'perfectDays', 'checkins', 'purchases', 'skills', 'weeklyDone', 'bossesDefeated', 'laddersMastered'] as const;

/** Один проход по датам с событиями (по возрастанию, ≤ today): достижение получено в первую дату, где условие верно. */
export function earnAchievements(days: Map<ISODate, Delta>, today: ISODate, startLevel = 1): { id: string; date: ISODate }[] {
  const c: AchievementCounters = { questsDone: 0, streak: 0, level: startLevel, maxStepsDay: 0, perfectDays: 0, checkins: 0, purchases: 0, skills: 0, weeklyDone: 0, bossesDefeated: 0, laddersMastered: 0 };
  const got = new Set<string>(), out: { id: string; date: ISODate }[] = [];
  let xp = 0;
  for (const d of [...days.keys()].filter(k => k <= today).sort()) {
    const x = days.get(d)!;
    for (const k of ADDITIVE) c[k] += x[k] ?? 0;
    xp += x.xp ?? 0; c.level = levelFromXp(xp, startLevel).level;
    c.maxStepsDay = Math.max(c.maxStepsDay, x.steps ?? 0);
    c.streak = x.streak ?? 0;
    for (const def of ACHIEVEMENTS) if (!got.has(def.id) && def.test(c)) { got.add(def.id); out.push({ id: def.id, date: d }); }
  }
  return out;
}
