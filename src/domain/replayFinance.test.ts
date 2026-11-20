import { expect, test } from 'vitest';
import { BALANCE } from './balance';
import { addDays, weekStart } from './day';
import { importChunks } from './csvImport';
import { QUEST_TEMPLATES } from './questBank';
import { replay } from './replay';
import type { GameEvent, ImportRow, Profile, Quest, Stat } from './types';
import { generateWeeklyQuests } from './weekly';

// Даты января 2027 — после BALANCE.rivalSince по умолчанию.
const D0 = BALANCE.depthSince;
const at = (date: string, h = 12, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent =>
  ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? D0), deviceId: 'd1', ...e }) as unknown as GameEvent;
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const STATS: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];
const rating = (a: Stat, b: Stat) => Object.fromEntries(STATS.map(s => [s, s === a || s === b ? 9 : 5])) as Record<Stat, number>;
const onb = (selfRating: Record<Stat, number>) => ev({ type: 'onboarding_completed', id: 'onb', ts: at(addDays(D0, -120), 7), profile: {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating } as Profile });

const cat = (categoryId: string, limit: number | null, ts: number) => ev({ type: 'fin_category_set', categoryId, title: 'Еда', kind: 'expense', limit, ts });
const spend = (date: string, amount: number, categoryId = 'food', h = 12) => ev({ type: 'fin_entry_added', entryId: `m${++seq}`, date, kind: 'expense', amount, categoryId, ts: at(date, h) });
const wallet = (date: string, amount: number, merchant: string, h = 13) => ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at(date, h), ts: at(date, h), signal: { kind: 'wallet', amount, merchant } });
const imp = (importId: string, rows: ImportRow[], ts: number) => ev({ type: 'fin_imported', importId, rows, ts });
const M = '2027-01', R0 = BALANCE.rivalSince;

