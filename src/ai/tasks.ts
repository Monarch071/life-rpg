import { addDays } from '../domain/day'
import { STATS } from '../domain/stats'
import { RANKS } from '../domain/balance'
import type { GameState, Profile, Quest, Rank, Stat } from '../domain/types'
import { weakestStat } from '../domain/weekly'
import { AI_METRICS, reportInput, reportWeek, seasonInput } from '../domain/masterReport'
import type { AiConfig } from './config'
import { AiError, generateJson } from './providers'

const STAT_KEYS = Object.keys(STATS) as Stat[]
const statLine = (s: Stat, st: GameState) => `${STATS[s].name} ${st.stats[s]} (×${st.multipliers[s].toFixed(2)})`

// Ключевые ответы анкеты для портрета: id → короткая подпись.
export const KEY_ANSWERS: [string, string][] = [['weight', 'Вес, кг'], ['weight_goal', 'Комфортный вес, кг'], ['income', 'Доход в месяц, ₽'], ['savings', 'Накопления, ₽'],
  ['money_goal', 'Финансовая цель'], ['money_goal_months', 'Срок цели, мес'], ['motivators', 'Мотивация'], ['limits', 'Ограничения здоровья'], ['games_hours', 'Игры, ч/день'],
  ['screen_hours', 'Телефон, ч/день'], ['year_goal', 'Главная цель года'], ['goal_hours', 'Часов в неделю на цели'], ['blockers', 'Что мешало'], ['sleep_hours', 'Сон, ч'], ['stress', 'Напряжение 1–5']]

function portrait(state: GameState): string[] {
  const c = state.character
  if (!c) return []
  if (!c.ai) return ['Портрет героя:', `Архетип: ${c.archetype}`] // без согласия на анализ ИИ ответы анкеты не уходят
  const a = state.interviewAnswers ?? {}
  const key = KEY_ANSWERS.filter(([id]) => a[id] !== undefined && a[id] !== '' && !(Array.isArray(a[id]) && !(a[id] as string[]).length))
    .map(([id, label]) => `${label}: ${(Array.isArray(a[id]) ? (a[id] as string[]).join(', ') : String(a[id])).slice(0, 150)}`)
  return ['Портрет героя:', `Архетип: ${c.archetype}`, `О герое: ${c.summary}`, `Зоны роста: ${c.focus.join('; ')}`, `Как давать задания: ${c.questGuidance}`,
    ...(key.length ? [`Ключевые ответы: ${key.join('; ')}`] : [])]
}

/** Компактный русский контекст для ИИ. */
export function questContext(state: GameState, profile: Profile): string {
  const m7: string[] = []
  const recent = state.metricHistory.filter(h => h.date >= addDays(state.today.date, -7))
  for (const k of AI_METRICS) {
    const v = recent.map(h => h.metrics[k]).filter((x): x is number => x !== undefined)
    if (v.length) m7.push(`${k} ${Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10}`)
  }
  return [
    `Герой: ${profile.name}, уровень ${state.level}, класс ${state.className}`,
    `Дата: ${state.today.date}`,
    `Цели: ${profile.goals.map(g => `${g.text} (${g.months} мес, ${STATS[g.stat].name})`).join('; ') || 'нет'}`,
    `Характеристики (множитель сложности): ${STAT_KEYS.map(s => statLine(s, state)).join(', ')}`,
    `Самая слабая характеристика: ${STATS[weakestStat(state.stats)].name}`,
    `История 14 дней (дата: xp/выполнено из выдано): ${state.history.slice(-14).map(h => `${h.date.slice(5)}: ${h.xp}/${h.completed} из ${h.issued}`).join('; ') || 'нет'}`,
    `Метрики, среднее за 7 дней: ${m7.join(', ') || 'нет данных'}`,
    `Энергия: сейчас ${state.today.lastEnergy ?? 'неизвестно'}/10; утро ${profile.energy.morning}, день ${profile.energy.day}, вечер ${profile.energy.evening} из 5`,
    `Сон: ${state.genInputs.lastSleepHours ?? 'неизвестно'} ч`,
    `Привычки: хорошие ${profile.goodHabits.join(', ') || 'нет'}; вредные ${profile.badHabits.join(', ') || 'нет'}`,
    ...portrait(state),
  ].join('\n')
}

