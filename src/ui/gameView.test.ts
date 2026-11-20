import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { replay } from '../domain/replay'
import type { GameEvent, GameState, Profile } from '../domain/types'
import Home from '../screens/Home'
import { battleSeen, markBattleSeen, partView, ritualChip, shadowScale } from './gameView'

const profile: Profile = {
  name: 'Гэндальф', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000,
  badHabits: [], goodHabits: [], energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 1 },
}

test('фигура тени по силе', () => {
  expect(shadowScale(0)).toEqual({ scale: 0.7, opacity: 0.25 })
  expect(shadowScale(100)).toEqual({ scale: 1.2, opacity: 0.85 })
  expect(shadowScale(42)).toEqual({ scale: 0.91, opacity: 0.5 })
})

test('чип ритуала', () => {
  const l = { title: 'Чтение', kind: 'do', step: 1, done: 2, required: 6, todayDone: false, todayVerify: null, label: '10 страниц', status: 'active' } as GameState['ladders'][number]
  expect(ritualChip(l)).toEqual({ text: 'Чтение · 10 страниц', sub: 'ступень 1 · 2/6', state: 'todo' })
  expect(ritualChip({ ...l, todayDone: true, todayVerify: 'auto' }).state).toBe('auto')
  expect(ritualChip({ ...l, todayDone: true, todayVerify: 'honest' }).state).toBe('done')
  expect(ritualChip({ ...l, kind: 'dont' }).state).toBe('later')
})

test('битва показана: без хранилища и при исключении — false, без падения', () => {
  expect(battleSeen('2026-12-27', null)).toBe(false)
  const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage
  expect(() => markBattleSeen('2026-12-27', bad)).not.toThrow()
  expect(battleSeen('2026-12-27', bad)).toBe(false)
  const m = new Map<string, string>()
  const ok = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage
  markBattleSeen('2026-12-27', ok)
  expect(battleSeen('2026-12-27', ok)).toBe(true)
  expect(battleSeen('2027-01-31', ok)).toBe(false)
})

test('на Главной нет имени грани', () => {
  const s = replay([{ id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent,
    { id: 'f', ts: new Date(2026, 11, 1, 12).getTime(), deviceId: 'd', type: 'facet_added', facetId: 'f', name: 'СЕКРЕТ', kind: 'custom', start: 50 } as GameEvent],
  new Date(2026, 11, 2, 12).getTime())
  expect(s.shadow.facets[0]?.name).toBe('СЕКРЕТ')
  const html = renderToStaticMarkup(createElement(Home, { state: s, profile: s.profile!, go: () => {}, interview: () => {} }))
  expect(html).not.toContain('СЕКРЕТ')
})

test('вид части босса', () => {
  const p = { title: 'Часть 1', start: '2026-12-01', end: '2026-12-31', steps: [{ title: 'А', done: true }, { title: 'Б', done: false }], hits: 2, hp: 52, status: 'active' } as const
  expect(partView(p)).toEqual({ label: 'Часть 1 · HP 52', tone: 'active', next: 'Б' })
  expect(partView({ ...p, status: 'late' }).tone).toBe('late')
  expect(partView({ ...p, status: 'upcoming' }).tone).toBe('muted')
  expect(partView({ ...p, status: 'escaped' })).toMatchObject({ tone: 'lost', next: null })
  expect(partView({ ...p, hp: 0, status: 'defeated' })).toMatchObject({ tone: 'won', next: null })
})
