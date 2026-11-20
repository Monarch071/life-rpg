import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from './index'
import { MemoryStore } from './memoryStore'
import { due, localNow, message, parseSubscribe, runCron, sendWakePush, type PushRow } from './push'
import { b64u } from './webpush'

const TOKEN = 'a'.repeat(40)
// валидные ключи подписки (из RFC 8291)
const P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg'
const EP = 'https://web.push.apple.com/QXYZ'
const body = (extra: object = {}) => ({ subscription: { endpoint: EP, keys: { p256dh: P256DH, auth: AUTH } }, tz: 'Europe/Moscow', morning: 480, evening: 1260, ...extra })

let vapid: { publicKey: string; privateD: string; subject: string }
let store: MemoryStore
beforeEach(async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair
  vapid = { publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey) as ArrayBuffer)),
    privateD: (await crypto.subtle.exportKey('jwk', kp.privateKey) as JsonWebKey).d!, subject: 'https://example.com/' }
  store = new MemoryStore()
  await store.setTokenHashIfAbsent([...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN)))].map(b => b.toString(16).padStart(2, '0')).join(''))
})
const call = (path: string, b?: unknown) =>
  handle(new Request('http://x' + path, { method: b === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: b === undefined ? undefined : JSON.stringify(b) }), store, [], vapid)

// 2026-11-18 05:00 UTC = 08:00 в Москве
const AT_8_MSK = Date.UTC(2026, 10, 18, 5, 0)

describe('время и расписание', () => {
  it('localNow учитывает часовой пояс', () => {
    expect(localNow('Europe/Moscow', AT_8_MSK)).toEqual({ date: '2026-11-18', min: 480 })
    expect(localNow('Asia/Vladivostok', AT_8_MSK)).toEqual({ date: '2026-11-18', min: 900 })
  })
  it('due: в окне один раз в день, вне окна — нет', () => {
    const r: PushRow = { ...parseSubscribe(body())!, last_morning: null, last_evening: null }
    expect(due(r, AT_8_MSK)).toEqual([{ kind: 'morning', date: '2026-11-18' }])
    expect(due({ ...r, last_morning: '2026-11-18' }, AT_8_MSK)).toEqual([])
    expect(due(r, AT_8_MSK - 60_000)).toEqual([]) // 07:59
    expect(due(r, AT_8_MSK + 60 * 60_000)).toEqual([]) // 09:00 — окно прошло
    expect(due({ ...r, morning: null }, AT_8_MSK)).toEqual([])
  })
  it('parseSubscribe отвергает чужие адреса, кривые ключи, пояс и время', () => {
    expect(parseSubscribe(body())).not.toBeNull()
    expect(parseSubscribe(body({ subscription: { endpoint: 'https://evil.com/x', keys: { p256dh: P256DH, auth: AUTH } } }))).toBeNull()
    expect(parseSubscribe(body({ subscription: { endpoint: EP, keys: { p256dh: AUTH, auth: AUTH } } }))).toBeNull()
    expect(parseSubscribe(body({ tz: 'Mars/Olympus' }))).toBeNull()
    expect(parseSubscribe(body({ morning: 1440 }))).toBeNull()
    expect(parseSubscribe(body({ evening: null }))).not.toBeNull()
  })
})

describe('cron', () => {
  it('шлёт утреннее один раз, повторяет после 5xx, удаляет мёртвую подписку', async () => {
    await store.upsertPushSub(parseSubscribe(body())!)
    let status = 503
    const urls: string[] = []
    const f = (async (url: string) => { urls.push(url); return new Response(null, { status }) }) as typeof fetch
    expect(await runCron(store, vapid, AT_8_MSK, f)).toBe(0) // 503 — не отмечено
    status = 201
    expect(await runCron(store, vapid, AT_8_MSK + 15 * 60_000, f)).toBe(1)
    expect(await runCron(store, vapid, AT_8_MSK + 30 * 60_000, f)).toBe(0) // уже отправлено сегодня
    expect(urls).toEqual([EP, EP])
    status = 410
    await runCron(store, vapid, AT_8_MSK + 13 * 3600_000, f) // 21:00 — вечернее
    expect(await store.listPushSubs()).toEqual([])
  })
  it('сетевая ошибка не роняет cron', async () => {
    await store.upsertPushSub(parseSubscribe(body())!)
    const f = (async () => { throw new TypeError('net') }) as typeof fetch
    expect(await runCron(store, vapid, AT_8_MSK, f)).toBe(0)
  })
})

