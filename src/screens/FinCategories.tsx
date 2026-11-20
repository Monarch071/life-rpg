import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { BALANCE } from '../domain/balance'
import type { FinKind, GameState } from '../domain/types'
import Sheet from '../ui/Sheet'
import { useWrite } from '../ui/useWrite'
import { KIND_LABEL } from './FinEntrySheet'
import { parseAmount } from './QuickInput'

const F = BALANCE.finance
type Cat = GameState['finance']['categories'][number]

/** «Категории и лимиты» (mode cats) или «Правила магазинов» (mode rules). */
export default function FinCategories({ state, mode, cur, onClose }: { state: GameState; mode: 'cats' | 'rules'; cur: string; onClose: () => void }) {
  return mode === 'cats'
    ? <Sheet id="fin-cats-title" title="Категории и лимиты" onClose={onClose}><Cats state={state} cur={cur} /></Sheet>
    : <Sheet id="fin-rules-title" title="Правила магазинов" onClose={onClose}><Rules state={state} /></Sheet>
}

function Cats({ state, cur }: { state: GameState; cur: string }) {
  const w = useWrite()
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<FinKind>('expense')
  const cats = state.finance.categories
  const add = async () => {
    const t = title.trim()
    if (!t || t.length > F.titleMax) return w.setMsg({ ok: false, text: `Название: 1–${F.titleMax} символов` })
    if (await w.write({ type: 'fin_category_set', categoryId: `c-${crypto.randomUUID()}`, title: t, kind, limit: null }, `Категория «${t}» добавлена`)) setTitle('')
  }
  return (
    <>
      <p className="muted">Лимит — на месяц, действует с начала следующего месяца (первый лимит — сразу). Архивные категории скрыты из выбора.</p>
      <ul className="fin-cats">{cats.map(c => <CatRow key={`${c.id}:${c.title}:${c.limit}:${c.archived}`} c={c} cur={cur} w={w} />)}</ul>
      <h3>Новая категория</h3>
      <div className="seg-toggle" role="group" aria-label="Вид категории">
        {(Object.keys(KIND_LABEL) as FinKind[]).map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      <div className="qi-row">
        <label className="field grow">Название<input value={title} maxLength={F.titleMax} onChange={e => setTitle(e.target.value)} /></label>
        <button className="btn primary" disabled={w.busy || cats.filter(c => !c.id.startsWith('default:')).length >= F.categoriesMax} onClick={() => void add()} aria-label="Добавить категорию"><Plus size={18} aria-hidden="true" /></button>
      </div>
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
    </>
  )
}

function CatRow({ c, cur, w }: { c: Cat; cur: string; w: ReturnType<typeof useWrite> }) {
  const [title, setTitle] = useState(c.title)
  const [limit, setLimit] = useState(c.limit === null ? '' : String(c.limit))
  const save = (archived = c.archived) => {
    const t = title.trim(), l = limit.trim() === '' ? null : parseAmount(limit, { mode: 'set', max: F.amountMax })
    if (!t || t.length > F.titleMax) return w.setMsg({ ok: false, text: `Название: 1–${F.titleMax} символов` })
    if (limit.trim() !== '' && l === null) return w.setMsg({ ok: false, text: 'Лимит: число от 0' })
    void w.write({ type: 'fin_category_set', categoryId: c.id, title: t, kind: c.kind, limit: c.kind === 'expense' ? l : null, archived }, `«${t}» сохранена`)
  }
  const changed = title.trim() !== c.title || (limit.trim() === '' ? null : Number(limit.replace(',', '.'))) !== c.limit
  return (
    <li className={`card${c.archived ? ' archived' : ''}`}>
      <div className="row">
        <label className="field grow">Название <small className="muted">· {KIND_LABEL[c.kind]}{c.archived ? ' · в архиве' : ''}</small>
          <input value={title} maxLength={F.titleMax} onChange={e => setTitle(e.target.value)} /></label>
        {c.kind === 'expense' && <label className="field lim">Лимит, {cur}
          <input inputMode="decimal" placeholder="нет" value={limit} onChange={e => setLimit(e.target.value)} /></label>}
      </div>
      <div className="row">
        <button className="btn primary sm" disabled={w.busy || !changed} onClick={() => save()}>Сохранить</button>
        <button className="btn ghost sm" disabled={w.busy} onClick={() => save(!c.archived)}>{c.archived ? 'Вернуть из архива' : 'В архив'}</button>
      </div>
    </li>
  )
}

function Rules({ state }: { state: GameState }) {
  const w = useWrite()
  const [pattern, setPattern] = useState('')
  const live = state.finance.categories.filter(c => !c.archived)
  const [cat, setCat] = useState(live[0]?.id ?? '')
  const title = (id: string) => state.finance.categories.find(c => c.id === id)?.title ?? 'удалённая категория'
  const add = async () => {
    const p = pattern.trim()
    if (p.length < F.patternMin || p.length > F.patternMax) return w.setMsg({ ok: false, text: `Текст: ${F.patternMin}–${F.patternMax} символов` })
    if (await w.write({ type: 'fin_rule_set', ruleId: crypto.randomUUID(), pattern: p, categoryId: cat }, 'Правило добавлено')) setPattern('')
  }
  return (
    <>
      <p className="muted">Если описание траты (Wallet или выписки) содержит текст правила — трата попадает в его категорию. Длинное правило важнее короткого.</p>
      {state.finance.rules.length === 0 ? <p className="muted">Правил пока нет.</p> : (
        <ul className="perk-list">{state.finance.rules.map(r => (
          <li key={r.id} className="row">
            <span className="grow"><b>«{r.pattern}»</b><small>→ {title(r.categoryId)}</small></span>
            <button className="icon-btn" disabled={w.busy} aria-label={`Удалить правило «${r.pattern}»`}
              onClick={() => void w.write({ type: 'fin_rule_set', ruleId: r.id, pattern: r.pattern, categoryId: null }, 'Правило удалено')}><Trash2 size={18} aria-hidden="true" /></button>
          </li>))}</ul>
      )}
      <h3>Новое правило</h3>
      <label className="field">Текст в описании<input value={pattern} maxLength={F.patternMax} placeholder="например, магазин 1" onChange={e => setPattern(e.target.value)} /></label>
      <label className="field">Категория
        <select value={cat} onChange={e => setCat(e.target.value)}>{live.map(c => <option key={c.id} value={c.id}>{c.title} · {KIND_LABEL[c.kind]}</option>)}</select></label>
      <button className="btn primary big" disabled={w.busy || !cat} onClick={() => void add()}>Добавить правило</button>
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
    </>
  )
}
