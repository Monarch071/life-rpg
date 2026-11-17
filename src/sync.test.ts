import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { appendEvent, db, getSetting, setSetting } from './db'
import { exportData } from './backup'
import { loadState } from './useGame'
import { disableSync, enableSync, joinSync, loginLink, newToken, parseLoginHash, syncNow, getSyncConfig, rotateToken } from './sync'
import { handle } from '../worker/src/index'
import { MemoryStore } from '../worker/src/memoryStore'

const URL_ = 'https://srv.test'
let store: MemoryStore
let calls: { path: string; body?: any }[]
let failPost: number // номер POST /events, на котором падаем (0 = никогда)
let status401: boolean

beforeEach(async () => {
  await db.events.clear()
  await db.settings.clear()
  store = new MemoryStore()
  calls = []
  failPost = 0
  status401 = false
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    const path = new URL(url).pathname
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : undefined })
    if (status401) return new Response('{}', { status: 401 })
    if (path === '/events' && init.method === 'POST' && ++postN === failPost) throw new TypeError('fail')
    return handle(new Request(url, init), store, [])
  })
  postN = 0
})
let postN = 0
afterEach(() => vi.unstubAllGlobals())

const ev = (i: number) => ({ type: 'busy_until', date: '2026-11-17', until: `${i}` }) as const

test('enableSync: токен 43 символа, push на сервер, pending=0, seq выставлен', async () => {
  await appendEvent(ev(1))
  const r = await enableSync(URL_ + '/')
  expect(r).toEqual({ ok: true, pushed: 1, pulled: 1 })
  expect((await getSyncConfig())!.token).toHaveLength(43)
  const e = (await db.events.toArray())[0]
  expect(e.pending).toBe(0)
  expect(e.seq).toBe(1)
  expect(calls[0].path).toBe('/register')
})

test('второе устройство получает события и то же состояние', async () => {
  for (let i = 0; i < 3; i++) await appendEvent(ev(i))
  await enableSync(URL_)
  const { token } = (await getSyncConfig())!
  const s1 = await loadState()
  await db.events.clear()
  await db.settings.clear()
  expect(await joinSync(URL_, token)).toMatchObject({ ok: true, pulled: 3 })
  expect((await loadState()).profile).toEqual(s1.profile)
})

test('сбой на второй пачке push: первые 40 pending=0, повтор досылает все 250', async () => {
  for (let i = 0; i < 250; i++) await appendEvent(ev(i))
  await enableSync(URL_) // регистрация + первый sync; сбросим и повторим
  await db.events.clear()
  await db.settings.put({ key: 'syncCursor', value: 0 })
  for (let i = 0; i < 250; i++) await appendEvent(ev(i))
  const ids = (await db.events.toArray()).length
  expect(ids).toBe(250)
  postN = 0
  failPost = 2
  const r = await syncNow()
  expect(r).toEqual({ ok: false, error: 'Нет связи с сервером' })
  expect(await db.events.where('pending').equals(0).count()).toBe(40)
  expect(await db.events.where('pending').equals(1).count()).toBe(210)
  expect((await syncNow()).ok).toBe(true)
  expect(await db.events.where('pending').equals(1).count()).toBe(0)
  expect((await store.eventsSince(0, 10000)).length).toBe(500) // 250 из первого enable + 250 новых
})

test('2500 событий на сервере → joinSync скачивает все, курсор 2500', async () => {
  const token = newToken()
  await handle(new Request(URL_ + '/register', { method: 'POST', body: JSON.stringify({ token }) }), store, [])
  const events = Array.from({ length: 2500 }, (_, i) => ({ id: `e${i}`, ts: i, type: 'busy_until', deviceId: 'd', date: '2026-11-17', until: '1' }))
  for (let i = 0; i < 2500; i += 500)
    await handle(new Request(URL_ + '/events', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ events: events.slice(i, i + 500) }) }), store, [])
  const r = await joinSync(URL_, token)
  expect(r).toMatchObject({ ok: true, pulled: 2500 })
  expect(await db.events.count()).toBe(2500)
  expect(await getSetting('syncCursor', 0)).toBe(2500)
})

test('401 → понятная ошибка, события целы', async () => {
  await appendEvent(ev(1))
  await enableSync(URL_)
  status401 = true
  expect(await syncNow()).toEqual({ ok: false, error: 'Неверный токен — войди заново' })
  expect(await db.events.count()).toBe(1)
})

