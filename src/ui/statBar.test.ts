import { describe, expect, it } from 'vitest'
import type { GameState } from '../domain/types'
import { pathLabel, statBar } from './statBar'

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
