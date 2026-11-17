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

const file = (o: object) => new Blob([JSON.stringify({ app: 'life-rpg', schema: 1, ...o })])
const good = { id: 'a', ts: 1, deviceId: 'd', type: 'busy_until', date: '2026-11-17', until: '18:00' }

test('плохой cutoffHour → ok:false, данные не тронуты', async () => {
  await appendEvent(ev)
  for (const v of ['x', 7, -1, 2.5]) {
    const r = await importData(file({ events: [good], settings: [{ key: 'cutoffHour', value: v }] }))
    expect(r.ok).toBe(false)
  }
  expect(await db.events.count()).toBe(1)
})

test('событие, ломающее replay → ok:false, данные не тронуты', async () => {
  await appendEvent(ev)
  const bad = { id: 'b', ts: 2, deviceId: 'd', type: 'onboarding_completed', profile: null }
  const r = await importData(file({ events: [good, bad] }))
  expect(r).toEqual({ ok: false, error: 'Файл повреждён: не удалось восстановить игру' })
  expect(await db.events.count()).toBe(1)
})

test('импортированные deviceId/aiKey игнорируются', async () => {
  await setSetting('aiKey', 'mine')
  await appendEvent(ev)
  const id = await getSetting('deviceId', '')
  const r = await importData(file({ events: [good], settings: [{ key: 'deviceId', value: 'evil' }, { key: 'aiKey', value: 'evil' }] }))
  expect(r.ok).toBe(true)
  expect(await getSetting('deviceId', '')).toBe(id)
  expect(await getSetting('aiKey', '')).toBe('mine')
})

test('lastExportAt — локальная настройка: не экспортируется и не перезаписывается импортом', async () => {
  await setSetting('lastExportAt', 123)
  await appendEvent(ev)
  expect(await (await exportData()).text()).not.toContain('lastExportAt')
  const r = await importData(file({ events: [good], settings: [{ key: 'lastExportAt', value: 999 }] }))
  expect(r.ok).toBe(true)
  expect(await getSetting('lastExportAt', 0)).toBe(123)
})

test('импорт сбрасывает syncCursor в 0', async () => {
  await setSetting('syncCursor', 42)
  expect((await importData(file({ events: [good] }))).ok).toBe(true)
  expect(await getSetting('syncCursor', -1)).toBe(0)
})

test('событие без deviceId отклоняется', async () => {
  const { deviceId: _d, ...noDev } = good
  const r = await importData(file({ events: [noDev] }))
  expect(r).toEqual({ ok: false, error: 'Резервная копия повреждена: некорректные события.' })
})
