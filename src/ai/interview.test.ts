import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./providers', async (orig) => ({ ...(await orig<typeof import('./providers')>()), generateJson: vi.fn() }))
import { AiError, generateJson } from './providers'
import { aiAnalysis, aiFollowups } from './interview'
import type { AiConfig } from './config'

const cfg: AiConfig = { provider: 'gemini', key: 'K', textModel: 'm', imageModel: null }
const gen = vi.mocked(generateJson)
beforeEach(() => gen.mockReset())

test('aiFollowups: отбрасывает невалидное, максимум три, промпт с ответами раздела', async () => {
  gen.mockResolvedValueOnce({ questions: [
    { text: 'ок', kind: 'text' }, { text: 'Что тебя больше всего вдохновляет?', kind: 'text' },
    { text: 'Выбери вариант отдыха', kind: 'choice', options: ['один'] }, { text: 'Выбери вариант отдыха', kind: 'choice', options: ['сон', 'спорт'] },
    { text: 'Оцени свою энергию', kind: 'scale' }, { text: 'Ещё один вопрос тут', kind: 'text' }, { text: 'И ещё один вопрос', kind: 'text' },
    { text: 'Странный тип вопроса', kind: 'magic' },
  ] })
  const r = await aiFollowups(cfg, 'body', { pushups: 20, steps: 7000, income: 5 })
  expect(r.map(x => x.kind)).toEqual(['text', 'choice', 'scale'])
  expect(r[1].options).toEqual(['сон', 'спорт'])
  expect(new Set(r.map(x => x.id)).size).toBe(3)
  expect(gen.mock.calls[0][2]).toContain('20'); expect(gen.mock.calls[0][2]).not.toContain('доход')
  gen.mockRejectedValueOnce(new AiError('x', 'rate'))
  await expect(aiFollowups(cfg, 'body', {})).rejects.toMatchObject({ kind: 'rate' })
})

const stats = { str: 8, end: 9, int: 12, dis: 6, cha: 10, fin: 7, spi: 11 }
const analysis = { archetype: '  Тихий стратег ', summary: 'Ты спокойный. '.repeat(200), strengths: ['a'], weaknesses: ['b'], stats, focus: ['x', 'y', 'z'], questGuidance: 'Мягко' }

test('aiAnalysis: валидный проходит, строки обрезаются', async () => {
  gen.mockResolvedValueOnce(analysis)
  const r = await aiAnalysis(cfg, { year_goal: 'Выучить английский' }, [{ q: 'Почему?', a: 'Работа' }])
  expect(r.archetype).toBe('Тихий стратег'); expect(r.summary.length).toBeLessThanOrEqual(1200)
  expect(gen.mock.calls[0][2]).toContain('Выучить английский'); expect(gen.mock.calls[0][2]).toContain('Работа')
})

test('aiAnalysis: stats вне 1..20 или мусор → AiError', async () => {
  gen.mockResolvedValueOnce({ ...analysis, stats: { ...stats, str: 25 } })
  await expect(aiAnalysis(cfg, {}, [])).rejects.toBeInstanceOf(AiError)
  gen.mockResolvedValueOnce('мусор')
  await expect(aiAnalysis(cfg, {}, [])).rejects.toMatchObject({ kind: 'bad_response' })
})

test('aiAnalysis: новые поля (scores, startLevel, skillLevels) проходят валидацию', async () => {
  const sc = { str: 40, end: 50, int: 60, dis: 30, cha: 45, fin: 20, spi: 55 }
  gen.mockResolvedValueOnce({ ...analysis, scores: sc, startLevel: 22, levelWhy: { str: 'зал 2 года' }, skillLevels: { strength: 5, reading: 3 } })
  const r = await aiAnalysis(cfg, {}, [])
  expect(r.scores).toEqual(sc); expect(r.startLevel).toBe(22); expect(r.skillLevels).toEqual({ strength: 5, reading: 3 })
  expect(r.levelWhy).toEqual({ str: 'зал 2 года' })
})
