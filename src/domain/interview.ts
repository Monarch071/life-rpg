import { STATS } from './stats';
import type { Analysis, Answers, Stat } from './types';

export type { Analysis, Answers };
export type QKind = 'choice' | 'multi' | 'scale' | 'number' | 'text';
export type SectionId = 'personality' | 'body' | 'health' | 'routine' | 'mind' | 'money' | 'social' | 'goals' | 'spirit';
export interface Question { id: string; section: SectionId; kind: QKind; text: string; options?: string[]; min?: number; max?: number; unit?: string; optional?: boolean }

export const SECTIONS: { id: SectionId; title: string; icon: string }[] = [   // icon — имя lucide-иконки
  { id: 'personality', title: 'Характер', icon: 'Sparkles' },
  { id: 'body', title: 'Тело', icon: 'Dumbbell' },
  { id: 'health', title: 'Здоровье', icon: 'HeartPulse' },
  { id: 'routine', title: 'Режим', icon: 'Clock' },
  { id: 'mind', title: 'Ум', icon: 'BookOpen' },
  { id: 'money', title: 'Деньги', icon: 'Wallet' },
  { id: 'social', title: 'Люди', icon: 'Users' },
  { id: 'goals', title: 'Цели', icon: 'Target' },
  { id: 'spirit', title: 'Дух', icon: 'Leaf' },
];

// Порядковые варианты: индекс используется в ruleStats, поэтому порядок «хуже → лучше» (или по возрастанию) важен.
const DEBT = ['Нет долгов', 'Небольшие, под контролем', 'Крупные, давят на меня'];
const TRACK = ['Не веду учёт', 'Иногда записываю', 'Веду регулярно'];
const PRACTICE = ['Никогда', 'Пробовал(а)', 'Иногда', 'Регулярно'];
const CIRCLE = ['Почти нет близких', 'Несколько человек', 'Широкий круг'];
const WAKE = ['До 6:00', '6:00–7:00', '7:00–8:00', '8:00–9:00', 'После 9:00'];
const BED = ['До 22:00', '22:00–23:00', '23:00–00:00', '00:00–01:00', 'После 01:00'];
const BIG5 = '1 — совсем не про меня, 5 — точно про меня';

const sc = (id: string, section: SectionId, text: string, extra: Partial<Question> = {}): Question => ({ id, section, kind: 'scale', text, min: 1, max: 5, ...extra });
const num = (id: string, section: SectionId, text: string, unit: string, max: number, extra: Partial<Question> = {}): Question => ({ id, section, kind: 'number', text, unit, min: 0, max, ...extra });
const ch = (id: string, section: SectionId, text: string, options: string[], extra: Partial<Question> = {}): Question => ({ id, section, kind: 'choice', text, options, ...extra });
const mu = (id: string, section: SectionId, text: string, options: string[], extra: Partial<Question> = {}): Question => ({ id, section, kind: 'multi', text, options, ...extra });
const tx = (id: string, section: SectionId, text: string, extra: Partial<Question> = {}): Question => ({ id, section, kind: 'text', text, ...extra });

