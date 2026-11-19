import { appendEvents, db, type StoredEvent } from './db'
import { missingDefaultRewards } from './domain/shopDefaults'
import type { GameEvent } from './domain/types'

/** Посев стартового магазина. Чтение и запись в одной rw-транзакции — две вкладки не засеют дважды;
 *  дубль id с другого устройства replay отбросит (побеждает первый). Возвращает число записанных событий. */
export async function seedDefaultRewards(): Promise<number> {
  return db.transaction('rw', db.events, db.settings, async () => {
    const events = (await db.events.toArray()).map(({ pending: _p, seq: _s, ...e }: StoredEvent) => e as GameEvent)
    const missing = missingDefaultRewards(events)
    if (missing.length) await appendEvents(missing)
    return missing.length
  })
}
