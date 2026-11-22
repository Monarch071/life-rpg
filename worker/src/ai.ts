// Встроенный ИИ: приложение шлёт тело generateContent, сервер подставляет свой ключ Gemini.
// Ключ — секрет GEMINI_KEY воркера, в коде и в приложении его нет.
import type { Store } from './store'

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
export const AI_LIMITS = { text: 300, image: 15 } as const   // запросов в сутки (UTC) на сервер
export const AI_BODY_MAX = 4 * 1024 * 1024
export type AiKind = keyof typeof AI_LIMITS
const MODELS_TTL = 24 * 3600_000
// на одну модель; не ответила — следующая (приложение ждёт до 60 с текст и 150 с картинку)
const TRY_MS = { text: 18_000, image: 70_000 } as const

/** Кандидаты по порядку (до 3): текст — flash-latest, новейшие flash, затем flash-lite; картинки — flash-image, pro-image, lite-image. */
export function pickModels(ids: string[]): { text: string[]; image: string[] } {
  const ver = (id: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0)
  const byNew = (xs: string[]) => [...xs].sort((a, b) => ver(b) - ver(a) || a.length - b.length)
  const bad = /preview|exp|tts|audio|live|embedding|thinking|image/
  // последним — lite: у неё меньше очередь, когда основные перегружены
  const latest = ids.filter(id => id === 'gemini-flash-latest')
  const lite = byNew(ids.filter(id => /^gemini-[\d.]+-flash-lite$/.test(id))).slice(0, 1)
  const text = [
    ...latest,
    ...byNew(ids.filter(id => /^gemini-[\d.]+-flash$/.test(id))).slice(0, 2 - latest.length),
    ...lite,
    ...byNew(ids.filter(id => /^gemini-.*flash/.test(id) && !bad.test(id))),
  ]
  const image = [
    ...byNew(ids.filter(id => /^gemini-.*flash.*image/.test(id) && !/lite|preview/.test(id))),
    ...byNew(ids.filter(id => /^gemini-.*pro.*image/.test(id) && !/preview/.test(id))),
    ...byNew(ids.filter(id => /^gemini-.*image/.test(id))),
  ]
  return { text: [...new Set(text)].slice(0, 3), image: [...new Set(image)].slice(0, 3) }
}

export class AiHttpError extends Error { constructor(public status: number, message: string) { super(message) } }

async function models(store: Store, key: string, now: number, f: typeof fetch): Promise<{ text: string[]; image: string[] }> {
  const cached = await store.getMeta('ai_models')
  if (cached) {
    const c = JSON.parse(cached) as { at: number; text: unknown; image: unknown }
    if (now - c.at < MODELS_TTL && Array.isArray(c.text) && c.text.length && Array.isArray(c.image)) return c as { text: string[]; image: string[] }
  }
  const r = await f(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } })
  if (!r.ok) throw new AiHttpError(r.status === 400 || r.status === 403 ? 502 : 503, r.status === 400 || r.status === 403 ? 'Ключ ИИ на сервере не подошёл' : 'ИИ недоступен')
  const d = await r.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
  const ids = (d.models ?? []).filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => String(m.name).replace(/^models\//, ''))
  const p = pickModels(ids)
  await store.setMeta('ai_models', JSON.stringify({ at: now, ...p }))
  return p
}

/** POST /ai/text и /ai/image: лимит в сутки, затем проксирование в Gemini. */
export async function aiProxy(kind: AiKind, body: string, store: Store, env: { GEMINI_KEY?: string; AI_TEXT_MODEL?: string; AI_IMAGE_MODEL?: string }, now: number, f: typeof fetch = fetch): Promise<{ status: number; body: string }> {
  if (!env.GEMINI_KEY) throw new AiHttpError(503, 'ИИ на сервере не настроен')
  try { if (typeof JSON.parse(body) !== 'object') throw 0 } catch { throw new AiHttpError(400, 'Некорректный JSON') }
  const env1 = kind === 'text' ? env.AI_TEXT_MODEL : env.AI_IMAGE_MODEL
  const list = env1 ? [env1] : (await models(store, env.GEMINI_KEY, now, f))[kind]
  if (!list.length) throw new AiHttpError(503, 'Нет подходящей модели ИИ')
  const day = new Date(now).toISOString().slice(0, 10)
  if (await store.bump(`ai_${kind}_${day}`) > AI_LIMITS[kind]) throw new AiHttpError(429, 'Дневной лимит ИИ исчерпан')
  let r: Response | null = null, picked = list[0]
  for (const m of list) {   // перегружена или снята — пробуем следующую
    picked = m
    try {
      r = await f(`${GEMINI}/models/${m}:generateContent`, {
        method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_KEY, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(TRY_MS[kind]),
      })
    } catch { r = new Response('{"error":{"message":"timeout"}}', { status: 503 }); continue }
    if (r.status === 404) await store.setMeta('ai_models', '')
    if (r.ok || ![404, 500, 503].includes(r.status)) break
  }
  if (!r!.ok) {
    const t = await r!.text().catch(() => '')
    let why = ''
    try { why = String(JSON.parse(t)?.error?.message ?? '').slice(0, 160) } catch { /* не JSON */ }
    console.error('gemini', picked, r!.status, t.slice(0, 500))
    throw new AiHttpError(r!.status === 429 ? 429 : r!.status === 400 ? 400 : 502, r!.status === 429 ? 'Лимит Gemini исчерпан' : `Ошибка ИИ (${r!.status}, ${picked})${why ? `: ${why}` : ''}`)
  }
  return { status: 200, body: await r!.text() }
}
