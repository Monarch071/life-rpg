import { db, setSetting } from './db'
import { replay } from './domain/replay'
import type { GameEvent } from './domain/types'

// device-local settings: never exported, never overwritten by import
const isLocal = (key: string) => key === 'deviceId' || key === 'lastExportAt' || key === 'lastSyncAt' || key.startsWith('seen') || key.startsWith('sync') || key.startsWith('ai') || key.startsWith('interview') || key.startsWith('notify')

export async function exportData(): Promise<Blob> {
  const events = await db.events.orderBy('ts').toArray()
  const settings = (await db.settings.toArray()).filter((s) => !isLocal(s.key))
  const body = { app: 'life-rpg', schema: 1, exportedAt: Date.now(), events, settings }
  return new Blob([JSON.stringify(body)], { type: 'application/json' })
}

export async function importData(file: Blob): Promise<{ ok: true; events: number } | { ok: false; error: string }> {
  let data: any
  try {
    data = JSON.parse(await file.text())
  } catch {
    return { ok: false, error: 'Файл повреждён: это не JSON.' }
  }
  if (data?.app !== 'life-rpg') return { ok: false, error: 'Это не файл резервной копии Life RPG.' }
  if (data.schema !== 1) return { ok: false, error: 'Неподдерживаемая версия резервной копии.' }
  if (
    !Array.isArray(data.events) ||
    !data.events.every((e: any) => e && typeof e.id === 'string' && typeof e.ts === 'number' && typeof e.deviceId === 'string' && typeof e.type === 'string')
  )
    return { ok: false, error: 'Резервная копия повреждена: некорректные события.' }
  const settings = (Array.isArray(data.settings) ? data.settings : []).filter(
    (s: any) => s && typeof s.key === 'string' && !isLocal(s.key),
  )
  // старое поле cutoffHour больше не используется (закрытие дня — по отбою), но битое значение — признак порчи файла
  const cutoff = settings.find((s: any) => s.key === 'cutoffHour')?.value
  if (cutoff !== undefined && !(Number.isInteger(cutoff) && cutoff >= 0 && cutoff <= 6))
    return { ok: false, error: 'Резервная копия повреждена: неверный час смены дня.' }
  try {
    // a payload that breaks replay would crash the app on every launch
    const plain = data.events.map(({ pending: _p, seq: _s, ...e }: any) => e as GameEvent)
    replay(plain, Date.now())
  } catch {
    return { ok: false, error: 'Файл повреждён: не удалось восстановить игру' }
  }
  try {
    await db.transaction('rw', db.events, db.settings, async () => {
      await db.events.clear()
      await db.events.bulkPut(data.events.map((e: any) => ({ ...e, pending: e.pending === 0 ? 0 : 1 })))
      // replace exportable settings only
      await db.settings.filter((s) => !isLocal(s.key)).delete()
      await db.settings.bulkPut(settings)
      await setSetting('syncCursor', 0) // следующий sync заново стянет всё с сервера
    })
  } catch {
    return { ok: false, error: 'Не удалось записать данные.' }
  }
  return { ok: true, events: data.events.length }
}
