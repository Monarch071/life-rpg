import { useRef, useState } from 'react'
import { appendEvents, setSetting } from '../db'
import { getAiConfig } from '../ai/config'
import { aiDailyQuests } from '../ai/tasks'
import { getSyncConfig, syncNow } from '../sync'
import { loadState } from '../useGame'
import type { Win } from '../domain/schedule'
import type { GameState, Profile, Quest } from '../domain/types'
import { hhmmNow } from '../now'
import { useDialog } from '../ui/useDialog'
import { generateWeeklyQuests } from '../domain/weekly'
import { buildQuests } from './issue'

/** Модальное «Мой день»: выбор режима дня → day_started, затем выдача заданий (если их ещё нет). */
export default function MyDay({ state, profile, onLater }: { state: GameState; profile: Profile; onLater: () => void }) {
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const lock = useRef(false)
  const dlg = useDialog<HTMLDivElement>() // закрывается только «Позже»: лист перекрывает панель вкладок

  const begin = async (work: Win | null) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      const wakeAt = hhmmNow()
      const date = state.today.date
      // первое устройство выдаёт задания: подтянуть чужие события и смотреть уже свежее состояние
      let cur = state
      try {
        if (await getSyncConfig()) {
          let timer: ReturnType<typeof setTimeout> | undefined
          await Promise.race([syncNow().catch(() => null), new Promise((r) => { timer = setTimeout(r, 4000) })])
          clearTimeout(timer)
          cur = await loadState()
        }
      } catch { /* синк не должен мешать началу дня */ }
      // сначала генерация, потом одна атомарная запись — день не останется без заданий
      let quests: Quest[] | null = null
      if (cur.today.quests.length === 0) {
        const cfg = await getAiConfig().catch(() => null)
        if (cfg) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            quests = await Promise.race([aiDailyQuests(cfg, cur, profile, work, wakeAt),
              new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 25_000) })])
          } catch { await setSetting('aiFallback', date).catch(() => {}) } // тихо на правила; пометку покажет Home
          clearTimeout(timer)
        }
        quests ??= buildQuests(cur, profile, work, wakeAt)
      }
      await appendEvents([
        { type: 'day_started', date, work, wakeAt },
        ...(cur.weekly.quests.length === 0
          ? [{ type: 'weekly_issued' as const, weekStart: cur.weekly.weekStart, quests: generateWeeklyQuests(cur.genWeekly) }] : []),
        ...(quests ? [{ type: 'quests_issued' as const, date, quests }] : []),
      ])
    } catch {
      setErr('Не удалось начать день, попробуй ещё раз')
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <div className="sheet-wrap">
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="myday-title">
        <h2 id="myday-title">Мой день</h2>
        <p className="muted">Какой сегодня день? Задания подстроятся под расписание.</p>
        <div className="stack">
          {profile.workTemplates.map((t, i) => (
            <button key={i} className="btn" disabled={busy} onClick={() => begin({ start: t.start, end: t.end })}>
              💼 {t.label} <small>{t.start}–{t.end}</small>
            </button>
          ))}
          <button className="btn" disabled={busy} onClick={() => begin(null)}>🌴 Выходной</button>
          <button className="btn ghost" disabled={busy} aria-expanded={custom} onClick={() => setCustom(!custom)}>🕑 Другое время</button>
          {custom && (
            <div className="row">
              <label className="field">С<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
              <label className="field">До<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
            </div>
          )}
          {custom && (
            <button className="btn primary" disabled={busy || !start || !end || start === end} onClick={() => begin({ start, end })}>
              Начать день
            </button>
          )}
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn ghost" disabled={busy} onClick={onLater}>Позже</button>
      </div>
    </div>
  )
}
