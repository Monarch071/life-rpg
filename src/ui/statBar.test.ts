import { describe, expect, it } from 'vitest'
import type { GameState } from '../domain/types'
import { ghostLine, leagueChip, pathLabel, statBar } from './statBar'

const season = (o: Partial<GameState['season']>): GameState['season'] =>
  ({ id: 'winter-2026', kind: 'winter', name: 'Зима', start: '2026-12-01', end: '2027-02-28', theme: 'mind_spirit', xp: 0, step: 0, stepXp: 600, joined: null, rewards: [], title: null, ...o })

describe('statBar', () => {
  it('base — Основа, form — Основа × Форма; без формы — как Основа', () => {
    expect(statBar(48, 0.38)).toEqual({ base: 48, form: 18.24 })
    expect(statBar(30, null)).toEqual({ base: 30, form: 30 })
    expect(statBar(100, 1)).toEqual({ base: 100, form: 100 })
  })
})

describe('pathLabel', () => {
  it('Пролог: дни до Зимы', () => {
    const p = pathLabel(season({ id: 'prologue', kind: 'prologue', name: 'Пролог', start: '2000-01-01', end: '2026-11-30', theme: null }), '2026-11-19')
    expect(p.title).toBe('Пролог · до Зимы 12 дн.')
    expect(p.pct).toBe(0)
  })
  it('сезон: ступень и XP до следующей', () => {
    const p = pathLabel(season({ xp: 1240, step: 2 }), '2026-12-10')
    expect(p.title).toContain('ступень 2/30')
    expect(p.title).toBe('Зима · ступень 2/30')
    expect(p.sub).toBe('до ступени 3: 40 / 600 XP')
    expect(p.pct).toBeCloseTo(6.67, 2)
  })
  it('путь пройден на 30/30', () => {
    const p = pathLabel(season({ xp: 30 * 600 + 5, step: 30 }), '2027-02-01')
    expect(p.title).toBe('Зима · ступень 30/30')
    expect(p.pct).toBe(100)
  })
})

describe('путь и лига (Глубина)', () => {
  it('путь сезона с уменьшенной ценой ступени', () => {
    const s = { kind: 'winter', name: 'Зима', step: 2, xp: 700, stepXp: 300 } as GameState['season']
    expect(pathLabel(s, '2027-01-20')).toEqual({ title: 'Зима · ступень 2/30', sub: 'до ступени 3: 100 / 300 XP', pct: expect.closeTo(33.3, 1) })
  })
  it('чип лиги', () => {
    expect(leagueChip({ tier: 1, name: 'Серебро', points: 8, seasonId: 'winter-2026' })).toEqual({ name: 'Серебро', into: 2, of: 6 })
    expect(leagueChip({ tier: 5, name: 'Легенда', points: 35, seasonId: 'winter-2026' })).toEqual({ name: 'Легенда', into: 5, of: 6 })
    expect(leagueChip({ tier: 0, name: 'Бронза', points: 0, seasonId: 'prologue' })).toEqual({ name: 'Бронза', into: 0, of: 6 })
  })
})

describe('строка призрака', () => {
  it('впереди, отстаёшь, вровень, ещё нет', () => {
    expect(ghostLine({ available: true, lead: 340 } as GameState['ghost'])).toBe('Ты впереди призрака на 340 XP')
    expect(ghostLine({ available: true, lead: -120 } as GameState['ghost'])).toBe('Отстаёшь от призрака на 120 XP')
    expect(ghostLine({ available: true, lead: 0 } as GameState['ghost'])).toBe('Вровень с призраком')
    expect(ghostLine({ available: false, lead: 0 } as GameState['ghost'], '2026-12-20')).toBe('Призрак появится 1 января')
    expect(ghostLine({ available: false, lead: 0 } as GameState['ghost'], '2026-11-25')).toBe('Призрак появится 1 января')
    expect(ghostLine({ available: false, lead: 0 } as GameState['ghost'], '2027-03-02')).toBe('Призрак появится 1 апреля')
  })
})
