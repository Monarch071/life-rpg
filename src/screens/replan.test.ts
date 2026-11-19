import { describe, expect, it } from 'vitest'
import { toMin } from '../domain/day'
import type { Profile, Quest } from '../domain/types'
import { replanAfterBusy } from './replan'

const profile = { sleep: '23:00', energy: { morning: 3, day: 3, evening: 3, night: 1 } } as Profile
const q = (id: string, start: string | null, minutes: number, done = false): Quest & { done: boolean } => ({
  id, date: '2026-11-17', title: id, stat: 'str', minutes, xp: 10, auto: null, templateId: id, done,
  window: start ? { start, end: start.replace(/^(\d\d)/, h => String(+h + 1).padStart(2, '0')) } : null,
})

describe('replanAfterBusy', () => {
  it('moves pending quests after busyUntil, keeps done and all-day quests', () => {
    const qs = [q('a', '09:00', 30), q('b', '10:00', 60), q('done', '09:00', 30, true), q('allday', null, 0)]
    const r = replanAfterBusy(qs, '08:00', '12:00', '07:00', profile, null)
    for (const id of ['a', 'b']) expect(toMin(r.find(x => x.id === id)!.window!.start)).toBeGreaterThanOrEqual(toMin('12:00'))
    expect(r.find(x => x.id === 'done')).toBe(qs[2])
    expect(r.find(x => x.id === 'allday')!.window).toBeNull()
  })
  it('uses now when it is later than busyUntil, avoids work, and drops quests that no longer fit', () => {
    const qs = [q('a', '09:00', 30), q('huge', '10:00', 600)]
    const r = replanAfterBusy(qs, '14:00', '12:00', '07:00', profile, { start: '15:00', end: '18:00' })
    const a = r.find(x => x.id === 'a')!.window!
    expect(toMin(a.start)).toBeGreaterThanOrEqual(toMin('14:00'))
    expect(toMin(a.start) >= toMin('18:00') || toMin(a.end) <= toMin('15:00')).toBe(true)
    expect(r.find(x => x.id === 'huge')!.window).toBeNull()
  })
  it.each([['23:00', '23:30'], ['01:00', '01:30']])('sleep %s, busy until %s → pending timed quests become all-day', (sleep, until) => {
    const qs = [q('a', '09:00', 30), q('done', '09:00', 30, true), q('allday', null, 0)]
    const r = replanAfterBusy(qs, '20:00', until, '07:00', { ...profile, sleep }, null)
    expect(r.find(x => x.id === 'a')!.window).toBeNull()
    expect(r.find(x => x.id === 'done')).toBe(qs[1])
  })
})
