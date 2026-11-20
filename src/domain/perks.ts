import { BALANCE as B } from './balance';
import { SKILL_CATALOG, SKILL_IDS, type SkillId } from './skillCatalog';
import type { Stat } from './types';

const P = B.perks;
const r9 = (x: number) => Math.round(x * 1e9) / 1e9;

export type PerkEffect = { kind: 'xp'; pct: number } | { kind: 'gold'; pct: number } | { kind: 'relapse'; value: number }
  | { kind: 'streakMiss'; factor: number } | { kind: 'fatigueDecay'; points: number };
export interface PerkDef { id: string; skill: SkillId; level: 3 | 6 | 10; title: string; desc: string; kind: 'pct' | 'flat'; effect: PerkEffect }

const DEFAULT_TITLES = { 3: 'Разгон', 6: 'Знаток', 10: 'Мастер' } as const;
const pct = (s: SkillId, level: 3 | 6 | 10, title: string, desc: string, effect: PerkEffect): PerkDef => ({ id: `${s}:${level}`, skill: s, level, title, desc, kind: 'pct', effect });
const flat = (s: SkillId, level: 3 | 6 | 10, title: string, desc: string, effect: PerkEffect): PerkDef => ({ ...pct(s, level, title, desc, effect), kind: 'flat' });

const calm = (s: SkillId) => flat(s, 6, 'Лёгкое восстановление', `Усталость спадает ещё на ${P.fatigueDecay} каждую ночь`, { kind: 'fatigueDecay', points: P.fatigueDecay });
const count = (s: SkillId) => pct(s, 6, 'Счёт', `+${P.goldPct * 100}% золота за задания этого навыка`, { kind: 'gold', pct: P.goldPct });
/** Особые перки заменяют умолчание на своём уровне (спека §3.1). */
const SPECIAL: Record<string, PerkDef> = Object.fromEntries([
  flat('habits', 3, 'Стойкость', `Срыв грани Тени даёт +${P.relapse} к силе вместо +${B.shadow.relapse}`, { kind: 'relapse', value: P.relapse }),
  flat('routine', 10, 'Режим 10', 'Пропуск дня: серия теряет 25% вместо половины', { kind: 'streakMiss', factor: P.streakMiss }),
  calm('mobility'), calm('sleep'), calm('mindfulness'), count('budget'), count('savings'), count('earning'),
].map(p => [p.id, p]));

const defaultPerk = (s: SkillId, level: 3 | 6 | 10): PerkDef =>
  pct(s, level, DEFAULT_TITLES[level], `+${P.xpPct * 100}% XP заданиям, где навык главный`, { kind: 'xp', pct: P.xpPct });

export const PERKS: PerkDef[] = SKILL_IDS.flatMap(s => P.levels.map(l => SPECIAL[`${s}:${l}`] ?? defaultPerk(s, l)));

type Forms = Record<Stat, number | null>;

/** Форма характеристики навыка; рабочие навыки — среднее Харизмы и Дисциплины; null (новая) = 1. */
export function skillForm(skill: SkillId, forms: Forms): number {
  const st = SKILL_CATALOG.find(s => s.id === skill)?.stat;
  if (!st) return 1;
  const f = (s: Stat) => forms[s] ?? 1;
  return r9(st === 'team' ? (f('cha') + f('dis')) / 2 : f(st));
}

export function perkPower(p: PerkDef, form: number, rusty: boolean): 0 | 0.5 | 1 {
  if (rusty) return 0;
  const f = r9(form);
  if (p.kind === 'flat') return f >= P.flatMin ? 1 : 0;
  return f >= P.pctFull ? 1 : f >= P.flatMin ? 0.5 : 0;
}

/** Процентные перки главного навыка задания: слагаемые XP и золотой множитель. */
export function mainSkillPerks(skill: SkillId, level: number, form: number, rusty: boolean): { xp: number; gold: number } {
  let xp = 0, gold = 0;
  for (const p of PERKS) {
    if (p.skill !== skill || p.level > level) continue;
    const w = perkPower(p, form, rusty);
    if (p.effect.kind === 'xp') xp += p.effect.pct * w;
    else if (p.effect.kind === 'gold') gold += p.effect.pct * w;
  }
  return { xp: r9(xp), gold: r9(gold) };
}

/** Постоянные перки на начало дня: срыв грани, потеря серии, доп. спад Усталости. */
export function flatPerks(skills: Record<SkillId, { level: number; rusty: boolean }>, forms: Forms): { relapse: number; streakMiss: number; fatigueDecay: number } {
  const out = { relapse: B.shadow.relapse as number, streakMiss: B.streak.missFactor as number, fatigueDecay: 0 };
  for (const p of PERKS) {
    const sk = skills[p.skill];
    if (!sk || p.level > sk.level || p.kind !== 'flat' || perkPower(p, skillForm(p.skill, forms), sk.rusty) === 0) continue;
    const e = p.effect;
    if (e.kind === 'relapse') out.relapse = Math.min(out.relapse, e.value);
    else if (e.kind === 'streakMiss') out.streakMiss = Math.max(out.streakMiss, e.factor);
    else if (e.kind === 'fatigueDecay') out.fatigueDecay += e.points;
  }
  return out;
}

export const isRusty = (idle: number | null): boolean => idle !== null && idle >= B.rust.days;
