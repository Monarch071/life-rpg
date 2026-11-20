import { describe, expect, it } from 'vitest'
import { pickCelebration } from './pickCelebration'

const st = (level: number, perfect = false, date = '2026-11-16') => ({
  level, today: { date: '2026-11-17' } as never,
  history: [{ date, xp: 200, completed: 3, issued: 3, counted: true, perfect, rest: false, streak: 1, hp: null, energy: null, focus: null, fatigue: 0 }],
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

describe('победа над боссом сезона', () => {
  const won = { ...st(5), seasonBoss: { seasonId: 'w2026', defeated: true } as never }
  it('не показана → boss', () => expect(pickCelebration(won, { level: 5 })).toEqual({ kind: 'boss', seasonId: 'w2026' }))
  it('показана → null', () => expect(pickCelebration(won, { level: 5, bossSeason: 'w2026' })).toBeNull())
  it('уровень приоритетнее', () => expect(pickCelebration({ ...won, level: 6 }, { level: 5 })?.kind).toBe('level'))
})

describe('новый рекорд', () => {
  const rec = (o: object) => ({ ...st(5), records: [{ id: 'steps_day', title: 'Шагов за день', value: 14230, date: '2026-11-16', prev: 12000, unit: 'шагов', ...o }] as never })
  it('побит вчера, не показан → record', () => expect(pickCelebration(rec({}), { level: 5 })).toEqual({ kind: 'record', key: 'steps_day:2026-11-16', text: 'Новый рекорд: 14 230 шагов' }))
  it('показан → null', () => expect(pickCelebration(rec({}), { level: 5, records: ['steps_day:2026-11-16'] })).toBeNull())
  it('первое значение (прошлого нет) → null', () => expect(pickCelebration(rec({ prev: null }), { level: 5 })).toBeNull())
  it('накопления — без суммы', () => expect(pickCelebration(rec({ id: 'savings_month', title: 'Месяц с наибольшими накоплениями', value: 5000, prev: 100 }), { level: 5 }))
    .toMatchObject({ text: 'Новый рекорд: месяц с наибольшими накоплениями' }))
})
