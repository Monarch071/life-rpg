import { BALANCE } from './balance';
import { addDays, gameDate, toMin } from './day';
import type { Win } from './schedule';
import type { HHMM, ISODate } from './types';

export type DayKind = 'day' | 'evening' | 'off' | 'rest';
export interface DayType { id: string; kind: DayKind; label: string; wake: HHMM | null; busy: { start: HHMM; end: HHMM } | null; bed: HHMM | null; slots: number }

// Данные в balance.ts (все числа там); так нет цикла импорта.
export const DEFAULT_DAY_TYPES = BALANCE.dayTypes as unknown as DayType[];

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS: readonly string[] = ['day', 'evening', 'off', 'rest'];
const hm = (x: unknown): x is HHMM => typeof x === 'string' && HM.test(x);

export function validDayType(x: unknown): DayType | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id || o.id.length > 40) return null;
  if (typeof o.kind !== 'string' || !KINDS.includes(o.kind)) return null;
  if (typeof o.label !== 'string' || o.label.length < 1 || o.label.length > 40) return null;
  if (o.wake !== null && !hm(o.wake)) return null;
  if (o.bed !== null && !hm(o.bed)) return null;
  let busy: DayType['busy'] = null;
  if (o.busy !== null) {
    const b = o.busy as Record<string, unknown> | undefined;
    if (!b || typeof b !== 'object' || !hm(b.start) || !hm(b.end)) return null;
    busy = { start: b.start, end: b.end };
  }
  if (!Number.isInteger(o.slots) || (o.slots as number) < 1 || (o.slots as number) > BALANCE.day.maxSlots) return null;
  return { id: o.id, kind: o.kind as DayKind, label: o.label, wake: o.wake as HHMM | null, busy, bed: o.bed as HHMM | null, slots: o.slots as number };
}

/** Минуты от полуночи следующих суток, когда закрывается день: отбой + 1 ч, в пределах 00:00–04:00. */
export function closeMinutes(t: DayType | null): number {
  if (!t || !t.bed) return BALANCE.day.closeDefaultMin;
  const m = toMin(t.bed);
  const r = m < 720 ? m + BALANCE.day.closeAfterBedMin : m + BALANCE.day.closeAfterBedMin - 1440;
  return Math.min(BALANCE.day.closeLatestMin, Math.max(0, r));
}

/** Игровая дата: календарная, но пока не наступило закрытие вчерашнего дня — ещё вчера. */
export function gameDateAt(ts: number, closeOf: (d: ISODate) => number): ISODate {
  const cal = gameDate(ts, 0);
  const d = new Date(ts);
  const min = d.getHours() * 60 + d.getMinutes();
  const prev = addDays(cal, -1);
  return min < closeOf(prev) ? prev : cal;
}

/** ts закрытия дня `date`: полночь следующих суток + closeMin (локальное время). */
export function closesAtTs(date: ISODate, closeMin: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, closeMin).getTime();
}

/** Старые события без типа дня: смена с началом до 12:00 — дневная, позже — вечерняя, нет смены — выходной. */
export function legacyDayType(work: Win | null, wakeAt: HHMM, bed: HHMM | null): DayType {
  const kind: DayKind = !work ? 'off' : toMin(work.start) < 720 ? 'day' : 'evening';
  const base = DEFAULT_DAY_TYPES.find(d => d.kind === kind)!;
  return { ...base, wake: wakeAt, busy: work ? { start: work.start, end: work.end } : null, bed };
}
