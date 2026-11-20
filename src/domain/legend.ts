// Легендарный класс (личная версия, спека §8): испытание 30 дней — 4 недельных этапа по целям на годы + финал ранга S.
import { BALANCE } from './balance';
import { seasonOf } from './calendar';
import { addDays } from './day';
import type { ISODate, Stat } from './types';

const L = BALANCE.legend;
export interface LegendTrial { start: ISODate; stages: string[]; final: string; done: boolean[]; finalDone: boolean }

/** Был ли продвинутый класс целый сезон (не Пролог), закончившийся до date. */
export function heldFullSeason(hist: readonly { since: ISODate; until: ISODate }[], date: ISODate): boolean {
  const sorted = [...hist].sort((a, b) => (a.since < b.since ? -1 : 1));
  return hist.some(h => {
    const s = seasonOf(h.until);
    if (s.kind === 'prologue' || s.end >= date) return false;
    let cur = s.start;   // смена пути внутри сезона не рвёт покрытие
    for (const e of sorted) if (e.since <= cur && e.until >= cur) cur = addDays(e.until, 1);
    return cur > s.end;
  });
}

/** Испытание можно начать: уровень на начало дня ≥ 40, сезон в продвинутом, 30 дней после провала, нет активного и легенды. */
export function legendOpen(i: { level: number; date: ISODate; held: boolean; lastFail: ISODate | null; busy: boolean }): boolean {
  return !i.busy && i.level >= L.level && i.held && i.date >= BALANCE.finishSince && (!i.lastFail || i.date >= addDays(i.lastFail, L.retryDays));
}

/** Окно этапа k (0–3 — недели, 4 — финал в последние 2 дня). */
export const stageWindow = (start: ISODate, k: number): [ISODate, ISODate] =>
  k < L.stages ? [addDays(start, k * 7), addDays(start, k * 7 + 6)] : [addDays(start, L.days - L.finalDays), addDays(start, L.days - 1)];

/** Отметка этапа: только в его окне и один раз. */
export const canMark = (t: LegendTrial, k: number, date: ISODate): boolean => {
  if (!Number.isInteger(k) || k < 0 || k > L.stages) return false;
  const [a, b] = stageWindow(t.start, k);
  return date >= a && date <= b && !(k === L.stages ? t.finalDone : t.done[k]);
};

/** Итог на последнем дне: 3 этапа из 4 и финал. */
export const legendPassed = (t: LegendTrial): boolean => t.done.filter(Boolean).length >= L.need && t.finalDone;

const EPITHET: Record<Stat, string> = { str: 'Несокрушимый', end: 'Неутомимый', int: 'Мудрый', dis: 'Железный', cha: 'Блистательный', fin: 'Золотой', spi: 'Безмятежный' };
/** Название по шаблону «[эпитет] [класс]»; город игрок дописывает сам. */
export const legendTitle = (className: string, top: Stat): string => `${EPITHET[top]} ${className}`;

/** Текст этапа: обрезка, пустой — null. */
export const cleanText = (x: unknown, max: number): string | null => {
  if (typeof x !== 'string') return null;
  const s = x.replace(/\s+/g, ' ').trim().slice(0, max);
  return s || null;
};