type Texts = Record<string, { title: string; why: string }>

const nums = (t: string) => (t.match(/\d+(?:[.,]\d+)?/g) ?? []).join(' ')

/** Ответ ИИ — недоверенные данные: берём только title (3–80) и why (≤140) для известных id; ранг, XP, навыки и окно ИИ не трогает.
 *  Если известен текст правил (titles), числа в заголовке ИИ должны совпасть с ним — иначе остаётся текст правил. */
export function validateAiTexts(raw: unknown, ids: string[], titles: Record<string, string> = {}): Texts {
  const list: unknown[] = Array.isArray((raw as any)?.texts) ? (raw as any).texts : []
  const out: Texts = {}
  for (const r of list as any[]) {
    const id = r?.id, title = typeof r?.title === 'string' ? r.title.trim() : '', why = typeof r?.why === 'string' ? r.why.trim() : null
    if (typeof id !== 'string' || !ids.includes(id) || Object.hasOwn(out, id)) continue
    if (title.length < 3 || title.length > 80 || why === null || why.length > 140) continue
    if (Object.hasOwn(titles, id) && nums(title) !== nums(titles[id])) continue
    out[id] = { title, why }
  }
  return out
}

/** Подставить тексты ИИ; пустое «почему» оставляет текст правил. */
export const applyTexts = (quests: Quest[], t: Texts): Quest[] =>
  quests.map(q => (Object.hasOwn(t, q.id) ? { ...q, title: t[q.id].title, why: t[q.id].why || q.why } : q))

const TEXTS_SYSTEM = `Ты — Мастер в приложении-игре по прокачке личных характеристик. Задания на сегодня уже собраны правилами. Для каждого задания перепиши формулировку в стиле Мастера (коротко, конкретно, с тем же числом и смыслом) и добавь одну фразу «почему сегодня». По-русски.
Нельзя менять суть задания, число, ранг, навыки и награду. Если в данных есть «Портрет героя» — учитывай его в «почему сегодня».
Характеристики: ${STAT_KEYS.map(s => `${s} — ${STATS[s].name}`).join(', ')}.`
const TEXTS_SCHEMA = {
  type: 'object', required: ['texts'],
  properties: { texts: { type: 'array', items: { type: 'object', required: ['id', 'title', 'why'],
    properties: { id: { type: 'string' }, title: { type: 'string' }, why: { type: 'string' } } } } },
}

/** ИИ пишет только тексты собранных заданий; ошибки пробрасываются (вызывающий остаётся на текстах правил). */
export async function aiQuestTexts(cfg: AiConfig, state: GameState, quests: Quest[]): Promise<Texts> {
  const list = quests.map(q => `${q.id} | ${q.title} | ${STATS[q.stat].name} | ранг ${q.rank ?? '—'} | ${q.why ?? ''}`)
  const user = [...(state.profile ? [questContext(state, state.profile)] : []), 'Задания (id | текст | характеристика | ранг | почему по правилам):', ...list].join('\n')
  return validateAiTexts(await generateJson(cfg, TEXTS_SYSTEM, user, TEXTS_SCHEMA), quests.map(q => q.id), Object.fromEntries(quests.map(q => [q.id, q.title])))
}

const TUNING_SYSTEM = 'Ты — наставник в игре по прокачке. По итогам дня подбери поправку сложности по характеристикам: число от 0.9 (облегчить) до 1.1 (усложнить), 1 — без изменений. Добавь одну-две фразы поддержки на завтра (до 200 символов). Отвечай по-русски.'
const TUNING_SCHEMA = { type: 'object', required: ['factors', 'note'],
  properties: { factors: { type: 'object', properties: Object.fromEntries(STAT_KEYS.map(s => [s, { type: 'number' }])) }, note: { type: 'string' } } }

