import { Trophy } from 'lucide-react'
import type { GameState } from '../domain/types'
import { money } from '../ui/finView'

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`
const int = (n: number) => n.toLocaleString('ru-RU')

/** Зал славы (спека §5): шесть рекордов — значение, дата, «установлен» / «побит». Экран владельца: накопления — с суммой. */
export default function HallOfFame({ state, cur }: { state: GameState; cur: string }) {
  return (
    <section className="panel" aria-label="Зал славы">
      <h2><Trophy size={18} aria-hidden="true" /> Зал славы</h2>
      <ul className="perk-list hof">{state.records.map(r => (
        <li key={r.id}>
          <span className="grow"><b>{r.title}</b>
            <small>{r.value === null || r.date === null ? 'ещё нет' : `${dm(r.date)} · ${r.prev !== null && r.prev > 0 ? `побит (было ${r.id === 'savings_month' ? money(r.prev, cur) : int(r.prev)})` : 'рекорд установлен'}`}</small></span>
          <b className="hof-v">{r.value === null ? '—' : r.id === 'savings_month' ? money(r.value, cur) : `${int(r.value)} ${r.unit}`}</b>
        </li>))}</ul>
    </section>
  )
}
