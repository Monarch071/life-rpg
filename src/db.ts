import Dexie, { type Table } from 'dexie'
import type { DistributiveOmit, GameEvent } from './domain/types'

export type StoredEvent = GameEvent & { pending: 1 | 0; seq?: number }

export const db = new Dexie('life-rpg') as Dexie & {
  events: Table<StoredEvent, string>
  settings: Table<{ key: string; value: unknown }, string>
}
db.version(1).stores({ events: 'id, ts, pending, seq', settings: 'key' })

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

export async function appendEvent(e: DistributiveOmit<GameEvent, 'id' | 'ts' | 'deviceId'>): Promise<void> {
  const deviceId = await getDeviceId()
  await db.events.add({ ...e, id: crypto.randomUUID(), ts: Date.now(), deviceId, pending: 1 } as StoredEvent)
}

export function initStorage(): void {
  void navigator.storage?.persist?.()
}
