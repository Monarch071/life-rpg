import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from './index'
import { MemoryStore } from './memoryStore'

const TOKEN = 'a'.repeat(40)
const ORIGINS = ['https://monarch071.github.io']
let store: MemoryStore

function call(path: string, init: { method?: string; token?: string | null; body?: unknown; raw?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {}
  const token = init.token === undefined ? TOKEN : init.token
  if (token) headers.authorization = `Bearer ${token}`
  if (init.origin) headers.origin = init.origin
  const body = init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body))
  return handle(new Request('http://x' + path, { method: init.method ?? (body === undefined ? 'GET' : 'POST'), headers, body }), store, ORIGINS)
}
const ev = (id: string, extra: object = {}) => ({ id, ts: 1000, deviceId: 'd1', type: 'x', pending: true, ...extra })

beforeEach(async () => {
  store = new MemoryStore()
  await call('/register', { token: null, body: { token: TOKEN } })
})

describe('register / ping', () => {
  it('регистрация один раз', async () => {
    const s = new MemoryStore()
    const r1 = await handle(new Request('http://x/register', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }), s, [])
    expect(r1.status).toBe(201)
    const r2 = await handle(new Request('http://x/register', { method: 'POST', body: JSON.stringify({ token: TOKEN }) }), s, [])
    expect(r2.status).toBe(409)
    expect(await r2.json()).toEqual({ ok: false, error: 'Сервер уже привязан' })
  })
  it('ping: без токена 401, с токеном 200', async () => {
    const bad = await call('/ping', { token: null })
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({ ok: false, error: 'Неверный токен' })
    const ok = await call('/ping')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await ok.json()).toMatchObject({ ok: true, lastHealthAt: null })
  })
  it('до регистрации — 401, неизвестный путь — 404', async () => {
    store = new MemoryStore()
    expect((await call('/ping')).status).toBe(401)
    store = new MemoryStore()
    await call('/register', { token: null, body: { token: TOKEN } })
    expect((await call('/nope')).status).toBe(404)
  })
})

describe('events', () => {
  it('вставка, дедуп, чтение', async () => {
    const r1 = await call('/events', { body: { events: [ev('a'), ev('b', { seq: 99 })] } })
    expect(await r1.json()).toEqual({ ok: true, inserted: 2 })
    const r2 = await call('/events', { body: { events: [ev('a'), ev('b')] } })
    expect(await r2.json()).toEqual({ ok: true, inserted: 0 })
    const g = await (await call('/events?since=0')).json()
    expect(g.events.map((e: any) => [e.id, e.seq])).toEqual([['a', 1], ['b', 2]])
    expect(g.events.every((e: any) => !('pending' in e))).toBe(true)
    expect(g.next).toBe(2)
    expect(g.more).toBe(false)
  })
  it('пагинация по 1000', async () => {
    await store.insertEvents(Array.from({ length: 1001 }, (_, i) => ({ id: 'e' + i, ts: i, type: 'x', body: JSON.stringify({ id: 'e' + i }) })))
    const p1 = await (await call('/events?since=0')).json()
    expect(p1.events).toHaveLength(1000)
    expect(p1.more).toBe(true)
    const p2 = await (await call(`/events?since=${p1.next}`)).json()
    expect(p2.events).toHaveLength(1)
    expect(p2.more).toBe(false)
  })
  it('валидация и лимиты', async () => {
    expect((await call('/events', { body: { events: [{ id: 'a', type: 'x', deviceId: 'd' }] } })).status).toBe(400)
    const many = Array.from({ length: 501 }, (_, i) => ev('e' + i))
    expect((await call('/events', { body: { events: many } })).status).toBe(413)
  })
})

