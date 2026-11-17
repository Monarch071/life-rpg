import { expect, test } from 'vitest'
import { QUESTIONS, SECTIONS } from '../domain/interview'
import { parseDraft, splitScale, TOTAL } from './interviewFlow'

test('parseDraft: мусор → null, idx ограничен, лишнее отброшено', () => {
  expect(parseDraft(null)).toBeNull()
  expect(parseDraft('x')).toBeNull()
  expect(parseDraft({ idx: 999 })!.idx).toBe(TOTAL)
  expect(parseDraft({ idx: -3 })!.idx).toBe(0)
  expect(parseDraft({ idx: 2.5 })!.idx).toBe(0)
  const d = parseDraft({ idx: 5, answers: { o1: 3, bad: {} }, followups: [{ q: 'a', a: 'b' }, { q: 1 }], asked: ['body', 'nope'] })!
  expect(d).toEqual({ idx: 5, answers: { o1: 3 }, followups: [{ q: 'a', a: 'b' }], asked: ['body'] })
  expect(d).not.toHaveProperty('aiFollow')
  expect(parseDraft({ aiFollow: false })!.aiFollow).toBe(false)
  expect(parseDraft({ aiFollow: 'yes' })).not.toHaveProperty('aiFollow')
})

test('splitScale: подписи краёв, в т.ч. со скобками внутри', () => {
  expect(splitScale('Сон? (1 — плохо, 5 — отлично)')).toEqual({ text: 'Сон?', lo: 'плохо', hi: 'отлично' })
  expect(splitScale('Стресс? (1 — спокоен(на), 5 — на пределе)')).toEqual({ text: 'Стресс?', lo: 'спокоен(на)', hi: 'на пределе' })
  expect(splitScale('Без подписей')).toEqual({ text: 'Без подписей', lo: 'мало', hi: 'много' })
  for (const q of QUESTIONS.filter(q => q.kind === 'scale')) expect(splitScale(q.text).text).not.toMatch(/1 —/)
})

test('разделы идут подряд и в порядке SECTIONS (на этом держится экран)', () => {
  const order = QUESTIONS.map(q => q.section).filter((s, i, a) => s !== a[i - 1])
  expect(order).toEqual(SECTIONS.map(s => s.id))
})