test('409 при регистрации', async () => {
  await enableSync(URL_)
  await db.settings.clear()
  expect(await enableSync(URL_)).toEqual({ ok: false, error: 'Этот сервер уже привязан. Подключись по ссылке с первого устройства' })
  expect(await getSyncConfig()).toBeNull()
})

test('rotateToken: новый токен работает, старый нет', async () => {
  await enableSync(URL_)
  const old = (await getSyncConfig())!.token
  expect((await rotateToken()).ok).toBe(true)
  const now = (await getSyncConfig())!.token
  expect(now).not.toBe(old)
  expect((await syncNow()).ok).toBe(true)
  await setSetting('syncToken', old)
  expect((await syncNow()).ok).toBe(false)
})

test('disableSync убирает настройки, события остаются', async () => {
  await appendEvent(ev(1))
  await enableSync(URL_)
  await disableSync()
  expect(await getSyncConfig()).toBeNull()
  expect(await db.events.count()).toBe(1)
  expect(await syncNow()).toEqual({ ok: true, pushed: 0, pulled: 0 })
})

test('single-flight', async () => {
  await enableSync(URL_)
  const a = syncNow()
  expect(syncNow()).toBe(a)
  await a
})

test('loginLink ↔ parseLoginHash', () => {
  const cfg = { url: 'https://a.b/x?y=1&z', token: newToken() }
  expect(parseLoginHash(new URL(loginLink(cfg, 'https://x/app/')).hash)).toEqual(cfg)
  expect(parseLoginHash('#foo')).toBeNull()
  expect(parseLoginHash('')).toBeNull()
})

test('exportData не содержит ключей синхронизации', async () => {
  await enableSync(URL_)
  await setSetting('lastSyncAt', 1)
  const t = await (await exportData()).text()
  for (const k of ['syncToken', 'syncUrl', 'syncCursor', 'lastSyncAt']) expect(t).not.toContain(k)
})

test('joinSync ждёт старый syncNow: курсор от нового сервера', async () => {
  await enableSync(URL_)
  const storeB = new MemoryStore()
  const tokenB = newToken()
  await handle(new Request('https://b.test/register', { method: 'POST', body: JSON.stringify({ token: tokenB }) }), storeB, [])
  await handle(new Request('https://b.test/events', { method: 'POST', headers: { authorization: `Bearer ${tokenB}` }, body: JSON.stringify({ events: [1, 2, 3].map((i) => ({ id: `b${i}`, ts: i, type: 'busy_until', deviceId: 'd', date: '2026-11-17', until: '1' })) }) }), storeB, [])
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const base = fetch
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    if (url.startsWith(URL_)) await gate
    else return handle(new Request(url, init), storeB, [])
    return base(url, init)
  })
  const a = syncNow()
  const j = joinSync('https://b.test', tokenB)
  await new Promise((r) => setTimeout(r, 20))
  release()
  await a
  expect(await j).toMatchObject({ ok: true, pulled: 3 })
  expect(await getSetting('syncCursor', 0)).toBe(3)
  expect(await db.events.where('id').startsWith('b').count()).toBe(3)
})

test('200 с HTML вместо JSON → ok:false, без исключения', async () => {
  await enableSync(URL_)
  vi.stubGlobal('fetch', async () => new Response('<html>', { status: 200 }))
  expect(await syncNow()).toEqual({ ok: false, error: 'Ошибка сервера (200)' })
})

test('parseLoginHash отвергает не-http(s) url', () => {
  const t = newToken()
  expect(parseLoginHash(`#sync=${t}&url=${encodeURIComponent('javascript:alert(1)')}`)).toBeNull()
  expect(parseLoginHash(`#sync=${t}&url=${encodeURIComponent('ftp://x')}`)).toBeNull()
})

test('more=true без прогресса курсора не зацикливает pull', async () => {
  await enableSync(URL_)
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ events: [], next: 0, more: true }), { status: 200 }))
  expect((await syncNow()).ok).toBe(true)
})

test('enableSync на новом сервере повторно отправляет уже синхронизированную историю', async () => {
  await appendEvent(ev(1))
  await enableSync(URL_)
  expect((await db.events.toArray())[0].pending).toBe(0)
  store = new MemoryStore() // сервер «стёрт»
  await disableSync()
  const r = await enableSync(URL_)
  expect(r).toMatchObject({ ok: true, pushed: 1 })
  expect(calls.filter((c) => c.path === '/events' && c.body?.events?.length).length).toBeGreaterThan(1)
})
