import { BALANCE } from './balance';
import { addDays } from './day';
import type { FinKind, ISODate } from './types';

const d = (slug: string, title: string, kind: FinKind) => ({ id: `default:${slug}`, title, kind });
export const DEFAULT_CATEGORIES: { id: string; title: string; kind: FinKind }[] = [
  d('food', 'Продукты', 'expense'), d('cafe', 'Кафе и доставка', 'expense'), d('transport', 'Транспорт', 'expense'),
  d('home', 'Дом и связь', 'expense'), d('health', 'Здоровье', 'expense'), d('clothes', 'Одежда', 'expense'),
  d('fun', 'Развлечения', 'expense'), d('subs', 'Подписки', 'expense'), d('gifts', 'Подарки', 'expense'), d('other', 'Прочее', 'expense'),
  d('salary', 'Зарплата', 'income'), d('side', 'Подработка', 'income'), d('income_other', 'Прочий доход', 'income'),
  d('piggy', 'Копилка', 'saving'),
];

export function otherOf(kind: FinKind): string {
  return kind === 'expense' ? 'default:other' : kind === 'income' ? 'default:income_other' : 'default:piggy';
}

/** Нижний регистр, ё→е, пробельные схлопнуты, прочие управляющие символы убраны. */
export function normText(s: string): string {
  return String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').replace(/\p{Cc}/gu, '').replace(/ +/g, ' ').trim();
}

/** text и pattern — уже после normText (нормализуются один раз при приёме события). */
export function matchRule(t: string, rules: { pattern: string; categoryId: string; ts: number }[]): string | null {
  let best: { len: number; ts: number; id: string } | null = null;
  for (const r of rules) {
    const p = r.pattern;
    if (!p || !t.includes(p)) continue;
    if (!best || p.length > best.len || (p.length === best.len && r.ts > best.ts)) best = { len: p.length, ts: r.ts, id: r.categoryId };
  }
  return best ? best.id : null;
}

/** sets — в порядке ts. Последнее значение до начала месяца, иначе первое внутри месяца. */
export function limitFor(sets: { month: string; limit: number | null }[], month: string): number | null {
  let before: number | null | undefined;
  for (const s of sets) if (s.month < month) before = s.limit;
  if (before !== undefined) return before;
  return sets.find(s => s.month === month)?.limit ?? null;
}

const cents = (x: number) => Math.round(x * 100);
const daysIn = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(y, m, 0).getDate(); };

export function weekLimit(limitOf: (month: string) => number | null, weekStart: ISODate): number | null {
  let sum = 0, any = false;
  for (let i = 0; i < 7; i++) {
    const m = addDays(weekStart, i).slice(0, 7), l = limitOf(m);
    if (l !== null) { any = true; sum += l / daysIn(m); }
  }
  return any ? cents(sum) / 100 : null;
}

export function periodTotals(entries: { date: ISODate; kind: FinKind; amount: number; categoryId: string; dup: boolean }[], from: ISODate, to: ISODate):
  { income: number; expense: number; saving: number; loggedDays: number; byCat: Record<string, number> } {
  let income = 0, saving = 0;
  const cat: Record<string, number> = {}, days = new Set<string>();
  for (const e of entries) {
    if (e.dup || e.date < from || e.date > to || !Number.isFinite(e.amount)) continue;
    const c = cents(e.amount);
    if (e.kind === 'income') income += c;
    else if (e.kind === 'saving') saving += c;
    else cat[e.categoryId] = (cat[e.categoryId] ?? 0) + c;
    days.add(e.date);   // день учёта — любая запись (решение контролёра)
  }
  const byCat: Record<string, number> = {};
  let expense = 0;
  for (const [k, v] of Object.entries(cat)) { const x = Math.max(0, v); byCat[k] = x / 100; expense += x; }
  return { income: income / 100, expense: expense / 100, saving: saving / 100, loggedDays: days.size, byCat };
}

/** null — нет ни одного лимита; иначе учёт активен (loggedDays ≥ minDays) и все категории с лимитом в пределах. */
export function budgetVerdict(byCat: Record<string, number>, limits: Record<string, number | null>, loggedDays: number, minDays: number): boolean | null {
  const lim = Object.entries(limits).filter((x): x is [string, number] => x[1] !== null);
  if (!lim.length) return null;
  return loggedDays >= minDays && lim.every(([k, l]) => cents(byCat[k] ?? 0) <= cents(l));
}

export function validAmount(x: unknown): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  const r = cents(x) / 100;
  return r !== 0 && Math.abs(r) <= BALANCE.finance.amountMax ? r : null;
}
