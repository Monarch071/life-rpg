import { QUESTIONS, SECTIONS, validAnalysis, type Analysis, type Answers, type SectionId } from '../domain/interview'
import { STATS } from '../domain/stats'
import type { Stat } from '../domain/types'
import type { AiConfig } from './config'
import { AiError, generateJson } from './providers'

export interface Followup { id: string; text: string; kind: 'text' | 'scale' | 'choice'; options?: string[] }

const fmt = (v: unknown) => Array.isArray(v) ? v.join(', ') : String(v)
const lines = (a: Answers, ids?: Set<string>) => QUESTIONS.filter(q => (!ids || ids.has(q.id)) && a[q.id] !== undefined && a[q.id] !== '')
  .map(q => `- ${q.text} → ${fmt(a[q.id])}`).join('\n')

const FOLLOW_SYSTEM = `Ты — внимательный наставник в приложении-игре по прокачке личных характеристик. Человек заполняет анкету. По ответам одного раздела задай от 0 до 3 коротких уточняющих вопросов по-русски, которые помогут лучше понять человека для прокачки. Тон уважительный и тёплый. Не ставь медицинских диагнозов, не дави на тему веса и денег. Если всё ясно, верни пустой список. Вопрос — 5–200 символов; kind: text (свободный ответ), scale (оценка 1–5) или choice (2–6 вариантов в options).`
const FOLLOW_SCHEMA = { type: 'object', required: ['questions'], properties: { questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['text', 'kind'],
  properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['text', 'scale', 'choice'] }, options: { type: 'array', items: { type: 'string' } } } } } } }

export async function aiFollowups(cfg: AiConfig, section: SectionId, answers: Answers): Promise<Followup[]> {
  const title = SECTIONS.find(s => s.id === section)?.title ?? section
  const ids = new Set(QUESTIONS.filter(q => q.section === section).map(q => q.id))
  const raw = await generateJson(cfg, FOLLOW_SYSTEM, `Раздел «${title}». Ответы:\n${lines(answers, ids) || 'нет'}`, FOLLOW_SCHEMA) as any
  const out: Followup[] = []
  for (const r of Array.isArray(raw?.questions) ? raw.questions : []) {
    if (out.length >= 3) break
    const text = typeof r?.text === 'string' ? r.text.trim() : ''
    if (text.length < 5 || text.length > 200) continue
    if (r.kind === 'text' || r.kind === 'scale') out.push({ id: `ai:${section}:${out.length}`, text, kind: r.kind })
    else if (r.kind === 'choice') {
      const options = Array.isArray(r.options) ? r.options.filter((o: unknown): o is string => typeof o === 'string' && !!o.trim()).map((o: string) => o.trim().slice(0, 60)) : []
      if (options.length >= 2 && options.length <= 6) out.push({ id: `ai:${section}:${out.length}`, text, kind: 'choice', options })
    }
  }
  return out
}

const STAT_KEYS = Object.keys(STATS) as Stat[]
const ANALYSIS_SYSTEM = `Ты — наставник в приложении-игре по прокачке личных характеристик. По анкете составь портрет героя по-русски: уважительно, без медицинских диагнозов, без давления на тему веса и денег.
Оцени 7 характеристик целыми числами от 1 до 20: ${STAT_KEYS.map(s => `${s} — ${STATS[s].name}`).join(', ')}.
Шкала: 5 — новичок, 10 — средний взрослый, 15 — заметно выше среднего, 20 — топ. Будь честным: не завышай и не занижай, опирайся на ответы.
Верни: archetype — аниме-класс или архетип героя («Тихий стратег»); summary — 4–6 предложений, обращение на «ты»; strengths и weaknesses — короткие списки; focus — 3 зоны роста; questGuidance — как давать задания этому человеку: темп, что мотивирует, чего избегать.`
const list = { type: 'array', items: { type: 'string' } }
const ANALYSIS_SCHEMA = { type: 'object', required: ['archetype', 'summary', 'strengths', 'weaknesses', 'stats', 'focus', 'questGuidance'],
  properties: { archetype: { type: 'string' }, summary: { type: 'string' }, strengths: list, weaknesses: list, focus: list, questGuidance: { type: 'string' },
    stats: { type: 'object', required: STAT_KEYS, properties: Object.fromEntries(STAT_KEYS.map(s => [s, { type: 'integer', minimum: 1, maximum: 20 }])) } } }

export async function aiAnalysis(cfg: AiConfig, answers: Answers, followups: { q: string; a: string }[]): Promise<Analysis> {
  const user = `Ответы анкеты:\n${lines(answers)}\n\nУточнения:\n${followups.map(f => `- ${f.q} → ${f.a}`).join('\n') || 'нет'}`
  const a = validAnalysis(await generateJson(cfg, ANALYSIS_SYSTEM, user, ANALYSIS_SCHEMA))
  if (!a) throw new AiError('некорректный разбор', 'bad_response')
  return a
}
