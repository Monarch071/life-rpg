import { describe, expect, it } from 'vitest'
import { backupFileName, tryShare } from './saveFile'

describe('backupFileName', () => {
  it('formats local date with zero padding', () => {
    expect(backupFileName(new Date(2026, 10, 17))).toBe('life-rpg-2026-11-17.json')
    expect(backupFileName(new Date(2026, 0, 5))).toBe('life-rpg-2026-01-05.json')
  })
})

describe('tryShare', () => {
  const err = (name: string) => () => Promise.reject(Object.assign(new Error(name), { name }))
  it('maps outcomes', async () => {
    expect(await tryShare(() => Promise.resolve())).toBe('shared')
    expect(await tryShare(err('AbortError'))).toBe('cancelled')
    expect(await tryShare(err('NotAllowedError'))).toBe('failed')
  })
})