export async function aiTuning(cfg: AiConfig, state: GameState, checkin: { went: string; notWent: string; energy: number }): Promise<{ factors: Partial<Record<Stat, number>>; note: string }> {
  const d = state.history.at(-1)
  const user = [`Герой: ${state.profile?.name ?? ''}`, `Характеристики: ${STAT_KEYS.map(s => statLine(s, state)).join(', ')}`,
    `Сегодня: выполнено ${state.today.quests.filter(q => q.done).length} из ${state.today.quests.length}, ${state.today.xp} XP, серия ${state.streak} дн.`,
    d ? `Вчера: ${d.completed} из ${d.issued}` : '',
    `Чек-ин: получилось — ${checkin.went || '—'}; не получилось — ${checkin.notWent || '—'}; энергия ${checkin.energy}/10`].filter(Boolean).join('\n')
  const raw = await generateJson(cfg, TUNING_SYSTEM, user, TUNING_SCHEMA) as any
  const factors: Partial<Record<Stat, number>> = {}
  for (const s of STAT_KEYS) { const f = raw?.factors?.[s]; if (typeof f === 'number' && Number.isFinite(f)) factors[s] = Math.min(1.1, Math.max(0.9, f)) }
  const note = typeof raw?.note === 'string' ? raw.note.trim().slice(0, 200) : ''
  if (!note && !Object.keys(factors).length) throw new AiError('пустой ответ', 'bad_response')
  return { factors, note }
}

const REPORT_SYSTEM = 'Ты — наставник в игре по прокачке. Составь недельный отчёт по-русски, 150–400 слов, простым текстом без разметки, с разделами: «Что получилось», «Закономерности», «Слабые места», «План на неделю». Опирайся только на данные.'
const REPORT_SCHEMA = { type: 'object', required: ['text'], properties: { text: { type: 'string' } } }

export async function aiWeeklyReport(cfg: AiConfig, state: GameState, weekStart = reportWeek(state.today.date)): Promise<string> {
  const i = reportInput(state, weekStart) // только белый список (спека §8)
  const user = [`Герой: ${state.profile?.name ?? ''}, уровень ${state.level}`, `Неделя с ${weekStart}; ранг недели: ${i.score.rank ?? 'нет'}${i.final ? '' : ' (предварительно)'}`,
    `Данные недели (JSON): ${JSON.stringify(i)}`].join('\n')
  const raw = await generateJson(cfg, REPORT_SYSTEM, user, REPORT_SCHEMA) as any
  const text = typeof raw === 'string' ? raw : raw?.text
  if (typeof text !== 'string' || !text.trim()) throw new AiError('пустой отчёт', 'bad_response')
  return text.trim().slice(0, 4000)
}

const SEASON_SYSTEM = 'Ты — Мастер в игре по прокачке. Составь разбор завершённого сезона по-русски, 120–300 слов, простым текстом без разметки, с разделами: «Что получилось», «Что нет», «Что взять в следующий сезон». Опирайся только на данные.'

/** Разбор сезона ИИ: только белый список seasonInput (без финансов и граней). Ответ пишется как ai_report scope 'season'. */
export async function aiSeasonReview(cfg: AiConfig, state: GameState, seasonId: string): Promise<string> {
  const i = seasonInput(state, seasonId)
  const raw = await generateJson(cfg, SEASON_SYSTEM, `Данные сезона (JSON): ${JSON.stringify(i)}`, REPORT_SCHEMA) as any
  const text = typeof raw === 'string' ? raw : raw?.text
  if (typeof text !== 'string' || !text.trim()) throw new AiError('пустой разбор', 'bad_response')
  return text.trim().slice(0, 4000)
}

const RANK_SYSTEM = `Ты — Мастер в игре по прокачке. Оцени трудность задания, которое герой придумал себе сам, рангом E (совсем легко, ~10 минут) … S (очень тяжело). Ранги: ${RANKS.join(', ')}. Ответ — только ранг.`
const RANK_SCHEMA = { type: 'object', required: ['rank'], properties: { rank: { type: 'string', enum: [...RANKS] } } }

/** Ранг своего задания от ИИ, не выше потолка `cap`; ответ — недоверенные данные. */
export async function aiCustomRank(cfg: AiConfig, title: string, skill: string, cap: Rank): Promise<Rank> {
  const raw = await generateJson(cfg, RANK_SYSTEM, `Задание: ${title}
Навык: ${skill}`, RANK_SCHEMA) as any
  const r = raw?.rank
  if (!RANKS.includes(r)) throw new AiError('нет ранга', 'bad_response')
  return RANKS[Math.min(RANKS.indexOf(r), RANKS.indexOf(cap))]
}
