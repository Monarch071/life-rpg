const BASE = [10, 20, 35, 55, 80];

export const xpToNext = (level: number): number => Math.round(100 * level ** 1.5);

export function levelFromXp(total: number): { level: number; into: number; need: number } {
  let level = 1, left = total;
  while (left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: xpToNext(level) };
}

export const questXp = (difficulty: 1|2|3|4|5, mult: number): number => Math.round(BASE[difficulty - 1] * mult);

export const currencyFor = (xp: number): number => Math.floor(xp / 10);
