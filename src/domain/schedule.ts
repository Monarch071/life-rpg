import { fromMin, toMin } from './day';
import type { HHMM, Profile, Quest } from './types';

export type Win = { start: HHMM; end: HHMM };
const win = (a: number, b: number): Win => ({ start: fromMin(a), end: fromMin(b) });

/** Окна ≥ 10 мин между подъёмом и отбоем; занятость (в т.ч. через полночь) вычитается. */
export function freeWindows(wakeAt: HHMM, sleepAt: HHMM, busy: Win[]): Win[] {
  const w = toMin(wakeAt);
  let e = toMin(sleepAt);
  if (e <= w) e += 1440;
  const iv: [number, number][] = [];
  for (const b of busy) {
    const s = toMin(b.start);
    let f = toMin(b.end);
    if (f <= s) f += 1440;
    for (const k of [-1440, 0, 1440]) {
      const a = Math.max(s + k, w), z = Math.min(f + k, e);
      if (z > a) iv.push([a, z]);
    }
  }
  iv.sort((x, y) => x[0] - y[0]);
  const out: Win[] = [];
  let cur = w;
  for (const [a, z] of iv) {
    if (a - cur >= 10) out.push(win(cur, a));
    cur = Math.max(cur, z);
  }
  if (e - cur >= 10) out.push(win(cur, e));
  return out;
}

type Seg = { s: number; e: number; en: number };

export function placeQuests(
  quests: Omit<Quest, 'window'>[], windows: Win[], energy: Profile['energy'], wakeAt: HHMM,
): Quest[] {
  const wk = toMin(wakeAt);
  const energyAt = (c: number) =>
    c < wk || c >= 1320 ? energy.night : c < 720 ? energy.morning : c < 1020 ? energy.day : energy.evening;
  const segs: Seg[] = [];
  for (const w of windows) {
    let s = toMin(w.start);
    if (s < wk) s += 1440;
    let e = toMin(w.end);
    if (e <= s) e += 1440;
    for (let a = s; a < e;) {
      const c = a % 1440;
      const z = Math.min(e, a + [720, 1020, 1320, 1440].find(b => b > c)! - c);
      segs.push({ s: a, e: z, en: energyAt(c) });
      a = z;
    }
  }
  const placed = new Map<string, Win>();
  for (const x of [...quests].sort((a, b) => b.minutes - a.minutes)) {
    if (x.minutes <= 0) continue;
    const fit = segs.filter(g => g.e - g.s >= x.minutes).sort((a, b) => b.en - a.en || a.s - b.s)[0];
    if (!fit) continue;
    placed.set(x.id, win(fit.s, fit.s + x.minutes));
    fit.s += x.minutes;
  }
  return quests.map(x => ({ ...x, window: placed.get(x.id) ?? null }));
}
