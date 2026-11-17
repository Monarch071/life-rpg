import { ACHIEVEMENTS } from '../domain/achievements'
import type { GameState } from '../domain/types'

export default function Achievements({ state }: { state: GameState }) {
  const got = new Map(state.achievements.map(a => [a.id, a.date]))
  return (
    <section className="panel stack" aria-label="Достижения">
      <h2>Достижения · {got.size}/{ACHIEVEMENTS.length}</h2>
      <div className="stack">{ACHIEVEMENTS.map(a => {
        const d = got.get(a.id)
        return (
          <div key={a.id} className="card" style={d ? { borderColor: 'var(--gold)' } : { opacity: 0.5, filter: 'grayscale(1)' }}>
            <b><span aria-hidden="true">{a.icon}</span> {a.title}{d && <span className="ok"> · {d.slice(8, 10)}.{d.slice(5, 7)}</span>}</b>
            <small>{a.desc}</small>
          </div>
        )
      })}</div>
    </section>
  )
}
