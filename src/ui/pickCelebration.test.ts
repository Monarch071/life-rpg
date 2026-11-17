import { describe, expect, it } from 'vitest'
import { pickCelebration } from './pickCelebration'

const st = (level: number, won = false, date = '2026-11-16') => ({
  level, today: { date: '2026-11-17' } as never,
  history: [{ date, xp: 200, shadowXp: 100, completed: 3, issued: 3, won }],
})

describe('pickCelebration', () => {
  it('первый запуск → null', () => expect(pickCelebration(st(5, true), {})).toBeNull())
  it('уровень вырос → level', () => expect(pickCelebration(st(6), { level: 5 })).toEqual({ kind: 'level', level: 6 }))
  it('победа вчера, не показана → win', () => expect(pickCelebration(st(5, true), { level: 5 })).toEqual({ kind: 'win', date: '2026-11-16', bonus: 30 }))
  it('победа уже показана → null', () => expect(pickCelebration(st(5, true), { level: 5, winDate: '2026-11-16' })).toBeNull())
  it('победа не вчера → null', () => expect(pickCelebration(st(5, true, '2026-11-10'), { level: 5 })).toBeNull())
  it('уровень приоритетнее победы', () => expect(pickCelebration(st(6, true), { level: 5 })?.kind).toBe('level'))
})
