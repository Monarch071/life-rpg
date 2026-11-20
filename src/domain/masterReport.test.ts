import { expect, test } from 'vitest'
import { reportByRules, reportInput, reportWeek, weekReportOf, type ReportInput } from './masterReport'
import { replay } from './replay'
import type { GameEvent, Profile } from './types'

const at = (d: string, h = 12) => { const [y, m, x] = d.split('-').map(Number); return new Date(y, m - 1, x, h).getTime() }
const profile: Profile = { name: 'Тест', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [{ text: 'СекретнаяЦель', months: 6, stat: 'fin' }], sportLevel: 1, stepsUsual: 5000,
  badHabits: [], goodHabits: [], energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 1 } }
const ev = (e: object, ts = at('2026-12-01')): GameEvent => ({ id: `e${Math.random()}`, ts, deviceId: 'd', ...e }) as unknown as GameEvent
const stateWith = (extra: GameEvent[] = []) => replay([ev({ type: 'onboarding_completed', profile }, 1), ...extra], at('2026-12-28'))

const sampleInput = (o: Partial<ReportInput> = {}): ReportInput => ({ weekStart: '2026-12-21', days: [{ date: '2026-12-21', xp: 300, done: 3, issued: 3, counted: true }, { date: '2026-12-22', xp: 100, done: 1, issued: 3, counted: true }],
  metrics: {}, vitals: { hp: 70, energy: 60, focus: 50, fatigue: 10 }, score: { share: 0.7, xp: 900, avg4: 1050, days: 6, rank: 'B' }, final: true, league: 'Бронза', cls: { name: 'Странник', passivePower: 0, abilityUsed: false },
  seasonStep: 2, newPerks: [], nearRust: [], rusty: [], ladders: { active: 1, ritualsDone: 2 }, shadow: null, weakest: 'Дисциплина', baseGain: null, ...o })

test('какая неделя', () => {
  expect(reportWeek('2026-12-27')).toBe('2026-12-21'); expect(reportWeek('2026-12-28')).toBe('2026-12-21')
  expect(reportWeek('2026-12-30')).toBe('2026-12-21'); expect(reportWeek('2027-01-03')).toBe('2026-12-28')
})
test('вход отчёта — белый список: без граней, dont-лестниц, трат, магазинов, целей', () => {
  const s = stateWith([
    ev({ type: 'facet_added', facetId: 'f1', name: 'СекретнаяГрань', kind: 'custom', start: 50 }),
    ev({ type: 'ladder_created', ladderId: 'l1', title: 'СекретнаяЛестница', kind: 'dont', skill: 'habits', steps: [{ label: 'x', per7: 7 }] }),
    ev({ type: 'metric_logged', date: '2026-12-22', metric: 'spend', value: 999, mode: 'set' }, at('2026-12-22')),
    ev({ type: 'signal_logged', at: at('2026-12-22'), signal: { kind: 'wallet', amount: 1250, merchant: 'СекретМагазин' } }, at('2026-12-22')),
  ])
  const j = JSON.stringify(reportInput(s, '2026-12-21'))
  for (const x of ['СекретнаяГрань', 'СекретнаяЛестница', 'СекретМагазин', 'СекретнаяЦель', '999', 'spend']) expect(j).not.toContain(x)
  expect(reportInput(s, '2026-12-21').shadow).toEqual(expect.any(Number))
})
test('текст правил: 4 раздела, ранг и план', () => {
  const t = reportByRules(sampleInput({ weakest: 'Финансы', nearRust: ['Мобильность'] }))
  for (const h of ['Что получилось', 'Закономерности', 'Слабые места', 'План на неделю']) expect(t).toContain(h)
  expect(t).toContain('B'); expect(t).toContain('Финансы'); expect(t).toContain('Мобильность'); expect(t.length).toBeLessThanOrEqual(1500)
})
test('weekReportOf: ИИ-текст за неделю побеждает правила', () => {
  const s = stateWith()
  expect(weekReportOf({ ...s, reports: [{ weekStart: '2026-12-21', text: 'ИИ' }] })).toEqual({ weekStart: '2026-12-21', text: 'ИИ', ai: true, final: false })
  expect(weekReportOf({ ...s, reports: [{ weekStart: '2026-12-21', text: 'ИИ', final: true }] }).final).toBe(true);
  expect(weekReportOf({ ...s, reports: [{ weekStart: '2026-12-21', text: 'ИИ' }] }).final).toBe(false);
  expect(weekReportOf({ ...s, reports: [] }).ai).toBe(false)
})
