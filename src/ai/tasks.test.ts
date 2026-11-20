import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./providers', async (orig) => ({ ...(await orig<typeof import('./providers')>()), generateJson: vi.fn() }))
import { AiError, generateJson } from './providers'
import { AI_METRICS } from '../domain/masterReport'
import { aiCustomRank, aiQuestTexts, aiTuning, aiWeeklyReport, applyTexts, questContext, validateAiTexts } from './tasks'
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
  // числа заголовка ИИ должны совпасть с текстом правил
  const rule = { s: 'Пройти 8000 шагов', w: 'Выпить воды: 6 стаканов' }
  expect(validateAiTexts({ texts: [{ id: 's', title: 'Мастер велит: 800 шагов', why: 'x' }, { id: 'w', title: 'Шесть стаканов воды', why: 'x' }] }, ['s', 'w'], rule)).toEqual({})
  expect(validateAiTexts({ texts: [{ id: 's', title: 'Пройди 8000 шагов, путник', why: 'x' }, { id: 'w', title: 'Осуши 6 стаканов воды', why: 'x' }] }, ['s', 'w'], rule))
    .toEqual({ s: { title: 'Пройди 8000 шагов, путник', why: 'x' }, w: { title: 'Осуши 6 стаканов воды', why: 'x' } })
  // пустое «почему» — остаётся текст правил
  expect(applyTexts([quest('a')], validateAiTexts({ texts: [{ id: 'a', title: 'Новый текст', why: '' }] }, ['a']))[0].why).toBe('тема сезона')
})

