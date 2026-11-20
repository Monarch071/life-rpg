import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight, FileUp, ListChecks, Plus, Tags } from 'lucide-react'
import { getSetting } from '../db'
import { addDays } from '../domain/day'
import { periodTotals } from '../domain/finance'
import type { GameState } from '../domain/types'
import LineChart from '../ui/LineChart'
import { catTone, money, pace } from '../ui/finView'
import FinCategories from './FinCategories'
import FinEntrySheet from './FinEntrySheet'
import FinImport from './FinImport'

type Entry = GameState['finance']['entries'][number]
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
export const monthName = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`
const shiftMonth = (m: string, n: number) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const lastDay = (m: string) => addDays(`${shiftMonth(m, 1)}-01`, -1)
const PAGE = 50

/** Валюта — настройка устройства (по умолчанию ₽). */
export const useCurrency = (): string => useLiveQuery(() => getSetting('currency', '₽')) ?? '₽'

/** Анализ → Финансы (спека §7.8). */
export default function Finance({ state }: { state: GameState }) {
  const cur = useCurrency()
  const fin = state.finance, today = state.today.date, thisMonth = today.slice(0, 7)
  const first = fin.entries.at(-1)?.date.slice(0, 7) ?? thisMonth
  const [month, setMonth] = useState(thisMonth)
  const [filter, setFilter] = useState<string | null>(null)   // id категории или 'none' — без категории
  const [more, setMore] = useState(PAGE)
  const [sheet, setSheet] = useState<null | 'new' | 'import' | 'cats' | 'rules' | Entry>(null)
  const from = `${month}-01`, to = lastDay(month)
  const t = useMemo(() => periodTotals(fin.entries, from, to), [fin.entries, from, to])
  const catTitle = (id: string) => fin.categories.find(c => c.id === id)?.title ?? id
  // лимиты — текущего месяца из состояния; у прошлых месяцев полосы без лимита
  const limits = new Map(month === thisMonth ? fin.month.byCat.map(c => [c.id, c.limit]) : [])
  const bars = [...new Set([...Object.keys(t.byCat), ...[...limits].filter(([, l]) => l !== null).map(([id]) => id)])]
    .map(id => ({ id, spent: t.byCat[id] ?? 0, limit: limits.get(id) ?? null })).sort((a, b) => b.spent - a.spent)
  const day = month === thisMonth ? +today.slice(8) : null, days = +to.slice(8)
  // «без категории» — за все месяцы: «разобрать N» считает их все
  const list = fin.entries.filter(e => filter === 'none' ? e.uncategorized && !e.dup
    : e.date >= from && e.date <= to && (filter === null || (e.categoryId === filter && !e.uncategorized)))
  const months6 = [...fin.months.filter(m => m.month < thisMonth).slice(0, 5).reverse(), { month: thisMonth, income: fin.month.income, expense: fin.month.expense, saving: fin.month.saving }]
  const go = (n: number) => { setMonth(shiftMonth(month, n)); setMore(PAGE) }
  return (
    <div className="stack fin">
      <div className="row month-nav">
        <button className="icon-btn" aria-label="Прошлый месяц" disabled={month <= first} onClick={() => go(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
        <h2 className="grow center" aria-live="polite">{monthName(month)}</h2>
        <button className="icon-btn" aria-label="Следующий месяц" disabled={month >= thisMonth} onClick={() => go(1)}><ChevronRight size={20} aria-hidden="true" /></button>
      </div>
      <div className="cards">
        <div className="panel card"><b>{money(t.income, cur)}</b><small className="muted">Доход</small></div>
        <div className="panel card"><b>{money(t.expense, cur)}</b><small className="muted">Расход</small></div>
        <div className="panel card"><b>{money(t.saving, cur)}</b><small className="muted">Отложено</small></div>
        <div className="panel card"><b>{t.loggedDays}</b><small className="muted">Дней с записями</small></div>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={() => setSheet('new')}><Plus size={18} aria-hidden="true" /> Запись</button>
        <button className="btn ghost" onClick={() => setSheet('import')}><FileUp size={18} aria-hidden="true" /> Импорт выписки</button>
        <button className="btn ghost" onClick={() => setSheet('cats')}><Tags size={18} aria-hidden="true" /> Категории и лимиты</button>
        <button className="btn ghost" onClick={() => setSheet('rules')}><ListChecks size={18} aria-hidden="true" /> Правила магазинов</button>
      </div>
      <section className="panel stack" aria-label="Категории расходов">
        <h2>Категории</h2>
        {bars.length === 0 && <p className="muted">Расходов в этом месяце нет.</p>}
        {bars.map(b => {
          const tone = catTone(b.spent, b.limit), pct = b.limit ? Math.round((b.spent / b.limit) * 100) : null
          return (
            <div key={b.id} className="fin-cat">
              <div className="row"><b className="grow">{catTitle(b.id)}</b><small>{money(b.spent, cur)}{b.limit !== null ? ` из ${money(b.limit, cur)}` : ''}</small></div>
              {b.limit !== null && <>
                <div className={`bar t-${tone}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct ?? 0)}
                  aria-valuetext={`${catTitle(b.id)}: ${money(b.spent, cur)} из ${money(b.limit, cur)}, ${pct}%`}>
                  <i style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
                </div>
                {day !== null && b.limit > 0 && <small className="muted">по темпу месяца — {pace(b.spent, b.limit, day, days)}%</small>}
              </>}
            </div>
          )
        })}
      </section>
      <section className="panel stack" aria-label="Записи">
        <h2>Записи</h2>
        {fin.uncategorized > 0 && filter !== 'none' &&
          <button className="btn" onClick={() => setFilter('none')}>Разобрать {fin.uncategorized}</button>}
        <label className="field">Фильтр
          <select value={filter ?? ''} onChange={e => setFilter(e.target.value || null)}>
            <option value="">Все</option><option value="none">Без категории</option>
            {fin.categories.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select></label>
        {list.length === 0 && <p className="muted">Записей нет.</p>}
        <ul className="fin-list">{list.slice(0, more).map(e => (
          <li key={e.id}><button type="button" className={`fin-row${e.dup ? ' dup' : ''}`} onClick={() => setSheet(e)}>
            <span className="grow"><b>{e.text || catTitle(e.categoryId)}</b>
              <small>{e.date.slice(8)}.{e.date.slice(5, 7)} · {e.uncategorized ? 'без категории' : catTitle(e.categoryId)}{e.dup ? ' · дубль' : ''}{e.source === 'import' ? ' · выписка' : e.source === 'wallet' ? ' · Wallet' : ''}</small></span>
            <span className={`amt k-${e.kind}`}>{e.kind === 'expense' ? '−' : '+'}{money(e.amount, cur)}</span>
          </button></li>))}</ul>
        {list.length > more && <button className="btn ghost" onClick={() => setMore(more + PAGE)}>Показать ещё</button>}
      </section>
      {months6.length >= 2 && <section className="panel" aria-label="Шесть месяцев">
        <h2>6 месяцев</h2>
        <LineChart title="Деньги по месяцам" unit={cur} labels={months6.map(m => m.month.slice(5) + '.' + m.month.slice(2, 4))} series={[
          { label: 'Расход', color: 'var(--str)', values: months6.map(m => m.expense) },
          { label: 'Доход', color: 'var(--up)', values: months6.map(m => m.income) },
          { label: 'Отложено', color: 'var(--fire)', values: months6.map(m => m.saving) }]} />
      </section>}
      {sheet === 'new' && <FinEntrySheet state={state} cur={cur} onClose={() => setSheet(null)} />}
      {sheet === 'import' && <FinImport state={state} onClose={() => setSheet(null)} />}
      {(sheet === 'cats' || sheet === 'rules') && <FinCategories state={state} mode={sheet} cur={cur} onClose={() => setSheet(null)} />}
      {sheet && typeof sheet === 'object' && <FinEntrySheet state={state} entry={sheet} cur={cur} onClose={() => setSheet(null)} />}
    </div>
  )
}
