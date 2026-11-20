import { describe, expect, test } from 'vitest';
import { DEFAULT_CATEGORIES, otherOf, normText, matchRule, limitFor, weekLimit, periodTotals, budgetVerdict, validAmount } from './finance';
import type { FinKind } from './types';

describe('finance', () => {
  test('правила магазинов: самый длинный шаблон, ничья — позднее', () => {
    const r = [{ pattern: 'магазин', categoryId: 'a', ts: 1 }, { pattern: 'магазин 1', categoryId: 'b', ts: 2 }, { pattern: 'кафе', categoryId: 'c', ts: 3 }, { pattern: 'кафе', categoryId: 'd', ts: 4 }];
    expect(matchRule('ОПЛАТА  МАГАЗИН 1 г. Город', r)).toBe('b');
    expect(matchRule('Кафе Ёлка', r)).toBe('d');
    expect(matchRule('Такси', r)).toBeNull();
    expect(normText(' Ёж\u0007  Кот ')).toBe('еж кот');
  });
  test('лимит месяца: середину месяца не спасти, первый лимит — сразу', () => {
    expect(limitFor([{ month: '2027-01', limit: 1000 }, { month: '2027-02', limit: 5000 }], '2027-02')).toBe(1000);
    expect(limitFor([{ month: '2027-02', limit: 1000 }, { month: '2027-02', limit: 9000 }], '2027-02')).toBe(1000);
    expect(limitFor([{ month: '2027-01', limit: 1000 }, { month: '2027-01', limit: null }], '2027-02')).toBeNull();
    expect(limitFor([], '2027-02')).toBeNull();
  });
  test('лимит недели на стыке месяцев — пропорция по дням', () => {
    expect(weekLimit(m => (m === '2027-01' ? 3100 : null), '2027-01-25')).toBe(700);
    expect(weekLimit(m => (m === '2027-02' ? 2800 : null), '2027-02-22')).toBe(700);
    expect(weekLimit(m => (m === '2027-03' ? 3100 : null), '2027-03-29')).toBe(300);
    expect(weekLimit(() => null, '2027-03-29')).toBeNull();
  });
  test('суммы периода: дубли и возвраты, категория не ниже 0, дни учёта', () => {
    const e = (date: string, kind: FinKind, amount: number, categoryId = 'food', dup = false) => ({ date, kind, amount, categoryId, dup });
    const t = periodTotals([e('2027-01-04', 'expense', 100.1), e('2027-01-04', 'expense', 0.2), e('2027-01-05', 'expense', 50, 'food', true),
      e('2027-01-06', 'expense', -500, 'fun'), e('2027-01-06', 'income', 1000), e('2027-01-07', 'saving', 300), e('2027-02-01', 'expense', 9)], '2027-01-04', '2027-01-10');
    expect(t).toEqual({ income: 1000, expense: 100.3, saving: 300, loggedDays: 2, byCat: { food: 100.3, fun: 0 } });
  });
  test('вердикт: учёт активен и все лимиты соблюдены; без лимитов — null', () => {
    expect(budgetVerdict({ food: 700, fun: 10 }, { food: 700, fun: null }, 3, 3)).toBe(true);
    expect(budgetVerdict({ food: 700.01 }, { food: 700 }, 7, 3)).toBe(false);
    expect(budgetVerdict({ food: 1 }, { food: 700 }, 2, 3)).toBe(false);
    expect(budgetVerdict({ food: 1 }, { food: null }, 7, 3)).toBeNull();
  });
  test('сумма — граница доверия', () => {
    expect([NaN, Infinity, 0, 1e9, '100', null].map(validAmount)).toEqual([null, null, null, null, null, null]);
    expect(validAmount(100.005)).toBe(100.01); expect(validAmount(-300)).toBe(-300);
    expect(DEFAULT_CATEGORIES).toHaveLength(14); expect(otherOf('expense')).toBe('default:other');
  });
});
