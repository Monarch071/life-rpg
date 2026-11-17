import { useState } from 'react'
import Avatar, { EYE_OPTIONS, HAIR_OPTIONS } from '../ui/Avatar'
import { STATS } from '../domain/stats'
import { appendEvent } from '../db'
import type { AvatarParams, GameState, Stat } from '../domain/types'

const HAIR_NAMES: Record<string, string> = { short: 'Короткая', spiky: 'Колючая', long: 'Длинная', ponytail: 'Хвост' }
const EYE_NAMES: Record<string, string> = { round: 'Круглые', sharp: 'Острые', calm: 'Спокойные' }
const HAIR_COLORS = ['#2b1d14', '#6b4226', '#ffb703', '#e8e8f0', '#c2185b', '#2fb5ff', '#7c4dff', '#2e7d32']
const OUTFIT_COLORS = ['#2fb5ff', '#b14dff', '#ff5d73', '#ffd166', '#5dffb0', '#ff8a3d', '#e8e8f0', '#3949ab']
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {colors.map(c => (
          <button key={c} type="button" className="icon-btn" aria-label={c} aria-pressed={value === c}
            style={{ background: c, borderColor: value === c ? 'var(--gold)' : 'var(--shadow)', borderWidth: value === c ? 3 : 1 }}
            onClick={() => onPick(c)} />
        ))}
        <input type="color" aria-label={`${label}: свой цвет`} value={value} onChange={e => onPick(e.target.value)}
          style={{ width: 44, height: 44, padding: 0, border: 'none', background: 'none' }} />
      </div>
    </div>
  )
}

function Editor({ saved }: { saved: AvatarParams }) {
  const [p, setP] = useState(saved)
  const [msg, setMsg] = useState('')
  const set = (patch: Partial<AvatarParams>) => { setP({ ...p, ...patch }); setMsg('') }
  const save = async () => {
    try { await appendEvent({ type: 'avatar_updated', params: p }); setMsg('Образ сохранён.') }
    catch { setMsg('Не удалось сохранить.') }
  }
  return (
    <section className="panel stack" aria-label="Редактор образа">
      <h2>Образ</h2>
      <div className="field"><span>Причёска</span>
        <div className="chips">{HAIR_OPTIONS.map(h => (
          <button key={h} className={`btn${p.hair === h ? ' primary' : ''}`} aria-pressed={p.hair === h} onClick={() => set({ hair: h })}>{HAIR_NAMES[h]}</button>
        ))}</div></div>
      <div className="field"><span>Глаза</span>
        <div className="chips">{EYE_OPTIONS.map(h => (
          <button key={h} className={`btn${p.eyes === h ? ' primary' : ''}`} aria-pressed={p.eyes === h} onClick={() => set({ eyes: h })}>{EYE_NAMES[h]}</button>
        ))}</div></div>
      <Swatches label="Цвет волос" colors={HAIR_COLORS} value={p.hairColor} onPick={c => set({ hairColor: c })} />
      <Swatches label="Цвет одежды" colors={OUTFIT_COLORS} value={p.outfitColor} onPick={c => set({ outfitColor: c })} />
      <div className="center"><Avatar params={p} tier={1} size={140} decorative /></div>
      <button className="btn primary big" onClick={save}>Сохранить образ</button>
      {msg && <p aria-live="polite" className="center">{msg}</p>}
    </section>
  )
}

export default function Character({ state }: { state: GameState }) {
  const last7 = state.history.slice(-7)
  return (
    <div className="home stack">
      <section className="hero">
        <Avatar params={state.avatar} tier={state.tier} size={220} />
        <div className="cls">{state.className}</div>
        <div className="muted">Уровень {state.level} · Тир {state.tier}</div>
      </section>
      <section className="panel stack" aria-label="Характеристики">
        {(Object.keys(STATS) as Stat[]).map(s => {
          const pts = state.statPoints[s] % 10
          const m = state.multipliers[s]
          return (
            <div key={s}>
              <div className="stat">
                <span>{STATS[s].icon} {STATS[s].name}</span>
                <div className="bar" role="progressbar" aria-label={`${STATS[s].name}: ${pts} из 10 до +1`} aria-valuemin={0} aria-valuemax={10} aria-valuenow={pts}><i style={{ width: `${pts * 10}%` }} /></div>
                <b>{state.stats[s]}</b>
              </div>
              <small className="muted">{pts}/10 до +1 · ×{m.toFixed(2)}{m > 1 ? ' · сложность растёт' : m < 1 ? ' · облегчено' : ''}</small>
            </div>
          )
        })}
      </section>
      <section className="panel stack" aria-label="История">
        <h2>Последние дни</h2>
        {last7.length === 0 ? <p className="muted">Пока нет завершённых дней.</p> : (
          <div className="chips">{last7.map(d => (
            <span key={d.date} className="pill" style={d.won ? undefined : { background: 'var(--shadow)' }}>{dm(d.date)} · {d.won ? 'Победа' : 'Тень'}</span>
          ))}</div>
        )}
      </section>
      <Editor saved={state.avatar} />
    </div>
  )
}
