import { describe, expect, it } from 'vitest'
import { backupFileName } from './saveFile'

describe('backupFileName', () => {
  it('formats local date with zero padding', () => {
    expect(backupFileName(new Date(2026, 10, 17))).toBe('life-rpg-2026-11-17.json')
    expect(backupFileName(new Date(2026, 0, 5))).toBe('life-rpg-2026-01-05.json')
  })
})
