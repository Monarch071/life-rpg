import { useRef, useState } from 'react'
import { appendEvents } from '../db'
import type { Win } from '../domain/schedule'
import type { GameState, Profile } from '../domain/types'
import { hhmmNow } from '../now'
import { useDialog } from '../ui/useDialog'
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
      // сначала генерация, потом одна атомарная запись — день не останется без заданий
      const quests = state.today.quests.length === 0 ? buildQuests(state, profile, work, wakeAt) : null
      await appendEvents([
        { type: 'day_started', date, work, wakeAt },
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
