import { useState } from 'react'
import { Check, Lock, Star } from 'lucide-react'
import { StatIcon, STAT_COLORS } from '../ui/icons'
import { SKILLS } from '../domain/skills'
import { STATS } from '../domain/stats'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'
import type { GameState, Stat } from '../domain/types'

export default function Skills({ state }: { state: GameState }) {
  const { unlocked, points } = state.skills
  const [ask, setAsk] = useState<string | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const w = useWrite()
  const node = SKILLS.find(s => s.id === ask)
  const sel = SKILLS.find(s => s.id === pick)
  const stateOf = (s: typeof SKILLS[number]) => {
    const open = unlocked.includes(s.id)
    const req = s.requires ? SKILLS.find(x => x.id === s.requires)! : null
    const reqOk = !req || unlocked.includes(req.id)
    return { open, req, reqOk, can: !open && reqOk && s.cost <= points }
  }
  return (
    <section className="panel stack" aria-label="Навыки">
      <div className="sec"><h2>Навыки</h2><span>Очки навыков: {points}</span></div>
      {(Object.keys(STATS) as Stat[]).map(stat => (
        <div key={stat} className="branch-row" style={{ '--c': STAT_COLORS[stat] } as React.CSSProperties}>
          <StatIcon stat={stat} size={18} />
          <div className="nodes">
            {SKILLS.filter(s => s.stat === stat).map((s, i) => {
              const { open, can } = stateOf(s)
              const st = open ? 'открыт' : can ? 'можно открыть' : 'закрыт'
              const label = s.id === `${stat}1` ? 'I' : s.id === `${stat}2` ? 'II' : null
              return (
                <button key={s.id} type="button" className={`dot ${open ? 'open' : can ? 'can' : 'locked'}`} aria-pressed={pick === s.id}
                  aria-label={`${s.title}, ${st}, цена ${s.cost}`} style={{ '--i': i } as React.CSSProperties} onClick={() => setPick(pick === s.id ? null : s.id)}>
                  {open ? <Check size={18} aria-hidden="true" /> : !can ? <Lock size={16} aria-hidden="true" /> : label ?? <Star size={16} aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {sel && (() => {
        const { open, req, reqOk, can } = stateOf(sel)
        return (
          <div className="card node-info" role="status" style={{ '--c': STAT_COLORS[sel.stat] } as React.CSSProperties}>
            <b>{sel.title}</b>
            <small>{sel.desc}</small>
            {open ? <small>Открыт</small> : can
              ? <button className="btn primary" disabled={w.busy} onClick={() => setAsk(sel.id)}>Открыть за {sel.cost}</button>
              : <small className="muted">{!reqOk ? `Нужен узел «${req!.title}»` : 'Не хватает очков'} · цена {sel.cost}</small>}
          </div>
        )
      })()}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      {node && <Confirm title={`Открыть «${node.title}» за ${node.cost}?`} yes="Открыть" onNo={() => setAsk(null)}
        onYes={() => { setAsk(null); void w.write({ type: 'skill_unlocked', skillId: node.id }, `Открыто: ${node.title}`) }} />}
    </section>
  )
}
