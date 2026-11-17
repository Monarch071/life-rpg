import { useRef, useState } from 'react'
import { appendEvent } from '../db'
import { getAiConfig } from '../ai/config'
import { aiTuning } from '../ai/tasks'
import { loadState } from '../useGame'
import { useDialog } from '../ui/useDialog'

/** Вечерний чек‑ин: что получилось / что нет / энергия 1–10. */
export default function Checkin({ date, onClose }: { date: string; onClose: () => void }) {
  const [went, setWent] = useState('')
  const [notWent, setNotWent] = useState('')
  const [energy, setEnergy] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const dlg = useDialog<HTMLDivElement>(onClose)
  const [err, setErr] = useState<string | null>(null)
  const lock = useRef(false)

  const save = async () => {
    if (energy === null) return setErr('Оцени энергию от 1 до 10')
    if (lock.current) return
    lock.current = true
    setSaving(true)
    try {
      const c = { went: went.trim(), notWent: notWent.trim(), energy }
      await appendEvent({ type: 'checkin', date, ...c })
      onClose()
      void (async () => { // фон: ошибки ИИ молча игнорируются
        const cfg = await getAiConfig()
        if (!cfg) return
        const t = await aiTuning(cfg, await loadState(), c)
        await appendEvent({ type: 'ai_tuning', date, ...t })
      })().catch(() => {})
    } catch {
      setErr('Не удалось сохранить, попробуй ещё раз')
      lock.current = false
      setSaving(false)
    }
  }

  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ci-title">
        <div className="sheet-head">
          <h2 id="ci-title">Чек‑ин дня</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        <label className="field">Что получилось
          <textarea rows={3} maxLength={500} value={went} onChange={e => setWent(e.target.value)} />
        </label>
        <label className="field">Что нет
          <textarea rows={3} maxLength={500} value={notWent} onChange={e => setNotWent(e.target.value)} />
        </label>
        <div className="field">
          <span>⚡ Энергия {energy ? `${energy}/10` : ''}</span>
          <div className="scale">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} className={`btn${energy === n ? ' primary' : ''}`} aria-label={`Энергия ${n} из 10`} aria-pressed={energy === n}
                onClick={() => { setEnergy(n); setErr(null) }}>{n}</button>
            ))}
          </div>
        </div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary big" disabled={saving} onClick={save}>Сохранить чек‑ин</button>
      </div>
    </div>
  )
}
