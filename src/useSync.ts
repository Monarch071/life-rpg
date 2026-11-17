import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from './db'
import { getSyncConfig, syncNow } from './sync'

export interface SyncState { status: 'off' | 'idle' | 'syncing' | 'error'; error: string | null; lastSyncAt: number | null; run: () => void }

export function useSync(): SyncState {
  const [s, setS] = useState<Omit<SyncState, 'run'>>({ status: 'off', error: null, lastSyncAt: null })
  const alive = useRef(true)
  const run = useCallback(() => {
    void (async () => {
      if (!(await getSyncConfig())) return alive.current && setS({ status: 'off', error: null, lastSyncAt: null })
      if (alive.current) setS((o) => ({ ...o, status: 'syncing' }))
      const r = await syncNow().catch(() => ({ ok: false as const, error: 'Ошибка синхронизации' }))
      const lastSyncAt = await getSetting<number | null>('lastSyncAt', null)
      if (alive.current) setS(r.ok ? { status: 'idle', error: null, lastSyncAt } : { status: 'error', error: r.error, lastSyncAt })
    })().catch(() => {})
  }, [])

  useEffect(() => {
    alive.current = true
    run()
    const onVis = () => document.visibilityState === 'visible' && run()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', run)
    const t = setInterval(() => document.visibilityState === 'visible' && run(), 60_000)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', run)
      clearInterval(t)
    }
  }, [run])

  // новые локальные события → отправить через 2 с (debounce: таймер сбрасывается при смене счётчика)
  const pending = useLiveQuery(() => db.events.where('pending').equals(1).count())
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(run, 2000)
    return () => clearTimeout(t)
  }, [pending, run])

  return { ...s, run }
}
