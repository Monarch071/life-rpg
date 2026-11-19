import { BALANCE } from './balance';
import type { SkillId } from './skillCatalog';
import type { AutoMetric, Quest, Rank, Stat } from './types';

type Skills = [SkillId] | [SkillId, SkillId];
export interface QuestTemplate {
  id: string; stat: Stat; base: number; unit: string;
  title: (n: number) => string; minutes: (n: number) => number; allDay?: boolean; badHabit?: string;
  auto?: (n: number) => Quest['auto']; physical?: boolean;
  skills: Skills; maxRank?: Rank; scale?: Partial<Record<Rank, number>>;
}

export const DEFAULT_SKILL_BY_STAT: Record<Stat, SkillId> =
  { str: 'strength', end: 'cardio', int: 'reading', dis: 'routine', cha: 'social', fin: 'budget', spi: 'mindfulness' };
const dk = (stat: Stat): Skills => [DEFAULT_SKILL_BY_STAT[stat]];

type Forms = [string, string, string];
/** Русское склонение: 1/21 → one; 2–4/22–24 → few; остальное и 11–14 → many. */
export const plural = (n: number, one: string, few: string, many: string): string => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a >= 11 && a <= 14 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
/** Минуты шаблона: perUnit — минут на единицу, 0 — фиксированные 5 минут. */
const minutesOf = (perUnit: number) => (n: number) => (perUnit ? Math.max(5, Math.round(n * perUnit)) : 5);
/** Авто-цель «метрика ≥ N». */
const ge = (metric: AutoMetric): Partial<QuestTemplate> => ({ auto: n => ({ metric, op: '>=', value: n }) });
/** Шаблон «<глагол> N <ед.>». */
const T = (id: string, stat: Stat, base: number, unit: string | Forms, verb: string, perUnit: number,
  extra: Partial<QuestTemplate> = {}): QuestTemplate => ({
  skills: dk(stat), id, stat, base, unit: typeof unit === 'string' ? unit : unit[2],
  title: n => `${verb} ${n} ${typeof unit === 'string' ? unit : plural(n, ...unit)}`,
  minutes: minutesOf(perUnit), ...extra,
});
/** Одноразовое задание без числа. */
const O = (id: string, stat: Stat, title: string, min: number, extra: Partial<QuestTemplate> = {}): QuestTemplate =>
  ({ skills: dk(stat), id, stat, base: 1, unit: '', title: () => title, minutes: () => min, ...extra });
const H = (id: string, badHabit: string, stat: Stat, title: string, skills: Skills = ['habits'], extra: Partial<QuestTemplate> = {}): QuestTemplate =>
  O(id, stat, title, 0, { allDay: true, badHabit, skills, ...extra });
/** «Без …»: минуты группы приложений за день ≤ порога (решается при закрытии дня). */
const le = (metric: AutoMetric): Partial<QuestTemplate> => ({ auto: () => ({ metric, op: '<=', value: BALANCE.autoLeMaxMin }) });