export const QUESTIONS: Question[] = [
  // — Характер: «Большая пятёрка» (по две формулировки на черту, одна обратная), шкала 1–5 —
  sc('o1', 'personality', `Мне нравится пробовать новое и необычное. (${BIG5})`),
  sc('o2', 'personality', `Я предпочитаю привычное и проверенное. (${BIG5})`),
  sc('c1', 'personality', `Я довожу начатое до конца. (${BIG5})`),
  sc('c2', 'personality', `Мне трудно взяться за дело и не откладывать. (${BIG5})`),
  sc('e1', 'personality', `В компании я заряжаюсь энергией. (${BIG5})`),
  sc('e2', 'personality', `Мне комфортнее держаться в тени. (${BIG5})`),
  sc('a1', 'personality', `Мне легко пойти навстречу другим. (${BIG5})`),
  sc('a2', 'personality', `Я скорее отстою своё, чем уступлю. (${BIG5})`),
  sc('n1', 'personality', `Я часто тревожусь по пустякам. (${BIG5})`),
  sc('n2', 'personality', `Я остаюсь спокойным(ой) под давлением. (${BIG5})`),
  ch('introvert', 'personality', 'Ты скорее…', ['Интроверт', 'Скорее интроверт', 'Золотая середина', 'Скорее экстраверт', 'Экстраверт']),
  ch('stress_reaction', 'personality', 'Как ты обычно реагируешь на стресс?', ['Собираюсь и действую', 'Замираю и откладываю', 'Ищу поддержку у людей', 'Ухожу в себя', 'Срываюсь на эмоциях']),
  mu('motivators', 'personality', 'Что тебя мотивирует? Можно выбрать несколько.', ['Соревнование', 'Признание', 'Деньги', 'Свобода', 'Мастерство', 'Забота о близких']),
  ch('decisions', 'personality', 'Как ты принимаешь решения?', ['Головой, по фактам', 'Сердцем, по ощущениям', 'По-разному']),
  ch('planning', 'personality', 'Ты больше планируешь или импровизируешь?', ['Всё планирую', 'Набросок плана', 'Импровизирую']),

  // — Тело —
  num('height', 'body', 'Какой у тебя рост?', 'см', 250, { optional: true }),
  num('weight', 'body', 'Сколько ты весишь? Можно пропустить.', 'кг', 400, { optional: true }),
  num('weight_goal', 'body', 'Какой вес для тебя комфортен? Можно пропустить.', 'кг', 400, { optional: true }),
  ch('build', 'body', 'Как бы ты описал(а) своё телосложение?', ['Худощавое', 'Среднее', 'Крепкое', 'Спортивное', 'Полное']),
  num('pushups', 'body', 'Сколько отжиманий делаешь за подход?', 'раз', 300),
  num('pullups', 'body', 'Сколько подтягиваний делаешь за подход?', 'раз', 100),
  num('plank', 'body', 'Сколько секунд стоишь в планке?', 'сек', 3600),
  num('run_km', 'body', 'Сколько километров можешь пробежать без остановки?', 'км', 100),
  num('steps', 'body', 'Сколько шагов в день ты обычно проходишь?', 'шагов', 60000),

  // — Здоровье —
  num('sleep_hours', 'health', 'Сколько часов ты обычно спишь?', 'ч', 16),
  sc('sleep_quality', 'health', 'Как ты оцениваешь качество сна? (1 — плохо, 5 — отлично)'),
  ch('smoking', 'health', 'Куришь ли ты?', ['Нет', 'Иногда', 'Регулярно'], { optional: true }),
  ch('alcohol', 'health', 'Как часто ты пьёшь алкоголь?', ['Не пью', 'Пару раз в месяц', 'Раз в неделю', 'Несколько раз в неделю'], { optional: true }),
  num('water', 'health', 'Сколько воды выпиваешь за день?', 'л', 10),
  ch('energy_peak', 'health', 'Когда у тебя больше всего энергии?', ['Утром', 'Днём', 'Вечером', 'Ночью']),
  tx('limits', 'health', 'Есть ли хронические состояния или ограничения, которые стоит учесть? Можно пропустить.', { optional: true }),
  ch('checkup', 'health', 'Когда ты в последний раз проходил(а) осмотр у врача?', ['В этом году', 'В прошлом году', 'Давно', 'Не помню'], { optional: true }),

  // — Режим —
  ch('wake', 'routine', 'Во сколько ты обычно встаёшь?', WAKE),
  ch('bed', 'routine', 'Во сколько ты обычно ложишься?', BED),
  sc('regular', 'routine', 'Мой режим дня стабилен. (1 — каждый день по-разному, 5 — по часам)'),
  num('work_hours', 'routine', 'Сколько часов в день ты работаешь или учишься?', 'ч', 24),
  num('free_weekday', 'routine', 'Сколько свободных часов у тебя в будни?', 'ч', 24),
  num('free_weekend', 'routine', 'Сколько свободных часов у тебя в выходные?', 'ч', 24),
  num('games_hours', 'routine', 'Сколько часов в день ты проводишь в играх?', 'ч', 24),
  num('screen_hours', 'routine', 'Сколько часов в день ты проводишь в телефоне?', 'ч', 24),
  mu('time_leaks', 'routine', 'Где у тебя уходит время впустую?', ['Соцсети', 'Видео и сериалы', 'Игры', 'Новости', 'Переписки', 'Дорога', 'Прокрастинация', 'Почти нигде'], { optional: true }),

  // — Ум —
  ch('education', 'mind', 'Какое у тебя образование?', ['Школа', 'Колледж', 'Высшее', 'Несколько дипломов или степень', 'Самообразование']),
  num('books', 'mind', 'Сколько книг ты читаешь в месяц?', 'шт', 50),
  tx('learn_want', 'mind', 'Чему хочется научиться?', { optional: true }),
  tx('languages', 'mind', 'Какие языки ты знаешь и на каком уровне?', { optional: true }),
  sc('focus', 'mind', 'Как ты концентрируешься? (1 — отвлекаюсь постоянно, 5 — держу фокус часами)'),
  num('study_hours', 'mind', 'Сколько часов в неделю ты учишься чему-то новому?', 'ч', 100),
  sc('curious', 'mind', `Мне интересно разбираться в сложных вещах. (${BIG5})`),

  // — Деньги —
  num('income', 'money', 'Какой у тебя доход в месяц? Можно пропустить.', '₽', 100_000_000, { optional: true }),
  num('savings', 'money', 'Сколько у тебя накоплено? Можно пропустить.', '₽', 1_000_000_000, { optional: true }),
  ch('debt', 'money', 'Как у тебя с долгами и кредитами?', DEBT, { optional: true }),
  ch('tracking', 'money', 'Ведёшь ли ты учёт расходов?', TRACK),
  sc('impulse', 'money', 'Как часто ты тратишь на импульсивные покупки? (1 — почти никогда, 5 — постоянно)'),
  tx('money_goal', 'money', 'Какая у тебя финансовая цель?', { optional: true }),
  num('money_goal_months', 'money', 'За сколько месяцев хочешь её достичь?', 'мес', 600, { optional: true }),
  num('cushion', 'money', 'На сколько месяцев жизни хватит твоих накоплений?', 'мес', 600, { optional: true }),
  mu('income_sources', 'money', 'Откуда приходят деньги?', ['Зарплата', 'Свой бизнес', 'Фриланс', 'Инвестиции', 'Пассивный доход', 'Помощь близких', 'Стипендия или пособие'], { optional: true }),

  // — Люди —
  num('friends', 'social', 'Сколько у тебя близких друзей?', 'чел.', 100),
  ch('circle', 'social', 'Как бы ты описал(а) свой круг общения?', CIRCLE),
  ch('relationship', 'social', 'Как у тебя с отношениями?', ['Один(одна), и мне хорошо', 'Один(одна), хочу пару', 'В отношениях', 'Всё сложно'], { optional: true }),
  sc('speaking_fear', 'social', 'Насколько тебе страшно выступать перед людьми? (1 — ничуть, 5 — очень)'),
  ch('conflict', 'social', 'Как ты ведёшь себя в конфликте?', ['Избегаю', 'Уступаю', 'Договариваюсь', 'Давлю', 'По-разному']),
  sc('help_others', 'social', `Я охотно помогаю другим. (${BIG5})`),
  sc('networking', 'social', `Мне легко заводить полезные знакомства. (${BIG5})`),

  // — Цели —
  tx('year_goal', 'goals', 'Какая у тебя главная цель на этот год?'),
  tx('dream_skills', 'goals', 'Три навыка, которыми хочешь овладеть.', { optional: true }),
  tx('quit', 'goals', 'От чего хочется отказаться или что бросить?', { optional: true }),
  tx('ideal_day', 'goals', 'Опиши свой идеальный день через год.', { optional: true }),
  mu('blockers', 'goals', 'Что раньше мешало тебе достигать целей?', ['Лень', 'Нехватка времени', 'Нехватка денег', 'Страх неудачи', 'Нет плана', 'Отвлекаюсь', 'Усталость', 'Окружение'], { optional: true }),
  tx('blockers_note', 'goals', 'Хочешь рассказать об этом подробнее?', { optional: true }),
  num('goal_hours', 'goals', 'Сколько часов в неделю ты готов(а) отдавать своим целям?', 'ч', 100),

  // — Дух —
  sc('stress', 'spirit', 'Насколько ты напряжён(на) в последнее время? (1 — спокоен(на), 5 — на пределе)'),
  ch('meditation', 'spirit', 'Практикуешь ли ты медитацию или дыхательные упражнения?', PRACTICE),
  sc('gratitude', 'spirit', 'Как часто ты замечаешь хорошее и благодаришь за него? (1 — редко, 5 — каждый день)'),
  mu('values', 'spirit', 'Что для тебя важно в жизни?', ['Семья', 'Свобода', 'Развитие', 'Честность', 'Творчество', 'Здоровье', 'Деньги', 'Помощь людям', 'Вера']),
  sc('life_satisfaction', 'spirit', 'Насколько ты доволен(льна) жизнью сейчас? (1 — совсем нет, 5 — вполне)'),
  sc('meaning', 'spirit', `Я чувствую, что моя жизнь осмысленна. (${BIG5})`),
];

