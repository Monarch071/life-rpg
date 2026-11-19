import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { db, setSetting } from './db'
import { getBlob, saveBlob, uploadPendingBlobs } from './blobs'
import { handle } from '../worker/src/index'
import { MemoryStore } from '../worker/src/memoryStore'

let store: MemoryStore
let down: boolean
const TOKEN = 't'.repeat(43)
const png = () => new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' })
const bytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())]

beforeEach(async () => {
  await db.blobs.clear()
  await db.settings.clear()
  store = new MemoryStore()
  await store.setTokenHashIfAbsent(
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN)))].map(b => b.toString(16).padStart(2, '0')).join(''))
  down = false
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    if (down) throw new TypeError('down')
    return handle(new Request(url, init), store, [])
  })
})
afterEach(() => vi.unstubAllGlobals())
const enable = async () => { await setSetting('syncUrl', 'https://srv.test'); await setSetting('syncToken', TOKEN) }

test('saveBlob при включённом синке выгружает на сервер', async () => {
  await enable()
  await saveBlob('av-1', png())
  expect((await db.blobs.get('av-1'))!.uploaded).toBe(1)
  expect(await store.getBlob('av-1')).toMatchObject({ mime: 'image/png' })
})

test('второе устройство: getBlob скачивает и кэширует', async () => {
  await enable()
  await saveBlob('av-1', png())
  await db.blobs.clear()
  const b = await getBlob('av-1')
  expect(b!.type).toBe('image/png')
  expect(await bytes(b!)).toEqual([1, 2, 3, 4, 5])
  expect((await db.blobs.get('av-1'))!.uploaded).toBe(1)
})

test('без синка getBlob неизвестного — null', async () => {
  expect(await getBlob('nope')).toBeNull()
})

test('сервер недоступен: остаётся uploaded:0, потом выгружается', async () => {
  await enable()
  down = true
  await saveBlob('av-1', png())
  expect((await db.blobs.get('av-1'))!.uploaded).toBe(0)
  expect(await getBlob('av-2')).toBeNull()
  down = false
  await uploadPendingBlobs()
  expect((await db.blobs.get('av-1'))!.uploaded).toBe(1)
  expect(await store.getBlob('av-1')).not.toBeNull()
})

test('фото-доказательства (proof-*) не выгружаются ни сразу, ни потом', async () => {
  await enable()
  await saveBlob('proof-1', png())
  await uploadPendingBlobs()
  expect((await db.blobs.get('proof-1'))!.uploaded).toBe(0)
  expect(await store.getBlob('proof-1')).toBeNull()
})
