import { BALANCE } from './balance';
import type { Stat } from './types';

export type SkillId = 'strength'|'mobility'|'sports'|'cardio'|'sleep'|'nutrition'|'reading'|'languages'|'tech'|'routine'|'focus'|'habits'
  |'social'|'speaking'|'negotiation'|'budget'|'savings'|'earning'|'mindfulness'|'reflection'|'rest'|'leadership'|'delegation'|'teamwork';

export interface SkillDef { id: SkillId; title: string; stat: Stat | 'team'; verify: string; examples: { E: string; C: string; A: string } }

const S = (id: SkillId, title: string, stat: Stat | 'team', verify: string, E: string, C: string, A: string): SkillDef =>
  ({ id, title, stat, verify, examples: { E, C, A } });

export const SKILL_CATALOG: SkillDef[] = [
  S('strength', 'Силовые', 'str', 'тренировка в «Здоровье», прибытие в зал', '3 × 10 отжиманий', 'зал 45 минут по программе', 'личный рекорд в базовом упражнении'),
  S('mobility', 'Мобильность', 'str', 'тренировка «Гибкость», таймер', '10 минут растяжки', 'йога 30 минут', 'сесть на шпагат по плану за месяц'),
  S('sports', 'Спортивные игры', 'str', 'тренировка «Игра», свидетель', 'понабивать мяч 15 минут', 'игра в футбол 60 минут', 'сыграть в любительском турнире'),
  S('cardio', 'Кардио', 'end', 'шаги, дистанция, пульс', '6 000 шагов', 'пробежка 5 км', '10 км или полумарафон по плану'),
  S('sleep', 'Сон', 'end', 'сон из «Здоровья»', 'лечь до 01:00', '7,5 часов сна 5 ночей из 7', '30 дней стабильного режима ±30 минут'),
  S('nutrition', 'Питание', 'end', 'фото еды, ввод воды', '6 стаканов воды', 'день без фастфуда и сладкого', 'неделя по плану питания'),
  S('reading', 'Чтение', 'int', 'таймер, квиз ИИ по прочитанному', '10 страниц', '40 страниц + пересказ в 3 предложениях', 'книга за неделю + квиз'),
  S('languages', 'Языки', 'int', 'таймер, диалог с ИИ на языке', '10 новых слов', '30 минут занятий + 5-минутный диалог', 'серия без субтитров и пересказ'),
  S('tech', 'Технологии', 'int', 'таймер, скриншот результата', '15 минут урока', 'урок курса + практика', 'доделать маленький проект'),
  S('routine', 'Режим', 'dis', 'время пробуждения и отбоя', 'подъём в окно ±30 минут', 'неделя подъёмов в окно', '30 дней режима без срывов'),
  S('focus', 'Фокус', 'dis', 'таймер, режим «Фокусирование»', '25 минут без телефона', '2 блока по 45 минут', '4 часа глубокой работы за день'),
  S('habits', 'Контроль привычек', 'dis', 'вечерний чек-ин, время в соцсетях', 'день без одной вредной привычки', '7 дней подряд', '30 дней подряд'),
  S('social', 'Общение', 'cha', 'календарь, чек-ин, свидетель', 'написать давнему другу', 'встретиться с человеком вживую', 'сходить на нетворкинг и взять 3 контакта'),
  S('speaking', 'Выступления', 'cha', 'видео, разбор ИИ', 'видео 1 минута на камеру', 'видео 3 минуты по плану', 'выступить перед группой'),
  S('negotiation', 'Переговоры', 'cha', 'сценарий с ИИ, чек-ин', 'сценарий переговоров с ИИ', 'попросить скидку в магазине', 'разговор о повышении или сделка'),
  S('budget', 'Бюджет', 'fin', 'ввод или выписка трат', 'записать траты дня', 'неделя в лимите', 'месяц в лимите по всем категориям'),
  S('savings', 'Накопления', 'fin', 'скриншот перевода в копилку', 'отложить 1 000 ₽', 'отложить 10% дохода', 'подушка на 3 месяца расходов'),
  S('earning', 'Заработок', 'fin', 'ввод дохода, свидетель', 'выписать 10 идей заработка', 'откликнуться на 3 заказа', 'первый доход с нового источника'),
  S('mindfulness', 'Осознанность', 'spi', '«Осознанность» в «Здоровье», таймер', '3 минуты дыхания', 'медитация 15 минут', 'неделя ежедневной практики'),
  S('reflection', 'Рефлексия', 'spi', 'чек-ин, дневник (ИИ проверяет длину)', 'вечерний чек-ин', 'запись в дневнике на 5 предложений', 'письмо себе через год'),
  S('rest', 'Отдых', 'spi', 'время без соцсетей, геопозиция', '20 минут без экрана', 'прогулка в парке 1 час', 'цифровой детокс на выходные'),
  S('leadership', 'Лидерство', 'team', 'роль лидера в задании, оценка участников', 'провести короткую планёрку', 'предложить и организовать общее дело', 'довести командный проект до результата'),
  S('delegation', 'Делегирование', 'team', 'распределённые роли выполнены, чек-ин', 'расписать задачу для другого', 'раздать роли и проверить результат', 'делегировать часть проекта и принять результат'),
  S('teamwork', 'Командная работа', 'team', 'своя часть командного задания в срок', 'помочь коллеге в завал', 'подтвердить задание друга', 'все части командного задания за месяц без пропусков'),
];

const IDS = new Set<unknown>(SKILL_CATALOG.map(s => s.id));
export const isSkillId = (x: unknown): x is SkillId => IDS.has(x);

const def = (id: SkillId): SkillDef => SKILL_CATALOG.find(s => s.id === id)!;

export const skillStatShares = (id: SkillId): Partial<Record<Stat, number>> => {
  const st = def(id).stat;
  return st === 'team' ? { cha: 0.5, dis: 0.5 } : { [st]: 1 };
};

export const primaryStat = (skills: readonly SkillId[]): Stat => {
  const st = def(skills[0]).stat;
  return st === 'team' ? 'cha' : st;
};

export function splitXp(xp: number, skills: readonly SkillId[]): { skills: [SkillId, number][]; stats: Partial<Record<Stat, number>> } {
  const main = skills.length > 1 ? Math.round(xp * BALANCE.skill.mainShare) : xp;
  const parts: [SkillId, number][] = skills.map((id, i) => [id, i === 0 ? main : xp - main]);
  const stats: Partial<Record<Stat, number>> = {};
  const add = (s: Stat, v: number) => { stats[s] = (stats[s] ?? 0) + v; };
  for (const [id, v] of parts) {
    const st = def(id).stat;
    if (st === 'team') { const c = Math.round(v / 2); add('cha', c); add('dis', v - c); } else add(st, v);
  }
  return { skills: parts, stats };
}
