import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { appendEvent, db, setSetting, getSetting } from './db'
import { exportData, importData } from './backup'

const ev = { type: 'busy_until', date: '2026-11-17', until: '18:00' } as const

beforeEach(async () => {
  await db.events.clear()
  await db.settings.clear()
})

test('экспорт → импорт восстанавливает те же события', async () => {
  await appendEvent(ev)
  await appendEvent({ ...ev, until: '19:00' })
  await setSetting('cutoffHour', 5)
  await setSetting('aiKey', 'secret')
  const before = await db.events.orderBy('ts').toArray()
  const blob = await exportData()
  expect(await blob.text()).not.toContain('secret')
  await db.events.clear()
  await setSetting('aiKey', 'mine')
  await setSetting('cutoffHour', 1)
  const r = await importData(blob)
  expect(r).toEqual({ ok: true, events: 2 })
  expect((await db.events.toArray()).map((e) => e.id).sort()).toEqual(before.map((e) => e.id).sort())
  expect(await getSetting('cutoffHour', 4)).toBe(5)
  expect(await getSetting('aiKey', '')).toBe('mine')
})

test('битый JSON → ok:false, существующие события не тронуты', async () => {
  await appendEvent(ev)
  const r = await importData(new Blob(['{oops']))
  expect(r.ok).toBe(false)
  expect(await db.events.count()).toBe(1)
})

test('чужой JSON (нет app или schema > 1) → ok:false', async () => {
  await appendEvent(ev)
  for (const o of [
    { schema: 1, events: [] },
    { app: 'life-rpg', schema: 2, events: [] },
    { app: 'life-rpg', schema: 1, events: [{ id: 'x', ts: 'no', type: 't' }] },
  ]) {
    const r = await importData(new Blob([JSON.stringify(o)]))
    expect(r.ok).toBe(false)
  }
  expect(await db.events.count()).toBe(1)
})