describe('sync', () => {
  it('плоский пакет сохраняется как health_packet', async () => {
    const r = await call('/sync', { body: { date: '2026-11-17', steps: '8 421' } })
    expect(r.status).toBe(200)
    expect((await r.json()).received.steps).toBe(8421)
    const g = await (await call('/events?since=0')).json()
    expect(g.events[0]).toMatchObject({ type: 'health_packet', deviceId: 'shortcuts', date: '2026-11-17' })
    expect(typeof (await (await call('/ping')).json()).lastHealthAt).toBe('number')
  })
  it('повторный /sync — duplicate, одно событие; Wallet без merchant, сигнал как signal_logged', async () => {
    const b = { kind: 'wallet', amount: '₸1 250,50', merchant: 'Секретный магазин', at: new Date().toISOString() }
    const r1 = await (await call('/sync', { body: b })).json()
    const r2 = await (await call('/sync', { body: b })).json()
    expect(r1).toMatchObject({ ok: true, duplicate: false })
    expect(r2).toMatchObject({ ok: true, duplicate: true })
    expect(JSON.stringify(r1)).not.toContain('Секретный')
    const g = await (await call('/events?since=0')).json()
    expect(g.events).toHaveLength(1)
    expect(g.events[0]).toMatchObject({ type: 'signal_logged', deviceId: 'shortcuts', signal: { kind: 'wallet', amount: 1250.5 } })
  })
  it('без date — 400 по-русски', async () => {
    const r = await call('/sync', { body: { steps: 1 } })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe('Поле date должно быть в формате ГГГГ-ММ-ДД')
  })
  it('300 КБ — 413', async () => {
    expect((await call('/sync', { raw: JSON.stringify({ date: '2026-11-17', pad: 'x'.repeat(300 * 1024) }) })).status).toBe(413)
  })
})

describe('token', () => {
  it('смена токена', async () => {
    const NEW = 'b'.repeat(40)
    expect((await call('/token', { body: { token: NEW } })).status).toBe(200)
    expect((await call('/ping')).status).toBe(401)
    expect((await call('/ping', { token: NEW })).status).toBe(200)
  })
})

describe('CORS', () => {
  it('preflight разрешённого origin', async () => {
    const r = await call('/events', { method: 'OPTIONS', token: null, origin: 'https://monarch071.github.io' })
    expect(r.status).toBe(204)
    expect(r.headers.get('access-control-allow-origin')).toBe('https://monarch071.github.io')
    expect(r.headers.get('vary')).toBe('Origin')
  })
  it('чужой origin — 403, без origin — работает', async () => {
    expect((await call('/ping', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/ping')).status).toBe(200)
    const ok = await call('/ping', { origin: 'https://monarch071.github.io' })
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://monarch071.github.io')
  })
})

describe('blob', () => {
  const put = (name: string, bytes: Uint8Array | string, type = 'image/png', token: string | null = TOKEN) => {
    const headers: Record<string, string> = { 'content-type': type }
    if (token) headers.authorization = `Bearer ${token}`
    return handle(new Request('http://x/blob/' + name, { method: 'PUT', headers, body: bytes }), store, ORIGINS)
  }
  it('PUT/GET: те же байты и content-type', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253, 254, 255])
    expect((await put('av-1', bytes)).status).toBe(200)
    const r = await call('/blob/av-1')
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/png')
    expect(r.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes)
  })
  it('1.1 МБ — 413, плохое имя и тип — 400, нет файла — 404, без токена — 401', async () => {
    expect((await put('big', new Uint8Array(1.1 * 1024 * 1024))).status).toBe(413)
    expect((await put('..%2Fx', new Uint8Array(3))).status).toBe(400)
    expect((await put('ok', new Uint8Array(3), 'text/html')).status).toBe(400)
    const r = await call('/blob/none')
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ ok: false, error: 'Нет такого файла' })
    expect((await put('ok', new Uint8Array(3), 'image/png', null)).status).toBe(401)
    expect((await call('/blob/none', { token: null })).status).toBe(401)
  })
  it('preflight разрешает PUT', async () => {
    const r = await call('/blob/x', { method: 'OPTIONS', token: null, origin: 'https://monarch071.github.io' })
    expect(r.headers.get('access-control-allow-methods')).toContain('PUT')
  })
})