const REP: Forms = ['раз', 'раза', 'раз'];
export const QUEST_TEMPLATES: QuestTemplate[] = [
  // Сила
  T('pushups', 'str', 20, REP, 'Отжаться', 0.3, { physical: true }),
  T('squats', 'str', 30, REP, 'Присесть', 0.25, { physical: true }),
  T('plank', 'str', 60, 'сек', 'Простоять в планке', 0.1, { physical: true }),
  T('abs', 'str', 25, REP, 'Пресс:', 0.25, { physical: true }),
  T('pullups', 'str', 8, REP, 'Подтянуться', 1, { physical: true }),
  T('workout', 'str', 30, 'мин', 'Силовая тренировка', 1, { physical: true, ...ge('strengthMin') }),
  T('stretch', 'str', 10, 'мин', 'Растяжка', 1, { physical: true, skills: ['mobility'], ...ge('mobilityMin') }),
  T('ball', 'str', 15, 'мин', 'Спортивная игра', 1, { physical: true, skills: ['sports'], ...ge('sportsMin') }),
  O('gym', 'str', 'Сходить в зал', 0, { allDay: true, physical: true, skills: ['strength'], auto: () => ({ metric: 'gymVisits', op: '>=', value: 1 }) }),
  // Выносливость
  { skills: ['cardio'], maxRank: 'B', scale: { E: 1, D: 1.25, C: 1.5, B: 2 },
    id: 'steps', stat: 'end', base: 6000, unit: 'шагов', title: n => `Пройти ${n} ${plural(n, 'шаг', 'шага', 'шагов')}`, minutes: () => 0,
    allDay: true, auto: n => ({ metric: 'steps', op: '>=', value: n }), physical: true },
  T('run', 'end', 20, 'мин', 'Пробежка', 1, { physical: true, ...ge('cardioMin') }),
  T('walk', 'end', 30, 'мин', 'Прогулка', 1, { physical: true }),
  T('cardio', 'end', 20, 'мин', 'Кардио', 1, { physical: true, ...ge('cardioMin') }),
  T('rope', 'end', 100, REP, 'Скакалка', 0.1, { physical: true }),
  T('bike', 'end', 30, 'мин', 'Велосипед', 1, { physical: true, ...ge('cardioMin') }),
  T('stairs', 'end', 10, ['этаж', 'этажа', 'этажей'], 'Подняться пешком на', 0.5, { physical: true }),
  O('sleep', 'end', 'Выспаться: 7,5 часов сна', 0, { allDay: true, skills: ['sleep'], auto: () => ({ metric: 'sleepHours', op: '>=', value: 7.5 }) }),
  T('water', 'end', 6, ['стакан', 'стакана', 'стаканов'], 'Выпить воды:', 1, { skills: ['nutrition'] }),
  // Интеллект
  T('read', 'int', 15, ['страницу', 'страницы', 'страниц'], 'Прочитать', 1.5, { auto: n => ({ metric: 'readMin', op: '>=', value: minutesOf(1.5)(n) }) }),
  T('course', 'int', 30, 'мин', 'Учиться по курсу', 1, { skills: ['tech'] }),
  T('words', 'int', 10, ['слово', 'слова', 'слов'], 'Выучить', 1.5, { skills: ['languages'] }),
  T('article', 'int', 1, ['статью', 'статьи', 'статей'], 'Прочитать', 15),
  T('puzzle', 'int', 15, 'мин', 'Решать задачи', 1, { skills: ['tech'] }),
  T('podcast', 'int', 20, 'мин', 'Послушать познавательный подкаст', 1),
  T('ideas', 'int', 3, ['идею', 'идеи', 'идей'], 'Записать', 3, { skills: ['tech'] }),
  // Дисциплина
  O('plan', 'dis', 'Составить план на день', 10),
  O('bed', 'dis', 'Заправить постель', 5),
  T('focus', 'dis', 45, 'мин', 'Глубокая работа без отвлечений:', 1, { skills: ['focus'], ...ge('focusMin') }),
  T('clean', 'dis', 15, 'мин', 'Уборка', 1),
  T('todo', 'dis', 3, ['дело', 'дела', 'дел'], 'Закрыть', 10, { skills: ['focus'] }),
  O('coldshower', 'dis', 'Закончить душ холодной водой', 5, { skills: ['habits'] }),
  T('nophone', 'dis', 60, 'мин', 'Не трогать телефон', 1, { skills: ['focus'] }),
  // Харизма
  T('compliments', 'cha', 2, ['комплимент', 'комплимента', 'комплиментов'], 'Сделать', 3),
  T('call', 'cha', 1, ['близкому', 'близким', 'близким'], 'Позвонить', 15),
  T('newtalk', 'cha', 1, ['новым человеком', 'новыми людьми', 'новыми людьми'], 'Заговорить с', 10),
  T('oldfriends', 'cha', 2, ['давнему знакомому', 'давним знакомым', 'давним знакомым'], 'Написать', 5),
  T('speak', 'cha', 5, 'мин', 'Проговорить вслух речь', 1, { skills: ['speaking'] }),
  T('thanks', 'cha', 2, ['человеку', 'людям', 'людям'], 'Сказать спасибо', 3),
  T('advice', 'cha', 1, ['человека', 'человек', 'человек'], 'Спросить совета у', 10),
  O('negotiate', 'cha', 'Отработать сценарий переговоров с ИИ', 15, { skills: ['negotiation'] }),
  O('lead', 'cha', 'Провести короткую планёрку', 15, { skills: ['leadership'] }),
  O('delegate', 'cha', 'Расписать задачу для другого и проверить результат', 15, { skills: ['delegation'] }),
  O('help', 'cha', 'Помочь коллеге в завал', 20, { skills: ['teamwork'] }),
  // Финансы
  T('expenses', 'fin', 5, ['трату', 'траты', 'трат'], 'Записать', 1),
  O('nobuy', 'fin', 'День без импульсных покупок', 0, { allDay: true }),
  O('budget', 'fin', 'Свериться с бюджетом на месяц', 10),
  T('save', 'fin', 300, '₽', 'Отложить', 0, { skills: ['savings'] }),
  T('finlearn', 'fin', 20, 'мин', 'Изучать финансы', 1, { skills: ['earning'] }),
  T('earnideas', 'fin', 5, ['идею заработка', 'идеи заработка', 'идей заработка'], 'Записать', 3, { skills: ['earning'] }),
  T('subs', 'fin', 2, ['подписку', 'подписки', 'подписок'], 'Проверить', 5),
  // Дух
  T('meditate', 'spi', 10, 'мин', 'Медитация', 1, ge('mindfulMin')),
  T('gratitude', 'spi', 3, ['вещь', 'вещи', 'вещей'], 'Записать благодарность за', 2, { skills: ['reflection'] }),
  T('journal', 'spi', 10, 'мин', 'Дневник', 1, { skills: ['reflection'] }),
  T('breath', 'spi', 5, 'мин', 'Дыхательная практика', 1, ge('mindfulMin')),
  T('nature', 'spi', 20, 'мин', 'Побыть на природе', 1, { skills: ['rest'] }),
  T('silence', 'spi', 30, 'мин', 'Тишина без экранов', 1, { skills: ['rest'] }),
  // Вредные привычки (badHabit — id из анкеты)
  H('no_games', 'games', 'dis', 'Без игр сегодня', ['habits'], le('gamesMin')),
  H('no_social', 'social', 'dis', 'Без соцсетей сегодня', ['habits'], le('socialMin')),
  H('no_late', 'late', 'spi', 'Лечь спать вовремя', ['rest']),
  H('no_junk', 'junk', 'end', 'Без фастфуда сегодня', ['nutrition']),
  H('no_smoke', 'smoke', 'dis', 'Не курить сегодня'),
  H('no_procr', 'procr', 'dis', 'Не откладывать дела на потом'),
];

/** Шаблон для неизвестной (своей) привычки. */
export const genericBadHabit = (habit: string): QuestTemplate => H('no_custom', habit, 'dis', `Без «${habit}» сегодня`);

/** Параметр задания на ранге: round(base × масштаб ранга × множитель количества). */
export const paramFor = (t: QuestTemplate, rank: Rank, mult: number): number =>
  Math.round(t.base * (t.scale?.[rank] ?? BALANCE.rank.paramScale[rank]) * mult);

/** Навык для старых записей журнала (templateId → навык). */
export const LEGACY_SKILL_BY_TEMPLATE: Record<string, SkillId> = {
  ...Object.fromEntries(QUEST_TEMPLATES.map(t => [t.id, t.skills[0]])),
  no_custom: 'habits',
};

/** Старая сложность 1–5 → ранг; всё непонятное — E. */
export const legacyRank = (d: unknown): Rank => (Object.hasOwn(BALANCE.legacyRank, String(d)) ? (BALANCE.legacyRank as Record<string, Rank>)[String(d)] : 'E');
