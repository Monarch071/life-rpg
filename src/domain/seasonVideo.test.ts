import { expect, test } from 'vitest'
import type { CardModel } from './card'
import { seasonMoments, VIDEO_MS, videoOps } from './seasonVideo'
import type { GameState } from './types'

const model: CardModel = { kind: 'season', title: 'Сезон «Зима»', before: { date: '2026-11-30', level: 20, avatar: { blob: 'a' } },
  after: { date: '2027-02-28', level: 28, avatar: { blob: 'b' } }, index: 124, record: null, gains: [], streak: 21, step: 30 }
const state = {
  today: { date: '2027-03-01' }, season: { id: 'spring-2027' }, ledger: [{ source: 'boss', xp: 1500, date: '2027-02-10' }],
  records: [{ id: 'savings_month', title: 'Месяц с самыми большими накоплениями', value: 900000, date: '2027-01-31', prev: 1, unit: '₸' },
    { id: 'steps_day', title: 'Шагов за день', value: 21000, date: '2027-01-12', prev: 12000, unit: 'шагов' }],
  shadow: { facets: [{ name: 'секретная привычка', banishedOn: '2027-02-01' }] },
  growth: { current: { month: '2027-03', index: null }, months: [] },
} as unknown as GameState
const texts = (t: number) => videoOps(model, seasonMoments(state, model), t).flatMap(o => (o.op === 'text' ? [o.text] : []))

test('моменты: босс, рекорд (не накопления), грань без названия', () => {
  const m = seasonMoments(state, model)
  expect(m.map(x => x.title)).toEqual(['Сезонный босс повержен', 'Рекорд: шагов за день', 'Грань Тени изгнана'])
  expect(JSON.stringify(m)).not.toMatch(/секретная|900/)
})

test('кадры: было → стало со счётчиком уровня → моменты → итог', () => {
  expect(texts(1000)).toEqual(expect.arrayContaining(['Было', 'Ур. 20']))
  expect(texts(5000)).toEqual(expect.arrayContaining(['Стало', 'Ур. 24']))
  expect(texts(8500)).toEqual(expect.arrayContaining(['Сезонный босс повержен']))
  expect(texts(14500)).toEqual(expect.arrayContaining(['Грань Тени изгнана']))
  expect(texts(VIDEO_MS - 500)).toEqual(expect.arrayContaining(['124', 'Ур. 20 → 28 · серия 21 дн.']))
  expect(videoOps(model, [], 0).every(o => (o.alpha ?? 1) >= 0 && (o.alpha ?? 1) <= 1)).toBe(true)
})
