import { useState } from 'react'
import { cosmeticById, type CosmeticSlot } from '../domain/cosmetics'
import type { GameState } from '../domain/types'
import Avatar from './Avatar'
import { useWrite } from './useWrite'

const SLOTS: [CosmeticSlot, string][] = [['head', 'Голова'], ['neck', 'Шея'], ['cloak', 'Плащ'], ['emblem', 'Знак'], ['background', 'Фон главной'], ['frame', 'Рамка портрета'], ['look', 'Тема ИИ-персонажа']]
const SOURCE = { path: 'путь сезона', chest: 'сундук недели', shop: 'магазин', trophy: 'трофей' } as const

/** «Инвентарь»: полка по слотам, примерка без надевания, «Надеть» / «Снять». */
export default function Wardrobe({ state }: { state: GameState }) {
  const w = useWrite()
  const { owned, equipped } = state.cosmetics
  const [tryOn, setTryOn] = useState<{ slot: CosmeticSlot; id: string; title: string } | null>(null)
  const shown = tryOn ? { ...equipped, [tryOn.slot]: tryOn.id } : equipped
  const items = owned.map(o => ({ ...o, def: cosmeticById(o.id) })).filter(o => o.def)
  const put = (slot: CosmeticSlot, itemId: string | null, title: string) =>
    void w.write({ type: 'cosmetic_equipped', slot, itemId }, itemId ? `Надето: ${title}` : `Снято: ${title}`)
  return (
    <section className="panel stack" aria-label="Снаряжение">
      <div className="sec"><h2>Инвентарь</h2><span>вещей {items.length}</span></div>
      <div className={`try-stage${tryOn ? ' on' : ''}`}>
        <Avatar params={state.avatar} tier={state.tier} size={180} wear={shown} decorative />
        {tryOn && <div className="try-bar" role="status">
          <span>Примерка: <b>{tryOn.title}</b></span>
          <button className="btn primary sm" disabled={w.busy} onClick={() => { put(tryOn.slot, tryOn.id, tryOn.title); setTryOn(null) }}>Надеть</button>
          <button className="btn ghost sm" onClick={() => setTryOn(null)}>Отмена</button>
        </div>}
      </div>
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
                  {!on && (slot === 'head' || slot === 'neck' || slot === 'cloak' || slot === 'emblem') && <button className="btn ghost sm" aria-pressed={tryOn?.id === o.id}
                    aria-label={`Примерить: ${title}`} onClick={() => setTryOn(tryOn?.id === o.id ? null : { slot, id: o.id, title })}>Примерить</button>}
                  <button className={`btn sm${on ? ' ghost' : ' primary'}`} disabled={w.busy} aria-pressed={on}
                    aria-label={`${on ? 'Снять' : 'Надеть'}: ${title}`} onClick={() => put(slot, on ? null : o.id, title)}>{on ? 'Снять' : 'Надеть'}</button>
                </div>
              )
            })}
          </div>
        )
      })}
      {equipped.look && <small className="muted">Тема сезона для ИИ-персонажа. На ИИ-картинке носимые вещи не рисуются (они видны здесь), фон и рамка работают всегда.</small>}
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
    </section>
  )
}
