import { parseSyncPayload } from './parse'
import { D1Store, type D1Like, type Store } from './store'

export interface Env { DB: D1Like; ALLOWED_ORIGINS: string }

const SYNC_MAX = 256 * 1024
const EVENTS_MAX = 1024 * 1024
const SMALL_MAX = 4 * 1024
const PAGE = 1000

class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// сравнение хэшей в постоянном времени (XOR-накопление)
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

async function readJson(req: Request, max: number): Promise<any> {
  const text = await req.text()
  if (new TextEncoder().encode(text).length > max) throw new HttpError(413, 'Слишком большой запрос')
  try { return JSON.parse(text) } catch { throw new HttpError(400, 'Некорректный JSON') }
}

const isTokenString = (t: unknown): t is string => typeof t === 'string' && t.length >= 32 && t.length <= 200

async function authorize(req: Request, store: Store): Promise<void> {
  const m = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')
  const stored = await store.getTokenHash()
  if (!m || !stored || !safeEqual(await sha256Hex(m[1]), stored)) throw new HttpError(401, 'Неверный токен')
}

async function route(req: Request, store: Store): Promise<{ status: number; body: unknown }> {
  const url = new URL(req.url)
  const key = `${req.method} ${url.pathname}`

  if (key === 'POST /register') {
    const b = await readJson(req, SMALL_MAX)
    if (!isTokenString(b?.token)) throw new HttpError(400, 'Токен должен быть строкой от 32 до 200 символов')
    if (!(await store.setTokenHashIfAbsent(await sha256Hex(b.token)))) throw new HttpError(409, 'Сервер уже привязан')
    return { status: 201, body: { ok: true } }
  }

  if (!['POST /token', 'POST /sync', 'POST /events', 'GET /events', 'GET /ping'].includes(key)) throw new HttpError(404, 'Не найдено')
  await authorize(req, store)

  switch (key) {
    case 'POST /token': {
      const b = await readJson(req, SMALL_MAX)
      if (!isTokenString(b?.token)) throw new HttpError(400, 'Токен должен быть строкой от 32 до 200 символов')
      await store.replaceTokenHash(await sha256Hex(b.token))
      return { status: 200, body: { ok: true } }
    }
    case 'POST /sync': {
      const r = parseSyncPayload(await readJson(req, SYNC_MAX))
      if (!r.ok) throw new HttpError(400, r.error)
      const ev = { id: crypto.randomUUID(), ts: Date.now(), deviceId: 'shortcuts', type: 'health_packet', ...r.packet }
      await store.insertEvents([{ id: ev.id, ts: ev.ts, type: ev.type, body: JSON.stringify(ev) }])
      const { date, health, calendar } = r.packet
      return { status: 200, body: { ok: true, received: { date, ...health, calendar: calendar.length } } }
    }
    case 'POST /events': {
      const b = await readJson(req, EVENTS_MAX)
      if (!Array.isArray(b?.events)) throw new HttpError(400, 'Ожидался массив events')
      if (b.events.length > 500) throw new HttpError(413, 'Не более 500 событий за раз')
      const rows = b.events.map((e: unknown) => {
        if (typeof e !== 'object' || e === null || Array.isArray(e)) throw new HttpError(400, 'Некорректное событие')
        const { pending: _p, seq: _s, ...ev } = e as Record<string, unknown>
        if (typeof ev.id !== 'string' || typeof ev.type !== 'string' || typeof ev.deviceId !== 'string'
          || typeof ev.ts !== 'number' || !Number.isFinite(ev.ts)) throw new HttpError(400, 'У события должны быть id, type, deviceId и ts')
        return { id: ev.id, ts: ev.ts, type: ev.type, body: JSON.stringify(ev) }
      })
      return { status: 200, body: { ok: true, inserted: await store.insertEvents(rows) } }
    }
    case 'GET /events': {
      const since = Math.max(0, Math.floor(Number(url.searchParams.get('since'))) || 0)
      const rows = await store.eventsSince(since, PAGE + 1)
      const page = rows.slice(0, PAGE)
      return { status: 200, body: {
        events: page.map(r => ({ ...JSON.parse(r.body), seq: r.seq })),
        next: page.length ? page[page.length - 1].seq : since,
        more: rows.length > PAGE,
      } }
    }
    default: // GET /ping
      return { status: 200, body: { ok: true, lastHealthAt: await store.lastHealthAt(), serverTime: Date.now() } }
  }
}

export async function handle(req: Request, store: Store, allowedOrigins: string[]): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
  const origin = req.headers.get('origin')
  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      return new Response(JSON.stringify({ ok: false, error: 'Origin не разрешён' }), { status: 403, headers })
    }
    Object.assign(headers, {
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    })
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  let status: number, body: unknown
  try {
    ({ status, body } = await route(req, store))
  } catch (e) {
    if (e instanceof HttpError) { status = e.status; body = { ok: false, error: e.message } }
    else { status = 500; body = { ok: false, error: 'Внутренняя ошибка' } }
  }
  return new Response(JSON.stringify(body), { status, headers })
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, new D1Store(env.DB), env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean))
  },
}
