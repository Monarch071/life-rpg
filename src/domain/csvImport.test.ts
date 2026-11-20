import { describe, expect, test } from 'vitest';
import { BALANCE } from './balance';
import { parseMoney, parseDate, parseCsv, parseCsvLines, detectDelimiter, guessColumns, toImportRows, rowKey, matchWallet, importChunks } from './csvImport';

describe('csvImport', () => {
  test('деньги', () => {
    const t: [string, number | null][] = [['1 234,50', 1234.5], ['−300', -300], ['(300,00)', -300], ['1,234.56', 1234.56], ['€ 2 500', 2500],
      ["1'000.5", 1000.5], ['-0,5 EUR', -0.5], ['12,345', 12345], ['', null], ['abc', null], ['1e5', null]];
    for (const [s, v] of t) expect(parseMoney(s), s).toBe(v);
  });
  test('даты', () => {
    expect(['12.01.2027', '12.01.27', '2027-01-12', '12/01/2027', '12.01.2027 14:03:00'].map(parseDate)).toEqual(Array(5).fill('2027-01-12'));
    expect(['31.02.2027', '2027-13-01', '', 'вчера'].map(parseDate)).toEqual([null, null, null, null]);
  });
  test('CSV: BOM, «;», кавычки с переводом строки и ""', () => {
    const csv = '\uFEFFДата;Сумма;Описание\r\n12.01.2027;-1 250,50;"Магазин 1, ""зал""\nвторая строка"\r\n\r\n13.01.2027;5000;Перевод\r\n';
    expect(parseCsv(csv)).toEqual([['Дата', 'Сумма', 'Описание'], ['12.01.2027', '-1 250,50', 'Магазин 1, "зал"\nвторая строка'], ['13.01.2027', '5000', 'Перевод']]);
    expect(detectDelimiter('a,b,c')).toBe(','); expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(guessColumns(['Дата операции', 'Списание', 'Поступление', 'Назначение платежа'])).toEqual({ date: 0, amount: null, debit: 1, credit: 2, text: 3 });
  });
  test('строки импорта: ключ с номером повтора, пропуски с причиной', () => {
    const rows = [['d', 'a', 't'], ['12.01.2027', '-100', 'Магазин 1'], ['12.01.2027', '-100', 'Магазин 1'], ['xx', '-1', 'x'], ['12.01.2027', '', 'x']];
    const r = toImportRows(rows, { date: 0, amount: 1, debit: null, credit: null, text: 2 }, true);
    expect(r.rows.map(x => x.amount)).toEqual([-100, -100]);
    expect(r.rows[0].key).not.toBe(r.rows[1].key);
    expect(r.rows[0].key).toBe(rowKey('2027-01-12', -100, 'магазин 1', 0));
    expect(r.skipped).toEqual([{ line: 4, reason: 'date' }, { line: 5, reason: 'amount' }]);
    expect(toImportRows([['12.01.2027', '1'.repeat(3), 'x'.repeat(500)]], { date: 0, amount: 1, debit: null, credit: null, text: 2 }, false).rows[0].text).toHaveLength(60);
  });
  test('дебет/кредит и мусор не бросают', () => {
    const r = toImportRows([['2027-01-12', '50,5', '', 'a'], ['2027-01-12', '', '7', 'b']], { date: 0, amount: null, debit: 1, credit: 2, text: 3 }, false);
    expect(r.rows.map(x => x.amount)).toEqual([-50.5, 7]);
    expect(() => { parseCsv('"abc'); parseCsv(''); parseCsv('\0\0;;\n;;'); toImportRows([[]], { date: 5, amount: 9, debit: null, credit: null, text: null }, false); }).not.toThrow();
    expect(parseCsv('a;b\n'.repeat(6000))).toHaveLength(5000);
  });
  test('дубли с Wallet: сумма до копейки, ±1 день, жадно, одна Wallet — одной строке', () => {
    const imp = [{ id: 'i1', date: '2027-01-12', amount: -100 }, { id: 'i2', date: '2027-01-12', amount: -100 }, { id: 'i3', date: '2027-01-15', amount: -100 }, { id: 'i4', date: '2027-01-12', amount: 100 }];
    const w = [{ id: 'w1', date: '2027-01-13', amount: 100, ts: 2 }, { id: 'w2', date: '2027-01-12', amount: 100, ts: 1 }];
    expect([...matchWallet(imp, w, 1)].sort()).toEqual(['i1', 'i2']);
    expect(matchWallet([{ id: 'i', date: '2027-01-12', amount: -100.01 }], w, 1).size).toBe(0);
  });
  test('ревью: «зачисление» — кредит; ключ 64 бита; блоки ≤ importRowsMax; номера строк файла; кавычка внутри поля', () => {
    expect(guessColumns(['Дата', 'Сумма списания', 'Сумма зачисления', 'Описание'])).toEqual({ date: 0, amount: null, debit: 1, credit: 2, text: 3 });
    expect(rowKey('2027-01-12', -100, 'магазин 1', 0)).toMatch(/^[0-9a-f]{16}$/);
    expect(rowKey('2027-01-12', -100, 'Магазин  1', 0)).toBe(rowKey('2027-01-12', -100, 'магазин 1', 0));
    const keys = new Set(Array.from({ length: 20000 }, (_, i) => rowKey('2027-01-12', -i, 'x', 0)));
    expect(keys.size).toBe(20000);
    const rows = Array.from({ length: 2500 }, (_, i) => ({ key: `k${i}`, date: '2027-01-12', amount: -1, text: '' }));
    expect(importChunks('s', rows).map(c => [c.importId, c.rows.length])).toEqual([['s#0', BALANCE.finance.importRowsMax], ['s#1', BALANCE.finance.importRowsMax], ['s#2', 500]]);
    const p = parseCsvLines('Дата;Сумма;Описание\n\n12.01.2027;-1;"a\nb"\r\nxx;-1;c\n');
    expect(p.lines).toEqual([1, 3, 5]);
    expect(toImportRows(p.rows, { date: 0, amount: 1, debit: null, credit: null, text: 2 }, true, p.lines).skipped).toEqual([{ line: 5, reason: 'date' }]);
    expect(parseCsv('a;5"x;b\nc;d;e\n')).toEqual([['a', '5"x', 'b'], ['c', 'd', 'e']]);
    expect(detectDelimiter('a;5";b;c,d')).toBe(';');
  });
});
