import type { Quest, Stat } from './types';

export interface QuestTemplate {
  id: string; stat: Stat; difficulty: 1|2|3|4|5; base: number; unit: string;
  title: (n: number) => string; minutes: (n: number) => number; allDay?: boolean; badHabit?: string;
  auto?: (n: number) => Quest['auto']; physical?: boolean;
}

type D = 1|2|3|4|5;
type Forms = [string, string, string];
/** Русское склонение: 1/21 → one; 2–4/22–24 → few; остальное и 11–14 → many. */
export const plural = (n: number, one: string, few: string, many: string): string => {
  const a = Math.abs(n) % 100, b = a % 10;
  return a >= 11 && a <= 14 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
/** Шаблон «<глагол> N <ед.>»; perUnit — минут на единицу, 0 — фиксированные 5 минут. */
const T = (id: string, stat: Stat, difficulty: D, base: number, unit: string | Forms, verb: string, perUnit: number,
  extra: Partial<QuestTemplate> = {}): QuestTemplate => ({
  id, stat, difficulty, base, unit: typeof unit === 'string' ? unit : unit[2],
  title: n => `${verb} ${n} ${typeof unit === 'string' ? unit : plural(n, ...unit)}`,
  minutes: n => (perUnit ? Math.max(5, Math.round(n * perUnit)) : 5), ...extra,
});
/** Одноразовое задание без числа. */
const O = (id: string, stat: Stat, difficulty: D, title: string, min: number, extra: Partial<QuestTemplate> = {}): QuestTemplate =>
  ({ id, stat, difficulty, base: 1, unit: '', title: () => title, minutes: () => min, ...extra });
const H = (id: string, badHabit: string, stat: Stat, title: string): QuestTemplate =>
  O(id, stat, 3, title, 0, { allDay: true, badHabit });

export const QUEST_TEMPLATES: QuestTemplate[] = [
  // Сила
  T('pushups', 'str', 2, 20, 'раз', 'Отжаться', 0.3, { physical: true }),
  T('squats', 'str', 2, 30, 'раз', 'Присесть', 0.25, { physical: true }),
  T('plank', 'str', 3, 60, 'сек', 'Простоять в планке', 0.1, { physical: true }),
  T('abs', 'str', 2, 25, 'раз', 'Пресс:', 0.25, { physical: true }),
  T('pullups', 'str', 4, 8, 'раз', 'Подтянуться', 1, { physical: true }),
  T('workout', 'str', 4, 30, 'мин', 'Силовая тренировка', 1, { physical: true }),
  // Выносливость
  { id: 'steps', stat: 'end', difficulty: 2, base: 6000, unit: 'шагов', title: n => `Пройти ${n} ${plural(n, 'шаг', 'шага', 'шагов')}`, minutes: () => 0,
    allDay: true, auto: n => ({ metric: 'steps', op: '>=', value: n }), physical: true },
  T('run', 'end', 3, 20, 'мин', 'Пробежка', 1, { physical: true }),
  T('walk', 'end', 1, 30, 'мин', 'Прогулка', 1, { physical: true }),
  T('cardio', 'end', 3, 20, 'мин', 'Кардио', 1, { physical: true }),
  T('rope', 'end', 3, 100, 'раз', 'Скакалка', 0.1, { physical: true }),
  T('bike', 'end', 3, 30, 'мин', 'Велосипед', 1, { physical: true }),
  T('stairs', 'end', 2, 10, ['этаж', 'этажа', 'этажей'], 'Подняться пешком на', 0.5, { physical: true }),
  // Интеллект
  T('read', 'int', 2, 15, ['страницу', 'страницы', 'страниц'], 'Прочитать', 1.5),
  T('course', 'int', 3, 30, 'мин', 'Учиться по курсу', 1),
  T('words', 'int', 2, 10, ['слово', 'слова', 'слов'], 'Выучить', 1.5),
  T('article', 'int', 2, 1, ['статью', 'статьи', 'статей'], 'Прочитать', 15),
  T('puzzle', 'int', 2, 15, 'мин', 'Решать задачи', 1),
  T('podcast', 'int', 1, 20, 'мин', 'Послушать познавательный подкаст', 1),
  T('ideas', 'int', 1, 3, ['идею', 'идеи', 'идей'], 'Записать', 3),
  // Дисциплина
  O('plan', 'dis', 1, 'Составить план на день', 10),
  O('bed', 'dis', 1, 'Заправить постель', 5),
  T('focus', 'dis', 4, 45, 'мин', 'Глубокая работа без отвлечений:', 1),
  T('clean', 'dis', 2, 15, 'мин', 'Уборка', 1),
  T('todo', 'dis', 3, 3, ['дело', 'дела', 'дел'], 'Закрыть', 10),
  O('coldshower', 'dis', 3, 'Закончить душ холодной водой', 5),
  T('nophone', 'dis', 3, 60, 'мин', 'Не трогать телефон', 1),
  // Харизма
  T('compliments', 'cha', 1, 2, ['комплимент', 'комплимента', 'комплиментов'], 'Сделать', 3),
  T('call', 'cha', 2, 1, ['близкому', 'близким', 'близким'], 'Позвонить', 15),
  T('newtalk', 'cha', 3, 1, ['новым человеком', 'новыми людьми', 'новыми людьми'], 'Заговорить с', 10),
  T('oldfriends', 'cha', 2, 2, ['давнему знакомому', 'давним знакомым', 'давним знакомым'], 'Написать', 5),
  T('speak', 'cha', 3, 5, 'мин', 'Проговорить вслух речь', 1),
  T('thanks', 'cha', 1, 2, ['человеку', 'людям', 'людям'], 'Сказать спасибо', 3),
  T('advice', 'cha', 2, 1, ['человека', 'человек', 'человек'], 'Спросить совета у', 10),
  // Финансы
  T('expenses', 'fin', 1, 5, ['трату', 'траты', 'трат'], 'Записать', 1),
  O('nobuy', 'fin', 3, 'День без импульсных покупок', 0, { allDay: true }),
  O('budget', 'fin', 2, 'Свериться с бюджетом на месяц', 10),
  T('save', 'fin', 2, 300, '₽', 'Отложить', 0),
  T('finlearn', 'fin', 3, 20, 'мин', 'Изучать финансы', 1),
  T('subs', 'fin', 2, 2, ['подписку', 'подписки', 'подписок'], 'Проверить', 5),
  // Дух
  T('meditate', 'spi', 2, 10, 'мин', 'Медитация', 1),
  T('gratitude', 'spi', 1, 3, ['вещь', 'вещи', 'вещей'], 'Записать благодарность за', 2),
  T('journal', 'spi', 2, 10, 'мин', 'Дневник', 1),
  T('breath', 'spi', 1, 5, 'мин', 'Дыхательная практика', 1),
  T('nature', 'spi', 2, 20, 'мин', 'Побыть на природе', 1),
  T('silence', 'spi', 3, 30, 'мин', 'Тишина без экранов', 1),
  // Вредные привычки (badHabit — id из анкеты)
  H('no_games', 'games', 'dis', 'Без игр сегодня'),
  H('no_social', 'social', 'dis', 'Без соцсетей сегодня'),
  H('no_late', 'late', 'spi', 'Лечь спать вовремя'),
  H('no_junk', 'junk', 'end', 'Без фастфуда сегодня'),
  H('no_smoke', 'smoke', 'end', 'Не курить сегодня'),
  H('no_procr', 'procr', 'dis', 'Не откладывать дела на потом'),
];

/** Шаблон для неизвестной (своей) привычки. */
export const genericBadHabit = (habit: string): QuestTemplate => H('no_custom', habit, 'dis', `Без «${habit}» сегодня`);
