import { BALANCE as B, RANKS } from './balance';
import type { Rank, Verify } from './types';

const r9 = (x: number) => Math.round(x * 1e9) / 1e9;
const sum = (a: number[]) => r9(a.reduce((s, x) => s + Math.max(0, x), 0)); // отрицательные слагаемые — 0

export const startBase = (score: number): number =>
  Math.min(B.stat.startMax, Math.round(B.stat.startBase + B.stat.startK * score));

export const statPointCost = (s: number): number => B.stat.pointBase + B.stat.pointK * s;

export function baseFromXp(start: number, xp: number): { value: number; into: number; need: number } {
  let value = start, left = xp;
  while (value < B.stat.max && left >= statPointCost(value)) { left -= statPointCost(value); value++; }
  return { value, into: left, need: value >= B.stat.max ? 0 : statPointCost(value) };
}

export const formNorm = (avgDailyXp: number): number => Math.max(B.form.normMin, r9(B.form.normShare * avgDailyXp));

export const formOf = (xpWindow: number, days: number, norm: number): number | null =>
  days <= 0 || norm <= 0 ? null : Math.min(1, xpWindow / (days * norm));

export function formStatus(form: number | null): 'new' | 'in_form' | 'sagging' | 'abandoned' {
  if (form === null) return 'new';
  return form >= B.form.inForm ? 'in_form' : form >= B.form.sagging ? 'sagging' : 'abandoned';
}

export function skillFromXp(start: number, xp: number): { level: number; into: number; need: number } {
  let level = start, left = xp;
  while (level < B.skill.maxLevel && left >= B.skill.costK * level) { left -= B.skill.costK * level; level++; }
  return { level, into: left, need: level >= B.skill.maxLevel ? 0 : B.skill.costK * level };
}

export function rankCap(level: number, skillLevel: number): Rank {
  let i = 0;
  RANKS.forEach((r, k) => { if (level >= B.rank.levelCap[r] && skillLevel >= B.rank.skillCap[r]) i = k; });
  return RANKS[i];
}

export const rankShift = (r: Rank, d: number): Rank =>
  RANKS[Math.max(0, Math.min(RANKS.length - 1, RANKS.indexOf(r) + d))];

export const streakBonus = (streak: number, perDay: number = B.bonus.streakPerDay): number => Math.min(B.bonus.streakMax, r9(perDay * streak));
export const fatiguePenalty = (f: number): number => r9(B.penalty.fatiguePerPoint * f);

export interface RewardBreakdown { base: number; k: number; bonus: number; penalty: number; mult: number; xp: number; gold: number }

export const goldFor = (xp: number, goldBonus = 0): number => Math.round(B.goldShare * xp * (1 + goldBonus));

export function questReward(i: { rank: Rank; verify: Verify; bonuses: number[]; penalties: number[]; mult?: number; goldBonus?: number }): RewardBreakdown {
  const base = B.rank.base[i.rank], k = B.verify[i.verify], mult = i.mult ?? 1;
  const bonus = Math.min(B.bonus.cap, sum(i.bonuses)), penalty = Math.min(B.penalty.cap, sum(i.penalties));
  const xp = Math.round(base * k * (1 + bonus) * (1 - penalty) * mult);
  return { base, k, bonus, penalty, mult, xp, gold: goldFor(xp, i.goldBonus) };
}
