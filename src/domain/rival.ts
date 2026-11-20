// Соперник — ты прошлый (спека §3–§5, §10): призрак, индекс роста, рекорды, итоги месяца. Чистые функции без журнала.
import { BALANCE } from './balance';
import { addDays } from './day';
import type { ISODate } from './types';

const R = BALANCE.rival;

/** Тот же день прошлого месяца; если такого числа нет (31 марта → февраль) — null. */
export function prevMonthSameDay(d: ISODate): ISODate | null {
  const p = addDays(`${d.slice(0, 7)}-01`, -1), day = d.slice(8);
  return day <= p.slice(8) ? `${p.slice(0, 8)}${day}` : null;
}

const ghostDay = (x: (d: ISODate) => number, d: ISODate) => { const p = prevMonthSameDay(d); return p ? x(p) : 0; };

/** Месячный счёт с 1-го числа по d: ты и призрак (прошлый месяц). */
export function ghostAt(x: (d: ISODate) => number, d: ISODate, has: (d: ISODate) => boolean): { available: boolean; you: number; ghost: number; lead: number } {
  const available = has(d);
  let you = 0, ghost = 0;
  for (let k = `${d.slice(0, 7)}-01`; k <= d; k = addDays(k, 1)) { you += x(k); if (available) ghost += ghostDay(x, k); }
  return { available, you, ghost, lead: you - ghost };
}

/** Неделя: у всех 7 дней должен быть призрак (стык месяцев — каждый день со своим прошлым месяцем). */
export function ghostWeek(x: (d: ISODate) => number, weekStart: ISODate, has: (d: ISODate) => boolean): { you: number; ghost: number } | null {
  let you = 0, ghost = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (!has(d)) return null;
    you += x(d); ghost += ghostDay(x, d);
  }
  return { you, ghost };
}

/** Индекс = 100 × XP/день ÷ XP/день прошлого; база 150 XP/день, если у прошлого < 14 рабочих дней (или XP нет). */
export function growthIndex(cur: { xp: number; days: number }, prev: { xp: number; days: number } | null): { index: number | null; xpPerDay: number; base: 'prev' | 'base' } {
  const xpPerDay = cur.days > 0 ? cur.xp / cur.days : 0;
  const usePrev = !!prev && prev.days >= R.growthMinDays && prev.xp > 0;
  const ref = usePrev ? prev!.xp / prev!.days : R.growthBaseDayXp;
  return { index: cur.days > 0 ? Math.round(100 * xpPerDay / ref) : null, xpPerDay, base: usePrev ? 'prev' : 'base' };
}

export type RecordId = 'streak' | 'steps_day' | 'week_xp' | 'pages_week' | 'focus_day' | 'savings_month';
export const RECORDS: { id: RecordId; title: string; unit: string }[] = [
  { id: 'streak',        title: 'Самая длинная серия',      unit: 'дн.' },
  { id: 'steps_day',     title: 'Шагов за день',            unit: 'шагов' },
  { id: 'week_xp',       title: 'Лучшая неделя по XP',      unit: 'XP' },
  { id: 'pages_week',    title: 'Страниц за неделю',        unit: 'стр.' },
  { id: 'focus_day',     title: 'Минут фокуса за день',     unit: 'мин' },
  { id: 'savings_month', title: 'Месяц с наибольшими накоплениями', unit: '¤' },
];

/** Новый рекорд — строго больше прошлого лучшего, который есть и > 0 (первое значение — без награды). */
export function recordStep(best: number | null, value: number | null): { best: number | null; beaten: boolean } {
  if (value === null || (best !== null && value <= best)) return { best, beaten: false };
  return { best: value, beaten: best !== null && best > 0 };
}

/** Серия: награда раз за серию; снова «взведён», когда серия опустилась ниже рекорда. */
export function streakRecord(s: { best: number; armed: boolean }, streak: number): { best: number; armed: boolean; beaten: boolean } {
  if (streak > s.best) return { best: streak, armed: false, beaten: s.armed && s.best > 0 };
  return { best: s.best, armed: s.armed || streak < s.best, beaten: false };
}

/** Итоги месяца [P§8]: открывал ≥ 25/31 дней, выполнял ≥ 60%, хоть один реальный сдвиг. share — доля выполненного. */
export function monthReview(i: { days: number; opened: number; issued: number; done: number; shifts: ('ladder' | 'saving' | 'base' | 'skill')[] }):
  { opened: boolean; completion: boolean; shift: boolean; pass: boolean; share: number } {
  const D = R.decision, share = i.issued > 0 ? i.done / i.issued : 0;
  const opened = i.opened >= i.days * D.openedShare - 1e-9, completion = i.issued > 0 && share >= D.completion, shift = i.shifts.length > 0;
  return { opened, completion, shift, pass: opened && completion && shift, share };
}
