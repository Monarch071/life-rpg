import { useRef, useState } from 'react'
import { Bed, X } from 'lucide-react'
import { appendEvent } from '../db'
import type { GameState } from '../domain/types'
import { useDialog } from '../ui/useDialog'

const Q_TEXT = ['без заданий', '1 лёгкое задание', '2 лёгких задания'] as const

/** Режим восстановления: старт с выбором 0/1/2 лёгких заданий, «Вернуться». Дата — игровая (today.date), не календарная. */
export default function Recovery({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { recovery: rec, today } = state
  const [quests, setQuests] = useState<0 | 1 | 2>(rec.active ? rec.quests : 1)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [err, setErr] = useState<string | null>(null)
  const dlg = useDialog<HTMLDivElement>(busy ? undefined : onClose)
  const write = async (e: Parameters<typeof appendEvent>[0]) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try { await appendEvent(e); onClose() } catch { setErr('Не удалось сохранить, попробуй ещё раз'); setBusy(false) } finally { lock.current = false }
  }
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rec-title">
        <div className="sheet-head">
          <h2 id="rec-title"><Bed size={18} aria-hidden="true" /> Отдых в таверне</h2>
          <button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="muted">Режим восстановления: серия замораживается, Усталость спадает. Задания — только лёгкие, на отдых и восстановление. Сам не выключается — вернись кнопкой «Вернуться».</p>
        <p>Дней отдыха в этом месяце: <b>{today.restDaysLeft}</b>
          {rec.active && <small className="muted"> · сегодня {rec.frozenToday ? 'заморожен' : 'не заморожен — лимит исчерпан'}</small>}</p>
        {!rec.active && today.restDaysLeft === 0 && <p className="muted">Лимит исчерпан: задания будут лёгкими, но дни не заморозятся.</p>}
        <div className="row" role="group" aria-label="Сколько заданий в день">
          {([0, 1, 2] as const).map(n => (
            <button key={n} className={`btn${quests === n ? ' primary' : ''}`} style={{ flex: 1 }} disabled={busy} aria-pressed={quests === n}
              aria-label={Q_TEXT[n]} onClick={() => setQuests(n)}>{n}</button>
          ))}
        </div>
        <p className="muted center">{Q_TEXT[quests]} в день</p>
        {!rec.active
          ? <button className="btn primary big" disabled={busy} onClick={() => void write({ type: 'recovery_started', date: today.date, quests })}>Начать отдых</button>
          : <>
            <button className="btn big" disabled={busy || quests === rec.quests} onClick={() => void write({ type: 'recovery_started', date: today.date, quests })}>Сохранить</button>
            <button className="btn primary big" disabled={busy} onClick={() => void write({ type: 'recovery_ended', date: today.date })}>Вернуться</button>
          </>}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </div>
  )
}
