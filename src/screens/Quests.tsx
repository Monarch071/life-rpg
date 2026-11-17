import { useState } from 'react'
import { STATS } from '../domain/stats'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'
import type { GameState, Stat } from '../domain/types'

function NewBoss({ state }: { state: GameState }) {
  const [title, setTitle] = useState('')
  const [stat, setStat] = useState<Stat>('int')
  const [stages, setStages] = useState('')
  const w = useWrite()
  const create = async () => {
    const t = title.trim()
    const st = stages.split('\n').map(s => s.trim()).filter(Boolean)
    if (!t || t.length > 80) return w.setMsg({ ok: false, text: 'Цель: от 1 до 80 символов' })
    if (st.length < 2 || st.length > 8) return w.setMsg({ ok: false, text: 'Нужно от 2 до 8 этапов, по одному на строку' })
    if (st.some(s => s.length > 80)) return w.setMsg({ ok: false, text: 'Этап не длиннее 80 символов' })
    if (await w.write({ type: 'boss_created', bossId: crypto.randomUUID(), title: t, stat, stages: st }, 'Босс создан!')) { setTitle(''); setStages('') }
  }
  return (
    <section className="panel stack" aria-label="Новый босс">
      <h2>Новый босс</h2>
      {state.profile && state.profile.goals.length > 0 && (
        <div className="field"><span>Из твоих целей</span>
          <div className="chips">{state.profile.goals.map((g, i) => (
            <button key={i} type="button" className="btn ghost" onClick={() => { setTitle(g.text.slice(0, 80)); setStat(g.stat) }}>{g.text}</button>
          ))}</div></div>
      )}
      <label className="field">Цель<input value={title} maxLength={80} onChange={e => { setTitle(e.target.value); w.setMsg(null) }} /></label>
      <div className="field"><span>Характеристика</span>
        <div className="chips" role="group" aria-label="Характеристика">{(Object.keys(STATS) as Stat[]).map(s => (
          <button key={s} type="button" className={`btn${stat === s ? ' primary' : ''}`} aria-pressed={stat === s} onClick={() => setStat(s)}>{STATS[s].icon} {STATS[s].name}</button>
        ))}</div></div>
      <label className="field">Этапы (по одному на строку, 2–8)<textarea rows={5} value={stages} onChange={e => { setStages(e.target.value); w.setMsg(null) }} /></label>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn primary big" disabled={w.busy} onClick={create}>Создать босса</button>
    </section>
  )
}

export default function Quests({ state }: { state: GameState }) {
  const w = useWrite()
  const [giveUp, setGiveUp] = useState<string | null>(null)
  return (
    <div className="home stack">
      <section className="panel stack" aria-label="Неделя">
        <h1>Неделя</h1>
        {state.weekly.quests.length === 0 && <p className="muted">Недельные задания появятся, когда начнёшь день</p>}
        {state.weekly.quests.map(q => (
          <div key={q.id} className="card">
            <div className="stat" style={{ gridTemplateColumns: '1fr auto' }}>
              <span>{q.stat ? STATS[q.stat].icon + ' ' : ''}{q.title}</span><b className="q-xp">+{q.xp} XP</b>
            </div>
            <div className="bar" role="progressbar" aria-label={q.title} aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={Math.min(q.progress, q.target)}>
              <i style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} /></div>
            <small className={q.done ? 'ok' : 'muted'}>{q.done ? '✓ Выполнено' : `${Math.min(q.progress, q.target)}/${q.target}`}</small>
          </div>
        ))}
      </section>
      <section className="panel stack" aria-label="Боссы">
        <h1>Боссы</h1>
        {state.bosses.length === 0 && <p className="muted">Боссов пока нет — создай первого ниже.</p>}
        {state.bosses.map(b => (
          <div key={b.id} className="card">
            <b>{STATS[b.stat].icon} {b.title}{b.defeated ? ' — побеждён! 🏆' : ''}</b>
            <ol style={{ margin: 0, paddingLeft: 22 }}>{b.stages.map((s, i) => (
              <li key={i} style={i < b.done ? { textDecoration: 'line-through', opacity: 0.55 } : undefined}>{s}</li>
            ))}</ol>
            {!b.defeated && (<>
              <button className="btn primary" disabled={w.busy}
                onClick={() => w.write({ type: 'boss_stage_done', bossId: b.id, stage: b.done }, b.done === b.stages.length - 1 ? 'Босс побеждён! 🏆' : 'Этап пройден!')}>
                Этап выполнен ({b.done === b.stages.length - 1 ? '+300 XP — победа над боссом!' : '+100 XP'})</button>
              <button className="btn ghost" disabled={w.busy} onClick={() => setGiveUp(b.id)}>Сдаться</button>
            </>)}
          </div>
        ))}
        {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      </section>
      <NewBoss state={state} />
      {giveUp && <Confirm title="Сдаться? Босс исчезнет из списка." yes="Сдаться" onNo={() => setGiveUp(null)}
        onYes={() => { const id = giveUp; setGiveUp(null); void w.write({ type: 'boss_abandoned', bossId: id }, 'Босс брошен') }} />}
    </div>
  )
}
