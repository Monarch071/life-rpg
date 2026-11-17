import type { Profile, Stat } from './types';

export const STATS: Record<Stat, { name: string; icon: string }> = {
  str: { name: 'Сила', icon: '💪' },
  end: { name: 'Выносливость', icon: '🏃' },
  int: { name: 'Интеллект', icon: '🧠' },
  dis: { name: 'Дисциплина', icon: '🎯' },
  cha: { name: 'Харизма', icon: '🗣️' },
  fin: { name: 'Финансы', icon: '💰' },
  spi: { name: 'Дух', icon: '🧘' },
};
const ORDER = Object.keys(STATS) as Stat[];

const clamp = (n: number) => Math.min(20, Math.max(1, n));

export function initialStats(p: Profile): Record<Stat, number> {
  const bonus = p.sportLevel >= 2 ? 2 : 0;
  const out = {} as Record<Stat, number>;
  for (const s of ORDER) out[s] = clamp(p.selfRating[s] * 2 + (s === 'str' || s === 'end' ? bonus : 0));
  return out;
}

const PAIRS: [Stat, Stat, string][] = [
  ['str', 'end', 'Воин'], ['int', 'dis', 'Стратег'], ['cha', 'spi', 'Лидер'],
  ['fin', 'dis', 'Торговец'], ['int', 'spi', 'Мудрец'], ['str', 'dis', 'Страж'],
  ['end', 'spi', 'Странник'], ['cha', 'fin', 'Дипломат'], ['int', 'cha', 'Бард'],
];

export function classFor(stats: Record<Stat, number>): string {
  const [a, b] = [...ORDER].sort((x, y) => stats[y] - stats[x]); // sort стабилен: ничья — по порядку STATS
  const hit = PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? hit[2] : `Искатель (${STATS[a].name})`;
}

export const tierFor = (level: number): 1|2|3|4 => (level >= 30 ? 4 : level >= 15 ? 3 : level >= 5 ? 2 : 1);

/** Проверка характеристики из недоверенных данных: только строка‑ключ STATS (hasOwn приводит массив ['int'] к 'int'). */
export const isStat = (x: unknown): x is Stat => typeof x === 'string' && Object.hasOwn(STATS, x);
