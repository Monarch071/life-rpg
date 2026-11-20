import { BALANCE as B } from './balance';
import type { ISODate, SeasonKind } from './types';

const dayNum = (d: ISODate) => { const [y, m, x] = d.split('-').map(Number); return Date.UTC(y, m - 1, x) / B.day.msPerDay; };
const NAMES = { winter: 'Зимы', spring: 'Весны', summer: 'Лета', autumn: 'Осени' } as const;

/** Цена ступени; поздний вход — пропорционально оставшимся дням, шаг roundStep, минимум minStepXp [S§8]. */
export function stepXpFor(season: { start: ISODate; end: ISODate }, firstActive: ISODate | null): number {
  const S = B.season;
  if (!firstActive || firstActive <= season.start) return S.stepXp;
  const total = dayNum(season.end) - dayNum(season.start) + 1, left = Math.max(0, dayNum(season.end) - dayNum(firstActive) + 1);
  const price = Math.round(S.stepXp * left / total / S.roundStep) * S.roundStep;
  return Number.isFinite(price) ? Math.max(S.minStepXp, price) : S.stepXp;
}

export function stepRewards(kind: Exclude<SeasonKind, 'prologue'>, step: number): { gold: number; items: string[]; title: string | null } {
  const S = B.season;
  if (!Number.isInteger(step) || step < 1 || step > S.steps) return { gold: 0, items: [], title: null };
  const items: string[] = [];
  if (step % S.itemEvery === 0) items.push(`season:${kind}:${step}`);
  if (step === S.bgStep) items.push(`bg:${kind}`);
  if (step === S.frameStep) items.push(`frame:${kind}`);
  if (step === S.lookStep) items.push(`look:${kind}`);
  return { gold: S.stepGold, items, title: step === S.lookStep ? `Покоритель ${NAMES[kind]}` : null };
}
