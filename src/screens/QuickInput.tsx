import { useState } from 'react'
import { appendEvent } from '../db'
import type { GameState, Metric } from '../domain/types'

type Field = { metric: Metric; icon: string; label: string; unit: string; mode: 'set' | 'add'; max: number }
const FIELDS: Field[] = [
  { metric: 'screenMin', icon: '📱', label: 'Экранное время', unit: 'мин', mode: 'set', max: 1440 },
  { metric: 'spend', icon: '💸', label: 'Траты', unit: '₽', mode: 'add', max: 10_000_000 },
  { metric: 'readPages', icon: '📖', label: 'Чтение', unit: 'стр', mode: 'add', max: 2000 },
  { metric: 'workoutMin', icon: '🏋️', label: 'Тренировка', unit: 'мин', mode: 'add', max: 1440 },
  { metric: 'sleepHours', icon: '😴', label: 'Сон', unit: 'ч', mode: 'set', max: 24 },
  { metric: 'weightKg', icon: '⚖️', label: 'Вес', unit: 'кг', mode: 'set', max: 500 },
]

/** Число из поля: запятая как разделитель, без NaN/отрицательных/сверх максимума; для add — строго > 0. */
export function parseAmount(raw: string, f: Pick<Field, 'mode' | 'max'>): number | null {
  const s = raw.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return n > f.max || (f.mode === 'add' && n === 0) ? null : n
}

export default function QuickInput({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { date, metrics } = state.today
  const [vals, setVals] = useState<Partial<Record<Metric, string>>>({})
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  const log = async (metric: Metric, value: number, mode: 'set' | 'add', label: string) => {
    if (saving) return
    setSaving(true)
    try {
      await appendEvent({ type: 'metric_logged', date, metric, value, mode })
      setMsg({ text: `Записано: ${label}` })
      setVals(v => ({ ...v, [metric]: '' }))
    } catch {
      setMsg({ text: 'Не удалось сохранить, попробуй ещё раз', err: true })
    } finally {
      setSaving(false)
    }
  }

  const submit = (f: Field) => {
    const n = parseAmount(vals[f.metric] ?? '', f)
    if (n === null) return setMsg({ text: `${f.label}: введи число ${f.mode === 'add' ? 'больше 0' : 'от 0'} и не больше ${f.max}`, err: true })
    void log(f.metric, n, f.mode, `${f.label} ${f.mode === 'add' ? '+' : ''}${n} ${f.unit}`)
  }

  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="qi-title">
        <div className="sheet-head">
          <h2 id="qi-title">Быстрый ввод</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        <button className="btn big" disabled={saving} onClick={() => log('water', 1, 'add', 'вода +1 стакан')}>
          💧 Вода +1 стакан <span className="pill">{metrics.water ?? 0}</span>
        </button>
        <div className="field">
          <span>🙂 Настроение {metrics.mood ? `(${metrics.mood}/5)` : ''}</span>
          <div className="scale">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className={`btn${metrics.mood === n ? ' primary' : ''}`} disabled={saving} aria-label={`Настроение ${n} из 5`}
                onClick={() => log('mood', n, 'set', `настроение ${n}/5`)}>{n}</button>
            ))}
          </div>
        </div>
        {FIELDS.map(f => (
          <form key={f.metric} className="qi-row" onSubmit={e => { e.preventDefault(); submit(f) }}>
            <label className="field">
              <span>{f.icon} {f.label}{f.mode === 'add' ? ' +' : ''} <small>({f.unit}){metrics[f.metric] !== undefined ? ` · сейчас ${metrics[f.metric]}` : ''}</small></span>
              <input inputMode="decimal" placeholder="0" value={vals[f.metric] ?? ''} onChange={e => setVals(v => ({ ...v, [f.metric]: e.target.value }))} />
            </label>
            <button className="btn primary" disabled={saving} aria-label={`Сохранить: ${f.label}`}>{f.mode === 'add' ? '+' : 'OK'}</button>
          </form>
        ))}
        {msg && <p className={msg.err ? 'err' : 'ok'} role="status">{msg.text}</p>}
      </div>
    </div>
  )
}
