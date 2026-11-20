import { expect, test } from 'vitest'
import { replay } from '../domain/replay'
import type { GameEvent } from '../domain/types'
import { catTone, money, pace, importSummary } from './finView'

const at = (date: string, h = 12) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h).getTime() }
let seq = 0
const ev = (e: Record<string, unknown>): GameEvent => ({ id: `e${++seq}`, deviceId: 'd1', ...e }) as unknown as GameEvent
const NB = ' '

test('деньги и тон категории', () => {
  expect(money(1234.5, '€')).toBe(`1${NB}234,50${NB}€`)
  expect(money(-300, '₽')).toBe(`−300,00${NB}₽`)
  expect(money(1234567, '$')).toBe(`1${NB}234${NB}567,00${NB}$`)
  expect([[700, 1000], [800, 1000], [1000, 1000], [1000.01, 1000], [5, null]].map(([s, l]) => catTone(s as number, l))).toEqual(['ok', 'warn', 'warn', 'over', null])
  // прогноз к концу месяца ÷ лимит: 500 за 10 дней из 31 → 1550 при лимите 1000
  expect(pace(500, 1000, 10, 31)).toBe(155)
  expect(pace(500, 3100, 10, 31)).toBe(50)
})

test('сводка импорта: новые, дубли Wallet, уже было', () => {
  const st = replay([ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at('2027-01-05'), ts: at('2027-01-05'), signal: { kind: 'wallet', amount: 100, merchant: 'Магазин 1' } }),
    ev({ type: 'fin_imported', importId: 'a', rows: [{ key: 'k1', date: '2027-01-04', amount: -50, text: 'x' }], ts: at('2027-01-06') })], at('2027-01-07'))
  expect(importSummary([{ key: 'k1', date: '2027-01-04', amount: -50, text: 'x' }, { key: 'k2', date: '2027-01-05', amount: -100, text: 'магазин 1' }, { key: 'k3', date: '2027-01-05', amount: -7, text: 'y' }], st))
    .toEqual({ fresh: 1, walletDup: 1, seen: 1 })
})

test('валюта: код → знак; по умолчанию тенге; старые сохранённые знаки понимаются', async () => {
  const { curSymbol, CURRENCIES } = await import('./finView')
  expect(Object.keys(CURRENCIES)).toEqual(['KZT', 'RUB', 'USD', 'EUR'])
  expect(curSymbol(undefined)).toBe('₸')
  expect(curSymbol('KZT')).toBe('₸')
  expect(curSymbol('USD')).toBe('$')
  expect(curSymbol('₽')).toBe('₽')
  expect(curSymbol('junk')).toBe('₸')
})
