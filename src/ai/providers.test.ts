import 'fake-indexeddb/auto'
import { beforeEach, expect, test, vi } from 'vitest'

const sdk = vi.hoisted(() => {
  const state = { create: vi.fn(), list: vi.fn() }
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError
    static AuthenticationError = AuthenticationError
    static RateLimitError = RateLimitError
    static APIConnectionError = APIConnectionError
    messages = { create: (...a: unknown[]) => state.create(...a) }
    models = { list: () => state.list() }
  }
  return { state, Anthropic }
})
vi.mock('@anthropic-ai/sdk', () => ({ default: sdk.Anthropic }))

import { DEFAULT_SYNC_URL } from '../sync'
import { AiError, aiErrorText, extractJson, generateImage, generateJson, listModels } from './providers'
import { getAiConfig, saveAiConfig, clearAiConfig, type AiConfig } from './config'
import { db, setSetting } from '../db'
import { exportData } from '../backup'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const kind = async (p: Promise<unknown>) => ((await p.catch((e) => e)) as AiError).kind
const gem: AiConfig = { provider: 'gemini', key: 'K', textModel: 'g', imageModel: 'gi' }
const oai: AiConfig = { provider: 'openai', key: 'K', textModel: 'gpt-x', imageModel: 'gpt-image-1' }
const cl: AiConfig = { provider: 'claude', key: 'K', textModel: 'claude-opus-5-5', imageModel: null }

beforeEach(async () => {
  vi.unstubAllGlobals()
  sdk.state.create.mockReset(); sdk.state.list.mockReset()
  await db.settings.clear()
})

test('extractJson', () => {
  expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  expect(extractJson('Вот: {"a":"}{"} спасибо')).toEqual({ a: '}{' })
  expect(extractJson('до [1,2] после')).toEqual([1, 2])
  expect(() => extractJson('нет json')).toThrow(AiError)
  try { extractJson('нет json') } catch (e) { expect((e as AiError).kind).toBe('bad_response') }
})

test('gemini listModels', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ models: [
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
    { name: 'models/imagen-4', supportedGenerationMethods: ['predict'] },
    { name: 'models/gemini-tts', supportedGenerationMethods: ['generateContent'] },
  ] })))
  expect(await listModels('gemini', 'K')).toEqual({ text: ['gemini-2.5-flash'], image: ['gemini-2.5-flash-image'] })
})

test('gemini generateJson: ключ в заголовке, не в URL', async () => {
  const f = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: '```json\n{"ok":true}\n```' }] } }] }))
  vi.stubGlobal('fetch', f)
  expect(await generateJson(gem, 'sys', 'usr', { type: 'object' })).toEqual({ ok: true })
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).not.toContain('K')
  expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('K')
})

test('HTTP-ошибки → kind', async () => {
  for (const [s, k] of [[429, 'rate'], [401, 'auth'], [403, 'auth'], [500, 'other']] as const) {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, s)))
    expect(await kind(generateJson(gem, 's', 'u', {}))).toBe(k)
  }
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fail') }))
  expect(await kind(generateJson(gem, 's', 'u', {}))).toBe('network')
  expect(aiErrorText(new AiError('x', 'auth'))).toBe('Ключ не подошёл')
  expect(aiErrorText(new Error('x'))).toBe('Ошибка ИИ')
})

test('таймаут при чтении тела → network', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new DOMException('t', 'TimeoutError') } })))
  expect(await kind(generateJson(gem, 's', 'u', {}))).toBe('network')
})

test('gemini generateImage', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ candidates: [{ content: { parts: [
    { thought: true, inlineData: { mimeType: 'image/png', data: 'AAAA' } },
    { inlineData: { mimeType: 'image/jpeg', data: 'BBBB' } },
  ] } }] })))
  const b = await generateImage(gem, new Blob(['x'], { type: 'image/png' }), 'p')
  expect(b.type).toBe('image/jpeg')
  vi.stubGlobal('fetch', vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: 'нет' }] } }] })))
  expect(await kind(generateImage(gem, new Blob(['x']), 'p'))).toBe('bad_response')
  expect(await kind(generateImage({ ...gem, imageModel: null }, new Blob(['x']), 'p'))).toBe('other')
})

