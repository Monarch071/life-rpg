import { expect, test } from 'vitest'
import { replay } from '../domain/replay'
import { toMin } from '../domain/day'
import type { GameEvent, Profile } from '../domain/types'
import { buildQuests } from './issue'

const profile: Profile = {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [{ text: 'x', months: 3, stat: 'int' }],
  sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 4, day: 3, evening: 3, night: 1 }, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 },
}

test('календарь 11:00–20:00 из пакета занимает время: заданий в окне нет', () => {
  const now = new Date(2026, 10, 21, 8).getTime() // суббота
  const ev = { id: 'p1', ts: now, deviceId: 'shortcuts', type: 'health_packet', date: '2026-11-21', kind: 'morning', health: {},
    calendar: [{ title: 'Событие', start: new Date(2026, 10, 21, 11).toISOString(), end: new Date(2026, 10, 21, 20).toISOString() }] } as GameEvent
  const state = replay([ev], now)
  expect(state.today.calendar).toHaveLength(1)
  for (let i = 0; i < 20; i++) {
    for (const x of buildQuests(state, profile, null, '08:00')) if (x.window) {
      expect(toMin(x.window.end) <= 660 || toMin(x.window.start) >= 1200).toBe(true)
    }
  }
})