test('мусорные события финансов игнорируются', () => {
  const s = replay([ev({ type: 'fin_entry_added', entryId: 'x', date: '2027-01-05', kind: 'expense', amount: NaN, categoryId: 'food' }),
    ev({ type: 'fin_entry_added', entryId: 'y', date: '2027-02-31', kind: 'expense', amount: 10, categoryId: 'food' }),
    ev({ type: 'fin_entry_added', entryId: 'z', date: '2027-01-05', kind: 'gift', amount: 10, categoryId: 'food' }),
    ev({ type: 'fin_imported', importId: 'i', rows: 'oops' })], at('2027-01-06'));
  expect(s.finance.entries).toEqual([]);
});
test('неизвестная категория → «Прочее»; Wallet по правилу; возврат уменьшает', () => {
  const s = replay([cat('food', null, at('2026-12-01')), ev({ type: 'fin_rule_set', ruleId: 'r', pattern: 'магазин 1', categoryId: 'food', ts: at('2026-12-01') }),
    spend('2027-01-05', 10, 'nope'), wallet('2027-01-05', 250, 'МАГАЗИН 1'), wallet('2027-01-05', -50, 'Магазин 1')], at('2027-01-05', 22));
  expect(s.finance.month.byCat).toEqual(expect.arrayContaining([{ id: 'default:other', spent: 10, limit: null }, { id: 'food', spent: 200, limit: null }]));
  expect(s.today.data.finEntries).toBe(3);
});
test('импорт: повтор файла — без дублей; Wallet ±1 день — дубль; порядок не важен; удаление импорта', () => {
  const rows = [{ key: 'k1', date: '2027-01-05', amount: -250, text: 'магазин 1' }, { key: 'k2', date: '2027-01-05', amount: -40, text: 'такси' }];
  const evs = [wallet('2027-01-06', 250, 'Магазин 1'), imp('a', rows, at('2027-01-08')), imp('b', rows, at('2027-01-09'))];
  const s = replay(evs, at('2027-01-10'));
  expect(s.finance.month.expense).toBe(290);
  expect(replay([...evs].reverse(), at('2027-01-10')).finance.month.expense).toBe(290);
  expect(s.finance.entries.filter(e => e.dup)).toHaveLength(3);   // import a k1 (Wallet) + b k1, b k2 (повтор ключа)
  expect(replay([...evs, ev({ type: 'fin_import_removed', importId: 'a', ts: at('2027-01-10') })], at('2027-01-10')).finance.month.expense).toBe(290);   // b становится основным
});
test('1001 строка в событии — принимаются первые 1000', () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({ key: `k${i}`, date: '2027-01-05', amount: -1, text: 'x' }));
  expect(replay([imp('a', rows, at('2027-01-06'))], at('2027-01-07')).finance.month.expense).toBe(1000);
});
test('месяц в лимите: лимит поднят в месяце — вердикт по старому; поздний импорт награду не меняет', () => {
  const base = [onb(rating('fin', 'int')), cat('food', 1000, at('2026-12-20')), ...span(`${M}-01`, 15).map(d => spend(d, 70)), cat('food', 9999, at(`${M}-30`))];
  const s = replay(base, at('2027-02-01', 12));
  expect(s.ledger.find(r => r.id === `budget:month:${M}`)).toBeUndefined();   // 1050 > 1000
  const ok = [onb(rating('fin', 'int')), cat('food', 1100, at('2026-12-20')), ...span(`${M}-01`, 15).map(d => spend(d, 70))];
  const s2 = replay(ok, at('2027-02-01', 12));
  expect(s2.ledger.find(r => r.id === `budget:month:${M}`)).toMatchObject({ xp: 140, skills: [['budget', 140]], source: 'budget' });
  const late = replay([...ok, imp('z', [{ key: 'k', date: `${M}-20`, amount: -5000, text: 'x' }], at('2027-02-01', 10))], at('2027-02-01', 12));
  expect(late.ledger.find(r => r.id === `budget:month:${M}`)?.xp).toBe(140);
  expect(late.finance.months[0]).toMatchObject({ month: M, expense: 6050 });
});
test('учёт неактивен (< 15 дней) — не в лимите; «10% дохода» — 49 XP', () => {
  const evs = [onb(rating('fin', 'int')), cat('food', 1000, at('2026-12-20')), ...span(`${M}-01`, 14).map(d => spend(d, 1)),
    ev({ type: 'fin_entry_added', entryId: 'inc', date: `${M}-10`, kind: 'income', amount: 1000, categoryId: 'default:salary', ts: at(`${M}-10`) }),
    ev({ type: 'fin_entry_added', entryId: 'sav', date: `${M}-11`, kind: 'saving', amount: 100, categoryId: 'default:piggy', ts: at(`${M}-11`) })];
  const s = replay(evs, at('2027-02-01', 12));
  expect(s.ledger.find(r => r.id === `budget:month:${M}`)).toBeUndefined();
  expect(s.ledger.find(r => r.id === `budget:save:${M}`)).toMatchObject({ xp: 49, skills: [['savings', 49]] });
});
test('неделя в лимите — третье недельное; решается в воскресенье', () => {
  const ws = '2027-01-11';
  const wk = generateWeeklyQuests({ weekStart: ws, stats: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 }, multipliers: {} as any, prevActiveDays: 3, prevStatQuests: 3, bestSteps7: 8000, themeStat: null, budget: true });
  expect(wk.map(w => w.kind)).toEqual(['active_days', 'stat_quests', 'budget_week']);
  const evs = [cat('food', 3100, at('2026-12-20')), ev({ type: 'weekly_issued', weekStart: ws, quests: wk, ts: at(ws, 8) }), ...span(ws, 3).map(d => spend(d, 200))];
  expect(replay(evs, at('2027-01-17', 12)).weekly.quests[2].done).toBe(false);   // до закрытия воскресенья
  expect(replay(evs, at('2027-01-18', 12)).ledger.some(r => r.id === `weekly:${ws}:${wk[2].id}`)).toBe(true);   // 600 ≤ 700, 3 дня учёта
  expect(replay(evs, at('2027-01-18', 12)).genWeekly.budget).toBe(true);
  expect(replay([], at('2027-01-18', 12)).genWeekly.budget).toBe(false);
});
test('до rivalSince — без бюджетных строк', () => {
  const m = R0.slice(0, 7), prev = `${addDays(`${m}-01`, -1).slice(0, 7)}`;
  const evs = [cat('food', 1e6, at(addDays(`${prev}-01`, -40))), ...span(`${prev}-01`, 28).map(d => spend(d, 1))];
  expect(replay(evs, at(R0)).ledger.filter(r => r.source === 'budget')).toEqual([]);
});