test('openai', async () => {
  const f = vi.fn(async () => json({ choices: [{ message: { content: '{"a":1}' } }] }))
  vi.stubGlobal('fetch', f)
  expect(await generateJson(oai, 's', 'u', { type: 'object' })).toEqual({ a: 1 })
  expect(JSON.parse((f.mock.calls[0] as any)[1].body).response_format.type).toBe('json_schema')
  const g = vi.fn(async () => json({ data: [{ b64_json: 'AAAA' }] }))
  vi.stubGlobal('fetch', g)
  await generateImage(oai, new Blob(['x'], { type: 'image/png' }), 'p')
  const fd = (g.mock.calls[0] as any)[1].body as FormData
  expect(fd.get('model')).toBe('gpt-image-1')
  expect(fd.get('image')).toBeTruthy()
})

test('openai listModels', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ data: [
    { id: 'gpt-4o' }, { id: 'gpt-image-1' }, { id: 'o3' }, { id: 'gpt-4o-audio-preview' }, { id: 'whisper-1' },
    { id: 'omni-moderation-latest' }, { id: 'gpt-3.5-turbo-instruct' }, { id: 'gpt-4o-search-preview' },
  ] })))
  expect(await listModels('openai', 'K')).toEqual({ text: ['gpt-4o', 'o3'], image: ['gpt-image-1'] })
})

test('claude', async () => {
  sdk.state.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":2}' }] })
  expect(await generateJson(cl, 's', 'u', { type: 'object' })).toEqual({ a: 2 })
  expect(sdk.state.create.mock.calls[0][0].output_config.format.type).toBe('json_schema')
  sdk.state.create.mockResolvedValue({ stop_reason: 'refusal', content: [] })
  expect(await kind(generateJson(cl, 's', 'u', {}))).toBe('refusal')
  sdk.state.create.mockRejectedValue(new sdk.Anthropic.RateLimitError('x'))
  expect(await kind(generateJson(cl, 's', 'u', {}))).toBe('rate')
  sdk.state.create.mockRejectedValue(new sdk.Anthropic.AuthenticationError('x'))
  expect(await kind(generateJson(cl, 's', 'u', {}))).toBe('auth')
  sdk.state.list.mockReturnValue((async function* () { yield { id: 'claude-opus-5-5' } })())
  expect(await listModels('claude', 'K')).toEqual({ text: ['claude-opus-5-5'], image: [] })
  expect(await kind(generateImage(cl, new Blob(['x']), 'p'))).toBe('other')
})

test('config', async () => {
  await saveAiConfig(gem)
  expect(await getAiConfig()).toEqual(gem)
  expect(await (await exportData()).text()).not.toContain('"K"')
  await setSetting('aiTextModel', '')
  expect((await getAiConfig())!.via).toBeDefined()   // неполный свой ключ — встроенный ИИ
  await clearAiConfig()
  expect(await db.settings.get('aiProvider')).toBeUndefined()
})

test('встроенный ИИ без настроек: анонимно по id устройства, id постоянный', async () => {
  const a = (await getAiConfig())!
  expect(a.via).toMatchObject({ url: DEFAULT_SYNC_URL, token: '', device: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  expect((await getAiConfig())!.via!.device).toBe(a.via!.device)
  const f = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: '{"x":1}' }] } }] }))
  vi.stubGlobal('fetch', f)
  await generateJson(a, 's', 'u', {})
  const [, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect(init.headers).toMatchObject({ 'x-device': a.via!.device })
  expect(JSON.stringify(init.headers)).not.toContain('authorization')
})

test('встроенный ИИ: с синхронизацией идёт по токену', async () => {
  await setSetting('syncUrl', 'https://s.example/'); await setSetting('syncToken', 'T')
  const cfg = (await getAiConfig())!
  expect(cfg).toMatchObject({ provider: 'gemini', key: '', via: { url: 'https://s.example/', token: 'T' } })
  const f = vi.fn(async () => json({ candidates: [{ content: { parts: [{ text: '{"x":2}' }] } }] }))
  vi.stubGlobal('fetch', f)
  expect(await generateJson(cfg, 's', 'u', {})).toEqual({ x: 2 })
  const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://s.example/ai/text')
  expect(init.headers).toMatchObject({ authorization: 'Bearer T' })
  expect(JSON.stringify(init.headers)).not.toContain('x-goog-api-key')
  await saveAiConfig(gem)
  expect((await getAiConfig())!.via).toBeUndefined()   // свой ключ важнее встроенного
})
