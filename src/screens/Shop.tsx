import { useState } from 'react'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'
import type { GameState } from '../domain/types'

const dm = (ts: number) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function Shop({ state }: { state: GameState }) {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [ask, setAsk] = useState<{ kind: 'buy' | 'del'; id: string; title: string; price: number } | null>(null)
  const w = useWrite()
  const create = async () => {
    const t = title.trim(), p = Number(price)
    if (!t || t.length > 60) return w.setMsg({ ok: false, text: 'Название: от 1 до 60 символов' })
    if (!Number.isInteger(p) || p < 1 || p > 100000) return w.setMsg({ ok: false, text: 'Цена: целое число от 1 до 100000' })
    if (await w.write({ type: 'reward_created', rewardId: crypto.randomUUID(), title: t, price: p }, 'Награда добавлена')) { setTitle(''); setPrice('') }
  }
  const yes = () => {
    const a = ask!; setAsk(null)
    void (a.kind === 'buy' ? w.write({ type: 'reward_purchased', rewardId: a.id }, 'Куплено! Наслаждайся 🎉') : w.write({ type: 'reward_deleted', rewardId: a.id }, 'Награда удалена'))
  }
  return (
    <div className="home stack">
      <section className="panel stack" aria-label="Магазин">
        <h1>Магазин <span className="coins" aria-label={`Монеты: ${state.currency}`}>🪙 {state.currency}</span></h1>
        {state.rewards.length === 0 && <p className="muted">Придумай награды за свои монеты — например, «1 час игр — 150».</p>}
        {state.rewards.map(r => (
          <div key={r.id} className="card">
            <b>{r.title}</b>
            <div className="row">
              <button className="btn primary" style={{ flex: 1 }} disabled={w.busy || state.currency < r.price}
                onClick={() => setAsk({ kind: 'buy', id: r.id, title: r.title, price: r.price })}>
                Купить · 🪙 {r.price}{state.currency < r.price && <small>Не хватает {r.price - state.currency}</small>}</button>
              <button className="btn ghost" disabled={w.busy} aria-label={`Удалить «${r.title}»`} onClick={() => setAsk({ kind: 'del', id: r.id, title: r.title, price: r.price })}>Удалить</button>
            </div>
          </div>
        ))}
        {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      </section>
      <section className="panel stack" aria-label="Новая награда">
        <h2>Новая награда</h2>
        <label className="field">Название<input value={title} maxLength={60} onChange={e => { setTitle(e.target.value); w.setMsg(null) }} /></label>
        <label className="field">Цена (🪙)<input type="number" inputMode="numeric" min={1} max={100000} value={price} onChange={e => { setPrice(e.target.value); w.setMsg(null) }} /></label>
        <button className="btn primary big" disabled={w.busy} onClick={create}>Добавить</button>
      </section>
      <section className="panel stack" aria-label="История покупок">
        <h2>История покупок</h2>
        {state.purchases.length === 0 && <p className="muted">Пока пусто.</p>}
        {state.purchases.slice(-20).reverse().map((p, i) => (
          <div key={i} className="stat" style={{ gridTemplateColumns: '48px 1fr auto' }}><span className="muted">{dm(p.ts)}</span><span>{p.title}</span><b>🪙 {p.price}</b></div>
        ))}
      </section>
      {ask && <Confirm title={ask.kind === 'buy' ? `Купить «${ask.title}» за ${ask.price}?` : `Удалить «${ask.title}»?`}
        yes={ask.kind === 'buy' ? 'Купить' : 'Удалить'} onYes={yes} onNo={() => setAsk(null)} />}
    </div>
  )
}
