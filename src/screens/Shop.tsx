import { useState } from 'react'
import { Coins, Trash2 } from 'lucide-react'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'
import { BALANCE } from '../domain/balance'
import type { GameState } from '../domain/types'

type Reward = GameState['rewards'][number]

/** Почему покупку сейчас нельзя сделать (null — можно). Правила — как в replay: эффект платится из spendable. */
function blocked(r: Reward, s: GameState): string | null {
  const t = s.today
  if (r.effect === 'streak_freeze' && t.freezesLeft === 0) return 'Лимит месяца исчерпан'
  if (r.effect === 'day_off' && (t.dayOff || t.dayType?.kind === 'rest')) return 'Сегодня уже день без заданий'
  if (r.effect === 'day_off' && t.restDaysLeft === 0) return 'Дни отдыха в этом месяце закончились'
  const have = r.effect ? t.spendable : s.gold
  return have < r.price ? `Не хватает ${r.price - have}` : null
}

const dm = (ts: number) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` }

export default function Shop({ state }: { state: GameState }) {
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [ask, setAsk] = useState<{ kind: 'buy' | 'del'; id: string; title: string; price: number } | null>(null)
  const w = useWrite()
  const wf = useWrite() // форма новой награды: своё сообщение под кнопкой
  const create = async () => {
    const t = title.trim(), p = Number(price)
    if (!t || t.length > 60) return wf.setMsg({ ok: false, text: 'Название: от 1 до 60 символов' })
    if (!Number.isInteger(p) || p < 1 || p > 100000) return wf.setMsg({ ok: false, text: 'Цена: целое число от 1 до 100000' })
    if (await wf.write({ type: 'reward_created', rewardId: crypto.randomUUID(), title: t, price: p }, 'Награда добавлена')) { setTitle(''); setPrice('') }
  }
  const yes = () => {
    const a = ask!; setAsk(null)
    void (a.kind === 'buy' ? w.write({ type: 'reward_purchased', rewardId: a.id }, 'Куплено! Наслаждайся!') : w.write({ type: 'reward_deleted', rewardId: a.id }, 'Награда удалена'))
  }
  return (
    <div className="home stack">
      <section className="panel stack" aria-label="Магазин">
        <h1>Магазин</h1>
        <div className="balance" aria-label={`Золото: ${state.gold}`}><span className="coin big" aria-hidden="true"><Coins size={22} /></span><b>{state.gold}</b><small>Золото</small></div>
        {state.rewards.some(r => r.effect) && <p className="muted">Золото {state.gold} · на заморозку и день без заданий можно потратить {state.today.spendable}: они оплачиваются золотом прошлых дней, без сегодняшнего и наград за достижения.</p>}
        {state.rewards.length === 0 && <p className="muted">Придумай награды за своё золото — например, «1 час игр — 150».</p>}
        {state.rewards.map(r => { const why = blocked(r, state); return (
          <div key={r.id} className="card">
            <div className="row qhead"><b className="grow">{r.title}</b><span className="price"><Coins size={13} aria-hidden="true" />{r.price}</span></div>
            {r.effect === 'streak_freeze' && <small className="fx">Заморозка серии, до {BALANCE.shop.freezePerMonth} в месяц · осталось {state.today.freezesLeft}</small>}
            {r.effect === 'day_off' && <small className="fx">День без заданий: сегодня, серия не ломается</small>}
            <div className="row">
              <button className="btn primary" style={{ flex: 1 }} disabled={w.busy || !!why}
                onClick={() => setAsk({ kind: 'buy', id: r.id, title: r.title, price: r.price })}>
                Купить{why && <small>{why}</small>}</button>
              <button className="btn ghost" disabled={w.busy} aria-label={`Удалить «${r.title}»`} onClick={() => setAsk({ kind: 'del', id: r.id, title: r.title, price: r.price })}><Trash2 size={16} aria-hidden="true" />Удалить</button>
            </div>
          </div>
        ) })}
        {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      </section>
      <section className="panel stack" aria-label="Новая награда">
        <h2>Новая награда</h2>
        <label className="field">Название<input value={title} maxLength={60} onChange={e => { setTitle(e.target.value); wf.setMsg(null) }} /></label>
        <label className="field">Цена (золото)<input type="number" inputMode="numeric" min={1} max={100000} value={price} onChange={e => { setPrice(e.target.value); wf.setMsg(null) }} /></label>
        <button className="btn primary big" disabled={wf.busy} onClick={create}>Добавить</button>
        {wf.msg && <p role={wf.msg.ok ? 'status' : 'alert'} className={wf.msg.ok ? 'ok' : 'err'}>{wf.msg.text}</p>}
      </section>
      <section className="panel stack" aria-label="История покупок">
        <h2>История покупок</h2>
        {state.purchases.length === 0 && <p className="muted">Пока пусто.</p>}
        {state.purchases.slice(-20).reverse().map((p, i) => (
          <div key={i} className="hist"><span className="muted">{dm(p.ts)}</span><span className="grow">{p.title}</span><span className="price"><Coins size={13} aria-hidden="true" />{p.price}</span></div>
        ))}
      </section>
      {ask && <Confirm title={ask.kind === 'buy' ? `Купить «${ask.title}» за ${ask.price}?${state.rewards.find(r => r.id === ask.id)?.effect === 'day_off' ? ' Действует сегодня.' : ''}` : `Удалить «${ask.title}»?`}
        yes={ask.kind === 'buy' ? 'Купить' : 'Удалить'} onYes={yes} onNo={() => setAsk(null)} />}
    </div>
  )
}
