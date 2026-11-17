import { useState } from 'react'
import { SKILLS } from '../domain/skills'
import { STATS } from '../domain/stats'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'
import type { GameState, Stat } from '../domain/types'

export default function Skills({ state }: { state: GameState }) {
  const { unlocked, points } = state.skills
  const [ask, setAsk] = useState<string | null>(null)
  const w = useWrite()
  const node = SKILLS.find(s => s.id === ask)
  return (
    <section className="panel stack" aria-label="Навыки">
      <h2>Навыки · Очки навыков: {points}</h2>
      {(Object.keys(STATS) as Stat[]).map(stat => (
        <div key={stat} className="stack">
          <b>{STATS[stat].icon} {STATS[stat].name}</b>
          {SKILLS.filter(s => s.stat === stat).map(s => {
            const open = unlocked.includes(s.id)
            const req = s.requires ? SKILLS.find(x => x.id === s.requires)! : null
            const reqOk = !req || unlocked.includes(req.id)
            const can = !open && reqOk && s.cost <= points
            return (
              <div key={s.id} className="card" style={open ? { borderColor: '#5dffb0' } : can ? undefined : { opacity: 0.6 }}>
                <b>{s.title}{open ? ' ✓' : ''}</b>
                <small>{s.desc}</small>
                {open ? <small className="ok">Открыт</small> : can
                  ? <button className="btn primary" disabled={w.busy} onClick={() => setAsk(s.id)}>Открыть за {s.cost}</button>
                  : <small className="muted">{!reqOk ? `Нужен узел «${req!.title}»` : 'Не хватает очков'} · цена {s.cost}</small>}
              </div>
            )
          })}
        </div>
      ))}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      {node && <Confirm title={`Открыть «${node.title}» за ${node.cost}?`} yes="Открыть" onNo={() => setAsk(null)}
        onYes={() => { setAsk(null); void w.write({ type: 'skill_unlocked', skillId: node.id }, `Открыто: ${node.title}`) }} />}
    </section>
  )
}
