import type { HHMM, ISODate } from './types';

const p2 = (n: number) => String(n).padStart(2, '0');

/** Игровая дата по локальному времени: до cutoffHour ещё «вчера». */
export function gameDate(ts: number, cutoffHour = 4): ISODate {
  const d = new Date(ts - cutoffHour * 3600_000);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const r = new Date(y, m - 1, day + n);
  return `${r.getFullYear()}-${p2(r.getMonth() + 1)}-${p2(r.getDate())}`;
}

/** Понедельник недели (пн–вс), в которую попадает игровая дата. */
export function weekStart(date: ISODate): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return addDays(date, -((new Date(y, m - 1, d).getDay() + 6) % 7));
}

export const toMin = (h: HHMM): number => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

export function fromMin(m: number): HHMM {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${p2(Math.floor(x / 60))}:${p2(x % 60)}`;
}