test('старые траты metric_logged spend add — записи «Прочее»; «Записать траты» засчитывается само', () => {
  const d = '2027-01-05';
  const tpl = QUEST_TEMPLATES.find(t => t.id === 'expenses')!;
  expect(tpl.auto?.(5)).toEqual({ metric: 'finEntries', op: '>=', value: 5 });
  const q = { id: 'q', date: d, title: 'Записать 2 траты', stat: 'fin', minutes: 2, window: null, xp: 0, auto: tpl.auto!(2), templateId: 'expenses', rank: 'E', skills: ['budget'], kind: 'daily' } as Quest;
  const s = replay([ev({ type: 'quests_issued', date: d, quests: [q], ts: at(d, 8) }), spend(d, 5, 'x'),
    ev({ type: 'metric_logged', date: d, metric: 'spend', value: 300, mode: 'add', ts: at(d, 9) })], at(d, 22));
  expect(s.finance.entries.find(e => e.source === 'legacy')).toMatchObject({ categoryId: 'default:other', amount: 300, kind: 'expense' });
  expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto' });
});
test('правка: категория → вид категории; удаление записи; поздняя запись не меняет засчёт закрытого дня', () => {
  const d = '2027-01-05';
  const s = replay([{ ...wallet(d, 500, 'Перевод'), id: 'w1' }, ev({ type: 'fin_entry_edited', entryId: 'wallet:w1', categoryId: 'default:piggy', ts: at(d, 14) }),
    ev({ type: 'fin_entry_added', entryId: 'gone', date: d, kind: 'expense', amount: 7, categoryId: 'x', ts: at(d, 12) }),
    ev({ type: 'fin_entry_edited', entryId: 'gone', removed: true, ts: at(d, 15) }),
    spend(d, 9, 'x', 23), ev({ type: 'fin_entry_added', entryId: 'late', date: d, kind: 'expense', amount: 1, categoryId: 'x', ts: at('2027-01-06', 12) }),
    ev({ type: 'quests_issued', date: d, ts: at(d, 8), quests: [{ id: 'q', date: d, title: 'Записать 4 траты', stat: 'fin', minutes: 4, window: null, xp: 0,
      auto: { metric: 'finEntries', op: '>=', value: 4 }, templateId: 'expenses', rank: 'E', skills: ['budget'], kind: 'daily' }] })], at('2027-01-07'));
  expect(s.history.find(h => h.date === d)?.completed).toBe(0);   // 3 записи до закрытия дня (принятые, правки не отнимают); поздняя — нет
  expect(s.finance.months).toEqual([]);
  expect(s.finance.entries.find(e => e.source === 'wallet')).toMatchObject({ kind: 'saving', categoryId: 'default:piggy', uncategorized: false });
  expect(s.finance.entries.filter(e => e.source === 'manual').map(e => e.amount).sort()).toEqual([1, 9]);
});

test('импорт блоками: удаление по базовому id снимает все блоки', () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ key: `k${i}`, date: '2027-01-05', amount: -1, text: 'x' }));
  const evs = importChunks('s', rows).map(c => imp(c.importId, c.rows, at('2027-01-06')));
  expect(replay(evs, at('2027-01-07')).finance.month.expense).toBe(2500);
  expect(replay([...evs, ev({ type: 'fin_import_removed', importId: 's', ts: at('2027-01-07', 9) })], at('2027-01-07')).finance.month.expense).toBe(0);
});
test('«Записать траты»: строка импорта, совпавшая с более ранним Wallet, не считается второй раз', () => {
  const d = '2027-01-05';
  const s = replay([wallet(d, 100, 'Магазин 1'), imp('a', [{ key: 'k1', date: d, amount: -100, text: 'магазин 1' }, { key: 'k2', date: d, amount: -7, text: 'y' }], at(d, 20))], at(d, 22));
  expect(s.today.data.finEntries).toBe(2);
});
test('производительность: год Wallet и ручных записей, 4 импорта по 1000 строк, 52 бюджетные недели', () => {
  let n = 0;
  const e = (x: Draft) => ev({ ...x, id: `p${++n}` });
  const evs: GameEvent[] = [cat('food', 30000, at('2026-11-01')), ev({ type: 'fin_rule_set', ruleId: 'r', pattern: 'магазин 1', categoryId: 'food', ts: at('2026-11-01') })];
  for (let i = 0; i < 365; i++) {
    const d = addDays('2026-12-01', i);
    evs.push(e({ type: 'signal_logged', at: at(d, 13), ts: at(d, 13), signal: { kind: 'wallet', amount: 100 + i, merchant: 'Магазин 1' } }),
      e({ type: 'fin_entry_added', entryId: `pm${i}`, date: d, kind: 'expense', amount: 50, categoryId: 'food', ts: at(d, 14) }));
    if (d === weekStart(d)) evs.push(e({ type: 'weekly_issued', weekStart: d, ts: at(d, 8), quests: [{ id: `${d}:w:budget_week`, weekStart: d, kind: 'budget_week', stat: 'fin', target: 1, title: 'x', xp: 150 }] }));
  }
  for (let k = 0; k < 4; k++) evs.push(imp(`i${k}`, Array.from({ length: 1000 }, (_, j) => ({ key: `k${k}-${j}`, date: addDays('2026-12-01', 90 * k + (j % 90)), amount: -(100 + j), text: 'магазин 1' })), at(addDays('2026-12-01', 90 * k + 89))));
  const now = at('2027-12-01');
  const s = replay(evs, now);   // прогрев JIT
  expect(s.ledger.filter(r => r.id.startsWith('weekly:')).length).toBeGreaterThan(40);
  const t = performance.now(); replay(evs, now);
  const ms = performance.now() - t;
  console.log(`finance replay: ${Math.round(ms)} ms`);
  // цель ~150 мс; порог с запасом под нагруженный CI
  expect(ms).toBeLessThan(450);
});
test('лимит 0 = «без лимита»: переименование не теряется', () => {
  const s = replay([cat('food', 500, at('2026-12-01')), ev({ type: 'fin_category_set', categoryId: 'food', title: 'Продукты', kind: 'expense', limit: 0, ts: at('2026-12-02') }),
    spend('2027-01-05', 10)], at('2027-01-06'));
  expect(s.finance.categories.find(c => c.id === 'food')).toMatchObject({ title: 'Продукты', limit: null });
});
