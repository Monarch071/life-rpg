import { BALANCE } from './balance';
import { isSkillId, SKILL_CATALOG, type SkillId } from './skillCatalog';
import type { ISODate, Stat } from './types';

export type ThemeId = 'mind_spirit' | 'body' | 'people' | 'money_discipline';

export const THEMES: Record<ThemeId, { name: string; stats: Stat[]; teamSkills: boolean }> = {
  mind_spirit:      { name: 'Разум и дух', stats: ['int', 'spi'], teamSkills: false },
  body:             { name: 'Тело', stats: ['str', 'end'], teamSkills: false },
  people:           { name: 'Люди', stats: ['cha'], teamSkills: true },
  money_discipline: { name: 'Деньги и дисциплина', stats: ['fin', 'dis'], teamSkills: false },
};

export interface Season { id: string; kind: 'prologue' | 'winter' | 'spring' | 'summer' | 'autumn'; name: string; start: ISODate; end: ISODate; defaultTheme: ThemeId | null }

const p2 = (n: number) => String(n).padStart(2, '0');

export function seasonOf(date: ISODate): Season {
  if (date <= BALANCE.season.prologueEnd) return { id: 'prologue', kind: 'prologue', name: 'Пролог', start: '2000-01-01', end: BALANCE.season.prologueEnd, defaultTheme: null };
  const [y, m] = date.split('-').map(Number);
  if (m === 12 || m <= 2) {
    const wy = m === 12 ? y : y - 1;
    const lastFeb = new Date(wy + 1, 2, 0).getDate(); // 28 или 29
    return { id: `winter-${wy}`, kind: 'winter', name: 'Зима', start: `${wy}-12-01`, end: `${wy + 1}-02-${p2(lastFeb)}`, defaultTheme: 'mind_spirit' };
  }
  if (m <= 5) return { id: `spring-${y}`, kind: 'spring', name: 'Весна', start: `${y}-03-01`, end: `${y}-05-31`, defaultTheme: 'body' };
  if (m <= 8) return { id: `summer-${y}`, kind: 'summer', name: 'Лето', start: `${y}-06-01`, end: `${y}-08-31`, defaultTheme: 'people' };
  return { id: `autumn-${y}`, kind: 'autumn', name: 'Осень', start: `${y}-09-01`, end: `${y}-11-30`, defaultTheme: 'money_discipline' };
}

/** +20% по теме: характеристика в списке темы, либо тема «Люди» и в задании есть командный навык. */
export function themeBonusApplies(theme: ThemeId | null, stat: Stat, skills: readonly SkillId[]): boolean {
  if (!theme) return false;
  const t = THEMES[theme];
  return t.stats.includes(stat) || (t.teamSkills && skills.some(s => isSkillId(s) && SKILL_CATALOG.find(d => d.id === s)?.stat === 'team'));
}