test('aiQuestTexts: промпт с заданиями и именем; без согласия ответы анкеты не уходят; ошибка пробрасывается', async () => {
  gen.mockResolvedValueOnce({ texts: [{ id: 'a', title: 'Мастер: 30 страниц', why: 'Пора' }, { id: 'b', title: 'Мастер: 300 страниц', why: 'Пора' }] })
  expect(await aiQuestTexts(cfg, state, [quest('a'), quest('b')])).toEqual({ a: { title: 'Мастер: 30 страниц', why: 'Пора' } })
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

test('aiCustomRank: ранг из ответа ИИ не выше потолка; мусор — ошибка', async () => {
  gen.mockResolvedValueOnce({ rank: 'C' })
  expect(await aiCustomRank(cfg, 'Сходить в бассейн', 'Кардио', 'B')).toBe('C')
  gen.mockResolvedValueOnce({ rank: 'S' })
  expect(await aiCustomRank(cfg, 'Сходить в бассейн', 'Кардио', 'D')).toBe('D')
  gen.mockResolvedValueOnce({ rank: 'Z' })
  await expect(aiCustomRank(cfg, 'Сходить в бассейн', 'Кардио', 'D')).rejects.toThrow()
})

test('белый список ИИ: траты, магазины, приложения, места и время в соцсетях не уходят ни в один промпт', async () => {
  const T = new Date(2026, 10, 17, 10).getTime()
  const ev = (i: number, e: object) => ({ id: `p${i}`, ts: T + i, deviceId: 'd', ...e }) as GameEvent
  const st = replay([
    { id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent,
    ev(1, { type: 'metric_logged', date: '2026-11-17', metric: 'spend', value: 5000, mode: 'set' }),
    ev(2, { type: 'metric_logged', date: '2026-11-17', metric: 'steps', value: 8000, mode: 'set' }),
    ev(3, { type: 'signal_logged', at: T - 3600e3, signal: { kind: 'wallet', amount: 777, merchant: 'Лавка Секретова' } }),
    ev(4, { type: 'signal_logged', at: T - 3000e3, signal: { kind: 'app', app: 'social', state: 'open' } }),
    ev(5, { type: 'signal_logged', at: T - 1200e3, signal: { kind: 'app', app: 'social', state: 'close' } }),
    ev(6, { type: 'signal_logged', at: T - 600e3, signal: { kind: 'arrive', place: 'gym' } }),
    ev(7, { type: 'fin_category_set', categoryId: 'c1', title: 'СекретКатегория', kind: 'expense', limit: 4321 }),
    ev(8, { type: 'fin_rule_set', ruleId: 'r1', pattern: 'секретправило', categoryId: 'c1' }),
    ev(9, { type: 'fin_entry_added', entryId: 'x1', date: '2026-11-17', kind: 'income', amount: 6543, categoryId: 'default:salary', note: 'СекретЗаметка' }),
    ev(10, { type: 'fin_imported', importId: 'i1', rows: [{ key: 'k', date: '2026-11-17', amount: -8765, text: 'СекретИмпорт' }] }),
  ], T + 60e3)
  expect(st.finance.entries).toHaveLength(3)
  expect(AI_METRICS).not.toContain('spend')
  gen.mockResolvedValue({ texts: [], text: 'отчёт', factors: {}, note: 'ок' })
  await aiWeeklyReport(cfg, st, '2026-11-16')
  await aiQuestTexts(cfg, st, [quest('a')])
  await aiTuning(cfg, st, { went: '', notWent: '', energy: 5 })
  const prompts = [questContext(st, profile), ...gen.mock.calls.map(c => `${c[1]}\n${c[2]}`)]
  expect(prompts[1]).toContain('steps')
  for (const p of prompts) for (const bad of ['spend', '5000', '777', 'Лавка Секретова', 'socialMin', 'social', 'gym', 'wallet', 'Траты', 'spendAuto',
    'СекретКатегория', '4321', 'секретправило', '6543', 'СекретЗаметка', '8765', 'СекретИмпорт', 'finEntries', 'finance'])
    expect(p, bad).not.toContain(bad)
})

// Названия граней Тени не уходят ни в один промпт ИИ.
test('грани Тени не уходят в ИИ (questContext, aiTuning, aiWeeklyReport)', async () => {
  const T = new Date(2026, 11, 3, 12).getTime()
  const ev = (i: number, e: object) => ({ id: `s${i}`, ts: T - 2 * 86400e3 + i, deviceId: 'd', ...e }) as GameEvent
  const st = replay([
    { id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent,
    ev(1, { type: 'facet_added', facetId: 'f1', name: 'Тайная Грань', kind: 'custom', start: 50 }),
    ev(2, { type: 'facet_added', facetId: 'f2', name: 'Ночной Холодильник', kind: 'junk', start: 65 }),
    { id: 's3', ts: T, deviceId: 'd', type: 'shadow_relapse', facetId: 'f1', date: '2026-12-03' } as GameEvent,
  ], T + 60e3)
  expect(st.shadow.facets.map(f => f.name)).toEqual(['Тайная Грань', 'Ночной Холодильник'])
  gen.mockResolvedValue({ texts: [], text: 'отчёт', factors: {}, note: 'ок' })
  await aiWeeklyReport(cfg, st, '2026-11-16')
  await aiQuestTexts(cfg, st, [quest('a')])
  await aiTuning(cfg, st, { went: '', notWent: '', energy: 5 })
  const prompts = [questContext(st, profile), ...gen.mock.calls.map(c => `${c[1]}
${c[2]}`)]
  expect(prompts).toHaveLength(4)
  for (const p of prompts) for (const bad of ['Тайная', 'Холодильник', 'f1', 'f2', 'Тень', 'тени'])
    expect(p, bad).not.toContain(bad)
})

test('aiWeeklyReport: промпт — только белый список, с рангом недели', async () => {
  const s = replay([{ id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile: { ...profile, goals: [{ text: 'СекретнаяЦель', months: 6, stat: 'fin' }] } } as GameEvent,
    { id: 'f', ts: 2, deviceId: 'd', type: 'facet_added', facetId: 'f1', name: 'СекретнаяГрань', kind: 'custom', start: 50 } as GameEvent,
    { id: 'm', ts: new Date(2026, 10, 17, 9).getTime(), deviceId: 'd', type: 'metric_logged', date: '2026-11-17', metric: 'spend', value: 999, mode: 'set' } as GameEvent],
    new Date(2026, 10, 17, 12).getTime())
  gen.mockResolvedValueOnce({ text: 'ок' })
  await aiWeeklyReport(cfg, s, '2026-11-09')
  const user = gen.mock.calls[0][2]
  expect(user).toContain('ранг недели')
  for (const x of ['СекретнаяЦель', 'СекретнаяГрань', 'spend', '999']) expect(user).not.toContain(x)
})
