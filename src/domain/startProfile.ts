import { BALANCE as B } from './balance';
import { cleanAnswers, ruleStats } from './interview';
import type { Answers } from './interview';
import { startBase } from './progression';
import { isSkillId, SKILL_CATALOG, type SkillId } from './skillCatalog';
import { initialStats, STATS } from './stats';
import type { Analysis, Profile, Stat } from './types';

const STAT_KEYS = Object.keys(STATS) as Stat[];
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const scoreFrom20 = (v: number): number => Math.round((v - 1) / 19 * 100);
export const ruleStartLevel = (scores: Record<Stat, number>): number =>
  clamp(Math.round(STAT_KEYS.reduce((s, k) => s + scores[k], 0) / STAT_KEYS.length / B.startLevel.scoreDiv), 1, B.startLevel.rulesMax);

/** Таблица спеки §5.2: пороги по убыванию → уровень. */
const tier = (v: unknown, steps: [number, number][]): number | undefined => {
  if (typeof v !== 'number') return undefined;
  return steps.find(([min]) => v >= min)?.[1];
};
export function ruleSkillLevels(a: Answers): Partial<Record<SkillId, number>> {
  const x = cleanAnswers(a);
  const sleep = x.sleep_hours;
  const sources = Array.isArray(x.income_sources) ? x.income_sources : [];
  const raw: Partial<Record<SkillId, number | undefined>> = {
    strength: tier(x.pushups, [[40, 4], [20, 3], [10, 2]]),
    cardio: tier(x.run_km, [[10, 4], [5, 3], [2, 2]]),
    sleep: typeof sleep === 'number' && sleep >= 7 && sleep <= 9 && typeof x.regular === 'number' && x.regular >= 4 ? 3 : undefined,
    reading: tier(x.books, [[4, 4], [2, 3], [1, 2]]),
    languages: typeof x.languages === 'string' && x.languages.trim() ? 2 : undefined,
    tech: tier(x.study_hours, [[5, 3], [2, 2]]),
    routine: tier(x.regular, [[5, 4], [4, 3]]),
    focus: tier(x.focus, [[5, 4], [4, 3]]),
    social: x.circle === 'Широкий круг' ? 3 : x.circle === 'Несколько человек' ? 2 : undefined,
    speaking: x.speaking_fear === 1 ? 4 : x.speaking_fear === 2 ? 3 : undefined,
    budget: x.tracking === 'Веду регулярно' ? 4 : x.tracking === 'Иногда записываю' ? 2 : undefined,
    savings: tier(x.cushion, [[6, 4], [3, 3], [1, 2]]),
    earning: sources.some(s => ['Свой бизнес', 'Фриланс', 'Инвестиции'].includes(s)) ? 3 : undefined,
    mindfulness: x.meditation === 'Регулярно' ? 4 : x.meditation === 'Иногда' ? 3 : x.meditation === 'Пробовал(а)' ? 2 : undefined,
  };
  const out: Partial<Record<SkillId, number>> = {};
  for (const [k, v] of Object.entries(raw)) if (v !== undefined) out[k as SkillId] = Math.min(v, B.skill.rulesStartMax);
  return out;
}

export interface StartProfile {
  source: 'ai' | 'rules' | 'none';
  scores: Record<Stat, number>; base: Record<Stat, number>; level: number;
  levelWhy: Partial<Record<Stat, string>>; skills: Record<SkillId, number>;
}
type Input = { analysis: Analysis | null; answers: Answers | null; profile: Profile | null };

const SECTION: Record<Stat, string> = { str: 'Тело', end: 'Здоровье', int: 'Ум', dis: 'Режим', cha: 'Люди', fin: 'Деньги', spi: 'Дух' };
const scoresOf = (i: Input): Record<Stat, number> => {
  if (i.analysis?.scores) return i.analysis.scores;
  const st = i.analysis?.stats ?? (i.answers ? ruleStats(i.answers) : i.profile ? initialStats(i.profile) : null);
  return Object.fromEntries(STAT_KEYS.map(k => [k, scoreFrom20(st![k])])) as Record<Stat, number>;
};

export function startProfile(inputs: Input[]): StartProfile {
  const used = inputs.filter(i => i.analysis || i.answers || i.profile);
  const scores = Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Record<Stat, number>;
  const skills = Object.fromEntries(SKILL_CATALOG.map(s => [s.id, 1])) as Record<SkillId, number>;
  let level = 1, whyFrom: Analysis | null = null, ai = false;
  for (const i of used) {
    const sc = scoresOf(i);
    for (const k of STAT_KEYS) scores[k] = Math.max(scores[k], sc[k]);
    const lv = i.analysis?.startLevel ?? ruleStartLevel(sc);
    if (lv > level || (lv === level && i.analysis?.levelWhy && !whyFrom)) { level = lv; whyFrom = i.analysis?.levelWhy ? i.analysis : null; }
    if (i.analysis?.scores || i.analysis?.startLevel !== undefined) ai = true;
    const sk = { ...(i.answers ? ruleSkillLevels(i.answers) : {}), ...i.analysis?.skillLevels };   // ИИ перекрывает правила в рамках анкеты
    for (const [k, v] of Object.entries(sk)) if (isSkillId(k)) skills[k] = Math.max(skills[k], v);
  }
  const levelWhy: Partial<Record<Stat, string>> = {};
  for (const k of STAT_KEYS) levelWhy[k] = whyFrom?.levelWhy?.[k] ?? `Оценка ${scores[k]}/100 по ответам раздела «${SECTION[k]}»`;
  return {
    source: ai ? 'ai' : used.length ? 'rules' : 'none', scores, level, levelWhy, skills,
    base: Object.fromEntries(STAT_KEYS.map(k => [k, startBase(scores[k])])) as Record<Stat, number>,
  };
}
