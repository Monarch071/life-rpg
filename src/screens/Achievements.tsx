import { useState } from 'react'
import { Lock } from 'lucide-react'
import { ACHIEVEMENTS } from '../domain/achievements'
import type { GameState } from '../domain/types'
import { achievementIcon, RARITY_NAME, rarityOf } from '../ui/achievementLook'

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

export default function Achievements({ state }: { state: GameState }) {
  const got = new Map(state.achievements.map(a => [a.id, a.date]))
  const [sel, setSel] = useState<string | null>(null)
  const cur = ACHIEVEMENTS.find(a => a.id === sel)
  return (
    <section className="panel stack" id="achievements" aria-label="Достижения">
      <div className="sec"><h2>Достижения</h2><span>{got.size} / {ACHIEVEMENTS.length}</span></div>
      <div className="gems">{ACHIEVEMENTS.map(a => {
        const d = got.get(a.id)
        const Icon = achievementIcon(a.id), r = rarityOf(a.id)
        return (
          <button key={a.id} type="button" className={`gem r-${r}${d ? '' : ' off'}`} aria-pressed={sel === a.id} aria-label={`${a.title}, ${RARITY_NAME[r]}${d ? `, получено ${dm(d)}` : ', не получено'}. ${a.desc}`}
            onClick={() => setSel(sel === a.id ? null : a.id)}>
            <span className="hex" aria-hidden="true">{d ? <Icon /> : <Lock />}</span>
            <b aria-hidden="true">{a.title}</b>
            <small aria-hidden="true">{d ? dm(d) : ''}</small>
          </button>
        )
      })}</div>
      {cur && <p role="status" className="gem-desc"><b>{cur.title}</b> · <span className={`rar r-${rarityOf(cur.id)}`}>{RARITY_NAME[rarityOf(cur.id)]}</span><br />{got.has(cur.id) ? cur.desc : `Как открыть: ${cur.desc.charAt(0).toLowerCase()}${cur.desc.slice(1)}`}</p>}
    </section>
  )
}
