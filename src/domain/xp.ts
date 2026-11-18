import { BALANCE } from './balance';
const BASE = [10, 20, 35, 55, 80];

export const xpToNext = (level: number): number => Math.round(BALANCE.level.costK * level ** BALANCE.level.costPow);

export function levelFromXp(total: number, start = 1): { level: number; into: number; need: number } {
  let level = start, left = total;
  while (level < BALANCE.level.max && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: level >= BALANCE.level.max ? 0 : xpToNext(level) };
}

export const questXp = (difficulty: 1|2|3|4|5, mult: number): number => Math.round(BASE[difficulty - 1] * mult);

export const currencyFor = (xp: number): number => Math.floor(xp / 10);
