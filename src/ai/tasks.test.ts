import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./providers', async (orig) => ({ ...(await orig<typeof import('./providers')>()), generateJson: vi.fn() }))
import { AiError, generateJson } from './providers'
import { aiQuestTexts, aiTuning, aiWeeklyReport, applyTexts, questContext, validateAiTexts } from './tasks'
import { replay } from '../domain/replay'
import type { GameEvent, Profile, Quest } from '../domain/types'
import type { AiConfig } from './config'

const cfg: AiConfig = { provider: 'gemini', key: 'K', textModel: 'm', imageModel: null }
const gen = vi.mocked(generateJson)
beforeEach(() => gen.mockReset())

const energy = { morning: 3, day: 3, evening: 3, night: 3 }

const profile: Profile = {
  name: 'Гэндальф', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000,
  badHabits: [], goodHabits: [], energy, selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 1 },
}
const state = replay([{ id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent], new Date(2026, 10, 17, 12).getTime())

const quest = (id: string, o = {}): Quest => ({ id, date: '2026-11-17', title: 'Прочитать 30 страниц', stat: 'int', minutes: 45, window: null, xp: 49,
  auto: null, templateId: 'read', rank: 'C', skills: ['reading'], kind: 'daily', why: 'тема сезона', ...o })

test('validateAiTexts: чужие id отброшены, длины 3–80 / ≤140, ранг и XP не меняются', () => {
  const raw = { texts: [
    { id: 'a', title: '  Мастер велит: 30 страниц  ', why: 'Разум ждёт', rank: 'S', xp: 9999, skills: ['tech'] },
    { id: 'zzz', title: 'Чужое задание', why: 'x' },
    { id: 'b', title: 'ab', why: 'x' },
    { id: 'c', title: 'я'.repeat(81), why: 'x' },
    { id: 'd', title: 'Нормальный текст', why: 'я'.repeat(141) },
    { id: 'e', title: 42, why: 'x' }, null, 'мусор',
    { id: 'a', title: 'Дубль id', why: 'x' },
  ] }
  const t = validateAiTexts(raw, ['a', 'b', 'c', 'd', 'e'])
  expect(t).toEqual({ a: { title: 'Мастер велит: 30 страниц', why: 'Разум ждёт' } })
  expect(validateAiTexts(null, ['a'])).toEqual({})
  expect(validateAiTexts({ texts: 'x' }, ['a'])).toEqual({})
  const qs = applyTexts([quest('a'), quest('b')], t)
  expect(qs[0]).toEqual({ ...quest('a'), title: 'Мастер велит: 30 страниц', why: 'Разум ждёт' })
  expect(qs[1]).toEqual(quest('b'))
  // пустое «почему» — остаётся текст правил
  expect(applyTexts([quest('a')], validateAiTexts({ texts: [{ id: 'a', title: 'Новый текст', why: '' }] }, ['a']))[0].why).toBe('тема сезона')
})

test('aiQuestTexts: промпт с заданиями и именем; без согласия ответы анкеты не уходят; ошибка пробрасывается', async () => {
  gen.mockResolvedValueOnce({ texts: [{ id: 'a', title: 'Мастер: 30 страниц', why: 'Пора' }] })
  expect(await aiQuestTexts(cfg, state, [quest('a')])).toEqual({ a: { title: 'Мастер: 30 страниц', why: 'Пора' } })
  const user = gen.mock.calls[0][2]
  expect(user).toContain('Гэндальф'); expect(user).toContain('Прочитать 30 страниц'); expect(user).toContain('a')
  const noAi = { ...state, character: { archetype: 'Тихий', summary: '', strengths: [], weaknesses: [], focus: [], questGuidance: 'секрет', date: '2026-11-17', ai: false },
    interviewAnswers: { weight: 80 } }
  gen.mockResolvedValueOnce({ texts: [] })
  await aiQuestTexts(cfg, noAi, [quest('a')])
  expect(gen.mock.calls[1][2]).not.toContain('Вес, кг'); expect(gen.mock.calls[1][2]).not.toContain('секрет')
  gen.mockRejectedValueOnce(new AiError('x', 'rate'))
  await expect(aiQuestTexts(cfg, state, [quest('a')])).rejects.toMatchObject({ kind: 'rate' })
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

test('questContext: портрет героя только при наличии character', () => {
  expect(questContext(state, profile)).not.toContain('Портрет героя')
  const withC = { ...state, character: { archetype: 'Тихий стратег', summary: 'Ты спокойный', strengths: [], weaknesses: [], focus: ['Дисциплина'], questGuidance: 'Мягкий темп', date: '2026-11-17', ai: true },
    interviewAnswers: { weight: 80, year_goal: 'Выучить английский', motivators: ['Свобода'] } }
  const t = questContext(withC, profile)
  expect(t).toContain('Тихий стратег'); expect(t).toContain('Дисциплина'); expect(t).toContain('Мягкий темп')
  expect(t).toContain('Вес, кг: 80'); expect(t).toContain('Свобода')
  const long = questContext({ ...withC, interviewAnswers: { year_goal: 'я'.repeat(400) } }, profile)
  expect(long).toContain('я'.repeat(150)); expect(long).not.toContain('я'.repeat(151))
  const rules = questContext({ ...withC, character: { ...withC.character, ai: false } }, profile)
  expect(rules).toContain('Тихий стратег'); expect(rules).not.toContain('Ключевые ответы'); expect(rules).not.toContain('Мягкий темп'); expect(rules).not.toContain('Вес, кг')
})

test('KEY_ANSWERS ссылаются на существующие вопросы анкеты', async () => {
  const { KEY_ANSWERS } = await import('./tasks')
  const { QUESTIONS } = await import('../domain/interview')
  const ids = new Set(QUESTIONS.map(q => q.id))
  expect(KEY_ANSWERS.map(([id]) => id).filter(id => !ids.has(id))).toEqual([])
})