const TEXT_MAX = 2000;

export function validAnswer(q: Question, v: unknown): boolean {
  switch (q.kind) {
    case 'choice': return typeof v === 'string' && !!q.options?.includes(v);
    case 'multi': return Array.isArray(v) && new Set(v).size === v.length && v.every(x => typeof x === 'string' && !!q.options?.includes(x));
    case 'scale': return typeof v === 'number' && Number.isInteger(v) && v >= (q.min ?? 1) && v <= (q.max ?? 5);
    case 'number': return typeof v === 'number' && Number.isFinite(v) && v >= (q.min ?? 0) && v <= (q.max ?? 1e9);
    case 'text': return typeof v === 'string' && v.length <= TEXT_MAX;
  }
}

/** Из недоверенных данных (журнал, сеть): оставляет только строки, конечные числа и массивы строк. */
export function cleanAnswers(x: unknown): Answers {
  const out: Answers = {};
  if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'string') out[k] = v.slice(0, TEXT_MAX);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (Array.isArray(v) && v.every(i => typeof i === 'string')) out[k] = v.slice(0, 20).map(i => i.slice(0, 120));
  }
  return out;
}

const STAT_KEYS = Object.keys(STATS) as Stat[];
const strs = (x: unknown): string[] | null => Array.isArray(x) && x.every(i => typeof i === 'string')
  ? x.map(i => (i as string).trim().slice(0, 120)).filter(Boolean).slice(0, 6) : null;

