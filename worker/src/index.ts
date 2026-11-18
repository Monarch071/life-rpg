import { parseSyncPayload } from './parse'
import { D1Store, type D1Like, type Store } from './store'
import { message, parseSubscribe, pushTo, runCron } from './push'
import type { Vapid } from './webpush'

export interface Env { DB: D1Like; ALLOWED_ORIGINS: string; VAPID_PUBLIC?: string; VAPID_PRIVATE?: string; VAPID_SUBJECT?: string }

const SYNC_MAX = 256 * 1024
const EVENTS_MAX = 1024 * 1024
const SMALL_MAX = 4 * 1024
const PAGE = 1000
const BLOB_MAX = 1024 * 1024
const BLOB_TYPES = ['image/webp', 'image/jpeg', 'image/png']
const BLOB_NAME = /^[a-z0-9-]{1,64}$/

function toB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0))

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

type Out = { status: number; body: unknown; mime?: string }

async function route(req: Request, store: Store, vapid?: Vapid): Promise<Out> {
  const url = new URL(req.url)
  const key = `${req.method} ${url.pathname}`

  if (key === 'POST /register') {
    const b = await readJson(req, SMALL_MAX)
    if (!isTokenString(b?.token)) throw new HttpError(400, 'Токен должен быть строкой от 32 до 200 символов')
    if (!(await store.setTokenHashIfAbsent(await sha256Hex(b.token)))) throw new HttpError(409, 'Сервер уже привязан')
    return { status: 201, body: { ok: true } }
  }

  const bm = /^\/blob\/([^/]*)$/.exec(url.pathname)
  if (bm && (req.method === 'GET' || req.method === 'PUT')) {
    await authorize(req, store)
    const name = bm[1]
    if (!BLOB_NAME.test(name)) throw new HttpError(400, 'Некорректное имя файла')
    if (req.method === 'GET') {
      const r = await store.getBlob(name)
      if (!r) throw new HttpError(404, 'Нет такого файла')
      return { status: 200, body: fromB64(r.data), mime: r.mime }
    }
    const mime = (req.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!BLOB_TYPES.includes(mime)) throw new HttpError(400, 'Допустимы только webp, jpeg и png')
    if (Number(req.headers.get('content-length')) > BLOB_MAX) throw new HttpError(413, 'Файл больше 1 МБ')
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.length > BLOB_MAX) throw new HttpError(413, 'Файл больше 1 МБ')
    await store.putBlob(name, mime, toB64(bytes))
    return { status: 200, body: { ok: true } }
  }

  if (url.pathname.startsWith('/push/')) {
    if (!['GET /push/key', 'POST /push/subscribe', 'POST /push/unsubscribe', 'POST /push/test'].includes(key)) throw new HttpError(404, 'Не найдено')
    await authorize(req, store)
    if (!vapid) throw new HttpError(503, 'Уведомления на сервере не настроены')
    if (key === 'GET /push/key') return { status: 200, body: { key: vapid.publicKey } }
    const b = await readJson(req, SMALL_MAX)
    if (key === 'POST /push/subscribe') {
      const sub = parseSubscribe(b)
      if (!sub) throw new HttpError(400, 'Некорректная подписка')
      await store.upsertPushSub(sub)
      return { status: 200, body: { ok: true } }
    }
    if (typeof b?.endpoint !== 'string') throw new HttpError(400, 'Нужен endpoint')
    if (key === 'POST /push/unsubscribe') {
      await store.deletePushSub(b.endpoint)
      return { status: 200, body: { ok: true } }
    }
    const sub = await store.getPushSub(b.endpoint)
    if (!sub) throw new HttpError(404, 'Подписка не найдена')
    const status = await pushTo(store, sub, message('test'), vapid).catch((e: unknown) => {
      throw new HttpError(502, e instanceof TypeError ? 'Push-сервис недоступен' : 'Ошибка ключа VAPID на сервере')
    })
    return { status: 200, body: { ok: status < 300, status } }
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

export async function handle(req: Request, store: Store, allowedOrigins: string[], vapid?: Vapid): Promise<Response> {
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
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    })
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  let status: number, body: unknown, mime: string | undefined
  try {
    ({ status, body, mime } = await route(req, store, vapid))
  } catch (e) {
    if (e instanceof HttpError) { status = e.status; body = { ok: false, error: e.message } }
    else { status = 500; body = { ok: false, error: 'Внутренняя ошибка' } }
  }
  if (mime) return new Response(body as Uint8Array, { status, headers: { ...headers, 'content-type': mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } })
  return new Response(JSON.stringify(body), { status, headers })
}

const vapidOf = (env: Env): Vapid | undefined =>
  env.VAPID_PUBLIC && env.VAPID_PRIVATE && env.VAPID_SUBJECT
    ? { publicKey: env.VAPID_PUBLIC, privateD: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT } : undefined

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, new D1Store(env.DB), env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean), vapidOf(env))
  },
  async scheduled(_ev: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    const v = vapidOf(env)
    if (v) ctx.waitUntil(runCron(new D1Store(env.DB), v, Date.now()))
  },
}
