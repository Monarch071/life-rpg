import { QUESTIONS, SECTIONS, cleanAnswers, type Answers, type SectionId } from '../domain/interview'

export type QA = { q: string; a: string }
/** aiFollow: согласие на уточнения ИИ (undefined — ещё не спрашивали). */
export interface Draft { answers: Answers; idx: number; followups: QA[]; asked: SectionId[]; aiFollow?: boolean }
export const TOTAL = QUESTIONS.length

/** Черновик из настроек (недоверенные данные). idx 0..TOTAL, где TOTAL — все вопросы пройдены. */
export function parseDraft(x: unknown): Draft | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const d = x as Record<string, unknown>
  const ids = new Set<string>(SECTIONS.map(s => s.id))
  return {
    answers: cleanAnswers(d.answers),
    idx: typeof d.idx === 'number' && Number.isInteger(d.idx) ? Math.min(TOTAL, Math.max(0, d.idx)) : 0,
    followups: Array.isArray(d.followups)
      ? d.followups.filter((f): f is QA => !!f && typeof f.q === 'string' && typeof f.a === 'string').slice(0, 3 * SECTIONS.length) : [],
    asked: Array.isArray(d.asked) ? d.asked.filter((s): s is SectionId => ids.has(s)) : [],
    ...(typeof d.aiFollow === 'boolean' ? { aiFollow: d.aiFollow } : {}),
  }
}

/** «… (1 — X, 5 — Y)» в тексте вопроса → сам вопрос и подписи краёв шкалы. */
export function splitScale(text: string): { text: string; lo: string; hi: string } {
  const m = /\s*\(1 — ([^,]+), 5 — ([^)]+(?:\([^)]*\)[^)]*)?)\)\s*$/.exec(text)
  return m ? { text: text.slice(0, m.index), lo: m[1], hi: m[2] } : { text, lo: 'мало', hi: 'много' }
}
