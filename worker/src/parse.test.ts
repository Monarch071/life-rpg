import { describe, expect, it } from 'vitest'
import { num, parseSyncPayload } from './parse'

describe('num', () => {
  it('терпит строки «Команд»', () => {
    expect(num('8 421')).toBe(8421)
    expect(num('6,8')).toBe(6.8)
    expect(num(' 78.4 ')).toBe(78.4)
    expect(num('')).toBeUndefined()
    expect(num('abc')).toBeUndefined()
    expect(num(NaN)).toBeUndefined()
    expect(num(null)).toBeUndefined()
  })
})

describe('parseSyncPayload', () => {
  it('плоский пакет', () => {
    const r = parseSyncPayload({ date: '2026-11-17', kind: 'evening', steps: '8 421', sleepMinutes: '408', weightKg: '78,4' })
    expect(r).toEqual({ ok: true, packet: { date: '2026-11-17', kind: 'evening',
      health: { steps: 8421, sleepHours: 6.8, weightKg: 78.4 }, calendar: [] } })
  })
  it('вложенный пакет из спеки, тренировки суммируются', () => {
    const r = parseSyncPayload({ date: '2026-11-17', health: { steps: 8421, sleepHours: 6.8,
      workouts: [{ type: 'Бег', minutes: 32 }, { minutes: '10' }], restingHR: 61 },
      calendar: [{ title: 'Работа', start: '2026-11-17T11:00:00+03:00', end: '2026-11-17T20:00:00+03:00' }] })
    expect(r.ok && r.packet.health).toEqual({ steps: 8421, sleepHours: 6.8, workoutMin: 42, restingHR: 61 })
    expect(r.ok && r.packet.calendar).toHaveLength(1)
    expect(r.ok && r.packet.kind).toBe('other')
  })
  it('вне диапазона и мусор отбрасываются, а не ломают', () => {
    const r = parseSyncPayload({ date: '2026-11-17', steps: -5, sleepHours: '30', weightKg: 'много',
      calendar: [{ title: 1, start: 'x', end: 'y' }, 'bad', { start: '2026-11-17T12:00:00Z', end: '2026-11-17T11:00:00Z' }] })
    expect(r).toEqual({ ok: true, packet: { date: '2026-11-17', kind: 'other', health: {}, calendar: [] } })
  })
  it('ошибки формата', () => {
    expect(parseSyncPayload({ steps: 1 })).toEqual({ ok: false, error: 'Поле date должно быть в формате ГГГГ-ММ-ДД' })
    expect(parseSyncPayload([1])).toEqual({ ok: false, error: 'Ожидался JSON-объект' })
  })
})
