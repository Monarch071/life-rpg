import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { appendEvent, db } from './db'
import { seedDefaultRewards } from './seed'

beforeEach(async () => {
  await db.events.clear()
  await db.settings.clear()
})

test('пустой журнал → 8 наград; повторный вызов → 0', async () => {
  expect(await seedDefaultRewards()).toBe(8)
  expect((await db.events.toArray()).filter(e => e.type === 'reward_created')).toHaveLength(8)
  expect(await seedDefaultRewards()).toBe(0)
  expect(await db.events.count()).toBe(8)
})

test('удалённая стартовая награда не возвращается', async () => {
  await seedDefaultRewards()
  await appendEvent({ type: 'reward_deleted', rewardId: 'default:games' })
  expect(await seedDefaultRewards()).toBe(0)
})

test('два одновременных вызова (две вкладки) сеют один раз', async () => {
  const [a, b] = await Promise.all([seedDefaultRewards(), seedDefaultRewards()])
  expect(a + b).toBe(8)
  expect(await db.events.count()).toBe(8)
})
