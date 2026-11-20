import { BALANCE } from '../domain/balance'
import { matchWallet } from '../domain/csvImport'
import type { GameState, ImportRow } from '../domain/types'

export const CURRENCIES = { KZT: '₸', RUB: '₽', USD: '$', EUR: '€' } as const
export type Currency = keyof typeof CURRENCIES
export const DEFAULT_CURRENCY: Currency = 'KZT'
const SYMBOLS: string[] = Object.values(CURRENCIES)

/** Настройка 'currency' (код; раньше хранился знак) → знак для money(); неизвестное — тенге. */
export const curSymbol = (v: unknown): string =>
  typeof v === 'string' && v in CURRENCIES ? CURRENCIES[v as Currency] : typeof v === 'string' && SYMBOLS.includes(v) ? v : CURRENCIES[DEFAULT_CURRENCY]
const NB = ' '

/** «1 234,50 €»: разряды и валюта через неразрывный пробел, минус — «−». */
export function money(n: number, cur: string): string {
  const c = Math.round(Math.abs(n) * 100), int = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NB)
  return `${c > 0 && n < 0 ? '−' : ''}${int},${String(c % 100).padStart(2, '0')}${NB}${cur}`
}

/** До warnShare лимита — ok, до 100% включительно — warn, сверх — over; без лимита — null. */
export function catTone(spent: number, limit: number | null): 'ok' | 'warn' | 'over' | null {
  if (limit === null) return null
  const s = Math.round(spent * 100), l = Math.round(limit * 100)
  return s > l ? 'over' : s >= l * BALANCE.finance.warnShare ? 'warn' : 'ok'
}

/** Темп месяца, %: прогноз траты к концу месяца при нынешнем темпе ÷ лимит. */
export const pace = (spent: number, limit: number, day: number, days: number): number =>
  limit > 0 && day > 0 ? Math.round((100 * spent * days) / (day * limit)) : 0

/** Предпросмотр импорта: seen — ключ уже есть в прошлых импортах; walletDup — новое списание совпало с тратой Wallet. */
export function importSummary(rows: ImportRow[], state: Pick<GameState, 'finance'>): { fresh: number; walletDup: number; seen: number } {
  const es = state.finance.entries
  const keys = new Set(es.filter(e => e.source === 'import').map(e => e.id.slice(e.id.lastIndexOf(':') + 1)))
  const neu = rows.filter(r => !keys.has(r.key))
  // прошлые списания импорта участвуют в сопоставлении первыми кандидатами — уже занятые ими траты Wallet не считаются
  // shortcut: жадное сопоставление как в replay, но без ts импорта — оценка для предпросмотра; точный дубль решит replay
  const old = es.filter(e => e.source === 'import' && e.kind !== 'income').map(e => ({ id: e.id, date: e.date, amount: -e.amount }))
  const wallet = es.filter(e => e.source === 'wallet').map((e, i) => ({ id: e.id, date: e.date, amount: e.amount, ts: i }))
  const dup = matchWallet([...old, ...neu.map(r => ({ id: `new:${r.key}`, date: r.date, amount: r.amount }))], wallet, BALANCE.finance.dedupeDays)
  const walletDup = neu.filter(r => dup.has(`new:${r.key}`)).length
  return { fresh: neu.length - walletDup, walletDup, seen: rows.length - neu.length }
}
