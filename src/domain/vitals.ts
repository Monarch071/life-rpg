import { BALANCE } from './balance';

const V = BALANCE.vitals;
const MIN_MS = 60_000;

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
/** round(Σ wᵢsᵢ / Σ wᵢ) по доступным (не-null) частям; null — частей нет. */
const blend = (parts: [number, number | undefined][]): number | null => {
  const ok = parts.filter((p): p is [number, number] => p[1] !== undefined);
  const w = ok.reduce((a, [wi]) => a + wi, 0);
  return w > 0 ? Math.round(ok.reduce((a, [wi, s]) => a + wi * s, 0) / w) : null;
};

export function sleepScore(hours: number): number {
  if (!num(hours)) return 0;
  return Math.round(clamp(hours >= V.hp.sleepMin ? 100 : 100 - V.hp.sleepPerHour * (V.hp.sleepMin - hours)));
}

export function hpScore(i: { sleepAvg: number | null; stepsAvg: number | null; stepsGoal: number; rhr: number | null; rhrMean: number | null; feel: number | null }):
  { hp: number | null; parts: Partial<Record<'sleep' | 'steps' | 'rhr' | 'feel', number>> } {
  const parts: Partial<Record<'sleep' | 'steps' | 'rhr' | 'feel', number>> = {};
  if (i.sleepAvg !== null) parts.sleep = sleepScore(i.sleepAvg);
  if (i.stepsAvg !== null) {
    const goal = num(i.stepsGoal) && i.stepsGoal > 0 ? i.stepsGoal : V.hp.stepsGoalDefault;
    parts.steps = Math.round(clamp(num(i.stepsAvg) ? (100 * i.stepsAvg) / goal : 0));
  }
  if (i.rhr !== null && i.rhrMean !== null) {
    parts.rhr = num(i.rhr) && num(i.rhrMean) ? Math.round(clamp(100 - V.hp.rhrPerBeat * Math.max(0, i.rhr - i.rhrMean))) : 0;
  }
  if (i.feel !== null) parts.feel = num(i.feel) ? Math.round(clamp(i.feel >= V.hp.feelFull ? 100 : i.feel * 10)) : 0;
  const w = V.hp.w;
  return { hp: blend([[w.sleep, parts.sleep], [w.steps, parts.steps], [w.rhr, parts.rhr], [w.feel, parts.feel]]), parts };
}

export function energyScore(i: { sleepLast: number | null; morning: number | null; weekMorning: number | null; hp: number | null }): number | null {
  const w = V.energy.w;
  const m = i.morning ?? i.weekMorning;
  const ok = (x: number | null) => (x === null ? undefined : num(x) ? clamp(x) : 0);
  return blend([
    [w.sleep, i.sleepLast === null ? undefined : sleepScore(i.sleepLast)],
    [w.morning, m === null ? undefined : num(m) ? clamp(m * 10) : 0],
    [w.hp, ok(i.hp)],
  ]);
}

export function focusScore(i: { focusMin: number | null; socialMin: number | null }): { focus: number | null; parts: Partial<Record<'focus' | 'social', number>> } {
  const F = V.focus;
  const parts: Partial<Record<'focus' | 'social', number>> = {};
  if (i.focusMin !== null) parts.focus = Math.round(clamp(num(i.focusMin) ? (i.focusMin / F.fullMin) * 100 : 0));
  if (i.socialMin !== null) {
    const s = num(i.socialMin) ? Math.max(0, i.socialMin) : F.socialZeroMin;
    parts.social = Math.round(clamp((100 * (F.socialZeroMin - s)) / (F.socialZeroMin - F.socialOkMin)));
  }
  return { focus: blend([[F.w.focus, parts.focus], [F.w.social, parts.social]]), parts };
}

export const intFocusMult = (focus: number | null): number =>
  focus === null || !num(focus) ? 1 : (100 * V.focus.intBase + V.focus.intSpan * clamp(focus)) / 100;

export function fatigueNext(prev: number, day: { bigDay: boolean; rest: boolean; calm: boolean; lowEvening: boolean } | null, nightSleep: number | null): number {
  const F = V.fatigue;
  let d = F.nightly;
  if (day) d += (day.bigDay ? F.bigDay : 0) + (day.rest ? F.rest : 0) + (day.calm ? F.calm : 0) + (day.lowEvening ? F.lowEvening : 0);
  if (num(nightSleep)) d += nightSleep < F.shortNightH ? F.shortNight : nightSleep >= F.longNightH ? F.longNight : 0;
  return Math.round(clamp((num(prev) ? prev : 0) + d));
}

/** Сессии одной группы: open→close; open без close — до следующего сигнала, не больше openTailMin; close без open игнорируется. */
export function sessionMinutes(sig: { at: number; state: 'open' | 'close' }[]): { start: number; min: number }[] {
  const s = sig.filter((x) => num(x.at)).sort((a, b) => a.at - b.at);
  const out: { start: number; min: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i].state !== 'open') continue;
    const next = s[i + 1];
    if (next?.state === 'close') {
      out.push({ start: s[i].at, min: Math.min((next.at - s[i].at) / MIN_MS, V.focus.sessionMaxMin) });
      i++;
    } else {
      const tail = next ? (next.at - s[i].at) / MIN_MS : V.focus.openTailMin;
      out.push({ start: s[i].at, min: Math.min(tail, V.focus.openTailMin) });
    }
  }
  return out;
}

/** Объединение интервалов (мс) без двойного счёта; каждый интервал не длиннее capMin. Возвращает минуты. */
export function unionMinutes(iv: { start: number; end: number }[], capMin: number): number {
  const cap = num(capMin) ? Math.max(0, capMin) * MIN_MS : 0;
  const s = iv.filter((x) => num(x.start) && num(x.end) && x.end > x.start)
    .map((x) => ({ start: x.start, end: Math.min(x.end, x.start + cap) }))
    .sort((a, b) => a.start - b.start);
  let total = 0, curStart = s[0]?.start ?? 0, curEnd = curStart;
  for (const x of s) {
    if (x.start > curEnd) { total += curEnd - curStart; curStart = x.start; curEnd = x.end; }
    else curEnd = Math.max(curEnd, x.end);
  }
  total += curEnd - curStart;
  return total / MIN_MS;
}

export type WorkoutKind = 'strength' | 'mobility' | 'cardio' | 'sports' | 'other';
// Порядок проверки — сверху вниз, первое совпадение (спека §4.2).
const KINDS: [Exclude<WorkoutKind, 'other'>, RegExp][] = [
  ['strength', /сил|strength|функц|functional|кроссфит|cross/i],
  ['mobility', /йог|yoga|гибк|flexib|растяж|stretch|пилат|pilates/i],
  ['cardio', /бег|run|вел|cycl|плав|swim|кардио|cardio|hiit|интервал|эллипс|ellip|гребл|row|ходьб|walk|поход|hik/i],
  ['sports', /футб|soccer|баскет|basket|теннис|tennis|волей|volley|бокс|box|единобор|martial|игр|game/i],
];
export const workoutKind = (type: string): WorkoutKind =>
  (typeof type === 'string' && KINDS.find(([, re]) => re.test(type))?.[0]) || 'other';
