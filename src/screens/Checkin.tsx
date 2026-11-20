import { useRef, useState } from 'react'
import { X, Zap } from 'lucide-react'
import { appendEvents } from '../db'
import { BALANCE } from '../domain/balance'
import type { GameState } from '../domain/types'
import { getAiConfig } from '../ai/config'
import { aiTuning } from '../ai/tasks'
import { loadState } from '../useGame'
import { useDialog } from '../ui/useDialog'

const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (!n.delete(id)) n.add(id); return n }

/** Вечерний чек‑ин: ритуалы, срывы Тени, что получилось / что нет / энергия 1–10. Дата — игровая. */
export default function Checkin({ state, onClose }: { state: GameState; onClose: () => void }) {
  const date = state.today.date
  const rituals = state.ladders.filter(l => (l.status === 'active' || l.status === 'auto') && !l.todayDone)
  const facets = state.shadow.facets.filter(f => !f.banished && !f.relapsedToday)
  const [rit, setRit] = useState<Set<string>>(new Set())
  const [rel, setRel] = useState<Set<string>>(new Set())
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
      // отдельными событиями до чек-ина, атомарно
      await appendEvents([
        ...[...rit].map(ladderId => ({ type: 'ritual_done' as const, ladderId, date })),
        ...[...rel].map(facetId => ({ type: 'shadow_relapse' as const, facetId, date })),
        { type: 'checkin', date, ...c },
      ])
      onClose()
      void (async () => { // фон: ошибки ИИ молча игнорируются
        const cfg = await getAiConfig()
        if (!cfg) return
        const t = await aiTuning(cfg, await loadState(), c)
        await appendEvents([{ type: 'ai_tuning', date, ...t }])
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
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        {rituals.length > 0 && (
          <div className="field" role="group" aria-label="Ритуалы">
            <span>Ритуалы сегодня</span>
            <div className="chips">{rituals.map(l => (
              <button key={l.id} type="button" className={`btn${rit.has(l.id) ? ' primary' : ''}`} aria-pressed={rit.has(l.id)}
                onClick={() => setRit(toggle(rit, l.id))}>{l.title} · {l.label}</button>
            ))}</div>
          </div>
        )}
        {facets.length > 0 && (
          <div className="field" role="group" aria-label="Тень">
            <span>Тень</span>
            <div className="chips">{facets.map(f => (
              <button key={f.id} type="button" className={`btn${rel.has(f.id) ? ' on-shadow' : ' ghost'}`} aria-pressed={rel.has(f.id)}
                onClick={() => setRel(toggle(rel, f.id))}>Был срыв: {f.name}</button>
            ))}</div>
            <small className="muted">Честно — +{BALANCE.shadow.honestXp} XP. Срыв — это данные, а не наказание.</small>
          </div>
        )}
        <label className="field">Что получилось
          <textarea rows={3} maxLength={500} value={went} onChange={e => setWent(e.target.value)} />
        </label>
        <label className="field">Что нет
          <textarea rows={3} maxLength={500} value={notWent} onChange={e => setNotWent(e.target.value)} />
        </label>
        <div className="field">
          <span className="lbl"><Zap size={16} aria-hidden="true" /> Энергия {energy ? `${energy}/10` : ''}</span>
          <div className="scale energy">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} style={{ '--e': n } as React.CSSProperties} className={`btn${energy === n ? ' on' : ''}`} aria-label={`Энергия ${n} из 10`} aria-pressed={energy === n}
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
