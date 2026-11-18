import { useState } from 'react'
import { Crown } from 'lucide-react'
import Avatar, { EYE_OPTIONS, HAIR_OPTIONS } from '../ui/Avatar'
import { STATS } from '../domain/stats'
import { StatIcon } from '../ui/icons'
import { appendEvent } from '../db'
import { imageNameFor } from '../ai/avatar'
import { useBlobUrl } from '../blobs'
import AvatarAi, { PhotoCta, type Go } from './AvatarAi'
import StatRadar from '../ui/StatRadar'
import Skills from './Skills'
import { InterviewCta, Portrait } from './Interview'
import Achievements from './Achievements'
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
        {colors.map((c, i) => (
          <button key={c} type="button" className="icon-btn" aria-label={`Цвет №${i + 1}`} aria-pressed={value === c}
            style={{ background: c, borderColor: value === c ? 'var(--gold)' : 'var(--shadow)', borderWidth: value === c ? 3 : 1 }}
            onClick={() => onPick(c)} />
        ))}
        <input type="color" aria-label={`${label}: свой цвет`} value={value} onChange={e => onPick(e.target.value)}
          style={{ width: 44, height: 44, padding: 0, border: 'none', background: 'none' }} />
      </div>
    </div>
  )
}

function Editor({ saved, tier }: { saved: AvatarParams; tier: 1 | 2 | 3 | 4 }) {
  const [p, setP] = useState(saved)
  const [msg, setMsg] = useState('')
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<AvatarParams>) => { setP({ ...p, ...patch }); setMsg('') }
  const save = async () => {
    try { await appendEvent({ type: 'avatar_updated', params: p }); setMsg('Образ сохранён.') }
    catch { setMsg('Не удалось сохранить.') }
  }
  return (
    <section className="panel stack" aria-label="Редактор образа">
      <div className="sec"><h2>Образ</h2></div>
      <button type="button" className="btn" aria-expanded={open} aria-controls="avatar-editor" onClick={() => setOpen(!open)}>{open ? 'Свернуть' : 'Изменить образ'}</button>
      {open && <div id="avatar-editor" className="stack">
      <div className="field"><span>Причёска</span>
        <div className="chips">{HAIR_OPTIONS.map(h => (
          <button key={h} type="button" className={`btn${p.hair === h ? ' primary' : ''}`} aria-pressed={p.hair === h} onClick={() => set({ hair: h })}>{HAIR_NAMES[h]}</button>
        ))}</div></div>
      <div className="field"><span>Глаза</span>
        <div className="chips">{EYE_OPTIONS.map(h => (
          <button key={h} type="button" className={`btn${p.eyes === h ? ' primary' : ''}`} aria-pressed={p.eyes === h} onClick={() => set({ eyes: h })}>{EYE_NAMES[h]}</button>
        ))}</div></div>
      <Swatches label="Цвет волос" colors={HAIR_COLORS} value={p.hairColor} onPick={c => set({ hairColor: c })} />
      <Swatches label="Цвет одежды" colors={OUTFIT_COLORS} value={p.outfitColor} onPick={c => set({ outfitColor: c })} />
      <div className="center"><Avatar params={p} tier={tier} size={140} decorative /></div>
      <button className="btn primary big" onClick={save}>Сохранить образ</button>
      </div>}
      {msg && <p aria-live="polite" className="center">{msg}</p>}
    </section>
  )
}

export default function Character({ state, go, interview }: { state: GameState; go: Go; interview: () => void }) {
  const last7 = state.history.slice(-7)
  const img = useBlobUrl(imageNameFor(state.avatarImages, state.tier))
  const [chart, setChart] = useState(true)
  const prev = state.statHistory.length ? state.statHistory[Math.max(0, state.statHistory.length - 7)].stats : null
  // контур «неделю назад» — только когда есть история и он отличается от текущего
  const radarPrev = prev && state.statHistory.length >= 2 && (Object.keys(STATS) as Stat[]).some(k => prev[k] !== state.stats[k]) ? prev : null
  return (
    <div className="home stack">
      <section className="hero-banner" aria-label="Герой">
        <div className="stage-art" aria-hidden="true">
          {img ? <img src={img} alt="" /> : <div className="stage-fallback"><Avatar params={state.avatar} tier={state.tier} size={300} decorative /></div>}
        </div>
        <div className="glass banner-card">
          <b><small>Lv.</small>{state.level}</b>
          <div>
            <div className="rank">{state.className}</div>
            <span className="ttl"><Crown size={14} aria-hidden="true" />{state.title}</span>
            <small className="muted">Очки навыков: {state.skills.points} · Тир {state.tier}</small>
          </div>
        </div>
      </section>
      {!img && <PhotoCta go={go} />}
      <section className="panel stats" aria-label="Характеристики">
        <div className="sec"><h3>Характеристики</h3>
          <div className="seg-toggle" role="group" aria-label="Вид">
            <button type="button" aria-pressed={chart} onClick={() => setChart(true)}>Диаграмма</button>
            <button type="button" aria-pressed={!chart} onClick={() => setChart(false)}>Список</button>
          </div>
        </div>
        {chart ? <>
          <StatRadar stats={state.stats} prev={radarPrev} />
          {radarPrev && <p className="muted center radar-key"><i /> неделю назад</p>}
        </> : (Object.keys(STATS) as Stat[]).map(s => {
          const pts = state.statPoints[s] % 10
          const m = state.multipliers[s]
          const d = prev ? state.stats[s] - prev[s] : 0
          return (
            <div key={s} className="stat-row">
              <div className="stat">
                <StatIcon stat={s} />
                <span className="n">{STATS[s].name}</span>
                <span className="d">{d > 0 ? `▲${d}` : ''}</span>
                <b className="v">{state.stats[s]}</b>
              </div>
              <div className="bar" style={{ '--c': `var(--${s})` } as React.CSSProperties} role="progressbar" aria-label={`${STATS[s].name}: ${pts} из 10 до +1`} aria-valuemin={0} aria-valuemax={10} aria-valuenow={pts}><i style={{ width: `${pts * 10}%` }} /></div>
              <small className="muted">{pts}/10 до +1 · ×{m.toFixed(2)}{m > 1 ? ' · сложность растёт' : m < 1 ? ' · облегчено' : ''}</small>
            </div>
          )
        })}
      </section>
      {state.character ? <Portrait c={state.character} onRetake={interview} /> : <InterviewCta onStart={interview} />}
      <Skills state={state} />
      <Achievements state={state} />
      <section className="panel stack" aria-label="История">
        <h2>Последние дни</h2>
        {last7.length === 0 ? <p className="muted">Пока нет завершённых дней.</p> : (
          <div className="chips">{last7.map(d => (
            <span key={d.date} className="pill" style={d.won ? undefined : { background: 'var(--shadow)' }}>{dm(d.date)} · {d.won ? 'Победа' : 'Тень'}</span>
          ))}</div>
        )}
      </section>
      <Editor saved={state.avatar} tier={state.tier} />
      <div id="avatar-ai"><AvatarAi state={state} /></div>
    </div>
  )
}