/** Проверка и обрезка разбора ИИ (недоверенные данные). Любое нарушение → null, вызывающий откатывается на ruleStats. */
export function validAnalysis(x: unknown): Analysis | null {
  const a = x as Record<string, any> | null;
  if (!a || typeof a !== 'object' || typeof a.archetype !== 'string' || typeof a.summary !== 'string' || typeof a.questGuidance !== 'string') return null;
  const strengths = strs(a.strengths), weaknesses = strs(a.weaknesses), focus = strs(a.focus);
  const st = a.stats;
  if (!strengths || !weaknesses || !focus || !st || typeof st !== 'object') return null;
  const stats = {} as Record<Stat, number>;
  for (const k of STAT_KEYS) {
    const v = st[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 20) return null;
    stats[k] = v;
  }
  const archetype = a.archetype.trim().slice(0, 40);
  if (!archetype) return null;
  return { archetype, summary: a.summary.trim().slice(0, 1200), strengths, weaknesses, stats, focus, questGuidance: a.questGuidance.trim().slice(0, 600) };
}

/**
 * ruleStats — прозрачный расчёт без ИИ. Каждый компонент нормируется в 0..1 (линейно до «потолка»),
 * пропущенный/нечисловой ответ даёт нейтральные 0.5. Характеристика = 1 + round(19 · Σ вес·компонент), т.е. 1..20.
 * Честно низкие значения — нормально: потолки выбраны «как у тренированного человека».
 *
 *  Сила         0.4 отжимания (потолок 40) + 0.3 подтягивания (12) + 0.3 планка (180 сек)
 *  Выносливость 0.4 бег (10 км) + 0.3 шаги (12000) + 0.3 сон (8 ч — идеал, штраф за отклонение, ±4 ч → 0)
 *  Интеллект    0.3 книги в месяц (4) + 0.4 учёба в неделю (10 ч) + 0.3 концентрация (1–5)
 *  Дисциплина   0.4 сознательность (c1 и обратный c2) + 0.2 стабильность режима + 0.2 мало игр (0–4 ч) + 0.2 мало экрана (0–8 ч)
 *  Харизма      0.4 экстраверсия (e1 и обратный e2) + 0.3 страх выступлений (обратно) + 0.3 круг общения
 *  Финансы      0.35 подушка (6 мес) + 0.25 учёт расходов + 0.25 долги (обратно) + 0.15 импульсивные траты (обратно)
 *  Дух          0.3 стресс (обратно) + 0.3 удовлетворённость жизнью + 0.2 практики (медитация) + 0.2 благодарность
 */
