import { expect, it } from 'vitest'
import { parseAmount } from './QuickInput'

it('parseAmount rejects NaN, negatives, overflow and zero for add', () => {
  const set = { mode: 'set' as const, max: 24 }, add = { mode: 'add' as const, max: 100 }
  expect(parseAmount('7,5', set)).toBe(7.5)
  expect(parseAmount('0', set)).toBe(0)
  for (const bad of ['', 'abc', '-1', '25', '1e3', 'NaN']) expect(parseAmount(bad, set)).toBeNull()
  expect(parseAmount('0', add)).toBeNull()
  expect(parseAmount(' 12 ', add)).toBe(12)
})
