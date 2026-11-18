import { describe, expect, it } from 'vitest'
import { toMin } from './push'

describe('toMin', () => {
  it('переводит HH:MM в минуты и отвергает мусор', () => {
    expect(toMin('08:00')).toBe(480)
    expect(toMin('23:59')).toBe(1439)
    expect(toMin(null)).toBeNull()
    expect(toMin('24:00')).toBeNull()
    expect(toMin('8:00')).toBeNull()
  })
})