export function ruleStats(a: Answers): Record<Stat, number> {
  const ans: Answers = cleanAnswers(a);
  const cl = (t: number) => Math.min(1, Math.max(0, t));
  const n = (id: string) => (typeof ans[id] === 'number' ? (ans[id] as number) : undefined);
  const up = (id: string, cap: number) => { const v = n(id); return v === undefined ? 0.5 : cl(v / cap); };
  const down = (id: string, cap: number) => { const v = n(id); return v === undefined ? 0.5 : cl(1 - v / cap); };
  const sc5 = (id: string, inv = false) => { const v = n(id); return v === undefined ? 0.5 : cl(inv ? (5 - v) / 4 : (v - 1) / 4); };
  const ord = (id: string, opts: string[], inv = false) => {
    const i = typeof ans[id] === 'string' ? opts.indexOf(ans[id] as string) : -1;
    return i < 0 ? 0.5 : inv ? 1 - i / (opts.length - 1) : i / (opts.length - 1);
  };
  const sleep = () => { const v = n('sleep_hours'); return v === undefined ? 0.5 : cl(1 - Math.abs(v - 8) / 4); };
  const pair = (pos: string, neg: string) => (sc5(pos) + sc5(neg, true)) / 2;
  const mix = (...parts: [number, number][]) => 1 + Math.round(19 * cl(parts.reduce((s, [w, t]) => s + w * t, 0)));
  return {
    str: mix([0.4, up('pushups', 40)], [0.3, up('pullups', 12)], [0.3, up('plank', 180)]),
    end: mix([0.4, up('run_km', 10)], [0.3, up('steps', 12000)], [0.3, sleep()]),
    int: mix([0.3, up('books', 4)], [0.4, up('study_hours', 10)], [0.3, sc5('focus')]),
    dis: mix([0.4, pair('c1', 'c2')], [0.2, sc5('regular')], [0.2, down('games_hours', 4)], [0.2, down('screen_hours', 8)]),
    cha: mix([0.4, pair('e1', 'e2')], [0.3, sc5('speaking_fear', true)], [0.3, ord('circle', CIRCLE)]),
    fin: mix([0.35, up('cushion', 6)], [0.25, ord('tracking', TRACK)], [0.25, ord('debt', DEBT, true)], [0.15, sc5('impulse', true)]),
    spi: mix([0.3, sc5('stress', true)], [0.3, sc5('life_satisfaction')], [0.2, ord('meditation', PRACTICE)], [0.2, sc5('gratitude')]),
  };
}
