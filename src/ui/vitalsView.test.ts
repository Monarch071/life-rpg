import { expect, test } from 'vitest'
import { autoHint, bannerKey, freshness, parseRunning, timerOverdue, timerSpan, vitalChips } from './vitalsView'
import type { DayQuest, Vitals } from '../domain/types'

const v: Vitals = { hp: null, energy: 76, focus: 50, fatigue: 72, parts: { hp: {}, focus: {} }, energyInputs: { sleep: null, hp: null, weekMorning: null } }

test('vitalChips: нет данных — прочерк; Энергия ≥70 хорошо; Усталость ≥70 плохо (шкала обратная)', () => {
  const c = Object.fromEntries(vitalChips(v).map(x => [x.id, x]))
  expect(c.hp).toMatchObject({ value: '—', tone: 'none', pct: 0 })
  expect(c.energy).toMatchObject({ value: '76', tone: 'good', pct: 76 })
  expect(c.focus.tone).toBe('mid')
  expect(c.fatigue).toMatchObject({ value: '72', tone: 'bad' })
  expect(vitalChips({ ...v, fatigue: 10 }).find(x => x.id === 'fatigue')!.tone).toBe('good')
  expect(vitalChips({ ...v, energy: 20 }).find(x => x.id === 'energy')!.tone).toBe('bad')
})

test('freshness: часы назад, устаревание после 36 ч, нет данных', () => {
  const now = Date.UTC(2026, 11, 2, 9)
  expect(freshness(now - 2 * 3600e3, now)).toEqual({ text: 'Данные: 2 ч назад', stale: false })
  expect(freshness(now - 37 * 3600e3, now).stale).toBe(true)
  expect(freshness(now - 5 * 60e3, now).text).toBe('Данные: 5 мин назад')
  expect(freshness(now - 3 * 86400e3, now).text).toBe('Данные: 3 дн. назад')
  expect(freshness(null, now)).toEqual({ text: 'Данных из «Команд» ещё не было', stale: true })
})

const q = (auto: DayQuest['auto']) => ({ auto, done: false } as DayQuest)
test('autoHint: порог и текущее значение; «не больше» — при закрытии дня', () => {
  expect(autoHint(q({ metric: 'steps', op: '>=', value: 9000 }), { steps: 6120, flags: [] })).toBe('Засчитается само: шагов ≥ 9 000 (сейчас 6 120)')
  expect(autoHint(q({ metric: 'readMin', op: '>=', value: 20 }), { flags: [] })).toBe('Засчитается само: чтение ≥ 20 мин (данных пока нет)')
  expect(autoHint(q({ metric: 'socialMin', op: '<=', value: 60 }), { socialMin: 30, flags: [] })).toContain('при закрытии дня')
  expect(autoHint(q(null), { flags: [] })).toBeNull()
  expect(autoHint({ ...q({ metric: 'steps', op: '>=', value: 1 }), done: true }, { flags: [] })).toBeNull()
})

test('timerSpan: конец по часам, не длиннее лимита; меньше минуты — не пишем', () => {
  const s = 1_000_000
  expect(timerSpan(s, s + 25 * 60e3)).toEqual({ start: s, end: s + 25 * 60e3, capped: false })
  expect(timerSpan(s, s + 300 * 60e3)).toEqual({ start: s, end: s + 240 * 60e3, capped: true })
  expect(timerSpan(s, s + 30e3)).toBeNull()
  expect(timerSpan(s, s - 5)).toBeNull()
})

test('parseRunning: только валидная запись таймера', () => {
  expect(parseRunning('{"timer":"reading","start":123}')).toEqual({ timer: 'reading', start: 123 })
  for (const bad of [null, '', 'x', '{"timer":"walk","start":1}', '{"timer":"focus","start":"1"}', '{"timer":"focus"}']) expect(parseRunning(bad)).toBeNull()
})

test('timerOverdue: дольше лимита — предлагаем сбросить', () => {
  const s = 1_000_000
  expect(timerOverdue(s, s + 240 * 60e3)).toBe(false)
  expect(timerOverdue(s, s + 241 * 60e3)).toBe(true)
})

test('bannerKey: по виду подсказки или причине флага, не по тексту с числами', () => {
  const flags = [{ metric: 'steps', reason: 'too_many_steps' }] as never
  expect(bannerKey({ suggest: 'recovery_enter', data: { flags } })).toBe('recovery_enter')
  expect(bannerKey({ suggest: null, data: { flags } })).toBe('too_many_steps')
  expect(bannerKey({ suggest: null, data: { flags: [] } })).toBeNull()
})
