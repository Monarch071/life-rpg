import 'fake-indexeddb/auto'
import { expect, test, vi } from 'vitest'
import { appendEvent, db } from './db'
import { importData } from './backup'

// replay не должен бросать ни на каком событии, но импорт всё равно страхуется пробным прогоном
vi.mock('./domain/replay', () => ({ replay: () => { throw new Error('boom') } }))

test('событие, ломающее replay → ok:false, данные не тронуты', async () => {
  await db.events.clear()
  await appendEvent({ type: 'busy_until', date: '2026-11-17', until: '18:00' })
  const good = { id: 'a', ts: 1, deviceId: 'd', type: 'busy_until', date: '2026-11-17', until: '18:00' }
  const file = new Blob([JSON.stringify({ app: 'life-rpg', schema: 1, events: [good], settings: [] })])
  const r = await importData(file)
  expect(r).toEqual({ ok: false, error: 'Файл повреждён: не удалось восстановить игру' })
  expect(await db.events.count()).toBe(1)
})
