import Dexie, { type Table } from 'dexie'
import type { DistributiveOmit, GameEvent } from './domain/types'
import { now } from './now'

export type StoredEvent = GameEvent & { pending: 1 | 0 | 2; seq?: number } // 2 — больше лимита воркера, не отправляется

export const db = new Dexie('life-rpg') as Dexie & {
  events: Table<StoredEvent, string>
  settings: Table<{ key: string; value: unknown }, string>
  blobs: Table<{ name: string; blob: Blob; uploaded: 0 | 1 }, string>
}
db.version(1).stores({ events: 'id, ts, pending, seq', settings: 'key' })
db.version(2).stores({ events: 'id, ts, pending, seq', settings: 'key', blobs: 'name' })

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

async function getDeviceId(): Promise<string> {
  return db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get('deviceId')
    if (existing) return existing.value as string
    const id = crypto.randomUUID()
    await db.settings.put({ key: 'deviceId', value: id })
    return id
  })
}

type NewEvent = DistributiveOmit<GameEvent, 'id' | 'ts' | 'deviceId'>

export async function appendEvent(e: NewEvent): Promise<void> {
  await appendEvents([e])
}

/** Несколько событий атомарно: либо все записаны, либо ни одного. */
export async function appendEvents(es: NewEvent[]): Promise<void> {
  const deviceId = await getDeviceId()
  const ts = now()
  await db.transaction('rw', db.events, async () => {
    for (const e of es) await db.events.add({ ...e, id: crypto.randomUUID(), ts, deviceId, pending: 1 } as StoredEvent)
  })
}

export function initStorage(): void {
  void navigator.storage?.persist?.()
}
