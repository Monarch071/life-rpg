import { addDays } from '../domain/day'
import { freeWindows, placeQuests, type Win } from '../domain/schedule'
import { isStat, STATS } from '../domain/stats'
import type { GameState, HHMM, ISODate, Profile, Quest, Stat } from '../domain/types'
import { weakestStat } from '../domain/weekly'
import { questXp } from '../domain/xp'
import type { AiConfig } from './config'
import { AiError, generateJson } from './providers'

const STAT_KEYS = Object.keys(STATS) as Stat[]
const statLine = (s: Stat, st: GameState) => `${STATS[s].name} ${st.stats[s]} (×${st.multipliers[s].toFixed(2)})`
const windowsFor = (state: GameState, profile: Profile, work: Win | null, wakeAt: HHMM) =>
  freeWindows(wakeAt, profile.sleep, [...(work ? [work] : []), ...state.today.calendar.map(({ start, end }) => ({ start, end }))])

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
export function questContext(state: GameState, profile: Profile, work: Win | null, wakeAt: HHMM): string {
  const m7: string[] = []
  const recent = state.metricHistory.filter(h => h.date >= addDays(state.today.date, -7))
  for (const k of ['steps', 'sleepHours', 'readPages', 'water', 'screenMin', 'mood'] as const) {
    const v = recent.map(h => h.metrics[k]).filter((x): x is number => x !== undefined)
    if (v.length) m7.push(`${k} ${Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10}`)
  }
  return [
    `Герой: ${profile.name}, уровень ${state.level}, класс ${state.className}`,
    `Дата: ${state.today.date}`,
    `Цели: ${profile.goals.map(g => `${g.text} (${g.months} мес, ${STATS[g.stat].name})`).join('; ') || 'нет'}`,
    `Характеристики (множитель сложности): ${STAT_KEYS.map(s => statLine(s, state)).join(', ')}`,
    `Самая слабая характеристика: ${STATS[weakestStat(state.stats)].name}`,
    `История 14 дней (дата: xp/тень/выполнено из выдано): ${state.history.slice(-14).map(h => `${h.date.slice(5)}: ${h.xp}/${h.shadowXp}/${h.completed} из ${h.issued}`).join('; ') || 'нет'}`,
    `Метрики, среднее за 7 дней: ${m7.join(', ') || 'нет данных'}`,
    `Энергия: сейчас ${state.today.lastEnergy ?? 'неизвестно'}/10; утро ${profile.energy.morning}, день ${profile.energy.day}, вечер ${profile.energy.evening} из 5`,
    `Сон: ${state.genInputs.lastSleepHours ?? 'неизвестно'} ч`,
    `Свободные окна: ${windowsFor(state, profile, work, wakeAt).map(w => `${w.start}–${w.end}`).join(', ') || 'нет'}`,
    `Привычки: хорошие ${profile.goodHabits.join(', ') || 'нет'}; вредные ${profile.badHabits.join(', ') || 'нет'}`,
    ...portrait(state),
  ].join('\n')
}

/** Ответ ИИ — недоверенные данные: валидируем, XP считаем сами. */
export function validateAiQuests(raw: unknown, ctx: { date: ISODate; multipliers: Record<Stat, number>; windows: Win[]; energy: Profile['energy']; wakeAt: HHMM }): Quest[] {
  const list = Array.isArray((raw as any)?.quests) ? (raw as any).quests : []
  const seen = new Set<string>()
  const ok: Omit<Quest, 'window'>[] = []
  for (const r of list) {
    if (ok.length >= 7) break
    const title = typeof r?.title === 'string' ? r.title.trim() : ''
    const allDay = r?.allDay === true
    if (title.length < 3 || title.length > 80 || !isStat(r.stat)) continue
    if (!Number.isInteger(r.difficulty) || r.difficulty < 1 || r.difficulty > 5) continue
    if (!allDay && (!Number.isInteger(r.minutes) || r.minutes < 5 || r.minutes > 120)) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const difficulty = r.difficulty as Quest['difficulty'], stat = r.stat as Stat
    ok.push({ id: `${ctx.date}:ai:${ok.length}`, date: ctx.date, title, stat, difficulty, minutes: allDay ? 0 : r.minutes,
      xp: questXp(difficulty, ctx.multipliers[stat]), auto: null, templateId: 'ai' })
  }
  if (ok.length < 3) throw new AiError('мало валидных заданий', 'bad_response')
  return placeQuests(ok, ctx.windows, ctx.energy, ctx.wakeAt)
}

