import { BALANCE } from './balance';

export const xpToNext = (level: number): number => Math.round(BALANCE.level.costK * level ** BALANCE.level.costPow);

export function levelFromXp(total: number, start = 1): { level: number; into: number; need: number } {
  let level = start, left = total;
  while (level < BALANCE.level.max && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: level >= BALANCE.level.max ? 0 : xpToNext(level) };
}
