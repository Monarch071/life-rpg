import { useState } from 'react'
import { CalendarCheck, Flame, Footprints, Ghost, Lock, Medal, Moon, ShoppingBag, Skull, Sparkles, Star, Swords, Trophy, type LucideIcon } from 'lucide-react'
import { ACHIEVEMENTS } from '../domain/achievements'
import type { GameState } from '../domain/types'

const FIRE = ['var(--fire)', 'var(--gold)'], SHADOW = ['var(--shadow)', 'var(--shadow2)'], UP = ['var(--up)', 'var(--cha)']
// id → иконка и цвета кристалла (по префиксу id)
function look(id: string): [LucideIcon, string[]] {
  if (id.startsWith('streak')) return [Flame, FIRE]
  if (id === 'shadow_win') return [Ghost, SHADOW]
  if (id.startsWith('shadow')) return [Skull, SHADOW]
  if (id.startsWith('level')) return [Trophy, ['var(--gold)', 'var(--fire)']]
  if (id.startsWith('steps')) return [Footprints, ['var(--end)', 'var(--dis)']]
  if (id === 'perfect_day') return [Star, ['var(--gold)', 'var(--fire2)']]
  if (id.startsWith('checkin')) return [Moon, ['var(--int)', 'var(--dis)']]
  if (id.endsWith('purchase')) return [ShoppingBag, ['var(--fin)', 'var(--fire2)']]
  if (id.endsWith('skill')) return [Sparkles, ['var(--spi)', 'var(--int)']]
  if (id.startsWith('weekly')) return [CalendarCheck, ['var(--dis)', 'var(--int)']]
  if (id.startsWith('boss')) return [Swords, ['var(--str)', 'var(--shadow)']]
  return [Medal, UP]
}
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

export default function Achievements({ state }: { state: GameState }) {
  const got = new Map(state.achievements.map(a => [a.id, a.date]))
  const [sel, setSel] = useState<string | null>(null)
  const cur = ACHIEVEMENTS.find(a => a.id === sel)
  return (
    <section className="panel stack" aria-label="Достижения">
      <div className="sec"><h2>Достижения</h2><span>{got.size} / {ACHIEVEMENTS.length}</span></div>
      <div className="gems">{ACHIEVEMENTS.map(a => {
        const d = got.get(a.id)
        const [Icon, [g1, g2]] = look(a.id)
        return (
          <button key={a.id} type="button" className={`gem${d ? '' : ' off'}`} aria-pressed={sel === a.id} aria-label={`${a.title}${d ? `, получено ${dm(d)}` : ', не получено'}. ${a.desc}`}
            style={{ '--g1': g1, '--g2': g2 } as React.CSSProperties} onClick={() => setSel(sel === a.id ? null : a.id)}>
            <span className="hex" aria-hidden="true">{d ? <Icon /> : <Lock />}</span>
            <b aria-hidden="true">{a.title}</b>
            <small aria-hidden="true">{d ? dm(d) : ''}</small>
          </button>
        )
      })}</div>
      {cur && <p role="status" className="gem-desc"><b>{cur.title}</b> — {cur.desc}</p>}
    </section>
  )
}
