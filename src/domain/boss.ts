import { BALANCE } from './balance';
import { THEMES, type ThemeId } from './calendar';
import { DEFAULT_SKILL_BY_STAT } from './questBank';
import { isSkillId } from './skillCatalog';
import { STATS } from './stats';
import { cleanText } from './text';
import type { BossDraft, ISODate, Stat } from './types';

const B = BALANCE.boss;

/** Строка ровно в пределах max (длиннее — отказ, а не обрезка): для проверки недоверенных черновиков. */
const fit = (s: unknown, max: number): string | null => {
  const t = cleanText(s, max + 1);
  return t && t.length <= max ? t : null;
};

/** HP части 0–100: 80 за шаги, 4 за удар (не больше hitCap). */
export function partHp(stepsDone: number, steps: number, hits: number): number {
  const n = (x: number) => (Number.isFinite(x) ? Math.max(0, x) : 0);
  const share = n(steps) > 0 ? Math.min(1, n(stepsDone) / n(steps)) : 0;
  return Math.min(100, Math.max(0, Math.round(100 - B.stepsShare * share - B.hitDamage * Math.min(B.hitCap, n(hits)))));
}

/** Три календарных месяца сезона, обрезанные по его границам; неверный вход → []. */
export function partWindows(start: ISODate, end: ISODate): { start: ISODate; end: ISODate }[] {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(start));
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(String(end))) return [];
  const p = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: B.parts }, (_, i) => {
    const d = new Date(+m[1], +m[2] - 1 + i, 1);
    const [y, mo] = [d.getFullYear(), d.getMonth() + 1];
    const first = `${y}-${p(mo)}-01`, last = `${y}-${p(mo)}-${p(new Date(y, mo, 0).getDate())}`;
    return { start: first < start ? start : first, end: last > end ? end : last };
  });
}

/** Общие части правил (спека §5.1). */
const RULE_PARTS: BossDraft['parts'] = [
  { title: 'Разведка', steps: ['Разбить цель на шаги', 'Сделать первый шаг', 'Выбрать мерило прогресса'] },
  { title: 'Наступление', steps: ['Главный шаг месяца', 'Проверить и поправить план', 'Получить видимый результат'] },
  { title: 'Финальная битва', steps: ['Последний рывок', 'Закрыть хвосты', 'Подвести итог'] },
];

/** Обобщённая цель на характеристику — заглушки темы. */
const GENERIC: Record<Stat, string> = {
  str: 'Выйти на новый уровень силы', end: 'Пробежать 5 км без остановки', int: 'Прочитать 3 книги', dis: 'Выстроить устойчивый распорядок',
  cha: 'Расширить круг общения', fin: 'Накопить подушку', spi: 'Завести практику осознанности',
};

const asStat = (x: unknown): Stat => (typeof x === 'string' && Object.hasOwn(STATS, x) ? (x as Stat) : 'dis');
const draft = (title: string, stat: Stat): BossDraft => ({ title, skill: DEFAULT_SKILL_BY_STAT[stat], parts: RULE_PARTS.map(p => ({ title: p.title, steps: [...p.steps] })) });

/** Варианты сезонного босса правилами: цели → легаси → цель года → тема, без дублей, ровно 3. */
export function bossOptionsByRules(i: { goals: { text: string; stat: Stat }[]; legacy: { title: string; stat: Stat }[]; yearGoal: string | null; theme: ThemeId | null }): BossDraft[] {
  const out: BossDraft[] = [];
  const seen = new Set<string>();
  const add = (raw: unknown, stat: Stat) => {
    const t = cleanText(raw, 60);
    if (!t || out.length >= B.parts || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(draft(t, stat));
  };
  const list = <T,>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x : []);
  for (const g of list(i?.goals)) add(g?.text, asStat(g?.stat));
  for (const l of list(i?.legacy)) add(l?.title, asStat(l?.stat));
  const themeStats = i?.theme && Object.hasOwn(THEMES, i.theme) ? THEMES[i.theme].stats : [];
  add(i?.yearGoal, themeStats[0] ?? 'dis');
  const order = [...themeStats, ...(Object.keys(STATS) as Stat[]).filter(s => !themeStats.includes(s))];
  for (const s of order) add(GENERIC[s], s);
  return out;
}

/** Черновик босса от ИИ/события — недоверенный: 3 части, в каждой 2–5 шагов; тексты ≤ 60/80. */
export function validBossDraft(x: unknown): BossDraft | null {
  const r = x as any;
  const title = fit(r?.title, 60);
  if (!title || !isSkillId(r?.skill) || !Array.isArray(r?.parts) || r.parts.length !== B.parts) return null;
  const parts: BossDraft['parts'] = [];
  for (const p of r.parts) {
    const pt = fit(p?.title, 60);
    if (!pt || !Array.isArray(p?.steps) || p.steps.length < B.stepsMin || p.steps.length > B.stepsMax) return null;
    const steps = p.steps.map((s: unknown) => fit(s, 80));
    if (steps.some((s: string | null) => s === null)) return null;
    parts.push({ title: pt, steps });
  }
  return { title, skill: r.skill, parts };
}

export function chainByRules(goal: string): string[] {
  const g = cleanText(goal, 40);
  return [g ? `Собрать идеи: ${g}` : 'Собрать идеи', 'Сделать пробу', 'Получить первый результат', 'Закрепить'];
}

export function validChainSteps(x: unknown): string[] | null {
  if (!Array.isArray(x) || x.length < BALANCE.chain.stepsMin || x.length > BALANCE.chain.stepsMax) return null;
  const out = x.map(s => fit(s, 80));
  return out.every((s): s is string => s !== null) ? out : null;
}
