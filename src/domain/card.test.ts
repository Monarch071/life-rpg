import { expect, test } from 'vitest'
import { addDays } from './day'
import { cardOps, levelAt, monthCard, reviewInput, seasonCard, weekCard } from './card'
import { replay } from './replay'
import type { GameEvent, Profile, Quest, Stat } from './types'

const at = (date: string, h = 12) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h).getTime() }
let seq = 0
const ev = (e: Record<string, unknown> & { ts: number }): GameEvent => ({ id: `e${++seq}`, deviceId: 'd1', ...e }) as unknown as GameEvent
const STATS: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi']
const profile = { name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating: Object.fromEntries(STATS.map(s => [s, 5])) } as unknown as Profile
const q = (id: string, date: string): Quest => ({ id, date, title: id, stat: 'end', minutes: 10, window: null, xp: 0, auto: null, templateId: `t-${id}`, rank: 'C', skills: ['cardio'], kind: 'daily' } as Quest)
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i)).flatMap(d => [
  ev({ type: 'quests_issued', date: d, quests: [q(`c${d}`, d)], ts: at(d, 8) }), ev({ type: 'quest_completed', date: d, questId: `c${d}`, ts: at(d, 20) })])
const steps = (date: string, n: number) => ev({ type: 'health_packet', date, kind: 'other', health: { steps: n }, calendar: [], ts: at(date, 13) })

/** Декабрь с заданиями; аватар tier 1 в ноябре и tier 2 20 декабря; рекорд шагов 12 декабря. */
const stateFixture = () => replay([
  ev({ type: 'onboarding_completed', profile, ts: at('2026-11-01', 7) }),
  ev({ type: 'avatar_image', tier: 1, blob: 'avatar-1', ts: at('2026-11-10') }),
  ...days('2026-11-25', 37),
  ev({ type: 'avatar_image', tier: 2, blob: 'avatar-2', ts: at('2026-12-20') }),
  steps('2026-12-11', 9000), steps('2026-12-12', 12000),
], at('2027-01-02'))

test('модель карточки: уровни и аватар на даты, лучший рекорд месяца', () => {
  const s = stateFixture()
  const m = monthCard(s, '2026-12')!
  expect(m.kind).toBe('month')
  expect(m.before.date).toBe('2026-11-30'); expect(m.after.date).toBe('2026-12-31')
  expect(m.before.avatar).toEqual({ blob: 'avatar-1' }); expect(m.after.avatar).toEqual({ blob: 'avatar-2' })
  expect(m.after.level).toBe(levelAt(s, '2026-12-31'))
  expect(m.after.level).toBeGreaterThanOrEqual(m.before.level)
  expect(m.record).toMatchObject({ title: 'Максимум шагов за день' })
  expect(m.gains.length).toBeLessThanOrEqual(3)
  expect(monthCard(s, '2026-06')).toBeNull()
  // без картинки — SVG-аватар по параметрам и тиру уровня
  expect(monthCard(replay([ev({ type: 'onboarding_completed', profile, ts: at('2026-11-01', 7) }), ...days('2026-12-01', 3)], at('2027-01-02')), '2026-12')!.before.avatar)
    .toMatchObject({ tier: expect.any(Number), params: expect.any(Object) })
})

test('cardOps: 9:16, без сумм и магазинов; рекорд накоплений — без суммы', () => {
  const m = { ...monthCard(stateFixture(), '2026-12')!, record: { title: 'Рекорд накоплений', value: '' } }
  const ops = cardOps(m)
  expect(ops[0]).toMatchObject({ op: 'rect', x: 0, y: 0, w: 1080, h: 1920 })
  const text = ops.filter(o => o.op === 'text').map(o => (o as { text: string }).text).join(' ')
  expect(text).toContain('Индекс роста'); expect(text).not.toMatch(/₽|₸|\$|€|Магазин/)
  for (const o of ops) if ('x' in o) { expect(o.x).toBeGreaterThanOrEqual(0); expect(o.x).toBeLessThanOrEqual(1080) }
  expect(ops.filter(o => o.op === 'image').map(o => (o as { slot: string }).slot)).toEqual(['before', 'after'])
})

test('карточка сезона и недели, вход итогов месяца', () => {
  const s = stateFixture()
  const sc = seasonCard(s, 'winter-2026')!
  expect(sc).toMatchObject({ kind: 'season', before: { date: '2026-11-30' }, after: { date: '2027-01-02' } })
  const wk = weekCard(s, '2026-12-14')!
  expect(wk).toMatchObject({ kind: 'week', index: null, before: { date: '2026-12-13' }, after: { date: '2026-12-20' } })
  expect(cardOps(wk).some(o => o.op === 'text' && (o as { text: string }).text.includes('Индекс'))).toBe(false)
  const r = reviewInput(s, '2026-12')
  expect(r).toMatchObject({ days: 31, issued: 31, done: 31 })
  expect(r.opened).toBeGreaterThan(0)
})
