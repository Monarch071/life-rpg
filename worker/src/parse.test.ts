import { describe, expect, it, test } from 'vitest'
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

const NOW = Date.parse('2026-12-02T12:00:00Z')
describe('parseSyncPayload', () => {
  it('плоский пакет', () => {
    const r = parseSyncPayload({ date: '2026-11-17', kind: 'evening', steps: '8 421', sleepMinutes: '408', weightKg: '78,4' }, NOW)
    expect(r).toEqual({ ok: true, value: { kind: 'health', packet: { date: '2026-11-17', kind: 'evening',
      health: { steps: 8421, sleepHours: 6.8, weightKg: 78.4 }, calendar: [] } } })
  })
  it('вложенный пакет из спеки, тренировки суммируются', () => {
    const r = parseSyncPayload({ date: '2026-11-17', health: { steps: 8421, sleepHours: 6.8,
      workouts: [{ type: 'Бег', minutes: 32 }, { minutes: '10' }], restingHR: 61 },
      calendar: [{ title: 'Работа', start: '2026-11-17T11:00:00+03:00', end: '2026-11-17T20:00:00+03:00' }] }, NOW)
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health).toEqual({ steps: 8421, sleepHours: 6.8, workoutMin: 42, restingHR: 61, workouts: [{ type: 'Бег', minutes: 32 }, { type: '', minutes: 10 }] })
    expect(r.ok && r.value.kind === 'health' && r.value.packet.calendar).toHaveLength(1)
    expect(r.ok && r.value.kind === 'health' && r.value.packet.kind).toBe('other')
  })
  it('вне диапазона и мусор отбрасываются, а не ломают', () => {
    const r = parseSyncPayload({ date: '2026-11-17', steps: -5, sleepHours: '30', weightKg: 'много',
      calendar: [{ title: 1, start: 'x', end: 'y' }, 'bad', { start: '2026-11-17T12:00:00Z', end: '2026-11-17T11:00:00Z' }] }, NOW)
    expect(r).toEqual({ ok: true, value: { kind: 'health', packet: { date: '2026-11-17', kind: 'other', health: {}, calendar: [] } } })
  })
  it('ошибки формата', () => {
    expect(parseSyncPayload({ steps: 1 }, NOW)).toEqual({ ok: false, error: 'Поле date должно быть в формате ГГГГ-ММ-ДД' })
    expect(parseSyncPayload([1], NOW)).toEqual({ ok: false, error: 'Ожидался JSON-объект' })
  })
  test('сводка: тренировки, осознанность, обрезка списка', () => {
    const r = parseSyncPayload({ date: '2026-12-02', kind: 'other', mindfulMinutes: '10', workouts: Array.from({ length: 60 }, (_, i) => ({ type: 'Бег'.repeat(30), minutes: i })) }, NOW)
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health.workouts!.length).toBe(50)
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health.workouts![0].type.length).toBe(60)
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health.mindfulMin).toBe(10)
  })
  test('сигналы: место и группа из списка, at в окне, Wallet', () => {
    expect(parseSyncPayload({ kind: 'arrive', place: 'gym', at: '2026-12-02T17:05:00+05:00' }, NOW)).toMatchObject({ ok: true, value: { kind: 'signal', signal: { kind: 'arrive', place: 'gym' } } })
    expect(parseSyncPayload({ kind: 'arrive', place: 'Зал на Ленина' }, NOW).ok).toBe(false)
    expect(parseSyncPayload({ kind: 'app', app: 'Instagram', state: 'open' }, NOW).ok).toBe(false)
    expect(parseSyncPayload({ kind: 'focus', state: 'on', at: '2026-11-20T10:00:00Z' }, NOW)).toEqual({ ok: false, error: 'Время at вне допустимого окна' })
    expect(parseSyncPayload({ kind: 'focus', state: 'on' }, NOW)).toMatchObject({ ok: true, value: { at: NOW } })
    const w = parseSyncPayload({ kind: 'wallet', amount: '₸1 250,50', merchant: 'Магазин 1'.padEnd(100, 'x') }, NOW)
    expect(w.ok && w.value.kind === 'signal' && w.value.signal).toMatchObject({ amount: 1250.5 })
    expect(w.ok && w.value.kind === 'signal' && (w.value.signal as any).merchant).toHaveLength(60)
    expect(parseSyncPayload({ kind: 'wallet', amount: 2e7 }, NOW).ok).toBe(false)
  })
})
