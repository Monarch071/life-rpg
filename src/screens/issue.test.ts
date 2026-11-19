import { expect, test } from 'vitest'
import { replay } from '../domain/replay'
import { toMin } from '../domain/day'
import { DEFAULT_DAY_TYPES } from '../domain/dayType'
import type { GameEvent, Profile } from '../domain/types'
import { assembleCtx, buildQuests } from './issue'

const profile: Profile = {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [{ text: 'x', months: 3, stat: 'int' }],
  sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 4, day: 3, evening: 3, night: 1 }, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 },
}
const OFF = DEFAULT_DAY_TYPES[2]
const onb = { id: 'o', ts: new Date(2026, 10, 1).getTime(), deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent

test('календарь 11:00–20:00 из пакета занимает время: заданий в окне нет', () => {
  const now = new Date(2026, 10, 21, 8).getTime() // суббота
  const ev = { id: 'p1', ts: now, deviceId: 'shortcuts', type: 'health_packet', date: '2026-11-21', kind: 'morning', health: {},
    calendar: [{ title: 'Событие', start: new Date(2026, 10, 21, 11).toISOString(), end: new Date(2026, 10, 21, 20).toISOString() }] } as GameEvent
  const state = replay([onb, ev], now)
  expect(state.today.calendar).toHaveLength(1)
  const qs = buildQuests(state, OFF, '08:00', 50)
  expect(qs.length).toBe(5)
  for (const x of qs) if (x.window) expect(toMin(x.window.end) <= 660 || toMin(x.window.start) >= 1200).toBe(true)
})

test('assembleCtx берёт состояние, недавние дни и боссов; выданные v2-задания проходят replay', () => {
  const t0 = new Date(2026, 10, 20, 9).getTime()
  const s0 = replay([onb], t0)
  const qs = buildQuests(s0, OFF, '09:00', 80)
  expect(qs).toHaveLength(6)
  const issued = { id: 'i1', ts: t0, deviceId: 'd', type: 'quests_issued', date: '2026-11-20', quests: qs } as GameEvent
  const boss = { id: 'b1', ts: t0, deviceId: 'd', type: 'boss_created', bossId: 'b', title: 'Босс', stat: 'fin', stages: ['a', 'b'] } as GameEvent
  const s1 = replay([onb, issued, boss], new Date(2026, 10, 21, 9).getTime())
  const c = assembleCtx(s1, OFF, '09:00', 50)
  expect(c).toMatchObject({ date: '2026-11-21', energy: 50, wakeAt: '09:00', bossStats: ['fin'], level: s1.level, profile })
  expect(c.recent).toEqual([{ date: '2026-11-20', stats: [...new Set(qs.map(q => q.stat))], templateIds: qs.map(q => q.templateId) }])
  // replay принимает задания сборки как v2 (с рангом и навыками), XP-предпросмотр сохраняется
  const r = replay([onb, issued], t0).today.quests
  expect(r.map(q => [q.id, q.rank, q.kind, q.legacy, q.xp])).toEqual(qs.map(q => [q.id, q.rank, q.kind, false, q.xp]))
})