const QUESTS_SYSTEM = `Ты — наставник в приложении-игре по прокачке личных характеристик. Составь задания на сегодня, по-русски.
Правила: заданий 3–7. Минимум одно — на самую слабую характеристику. Задания должны влезать в свободные окна. Сложность следует текущему уровню и вчерашнему выполнению и растёт постепенно. Никаких медицинских рисков и экстремальных нагрузок; при низкой энергии или сне меньше 6 часов — задания легче. Если в данных есть «Портрет героя» — каждое задание должно помогать одной из зон роста или закрывать слабость из портрета и учитывать «Как давать задания». Задания конкретные и измеримые («Прочитать 15 страниц», а не «Почитать»). Для заданий «в течение дня» ставь allDay=true.
Характеристики: ${STAT_KEYS.map(s => `${s} — ${STATS[s].name}`).join(', ')}.`
const QUESTS_SCHEMA = {
  type: 'object', required: ['quests'],
  properties: { quests: { type: 'array', minItems: 3, maxItems: 7, items: { type: 'object', required: ['title', 'stat', 'difficulty', 'minutes', 'allDay', 'why'],
    properties: { title: { type: 'string' }, stat: { type: 'string', enum: STAT_KEYS }, difficulty: { type: 'integer', minimum: 1, maximum: 5 },
      minutes: { type: 'integer', minimum: 5, maximum: 120 }, allDay: { type: 'boolean' }, why: { type: 'string' } } } } },
}

export async function aiDailyQuests(cfg: AiConfig, state: GameState, profile: Profile, work: Win | null, wakeAt: HHMM): Promise<Quest[]> {
  const raw = await generateJson(cfg, QUESTS_SYSTEM, questContext(state, profile, work, wakeAt), QUESTS_SCHEMA)
  return validateAiQuests(raw, { date: state.today.date, multipliers: state.multipliers, windows: windowsFor(state, profile, work, wakeAt), energy: profile.energy, wakeAt })
}

const TUNING_SYSTEM = 'Ты — наставник в игре по прокачке. По итогам дня подбери поправку сложности по характеристикам: число от 0.9 (облегчить) до 1.1 (усложнить), 1 — без изменений. Добавь одну-две фразы поддержки на завтра (до 200 символов). Отвечай по-русски.'
const TUNING_SCHEMA = { type: 'object', required: ['factors', 'note'],
  properties: { factors: { type: 'object', properties: Object.fromEntries(STAT_KEYS.map(s => [s, { type: 'number' }])) }, note: { type: 'string' } } }

export async function aiTuning(cfg: AiConfig, state: GameState, checkin: { went: string; notWent: string; energy: number }): Promise<{ factors: Partial<Record<Stat, number>>; note: string }> {
  const d = state.history.at(-1)
  const user = [`Герой: ${state.profile?.name ?? ''}`, `Характеристики: ${STAT_KEYS.map(s => statLine(s, state)).join(', ')}`,
    `Сегодня: выполнено ${state.today.quests.filter(q => q.done).length} из ${state.today.quests.length}, ${state.today.xp} XP против Тени ${state.today.shadowXp}`,
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

export async function aiWeeklyReport(cfg: AiConfig, state: GameState): Promise<string> {
  const from = addDays(state.today.date, -14)
  const user = [`Герой: ${state.profile?.name ?? ''}, уровень ${state.level}`,
    `Характеристики: ${STAT_KEYS.map(s => statLine(s, state)).join(', ')}`,
    `Дни (дата: xp/тень/выполнено из выдано/победа): ${state.history.filter(h => h.date >= from).map(h => `${h.date}: ${h.xp}/${h.shadowXp}/${h.completed} из ${h.issued}/${h.won ? 'да' : 'нет'}`).join('; ') || 'нет'}`,
    `Метрики: ${state.metricHistory.filter(h => h.date >= from).map(h => `${h.date} ${JSON.stringify(h.metrics)}`).join('; ') || 'нет'}`,
  ].join('\n')
  const raw = await generateJson(cfg, REPORT_SYSTEM, user, REPORT_SCHEMA) as any
  const text = typeof raw === 'string' ? raw : raw?.text
  if (typeof text !== 'string' || !text.trim()) throw new AiError('пустой отчёт', 'bad_response')
  return text.trim().slice(0, 4000)
}
