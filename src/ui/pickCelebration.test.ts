import { describe, expect, it } from 'vitest'
import { pickCelebration } from './pickCelebration'

const st = (level: number, perfect = false, date = '2026-11-16') => ({
  level, today: { date: '2026-11-17' } as never,
  history: [{ date, xp: 200, completed: 3, issued: 3, counted: true, perfect, rest: false, streak: 1 }],
})

describe('pickCelebration', () => {
  it('первый запуск → null', () => expect(pickCelebration(st(5, true), {})).toBeNull())
  it('уровень вырос → level', () => expect(pickCelebration(st(6), { level: 5 })).toEqual({ kind: 'level', level: 6 }))
  it('идеальный день вчера, не показан → perfect', () => expect(pickCelebration(st(5, true), { level: 5 })).toEqual({ kind: 'perfect', date: '2026-11-16' }))
  it('уже показан → null', () => expect(pickCelebration(st(5, true), { level: 5, perfectDate: '2026-11-16' })).toBeNull())
  it('не вчера → null', () => expect(pickCelebration(st(5, true, '2026-11-10'), { level: 5 })).toBeNull())
  it('не идеальный → null', () => expect(pickCelebration(st(5, false), { level: 5 })).toBeNull())
  it('уровень приоритетнее', () => expect(pickCelebration(st(6, true), { level: 5 })?.kind).toBe('level'))
})
