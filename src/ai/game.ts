import { validBossDraft, validChainSteps } from '../domain/boss'
import { BALANCE } from '../domain/balance'
import { AUTO_METRIC_INFO } from '../domain/metricInfo'
import { validLadderSteps } from '../domain/ladder'
import { SKILL_CATALOG } from '../domain/skillCatalog'
import { cleanText } from '../domain/text'
import type { BossDraft, LadderStep } from '../domain/types'
import type { AiConfig } from './config'
import { AiError, generateJson } from './providers'

// В промпты уходят только тексты целей (уже уходят в questContext). Названия граней Тени и «не делать»-привычек — никогда.
const BOSS_SYSTEM = `Ты — Мастер в игре по прокачке. По целям героя предложи ровно 3 варианта сезонного босса — большой цели на три месяца. Каждый вариант: title (до 60 символов), skill (один из: ${SKILL_CATALOG.map(k => k.id).join(', ')}), parts — ровно 3 части по месяцам, у каждой title (до 60) и steps — от 2 до 5 коротких шагов (до 80 символов). Пиши по-русски, без разметки.`
const stepsArr = { type: 'array', items: { type: 'string' } }
const BOSS_SCHEMA = { type: 'object', required: ['options'], properties: { options: { type: 'array', items: { type: 'object', required: ['title', 'skill', 'parts'],
  properties: { title: { type: 'string' }, skill: { type: 'string' }, parts: { type: 'array', items: { type: 'object', required: ['title', 'steps'], properties: { title: { type: 'string' }, steps: stepsArr } } } } } } } }

/** Ровно 3 варианта: невалидный (или отсутствующий) заменяется fallback[i]; ответ ИИ — недоверенные данные. */
export async function aiBossOptions(cfg: AiConfig, goals: string[], fallback: BossDraft[]): Promise<BossDraft[]> {
  const g = goals.map(x => cleanText(x, 80)).filter((x): x is string => !!x)
  const raw = await generateJson(cfg, BOSS_SYSTEM, `Цели героя: ${g.join('; ') || 'нет'}`, BOSS_SCHEMA) as any
  const opts: unknown[] = Array.isArray(raw?.options) ? raw.options : []
  const out = Array.from({ length: BALANCE.boss.parts }, (_, i) => validBossDraft(opts[i]) ?? fallback[i])
  if (out.some(o => !o)) throw new AiError('нет вариантов', 'bad_response')
  return out
}

const CHAIN_SYSTEM = 'Ты — Мастер в игре по прокачке. Разбей цель героя на последовательную сюжетную цепочку из 3–6 коротких шагов (до 80 символов каждый), по-русски, без разметки.'
const CHAIN_SCHEMA = { type: 'object', required: ['steps'], properties: { steps: stepsArr } }

export async function aiChainSteps(cfg: AiConfig, goal: string): Promise<string[]> {
  const raw = await generateJson(cfg, CHAIN_SYSTEM, `Цель: ${cleanText(goal, 80) ?? ''}`, CHAIN_SCHEMA) as any
  const steps = validChainSteps(raw?.steps)
  if (!steps) throw new AiError('нет шагов', 'bad_response')
  return steps
}

const LADDER_SYSTEM = `Ты — Мастер в игре по прокачке. Построй лестницу привычки из ровно 5 ступеней от лёгкой пробы к автоматизму: label (до 60 символов), per7 — сколько раз в неделю (целое 1–7, не убывает). Можно добавить auto: { metric, op: ">=", value }, если метрика подходит: ${Object.keys(AUTO_METRIC_INFO).join(', ')}. По-русски, без разметки.`
const LADDER_SCHEMA = { type: 'object', required: ['steps'], properties: { steps: { type: 'array', items: { type: 'object', required: ['label', 'per7'],
  properties: { label: { type: 'string' }, per7: { type: 'integer' }, auto: { type: 'object', properties: { metric: { type: 'string' }, op: { type: 'string' }, value: { type: 'number' } } } } } } } }

/** Только для лестниц «делать»: название «не делать»-привычки в ИИ не уходит (может совпадать с гранью Тени). */
export async function aiLadderSteps(cfg: AiConfig, title: string): Promise<LadderStep[]> {
  const raw = await generateJson(cfg, LADDER_SYSTEM, `Привычка: ${cleanText(title, 40) ?? ''}`, LADDER_SCHEMA) as any
  const steps = validLadderSteps(raw?.steps)
  if (!steps) throw new AiError('нет ступеней', 'bad_response')
  return steps
}
