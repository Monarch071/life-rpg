import { cosmeticById, type CosmeticSlot } from '../domain/cosmetics'
import type { GameState } from '../domain/types'
import Avatar from './Avatar'
import { useWrite } from './useWrite'

const SLOTS: [CosmeticSlot, string][] = [['head', 'Голова'], ['neck', 'Шея'], ['cloak', 'Плащ'], ['emblem', 'Знак'], ['background', 'Фон главной'], ['frame', 'Рамка портрета'], ['look', 'Образ ИИ-аватара']]
const SOURCE = { path: 'путь сезона', chest: 'сундук недели', shop: 'магазин', trophy: 'трофей' } as const

/** «Снаряжение»: полка по слотам, «Надеть» / «Снять», превью на SVG-аватаре. */
export default function Wardrobe({ state }: { state: GameState }) {
  const w = useWrite()
  const { owned, equipped } = state.cosmetics
  const items = owned.map(o => ({ ...o, def: cosmeticById(o.id) })).filter(o => o.def)
  const put = (slot: CosmeticSlot, itemId: string | null, title: string) =>
    void w.write({ type: 'cosmetic_equipped', slot, itemId }, itemId ? `Надето: ${title}` : `Снято: ${title}`)
  return (
    <section className="panel stack" aria-label="Снаряжение">
      <div className="sec"><h2>Снаряжение</h2><span>вещей {items.length}</span></div>
      <div className="center"><Avatar params={state.avatar} tier={state.tier} size={160} wear={equipped} decorative /></div>
      {items.length === 0 && <p className="muted">Пока пусто — вещи дают ступени пути сезона, сундук за ранг S и раздел «Снаряжение» в магазине.</p>}
      {SLOTS.map(([slot, label]) => {
        const list = items.filter(o => o.def!.slot === slot)
        if (!list.length) return null
        return (
          <div key={slot} className="stack shelf">
            <h3>{label}</h3>
            {list.map(o => {
              const on = equipped[slot] === o.id, title = o.def!.title
              return (
                <div key={o.id} className={`card row qhead${on ? ' worn' : ''}`}>
                  <span className="grow"><b>{title}</b><small className="muted"> · {SOURCE[o.source]}</small></span>
                  <button className={`btn sm${on ? ' ghost' : ' primary'}`} disabled={w.busy} aria-pressed={on}
                    aria-label={`${on ? 'Снять' : 'Надеть'}: ${title}`} onClick={() => put(slot, on ? null : o.id, title)}>{on ? 'Снять' : 'Надеть'}</button>
                </div>
              )
            })}
          </div>
        )
      })}
      {equipped.look && <small className="muted">Образ — тема сезона для ИИ-аватара. На ИИ-картинке носимые вещи не рисуются (они видны здесь), фон и рамка работают всегда.</small>}
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
    </section>
  )
}
