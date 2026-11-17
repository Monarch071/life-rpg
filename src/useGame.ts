import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, type StoredEvent } from './db'
import { replay } from './domain/replay'
import { now as clock } from './now'
import type { GameEvent, GameState } from './domain/types'

const toGameEvents = (es: StoredEvent[]) => es.map(({ pending: _p, seq: _s, ...e }) => e as GameEvent)

export async function loadState(): Promise<GameState> {
  const events = toGameEvents(await db.events.orderBy('ts').toArray())
  return replay(events, clock(), await getSetting<number>('cutoffHour', 4))
}

export function useGame(): GameState | undefined {
  const [now, setNow] = useState(() => clock())
  useEffect(() => {
    const tick = () => setNow(clock())
    const onVis = () => document.visibilityState === 'visible' && tick()
    document.addEventListener('visibilitychange', onVis)
    const t = setInterval(tick, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(t)
    }
  }, [])
  const data = useLiveQuery(async () => ({
    events: await db.events.orderBy('ts').toArray(),
    cutoffHour: await getSetting<number>('cutoffHour', 4),
  }))
  return useMemo(() => {
    if (!data) return undefined
    return replay(toGameEvents(data.events), now, data.cutoffHour)
  }, [data, now])
}
