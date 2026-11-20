import { BALANCE } from './balance';
import { normText, validAmount } from './finance';
import type { ImportRow, ISODate } from './types';

type Delim = ',' | ';' | '\t';
export interface ColumnMap { date: number; amount: number | null; debit: number | null; credit: number | null; text: number | null }

/** Разделитель по числу вхождений вне кавычек; ничья — «;», затем таб, затем запятая. */
export function detectDelimiter(line: string): Delim {
  const cnt = { ';': 0, '\t': 0, ',': 0 };
  let q = false;
  for (const ch of String(line ?? '')) {
    if (ch === '"') q = !q;
    else if (!q && ch in cnt) cnt[ch as Delim]++;
  }
  let best: Delim = ',', n = 0;
  for (const k of [';', '\t', ','] as Delim[]) if (cnt[k] > n) { best = k; n = cnt[k]; }
  return best;
}

export function parseCsv(text: string): string[][] {
  const max = BALANCE.finance.importLinesMax;
  const src = String(text ?? '').slice(0, BALANCE.finance.importFileMaxBytes).replace(/^﻿/, '');
  const first = src.split(/\r?\n/).find(l => l.trim() !== '') ?? '';
  const delim = detectDelimiter(first);
  const out: string[][] = [];
  let row: string[] = [], field = '', q = false;
  const endRow = () => {
    row.push(field); field = '';
    if (row.some(c => c.trim() !== '')) out.push(row);
    row = [];
  };
  for (let i = 0; i < src.length && out.length < max; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; endRow(); }
    else field += ch;
  }
  if (out.length < max && (field !== '' || row.length)) endRow();
  return out;
}

export function guessColumns(header: string[]): Partial<ColumnMap> {
  const h = (header ?? []).map(x => normText(String(x ?? '')));
  const find = (re: RegExp, skip: number[] = []) => { const i = h.findIndex((x, k) => !skip.includes(k) && re.test(x)); return i < 0 ? null : i; };
  const debit = find(/списан|расход|debit|withdraw/);
  const credit = find(/поступлен|приход|credit|deposit/);
  const used = [debit, credit].filter((x): x is number => x !== null);
  const date = find(/дата|date/, used);
  const amount = find(/сумма|amount|\bsum\b/, used);
  const text = find(/описан|назначен|детал|description|details|merchant|контрагент|получател|наименован/, used);
  return { ...(date !== null ? { date } : {}), amount, debit, credit, ...(text !== null ? { text } : {}) };
}

export function parseDate(s: string): ISODate | null {
  const t = String(s ?? '').trim();
  let y: number, m: number, d: number, x: RegExpMatchArray | null;
  if ((x = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?:[ T,].*)?$/))) { d = +x[1]; m = +x[2]; y = x[3].length === 2 ? 2000 + +x[3] : +x[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1970 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseMoney(s: string): number | null {
  let t = String(s ?? '').trim();
  const neg = /^[^\d\-−–()]*[-−–]/.test(t) || /^\(.*\)$/.test(t) || /\d\s*[-−–]$/.test(t);
  t = t.replace(/[-−–()]/g, '');
  const m = t.match(/^[^\d]*(\d[\d\s '’.,]*)[^\d]*$/);
  if (!m) return null;
  const body = m[1].replace(/[\s '’]/g, '').replace(/[.,]+$/, '');
  const last = Math.max(body.lastIndexOf('.'), body.lastIndexOf(','));
  let num: string;
  if (last < 0) num = body;
  else {
    const frac = body.slice(last + 1);
    // 1–2 цифры после последнего разделителя — дробь; три — разряд (12,345)
    num = frac.length >= 1 && frac.length <= 2 ? body.slice(0, last).replace(/[.,]/g, '') + '.' + frac : body.replace(/[.,]/g, '');
  }
  const v = Number(num);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

export function rowKey(date: ISODate, amount: number, text: string, n: number): string {
  const s = `${date}|${amount}|${normText(text)}|${n}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/\p{Cc}/gu, '').trim().slice(0, BALANCE.finance.textMax).replace(/[\ud800-\udbff]$/, '');
}

export function toImportRows(rows: string[][], map: ColumnMap, hasHeader: boolean): { rows: ImportRow[]; skipped: { line: number; reason: 'date' | 'amount' }[] } {
  const out: ImportRow[] = [], skipped: { line: number; reason: 'date' | 'amount' }[] = [], seen = new Map<string, number>();
  const cell = (r: string[], i: number | null) => (i === null ? '' : String(r[i] ?? ''));
  (rows ?? []).slice(hasHeader ? 1 : 0).forEach((r, k) => {
    const line = k + 1 + (hasHeader ? 1 : 0);
    const date = parseDate(cell(r, map.date));
    if (!date) { skipped.push({ line, reason: 'date' }); return; }
    let raw: number | null;
    if (map.amount !== null) raw = parseMoney(cell(r, map.amount));
    else {
      const db = parseMoney(cell(r, map.debit)), cr = parseMoney(cell(r, map.credit));
      raw = db ? -Math.abs(db) : cr ? Math.abs(cr) : null;
    }
    const amount = validAmount(raw);
    if (amount === null) { skipped.push({ line, reason: 'amount' }); return; }
    const text = cleanText(cell(r, map.text));
    const k3 = `${date}|${amount}|${normText(text)}`, n = seen.get(k3) ?? 0;
    seen.set(k3, n + 1);
    out.push({ key: rowKey(date, amount, text, n), date, amount, text });
  });
  return { rows: out, skipped };
}

const dayNum = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / BALANCE.day.msPerDay : NaN; };

/** id строк импорта, совпавших с Wallet-тратой: списание −a ↔ трата a, |Δдат| ≤ days; жадно: ближайшая дата, затем меньший ts. */
export function matchWallet(imports: { id: string; date: ISODate; amount: number }[], wallet: { id: string; date: ISODate; amount: number; ts: number }[], days: number): Set<string> {
  type W = { id: string; date: ISODate; amount: number; ts: number };
  const byAmt = new Map<number, W[]>();
  for (const w of wallet ?? []) {
    const c = Math.round(w.amount * 100);
    if (c > 0) { const l = byAmt.get(c) ?? []; l.push(w); byAmt.set(c, l); }
  }
  const pairs: { ii: number; w: W; dd: number }[] = [];
  (imports ?? []).forEach((im, ii) => {
    const c = Math.round(-im.amount * 100);
    if (c <= 0) return;
    for (const w of byAmt.get(c) ?? []) { const dd = Math.abs(dayNum(im.date) - dayNum(w.date)); if (dd <= days) pairs.push({ ii, w, dd }); }
  });
  pairs.sort((a, b) => a.dd - b.dd || a.w.ts - b.w.ts || a.ii - b.ii);
  const usedW = new Set<string>(), usedI = new Set<number>(), res = new Set<string>();
  for (const p of pairs) {
    if (usedW.has(p.w.id) || usedI.has(p.ii)) continue;
    usedW.add(p.w.id); usedI.add(p.ii); res.add(imports[p.ii].id);
  }
  return res;
}
