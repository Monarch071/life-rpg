import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { BALANCE } from '../domain/balance'
import { addDays } from '../domain/day'
import type { FinKind, GameState } from '../domain/types'
import Confirm from '../ui/Confirm'
import Sheet from '../ui/Sheet'
import { money } from '../ui/finView'
import { useWrite } from '../ui/useWrite'
import { parseAmount } from './QuickInput'

type Entry = GameState['finance']['entries'][number]
export const KIND_LABEL: Record<FinKind, string> = { expense: 'Расход', income: 'Доход', saving: 'Отложить' }
const KINDS = Object.keys(KIND_LABEL) as FinKind[]
const F = BALANCE.finance

/** Новая запись или правка существующей (entry). Дата — игровая: сегодня или вчера. */
export default function FinEntrySheet({ state, entry = null, cur, onClose }: { state: GameState; entry?: Entry | null; cur: string; onClose: () => void }) {
  const today = state.today.date, yesterday = addDays(today, -1)
  const [kind, setKind] = useState<FinKind>(entry?.kind ?? 'expense')
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '')
  const [cat, setCat] = useState<string | null>(entry && !entry.uncategorized ? entry.categoryId : null)
  const [date, setDate] = useState(entry?.date ?? today)
  const [note, setNote] = useState('')
  const [remember, setRemember] = useState(false)
  const [ask, setAsk] = useState(false)
  const w = useWrite()
  const cats = state.finance.categories.filter(c => c.kind === kind && (!c.archived || c.id === cat))
  // правило магазина — только для записей с текстом банка/Wallet
  const pattern = entry && entry.source !== 'manual' ? entry.text.trim().slice(0, F.patternMax) : ''
  const canRemember = !!pattern && pattern.length >= F.patternMin && cat !== null && cat !== (entry?.uncategorized ? null : entry?.categoryId)
  const save = async () => {
    const n = parseAmount(amount, { mode: 'add', max: F.amountMax })
    if (n === null) return w.setMsg({ ok: false, text: `Сумма: число больше 0, не больше ${F.amountMax}` })
    if (!cat) return w.setMsg({ ok: false, text: 'Выбери категорию' })
    const ok = entry
      ? await w.write([{ type: 'fin_entry_edited', entryId: entry.id, categoryId: cat, amount: n, ...(date !== entry.date ? { date } : {}) },
        ...(remember && canRemember ? [{ type: 'fin_rule_set' as const, ruleId: crypto.randomUUID(), pattern, categoryId: cat }] : [])], 'Запись изменена')
      : await w.write({ type: 'fin_entry_added', entryId: crypto.randomUUID(), date, kind, amount: n, categoryId: cat, ...(note.trim() ? { note: note.trim() } : {}) }, 'Записано')
    if (ok) onClose()
  }
  const remove = async () => { setAsk(false); if (entry && await w.write({ type: 'fin_entry_edited', entryId: entry.id, removed: true }, 'Запись удалена')) onClose() }
  return (
    <Sheet id="fin-entry-title" title={entry ? 'Запись' : 'Трата / доход'} onClose={onClose}>
      {entry && <p className="muted">{entry.text || KIND_LABEL[entry.kind]} · {money(entry.amount, cur)}{entry.dup ? ' · дубль, в суммы не входит' : ''}</p>}
      <div className="seg-toggle" role="group" aria-label="Вид записи">
        {KINDS.map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setCat(null) }}>{KIND_LABEL[k]}</button>)}
      </div>
      <label className="field">Сумма, {cur}
        <input inputMode="decimal" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <div className="field"><span>Категория</span>
        <div className="chips" role="group" aria-label="Категория">
          {cats.map(c => <button key={c.id} type="button" className={`btn${cat === c.id ? ' primary' : ''}`} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.title}</button>)}
        </div>
      </div>
      {canRemember && <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Запомнить для «{pattern}»</label>}
      <div className="seg-toggle" role="group" aria-label="Дата">
        <button type="button" aria-pressed={date === today} onClick={() => setDate(today)}>Сегодня</button>
        <button type="button" aria-pressed={date === yesterday} onClick={() => setDate(yesterday)}>Вчера</button>
        {date !== today && date !== yesterday && <button type="button" aria-pressed>{date.slice(8)}.{date.slice(5, 7)}</button>}
      </div>
      {!entry && <label className="field">Заметка <small className="muted">(необязательно)</small>
        <input value={note} maxLength={F.textMax} onChange={e => setNote(e.target.value)} /></label>}
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
      <button className="btn primary big" disabled={w.busy} onClick={() => void save()}>{entry ? 'Сохранить' : 'Добавить'}</button>
      {entry && <button className="btn ghost" disabled={w.busy} onClick={() => setAsk(true)}><Trash2 size={18} aria-hidden="true" /> Удалить запись</button>}
      {ask && <Confirm title="Удалить запись?" yes="Удалить" onYes={() => void remove()} onNo={() => setAsk(false)} />}
    </Sheet>
  )
}
