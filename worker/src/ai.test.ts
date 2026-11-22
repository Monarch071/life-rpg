import { describe, expect, it } from 'vitest'
import { AI_LIMITS, pickModels } from './ai'
import { handle } from './index'
import { MemoryStore } from './memoryStore'

const TOKEN = 'a'.repeat(40)
const LIST = { models: ['gemini-2.5-flash', 'gemini-3.1-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image', 'text-embedding-004']
  .map(n => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) }

describe('pickModels', () => {
  it('новейшая flash и flash-image без lite', () => {
    expect(pickModels(LIST.models.map(m => m.name.slice(7)))).toEqual({ text: ['gemini-3.1-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'], image: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image'] })
  })
  it('алиас flash-latest в приоритете, пустой список — null', () => {
    expect(pickModels(['gemini-flash-latest', 'gemini-3.1-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']).text).toEqual(['gemini-flash-latest', 'gemini-3.1-flash', 'gemini-3.1-flash-lite'])
    expect(pickModels([])).toEqual({ text: [], image: [] })
  })
})

async function setup(env: { GEMINI_KEY?: string; busy?: string } = { GEMINI_KEY: 'k' }) {
  const store = new MemoryStore()
  await handle(new Request('http://x/register', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }), store, [])
  const calls: { url: string; key: string | null }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, key: new Headers(init?.headers).get('x-goog-api-key') })
    if (url.includes('/models?')) return new Response(JSON.stringify(LIST))
    if (env.busy && url.includes(`/models/${env.busy}:`)) return new Response('{"error":{"message":"high demand"}}', { status: 503 })
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }))
  }) as typeof fetch
  const post = (path: string, token = TOKEN) => handle(new Request('http://x' + path, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ contents: [] }),
  }), store, [], undefined, Date.UTC(2026, 10, 23), f, env)
  return { store, calls, post }
}

describe('POST /ai/*', () => {
  it('перегруженная модель (503) — запрос уходит в следующую', async () => {
    const { calls, post } = await setup({ GEMINI_KEY: 'k', busy: 'gemini-3.1-flash' } as never)
    const r = await post('/ai/text')
    expect(r.status).toBe(200)
    expect(calls.filter(c => c.url.includes(':generateContent')).map(c => c.url.split('/models/')[1])).toEqual(['gemini-3.1-flash:generateContent', 'gemini-2.5-flash:generateContent'])
  })
  it('проксирует в Gemini с ключом сервера и выбранной моделью', async () => {
    const { calls, post } = await setup()
    const r = await post('/ai/text')
    expect(r.status).toBe(200)
    expect((await r.json()).candidates[0].content.parts[0].text).toBe('{"a":1}')
    expect(calls.at(-1)).toEqual({ url: expect.stringContaining('/models/gemini-3.1-flash:generateContent'), key: 'k' })
    await post('/ai/image')
    expect(calls.at(-1)!.url).toContain('/models/gemini-3.1-flash-image:generateContent')
    expect(calls.filter(c => c.url.includes('/models?')).length).toBe(1)   // список моделей кэшируется
  })
  it('без токена 401, без ключа 503', async () => {
    expect((await (await setup()).post('/ai/text', 'b'.repeat(40))).status).toBe(401)
    expect((await (await setup({})).post('/ai/text')).status).toBe(503)
  })
  it('дневной лимит картинок', async () => {
    const { post } = await setup()
    for (let i = 0; i < AI_LIMITS.image; i++) expect((await post('/ai/image')).status).toBe(200)
    const r = await post('/ai/image')
    expect(r.status).toBe(429)
    expect(await r.json()).toEqual({ ok: false, error: 'Дневной лимит ИИ исчерпан' })
    expect((await post('/ai/text')).status).toBe(200)
  })
})