describe('эндпоинты /push', () => {
  it('ключ, подписка, повторная подписка сохраняет отметки, отписка', async () => {
    expect(await (await call('/push/key')).json()).toEqual({ key: vapid.publicKey })
    expect((await call('/push/subscribe', body())).status).toBe(200)
    await store.markPushSent(EP, 'morning', '2026-11-18')
    await call('/push/subscribe', body({ morning: 540 }))
    expect(await store.getPushSub(EP)).toMatchObject({ morning: 540, last_morning: '2026-11-18' })
    expect((await call('/push/subscribe', body({ tz: 'x' }))).status).toBe(400)
    expect((await call('/push/unsubscribe', { endpoint: EP })).status).toBe(200)
    expect(await store.listPushSubs()).toEqual([])
  })
  it('без токена 401, без ключей VAPID 503, неизвестная подписка в тесте 404', async () => {
    const r = await handle(new Request('http://x/push/key'), store, [], vapid)
    expect(r.status).toBe(401)
    const noVapid = await handle(new Request('http://x/push/key', { headers: { authorization: `Bearer ${TOKEN}` } }), store, [])
    expect(noVapid.status).toBe(503)
    expect((await call('/push/test', { endpoint: EP })).status).toBe(404)
    expect((await call('/push/nope')).status).toBe(404)
  })
})

describe('окно около полуночи', () => {
  it('23:30 продолжается после полуночи и помечается вчерашней датой', () => {
    const r: PushRow = { ...parseSubscribe(body({ tz: 'UTC', morning: null, evening: 1410 }))!, last_morning: null, last_evening: null }
    const at0015 = Date.UTC(2026, 10, 19, 0, 15)
    expect(due(r, at0015)).toEqual([{ kind: 'evening', date: '2026-11-18' }])
    expect(due({ ...r, last_evening: '2026-11-18' }, at0015)).toEqual([])
    expect(due(r, Date.UTC(2026, 10, 19, 0, 30))).toEqual([]) // окно 23:30–00:30 закончилось
  })
})

describe('пуш после сна', () => {
  const T0630 = Date.UTC(2026, 10, 18, 3, 30) // 06:30 МСК
  it('/sync morning со сном шлёт один пуш, повтор и cron — нет', async () => {
    await store.upsertPushSub(parseSubscribe(body())!)
    let n = 0
    const f = (async () => { n++; return new Response(null, { status: 201 }) }) as typeof fetch
    const sync = () => handle(new Request('http://x/sync', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ date: '2026-11-18', kind: 'morning', sleepMinutes: 456 }) }), store, [], vapid, T0630, f)
    expect((await sync()).status).toBe(200)
    expect(n).toBe(1)
    expect((await store.getPushSub(EP))!.last_morning).toBe('2026-11-18')
    await sync()
    expect(n).toBe(1)
  })
  it('sendWakePush: до 04:00 и без morning — нет; после — да; cron в 08:00 — 0', async () => {
    await store.upsertPushSub(parseSubscribe(body())!)
    await store.upsertPushSub(parseSubscribe(body({ subscription: { endpoint: 'https://web.push.apple.com/B', keys: { p256dh: P256DH, auth: AUTH } }, morning: null }))!)
    const f = (async () => new Response(null, { status: 201 })) as typeof fetch
    expect(await sendWakePush(store, vapid, Date.UTC(2026, 10, 18, 0, 30), '2026-11-18', 7, f)).toBe(0) // 03:30 МСК
    expect(await sendWakePush(store, vapid, Date.UTC(2026, 10, 18, 3, 30), '2026-11-18', 7.6, f)).toBe(1)
    expect(await runCron(store, vapid, AT_8_MSK, f)).toBe(0)
  })
  it('пакет за вчера не шлёт и не блокирует сегодняшний', async () => {
    await store.upsertPushSub(parseSubscribe(body())!)
    let n = 0
    const f = (async () => { n++; return new Response(null, { status: 201 }) }) as typeof fetch
    expect(await sendWakePush(store, vapid, T0630, '2026-11-17', 7, f)).toBe(0)
    expect((await store.getPushSub(EP))!.last_morning).not.toBe('2026-11-18')
    expect(await sendWakePush(store, vapid, T0630, '2026-11-18', 7, f)).toBe(1)
  })
  it('воскресный вечер — разбор недели без данных игрока', () => {
    expect(message('evening', '2026-12-27')).toMatchObject({ title: 'Разбор недели', tag: 'weekly' })
    expect(message('evening', '2026-12-28').tag).toBe('evening')
    expect(message('evening', '2026-12-27').body).not.toMatch(/\d/)
  })
  it('текст про сон', () => expect(message('wake', '2026-11-18', { sleepHours: 7.6 }).body).toBe('Сон 7,6 ч засчитан. Открой «Мой день» — задания ждут'))
})

describe('тексты пушей', () => {
  it('без Тени во всех вариантах', () => {
    for (const kind of ['morning', 'evening', 'test'] as const)
      for (let d = 1; d <= 3; d++) expect(message(kind, `2026-12-0${d}`).body).not.toMatch(/Тен/)
  })
})
