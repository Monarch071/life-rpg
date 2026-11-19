import { BALANCE } from './balance';
import { cleanText } from './text';
import type { Answers, FacetKind, ISODate, Profile } from './types';

const S = BALANCE.shadow;
const clamp = (x: number) => Math.min(100, Math.max(0, x));
type Freq = keyof typeof S.start;

/** Один закрытый день грани [S§7]: срыв +8; иначе −2, каждый 7-й чистый день ещё −5; ритуал-помощник −1 (не в день срыва). */
export function facetDay(f: { strength: number; cleanRun: number }, relapse: boolean, assist: boolean): { strength: number; cleanRun: number } {
  const run = relapse ? 0 : f.cleanRun + 1;
  let d = relapse ? S.relapse : -S.clean - (run % S.cleanWeekDays === 0 ? S.cleanWeek : 0);
  if (assist && !relapse) d -= BALANCE.ladder.assist;
  return { strength: Math.round(clamp(f.strength + d)), cleanRun: run };
}

export const banished = (f: { strength: number; cleanRun: number }): boolean => f.strength <= 0 && f.cleanRun >= S.banishDays;

export function battleOutcome(strength: number | null): { result: 'crush' | 'win' | 'draw' | 'lost'; xp: number; trophy: 'rare' | null; plan: boolean } | null {
  if (typeof strength !== 'number' || !Number.isFinite(strength)) return null;
  const B = S.battle;
  if (strength < B.crushBelow) return { result: 'crush', xp: B.crushXp, trophy: 'rare', plan: false };
  if (strength < B.winBelow) return { result: 'win', xp: B.winXp, trophy: null, plan: false };
  if (strength < B.drawBelow) return { result: 'draw', xp: B.drawXp, trophy: null, plan: true };
  return { result: 'lost', xp: 0, trophy: null, plan: false };
}

/** Последнее воскресенье месяца 'ГГГГ-ММ'; неверный вход → ''. */
export function lastSunday(month: string): ISODate {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || +m[2] < 1 || +m[2] > 12) return '';
  const last = new Date(+m[1], +m[2], 0);
  last.setDate(last.getDate() - last.getDay());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())}`;
}

const numAns = (a: Answers | null, k: string): number | null => {
  const v = a?.[k];
  return (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : null;
};
const byHours = (h: number, cuts: number[]): number => {
  const i = cuts.findIndex(c => h < c);
  return [S.start.rare, S.start.sometimes, S.start.often, S.start.daily][i < 0 ? 3 : i];
};
const SMOKE: Record<string, number> = { 'Иногда': S.start.sometimes, 'Регулярно': S.start.daily };
const ALCO: Record<string, number> = { 'Пару раз в месяц': S.start.rare, 'Раз в неделю': S.start.sometimes, 'Несколько раз в неделю': S.start.often };

/** Стартовая сила грани: явная частота, иначе из ответов анкеты, иначе 50 (спека §4.1). */
export function facetStart(kind: FacetKind, answers: Answers | null, freq?: Freq): number {
  const a = answers ?? {};
  const fromAnswers =
    kind === 'smoke' ? SMOKE[String(a.smoking)]
    : kind === 'alcohol' ? ALCO[String(a.alcohol)]
    : kind === 'games' ? (numAns(a, 'games_hours') === null ? undefined : byHours(numAns(a, 'games_hours')!, [1, 2, 4]))
    : kind === 'social' ? (numAns(a, 'screen_hours') === null ? undefined : byHours(numAns(a, 'screen_hours')!, [2, 4, 6]))
    : undefined;
  return freq && Object.hasOwn(S.start, freq) ? S.start[freq] : fromAnswers ?? S.start.sometimes;
}

/** Серьёзная зависимость (решение контролёра): наркотики/вещества — всегда; алкоголь — от «несколько раз в неделю»
 *  (явная частота often/daily, иначе ответ анкеты); прочие привычки — нет. Грань не предлагается, UI советует специалиста. */
export function isSerious(name: string, kind: FacetKind, answers: Answers | null, freq?: Freq): boolean {
  // всегда серьёзно: вещества, азартные игры на деньги, самоповреждение — не игра, а повод обратиться за помощью
  if (/наркот|веществ|ставк|казино|азарт|самоповрежд|порез|суицид/i.test(String(name))) return true;
  if (kind !== 'alcohol' && !/алког/i.test(String(name))) return false;
  return freq ? freq === 'often' || freq === 'daily' : answers?.alcohol === 'Несколько раз в неделю';
}

const BAD: Record<string, { kind: FacetKind; name: string }> = {
  games: { kind: 'games', name: 'Игры' }, social: { kind: 'social', name: 'Соцсети' }, late: { kind: 'late', name: 'Поздний отбой' },
  junk: { kind: 'junk', name: 'Фастфуд' }, smoke: { kind: 'smoke', name: 'Курение' }, procr: { kind: 'procr', name: 'Прокрастинация' },
};

const LEAKS: Record<string, string> = { 'Соцсети': 'social', 'Игры': 'games', 'Прокрастинация': 'procr' };

/** Предложения из анкеты: badHabits, затем ответы smoking, games_hours, screen_hours, time_leaks (§4.1); без серьёзных и дублей (по kind; свои строки — по названию). */
export function facetSuggestions(profile: Profile | null, answers: Answers | null): { kind: FacetKind; name: string; start: number }[] {
  const ids: unknown[] = Array.isArray(profile?.badHabits) ? [...profile!.badHabits] : [];
  if (SMOKE[String(answers?.smoking)]) ids.push('smoke');
  // часы «редко» (ниже первой границы) не предлагаются
  if (numAns(answers, 'games_hours') !== null && facetStart('games', answers) > S.start.rare) ids.push('games');
  if (numAns(answers, 'screen_hours') !== null && facetStart('social', answers) > S.start.rare) ids.push('social');
  if (Array.isArray(answers?.time_leaks)) for (const l of answers.time_leaks) if (Object.hasOwn(LEAKS, l)) ids.push(LEAKS[l]);
  const seen = new Set<string>();
  const out: { kind: FacetKind; name: string; start: number }[] = [];
  for (const id of ids) {
    const known = typeof id === 'string' && Object.hasOwn(BAD, id) ? BAD[id] : null;
    const name = known?.name ?? cleanText(id, 40);
    if (!name) continue;
    const kind: FacetKind = known?.kind ?? 'custom';
    const key = known ? kind : `custom:${name}`;
    if (seen.has(key) || isSerious(name, kind, answers)) continue;
    seen.add(key);
    out.push({ kind, name, start: facetStart(kind, answers) });
  }
  return out;
}

/** «План Мастера» на месяц (правилами, без ИИ): по самой сильной грани. */
export function masterPlan(facets: { name: string; strength: number }[], hasDontLadder: boolean): string {
  if (!facets.length) return '';
  const top = facets.reduce((a, b) => (b.strength > a.strength ? b : a));
  return hasDontLadder
    ? `Опусти лестницу «не делать» для «${top.name}» на ступень ниже и держи её две недели.`
    : `Начни лестницу «не делать» для «${top.name}»: первая ступень — всего 3 дня в неделю.`;
}
