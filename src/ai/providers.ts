import type { AiConfig, AiProvider } from './config'

export type AiErrorKind = 'auth' | 'rate' | 'network' | 'bad_response' | 'refusal' | 'other'
export class AiError extends Error {
  constructor(message: string, readonly kind: AiErrorKind) { super(message) }
}

const TEXT_MS = 25_000
const IMAGE_MS = 120_000
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
const OPENAI = 'https://api.openai.com/v1'

const TEXTS: Record<AiErrorKind, string> = {
  auth: 'Ключ не подошёл',
  rate: 'Лимит запросов исчерпан, попробуй позже',
  network: 'Нет связи с ИИ',
  bad_response: 'ИИ ответил непонятно',
  refusal: 'ИИ отказался отвечать',
  other: 'Ошибка ИИ',
}
export const aiErrorText = (e: unknown): string => TEXTS[e instanceof AiError ? e.kind : 'other']

/** Первый сбалансированный {...} или [...] с учётом строк и экранирования. */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, '')
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{' && t[i] !== '[') continue
    let depth = 0, str = false, esc = false
    for (let j = i; j < t.length; j++) {
      const c = t[j]
      if (str) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') str = false; continue }
      if (c === '"') str = true
      else if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') {
        if (--depth === 0) {
          try { return JSON.parse(t.slice(i, j + 1)) } catch { break }
        }
      }
    }
  }
  throw new AiError('JSON не найден', 'bad_response')
}

async function http(url: string, init: RequestInit, ms: number): Promise<any> {
  let r: Response
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) }) }
  catch { throw new AiError('network', 'network') }
  if (!r.ok) throw new AiError(`HTTP ${r.status}`, r.status === 401 || r.status === 403 ? 'auth' : r.status === 429 ? 'rate' : 'other')
  try { return await r.json() } catch (e) { throw new AiError('bad json', e instanceof SyntaxError ? 'bad_response' : 'network') }
}

const gHeaders = (key: string) => ({ 'x-goog-api-key': key, 'content-type': 'application/json' })
const oHeaders = (key: string) => ({ authorization: `Bearer ${key}` })

// SDK грузится лениво: основной бандл без него
async function claudeClient(key: string) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 })
}
async function mapSdk(e: unknown): Promise<never> {
  if (e instanceof AiError) throw e
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  if (e instanceof Anthropic.AuthenticationError) throw new AiError('auth', 'auth')
  if (e instanceof Anthropic.RateLimitError) throw new AiError('rate', 'rate')
  if (e instanceof Anthropic.APIConnectionError) throw new AiError('network', 'network')
  throw new AiError('other', 'other')
}

export async function listModels(provider: AiProvider, key: string): Promise<{ text: string[]; image: string[] }> {
  if (provider === 'gemini') {
    const d = await http(`${GEMINI}/models?pageSize=200`, { headers: gHeaders(key) }, TEXT_MS)
    const text: string[] = [], image: string[] = []
    for (const m of d?.models ?? []) {
      const id = String(m.name ?? '').replace(/^models\//, '')
      if (!(m.supportedGenerationMethods ?? []).includes('generateContent')) continue
      if (/-image/.test(id)) image.push(id)
      else if (!/image|embedding|tts|audio/.test(id)) text.push(id)
    }
    return { text, image }
  }
  if (provider === 'openai') {
    const d = await http(`${OPENAI}/models`, { headers: oHeaders(key) }, TEXT_MS)
    const ids: string[] = (d?.data ?? []).map((m: { id: string }) => m.id)
    return {
      image: ids.filter((id) => id.startsWith('gpt-image')),
      text: ids.filter((id) => /^(gpt-|o\d)/.test(id) && !/instruct|moderation|image|audio|realtime|tts|transcribe|embedding|search/.test(id)),
    }
  }
  try {
    const text: string[] = []
    for await (const m of (await claudeClient(key)).models.list()) text.push(m.id)
    return { text, image: [] }
  } catch (e) { return await mapSdk(e) }
}

export async function generateJson(cfg: AiConfig, system: string, user: string, schema: object): Promise<unknown> {
  if (cfg.provider === 'gemini') {
    const d = await http(`${GEMINI}/models/${cfg.textModel}:generateContent`, {
      method: 'POST', headers: gHeaders(cfg.key),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: `${user}\n\nОтветь только JSON по схеме:\n${JSON.stringify(schema)}` }] }],
      }),
    }, TEXT_MS)
    const parts: { text?: string; thought?: boolean }[] = d?.candidates?.[0]?.content?.parts ?? []
    return extractJson(parts.filter((p) => !p.thought).map((p) => p.text ?? '').join(''))
  }
  if (cfg.provider === 'openai') {
    const d = await http(`${OPENAI}/chat/completions`, {
      method: 'POST', headers: { ...oHeaders(cfg.key), 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.textModel,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'result', schema, strict: false } },
      }),
    }, TEXT_MS)
    return extractJson(String(d?.choices?.[0]?.message?.content ?? ''))
  }
  try {
    const r = await (await claudeClient(cfg.key)).messages.create({
      model: cfg.textModel, max_tokens: 16000, system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
    }, { timeout: TEXT_MS })
    if (r.stop_reason === 'refusal') throw new AiError('refusal', 'refusal')
    return extractJson(r.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
  } catch (e) { return await mapSdk(e) }
}

const b64 = async (b: Blob) => {
  let s = ''
  const u = new Uint8Array(await b.arrayBuffer())
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (data: string, type: string) =>
  new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type })

export async function generateImage(cfg: AiConfig, photo: Blob, prompt: string): Promise<Blob> {
  if (!cfg.imageModel || cfg.provider === 'claude') throw new AiError('нет модели картинок', 'other')
  if (cfg.provider === 'gemini') {
    const d = await http(`${GEMINI}/models/${cfg.imageModel}:generateContent`, {
      method: 'POST', headers: gHeaders(cfg.key),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: photo.type || 'image/jpeg', data: await b64(photo) } }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }, IMAGE_MS)
    for (const p of d?.candidates?.[0]?.content?.parts ?? []) {
      const i = p.inlineData ?? p.inline_data
      if (i?.data && p.thought !== true) return fromB64(i.data, i.mimeType ?? i.mime_type ?? 'image/png')
    }
    throw new AiError('нет картинки', 'bad_response')
  }
  const fd = new FormData()
  fd.append('model', cfg.imageModel)
  fd.append('image', photo, 'photo')
  fd.append('prompt', prompt)
  fd.append('size', '1024x1536')
  const d = await http(`${OPENAI}/images/edits`, { method: 'POST', headers: oHeaders(cfg.key), body: fd }, IMAGE_MS)
  const data = d?.data?.[0]?.b64_json
  if (!data) throw new AiError('нет картинки', 'bad_response')
  return fromB64(data, 'image/png')
}
