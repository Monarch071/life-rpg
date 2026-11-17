/** Тень дня: 75‑й перцентиль последних 14 дней × (1 + 0.02·серия побед); пусто → 40. */
export function shadowXpForDay(prevDailyXp: number[], winStreak: number): number {
  const xs = prevDailyXp.slice(-14).sort((a, b) => a - b);
  if (!xs.length) return 40;
  const i = 0.75 * (xs.length - 1), lo = Math.floor(i);
  const p = xs[lo] + (i - lo) * ((xs[lo + 1] ?? xs[lo]) - xs[lo]);
  return Math.round(p * (1 + 0.02 * winStreak));
}
