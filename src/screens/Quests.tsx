import { useState } from 'react'
import { Check, Swords, Trophy } from 'lucide-react'
import { StatIcon } from '../ui/icons'
import XpBar from '../ui/XpBar'
import Confirm from '../ui/Confirm'
import Ladders from './Ladders'
import { useWrite } from '../ui/useWrite'
import type { GameState } from '../domain/types'
import SeasonBoss from './SeasonBoss'
import Chain from './Chain'

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
            <div className="row qhead">
              {q.stat && <StatIcon stat={q.stat} />}
              <span className="grow">{q.title}</span><b className="xpchip">+{q.xp} XP</b>
            </div>
            <XpBar into={Math.min(q.progress, q.target)} need={q.target} label={q.title} unit="" />
            {q.done && <small className="ok"><Check size={14} aria-hidden="true" /> Выполнено</small>}
          </div>
        ))}
      </section>
      <Ladders state={state} />
      <SeasonBoss state={state} />
      <Chain state={state} />
      {state.bosses.length > 0 && <section className="panel stack" aria-label="Прежние цели">
        <h1>Прежние цели</h1>
        {state.bosses.map(b => (
          <div key={b.id} className="card boss">
            <div className="row qhead">
              <span className="ico" style={{ '--c': 'var(--shadow)' } as React.CSSProperties} aria-hidden="true"><Swords size={22} /></span>
              <b className="grow">{b.title}{b.defeated ? ' — побеждён!' : ''}</b>
              {b.defeated && <Trophy size={20} color="var(--gold)" aria-hidden="true" />}
            </div>
            <ol className="stages">{b.stages.map((s, i) => (
              <li key={i} className={i < b.done ? 'done' : undefined}>{i < b.done && <Check size={14} aria-hidden="true" />}{s}</li>
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
      </section>}
      {giveUp && <Confirm title="Сдаться? Босс исчезнет из списка." yes="Сдаться" onNo={() => setGiveUp(null)}
        onYes={() => { const id = giveUp; setGiveUp(null); void w.write({ type: 'boss_abandoned', bossId: id }, 'Босс брошен') }} />}
    </div>
  )
}
