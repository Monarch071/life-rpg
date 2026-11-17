import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./providers', async (orig) => ({ ...(await orig<typeof import('./providers')>()), generateJson: vi.fn() }))
import { AiError, generateJson } from './providers'
import { aiDailyQuests, aiTuning, aiWeeklyReport, questContext, validateAiQuests } from './tasks'
import { replay } from '../domain/replay'
import type { GameEvent, Profile } from '../domain/types'
import type { AiConfig } from './config'

const cfg: AiConfig = { provider: 'gemini', key: 'K', textModel: 'm', imageModel: null }
const gen = vi.mocked(generateJson)
beforeEach(() => gen.mockReset())

const energy = { morning: 3, day: 3, evening: 3, night: 3 }
const mult = { str: 1, end: 1, int: 2, dis: 1, cha: 1, fin: 1, spi: 1 }
const ctx = { date: '2026-11-17', multipliers: mult, windows: [{ start: '08:00', end: '22:00' }], energy, wakeAt: '08:00' }
const good = (i: number, o = {}) => ({ title: `Задание номер ${i}`, stat: 'int', difficulty: 2, minutes: 30, allDay: false, why: 'x', ...o })

test('validateAiQuests: 5 валидных → наш XP, id и окна', () => {
  const r = validateAiQuests({ quests: [1, 2, 3, 4, 5].map(i => good(i, { xp: 99999 })) }, ctx)
  expect(r).toHaveLength(5)
  expect(r[0]).toMatchObject({ id: '2026-11-17:ai:0', templateId: 'ai', auto: null })
  expect(r[0].xp).toBe(validateAiQuests({ quests: [1, 2, 3].map(i => good(i, { difficulty: 2 })) }, { ...ctx, multipliers: { ...mult, int: 1 } })[0].xp * 2)
  expect(r.every(x => x.window !== null)).toBe(true)
})

test('validateAiQuests: чужая стат, сложность 9, 600 мин, пустое название отбрасываются', () => {
  const bad = [good(4, { stat: 'magic' }), good(5, { difficulty: 9 }), good(6, { minutes: 600 }), good(7, { title: '  ' })]
  expect(validateAiQuests({ quests: [good(1), good(2), good(3), ...bad] }, ctx)).toHaveLength(3)
  expect(() => validateAiQuests({ quests: [good(1), good(2), ...bad] }, ctx)).toThrow(AiError)
})

test('validateAiQuests: дубли удалены, allDay → 0 минут, максимум 7', () => {
  expect(() => validateAiQuests({ quests: [good(1), good(1, { title: ' ЗАДАНИЕ НОМЕР 1 ' }), good(2)] }, ctx)).toThrow(AiError)
  expect(() => validateAiQuests(null, ctx)).toThrow(AiError)
  const r = validateAiQuests({ quests: [good(1), good(2), good(3, { allDay: true, minutes: 999 })] }, ctx)
  expect(r[2]).toMatchObject({ minutes: 0, window: null })
  expect(validateAiQuests({ quests: Array.from({ length: 9 }, (_, i) => good(i)) }, ctx)).toHaveLength(7)
})

const profile: Profile = {
  name: 'Гэндальф', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000,
  badHabits: [], goodHabits: [], energy, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 1 },
}
const state = replay([{ id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent], new Date(2026, 10, 17, 12).getTime())

test('aiDailyQuests: промпт с именем и слабейшей характеристикой; ошибка пробрасывается', async () => {
  gen.mockResolvedValueOnce({ quests: [1, 2, 3].map(i => good(i)) })
  expect(await aiDailyQuests(cfg, state, profile, null, '08:00')).toHaveLength(3)
  const user = gen.mock.calls[0][2]
  expect(user).toContain('Гэндальф'); expect(user).toContain('Дух')
  gen.mockRejectedValueOnce(new AiError('x', 'rate'))
  await expect(aiDailyQuests(cfg, state, profile, null, '08:00')).rejects.toMatchObject({ kind: 'rate' })
})

test('aiTuning и aiWeeklyReport: ограничивают ответ', async () => {
  gen.mockResolvedValueOnce({ factors: { str: 5, magic: 1, int: 'x' }, note: 'н'.repeat(500) })
  const t = await aiTuning(cfg, state, { went: 'a', notWent: 'b', energy: 5 })
  expect(t.factors).toEqual({ str: 1.1 }); expect(t.note).toHaveLength(200)
  gen.mockResolvedValueOnce({ text: 'я'.repeat(5000) })
  expect(await aiWeeklyReport(cfg, state)).toHaveLength(4000)
  gen.mockResolvedValueOnce({ text: '' })
  await expect(aiWeeklyReport(cfg, state)).rejects.toBeInstanceOf(AiError)
})

test('validateAiQuests: stat-массив [\x27int\x27] отбрасывается', async () => {
  const { validateAiQuests } = await import('./tasks')
  const q = (stat: unknown, t: string) => ({ title: t, stat, difficulty: 2, minutes: 10, allDay: false, why: '' })
  const ctx = { date: '2026-11-17', multipliers: { str: 1, end: 1, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 }, windows: [{ start: '10:00', end: '22:00' }], energy: { morning: 3, day: 3, evening: 3, night: 3 }, wakeAt: '10:00' }
  const r = validateAiQuests({ quests: [q(['int'], 'Читать 10 страниц'), q('int', 'Прочитать статью'), q('str', 'Отжаться 20 раз'), q('spi', 'Медитация 5 минут')] }, ctx as any)
  expect(r.map(x => x.stat)).toEqual(['int', 'str', 'spi'])
})

test('questContext: портрет героя только при наличии character', () => {
  expect(questContext(state, profile, null, '08:00')).not.toContain('Портрет героя')
  const withC = { ...state, character: { archetype: 'Тихий стратег', summary: 'Ты спокойный', strengths: [], weaknesses: [], focus: ['Дисциплина'], questGuidance: 'Мягкий темп', date: '2026-11-17' },
    interviewAnswers: { weight: 80, year_goal: 'Выучить английский', motivators: ['Свобода'] } }
  const t = questContext(withC, profile, null, '08:00')
  expect(t).toContain('Тихий стратег'); expect(t).toContain('Дисциплина'); expect(t).toContain('Мягкий темп')
  expect(t).toContain('Вес, кг: 80'); expect(t).toContain('Свобода')
})

test('KEY_ANSWERS ссылаются на существующие вопросы анкеты', async () => {
  const { KEY_ANSWERS } = await import('./tasks')
  const { QUESTIONS } = await import('../domain/interview')
  const ids = new Set(QUESTIONS.map(q => q.id))
  expect(KEY_ANSWERS.map(([id]) => id).filter(id => !ids.has(id))).toEqual([])
})
