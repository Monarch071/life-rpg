import { useState } from 'react'
import { X } from 'lucide-react'
import { appendEvent } from '../db'
import { BALANCE } from '../domain/balance'
import type { DayType } from '../domain/dayType'
import type { GameState } from '../domain/types'
import { hhmmNow } from '../now'
import { DAY_ICONS } from '../ui/icons'
import { useDialog } from '../ui/useDialog'

const span = (t: DayType) => t.busy ? `занят ${t.busy.start}–${t.busy.end}` : t.kind === 'rest' ? 'без давления' : 'свободный день'

/** «День изменился»: новый тип дня → day_changed. Сделанное остаётся, лишнее снимается без штрафа. */
export default function DayChanged({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { today } = state
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dlg = useDialog<HTMLDivElement>(busy ? undefined : onClose)
  const pick = async (t: DayType) => {
    setBusy(true)
    setErr(null)
    try {
      await appendEvent({ type: 'day_changed', date: today.date, dayType: t, at: hhmmNow() })
      onClose()
    } catch {
      setErr('Не удалось сохранить, попробуй ещё раз')
      setBusy(false)
    }
  }
  return (
    <div className="sheet-wrap" onClick={e => !busy && e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dch-title">
        <div className="sheet-head">
          <h2 id="dch-title">День изменился</h2>
          <button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="muted">Выполненное остаётся. Если у нового дня меньше слотов, лишние задания снимутся без штрафа, остальные переедут в свободное время.</p>
        <p className="ok">{today.changed ? 'XP за гибкость сегодня уже получен' : `+${BALANCE.dayChangedXp} XP за гибкость`}</p>
        <div className="stack">
          {state.dayTypes.map(t => {
            const Icon = DAY_ICONS[t.kind], cur = today.dayType?.id === t.id
            return (
              <button key={t.id} className="btn day-card" disabled={busy || cur} aria-current={cur || undefined} onClick={() => pick(t)}>
                <Icon size={22} aria-hidden="true" /> <span>{t.label}{cur && ' · сейчас'}</span> <small>{span(t)} · {t.slots} зад.</small>
              </button>
            )
          })}
        </div>
        {state.dayTypes.some(t => t.kind === 'rest') && <p className="muted small">Дней отдыха в этом месяце осталось: {today.restDaysLeft}</p>}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </div>
  )
}
