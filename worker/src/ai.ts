// Встроенный ИИ: приложение шлёт тело generateContent, сервер подставляет свой ключ Gemini.
// Ключ — секрет GEMINI_KEY воркера, в коде и в приложении его нет.
import type { Store } from './store'

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
export const AI_LIMITS = { text: 300, image: 15 } as const   // запросов в сутки (UTC) на сервер
export const AI_BODY_MAX = 4 * 1024 * 1024
export type AiKind = keyof typeof AI_LIMITS
const MODELS_TTL = 24 * 3600_000

/** Выбор моделей из списка Gemini: текст — flash-latest или новейшая flash, картинки — новейшая flash-image (не lite). */
export function pickModels(ids: string[]): { text: string | null; image: string | null } {
  const ver = (id: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0)
  const newest = (xs: string[]) => [...xs].sort((a, b) => ver(b) - ver(a) || a.length - b.length)[0] ?? null
  const stable = (id: string) => !/preview|exp|lite|tts|audio|live|embedding|thinking/.test(id)
  const text = ids.includes('gemini-flash-latest') ? 'gemini-flash-latest'
    : newest(ids.filter(id => /^gemini-[\d.]+-flash$/.test(id))) ?? newest(ids.filter(id => /flash/.test(id) && !/image/.test(id) && stable(id)))
  const image = newest(ids.filter(id => /flash.*image/.test(id) && !/lite/.test(id) && !/preview/.test(id)))
    ?? newest(ids.filter(id => /image/.test(id) && /^gemini/.test(id)))
  return { text, image }
}

export class AiHttpError extends Error { constructor(public status: number, message: string) { super(message) } }

async function models(store: Store, key: string, now: number, f: typeof fetch): Promise<{ text: string | null; image: string | null }> {
  const cached = await store.getMeta('ai_models')
  if (cached) {
    const c = JSON.parse(cached) as { at: number; text: string | null; image: string | null }
    if (now - c.at < MODELS_TTL && c.text) return c
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
  const picked = (kind === 'text' ? env.AI_TEXT_MODEL : env.AI_IMAGE_MODEL) || (await models(store, env.GEMINI_KEY, now, f))[kind]
  if (!picked) throw new AiHttpError(503, 'Нет подходящей модели ИИ')
  const day = new Date(now).toISOString().slice(0, 10)
  if (await store.bump(`ai_${kind}_${day}`) > AI_LIMITS[kind]) throw new AiHttpError(429, 'Дневной лимит ИИ исчерпан')
  const r = await f(`${GEMINI}/models/${picked}:generateContent`, {
    method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_KEY, 'content-type': 'application/json' }, body,
  })
  if (r.status === 404) await store.setMeta('ai_models', '')   // модель сняли — выбрать заново в следующий раз
  if (!r.ok) throw new AiHttpError(r.status === 429 ? 429 : r.status === 400 ? 400 : 502, r.status === 429 ? 'Лимит Gemini исчерпан' : 'Ошибка ИИ')
  return { status: 200, body: await r.text() }
}
