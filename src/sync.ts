import { db, getSetting, setSetting, type StoredEvent } from './db'
import { now } from './now'

export const DEFAULT_SYNC_URL = '' // заполняется при деплое воркера

export interface SyncConfig { url: string; token: string }
export type SyncResult = { ok: true; pushed: number; pulled: number } | { ok: false; error: string }

const BATCH = 40 // лимит запросов D1 на бесплатном тарифе за один вызов
const enc = encodeURIComponent

class SyncError extends Error {}

export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function getSyncConfig(): Promise<SyncConfig | null> {
  const url = await getSetting<string>('syncUrl', '')
  const token = await getSetting<string>('syncToken', '')
  return url && token ? { url, token } : null
}

async function call(cfg: SyncConfig, method: string, path: string, body?: unknown): Promise<any> {
  let res: Response
  try {
    res = await fetch(cfg.url.replace(/\/+$/, '') + path, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new SyncError('Нет связи с сервером')
  }
  if (res.status === 401) throw new SyncError('Неверный токен — войди заново')
  if (res.status === 409) throw new SyncError('Этот сервер уже привязан. Подключись по ссылке с первого устройства')
  if (!res.ok) throw new SyncError(`Ошибка сервера (${res.status})`)
  return res.json()
}

const guard = async (f: () => Promise<SyncResult>): Promise<SyncResult> => {
  try {
    return await f()
  } catch (e) {
    if (e instanceof SyncError) return { ok: false, error: e.message }
    throw e
  }
}

async function run(): Promise<SyncResult> {
  const cfg = await getSyncConfig()
  if (!cfg) return { ok: true, pushed: 0, pulled: 0 }
  return guard(async () => {
    let pushed = 0
    let pulled = 0
    const pending = await db.events.where('pending').equals(1).sortBy('ts')
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH)
      await call(cfg, 'POST', '/events', { events: batch.map(({ pending: _p, seq: _s, ...e }) => e) })
      await db.events.where('id').anyOf(batch.map((e) => e.id)).modify({ pending: 0 })
      pushed += batch.length
    }
    for (let more = true; more; ) {
      const since = await getSetting<number>('syncCursor', 0)
      const page = await call(cfg, 'GET', `/events?since=${since}`)
      await db.transaction('rw', db.events, db.settings, async () => {
        await db.events.bulkPut(page.events.map((e: StoredEvent) => ({ ...e, pending: 0 })))
        await setSetting('syncCursor', page.next)
      })
      pulled += page.events.length
      more = page.more
    }
    await setSetting('lastSyncAt', now())
    return { ok: true, pushed, pulled }
  })
}

let inflight: Promise<SyncResult> | null = null
export function syncNow(): Promise<SyncResult> {
  return (inflight ??= run().finally(() => { inflight = null }))
}

export async function enableSync(url: string): Promise<SyncResult> {
  const cfg = { url: url.replace(/\/+$/, ''), token: newToken() }
  const r = await guard(async () => {
    await call(cfg, 'POST', '/register', { token: cfg.token })
    return { ok: true, pushed: 0, pulled: 0 }
  })
  if (!r.ok) return r
  await db.transaction('rw', db.settings, async () => {
    await setSetting('syncUrl', cfg.url)
    await setSetting('syncToken', cfg.token)
    await setSetting('syncCursor', 0)
  })
  return syncNow()
}

export async function joinSync(url: string, token: string): Promise<SyncResult> {
  const cfg = { url: url.replace(/\/+$/, ''), token }
  const r = await guard(async () => {
    await call(cfg, 'GET', '/ping')
    return { ok: true, pushed: 0, pulled: 0 }
  })
  if (!r.ok) return r
  await db.transaction('rw', db.settings, async () => {
    await setSetting('syncUrl', cfg.url)
    await setSetting('syncToken', cfg.token)
    await setSetting('syncCursor', 0)
  })
  return syncNow()
}

export async function rotateToken(): Promise<SyncResult> {
  const cfg = await getSyncConfig()
  if (!cfg) return { ok: false, error: 'Синхронизация не включена' }
  const token = newToken()
  return guard(async () => {
    await call(cfg, 'POST', '/token', { token })
    await setSetting('syncToken', token)
    return { ok: true, pushed: 0, pulled: 0 }
  })
}

export async function disableSync(): Promise<void> {
  await db.settings.bulkDelete(['syncToken', 'syncCursor', 'lastSyncAt'])
}

export const loginLink = (cfg: SyncConfig, appUrl: string): string => `${appUrl}#sync=${enc(cfg.token)}&url=${enc(cfg.url)}`

export function parseLoginHash(hash: string): SyncConfig | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''))
  const token = p.get('sync')
  const url = p.get('url')
  return token && url ? { url, token } : null
}
