import { useMemo, useState } from 'react'
import { FileUp, Trash2 } from 'lucide-react'
import { getSetting, setSetting } from '../db'
import { BALANCE } from '../domain/balance'
import { guessColumns, importChunks, parseCsvLines, decodeCsv, toImportRows, type ColumnMap } from '../domain/csvImport'
import type { GameState } from '../domain/types'
import Confirm from '../ui/Confirm'
import Sheet from '../ui/Sheet'
import { importSummary } from '../ui/finView'
import { useWrite } from '../ui/useWrite'

const F = BALANCE.finance
type Draft = { date: number | null; amount: number | null; debit: number | null; credit: number | null; text: number | null }
const FIELDS: [keyof Draft, string][] = [['date', 'Дата'], ['amount', 'Сумма (со знаком)'], ['debit', 'Списание'], ['credit', 'Поступление'], ['text', 'Описание']]
const REASON = { date: 'нет даты', amount: 'нет суммы' } as const
const headKey = (h: string[]) => h.map(x => x.trim().toLowerCase()).join('|')

/** Прошлые импорты по базовому id (блоки `<base>#<n>` вместе). */
function pastImports(state: GameState): { base: string; rows: number; from: string; to: string }[] {
  const m = new Map<string, { base: string; rows: number; from: string; to: string }>()
  for (const e of state.finance.entries) {
    if (e.source !== 'import') continue
    const base = e.id.split(':')[1].split('#')[0], x = m.get(base)
    if (!x) m.set(base, { base, rows: 1, from: e.date, to: e.date })
    else { x.rows++; if (e.date < x.from) x.from = e.date; if (e.date > x.to) x.to = e.date }
  }
  return [...m.values()].sort((a, b) => (a.to < b.to ? 1 : -1))
}
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`

/** Импорт выписки CSV: файл → колонки → предпросмотр → запись блоками. Файл читается только на устройстве и не сохраняется. */
export default function FinImport({ state, onClose }: { state: GameState; onClose: () => void }) {
  const w = useWrite()
  const [csv, setCsv] = useState<{ rows: string[][]; lines: number[] } | null>(null)
  const [map, setMap] = useState<Draft | null>(null)
  const [step, setStep] = useState<'file' | 'cols' | 'preview'>('file')
  const [del, setDel] = useState<string | null>(null)
  const header = csv?.rows[0] ?? []
  const valid = !!map && map.date !== null && (map.amount !== null || map.debit !== null || map.credit !== null)
  const parsed = useMemo(() => (csv && valid && step === 'preview' ? toImportRows(csv.rows, map as ColumnMap, true, csv.lines) : null), [csv, map, valid, step])
  const sum = useMemo(() => (parsed ? importSummary(parsed.rows, state) : null), [parsed, state])

  const pick = async (f: File | undefined) => {
    w.setMsg(null)
    if (!f) return
    if (f.size > F.importFileMaxBytes) return w.setMsg({ ok: false, text: `Файл больше ${F.importFileMaxBytes / 1e6} МБ — выгрузи выписку за меньший период` })
    try {
      const c = parseCsvLines(decodeCsv(await f.arrayBuffer()))
      if (c.rows.length < 2) return w.setMsg({ ok: false, text: 'В файле нет строк с данными' })
      const g = guessColumns(c.rows[0]), saved = (await getSetting<Record<string, Draft>>('csvMapping', {}))[headKey(c.rows[0])]
      setCsv(c)
      setMap(saved ?? { date: g.date ?? null, amount: g.amount ?? null, debit: g.debit ?? null, credit: g.credit ?? null, text: g.text ?? null })
      setStep('cols')
    } catch { w.setMsg({ ok: false, text: 'Не удалось прочитать файл — нужен CSV из банка' }) }
  }
  const add = async () => {
    if (!parsed || !csv || !map) return
    const keys = new Set(state.finance.entries.filter(e => e.source === 'import').map(e => e.id.slice(e.id.lastIndexOf(':') + 1)))
    const rows = parsed.rows.filter(r => !keys.has(r.key))   // уже импортированные строки не пишем повторно
    const chunks = importChunks(crypto.randomUUID(), rows)
    if (await w.write(chunks.map(c => ({ type: 'fin_imported' as const, ...c })), `Добавлено строк: ${rows.length}`)) {
      void getSetting<Record<string, Draft>>('csvMapping', {}).then(m => setSetting('csvMapping', { ...m, [headKey(header)]: map })).catch(() => {})
      setCsv(null); setMap(null); setStep('file')
    }
  }
  const remove = async () => { const b = del; setDel(null); if (b) await w.write({ type: 'fin_import_removed', importId: b }, 'Импорт удалён') }
  const past = pastImports(state)

  return (
    <Sheet id="fin-import-title" title="Импорт выписки" onClose={onClose}>
      {step === 'file' && <>
        <p className="muted">Выгрузи выписку из банка в CSV. Файл разбирается только на этом устройстве и никуда не отправляется; в журнал попадают дата, сумма и описание (до {F.textMax} символов).</p>
        <label className="btn primary big" style={{ cursor: 'pointer' }}><FileUp size={18} aria-hidden="true" /> Выбрать файл CSV
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f) }} /></label>
        {past.length > 0 && <>
          <h3>Прошлые импорты</h3>
          <ul className="perk-list">{past.map(p => (
            <li key={p.base} className="row"><span className="grow"><b>{dm(p.from)}–{dm(p.to)}</b><small>{p.rows} строк</small></span>
              <button className="icon-btn" disabled={w.busy} aria-label={`Удалить импорт ${dm(p.from)}–${dm(p.to)}`} onClick={() => setDel(p.base)}><Trash2 size={18} aria-hidden="true" /></button></li>))}</ul>
        </>}
      </>}
      {step === 'cols' && map && <>
        <p className="muted">Проверь колонки. Нужны дата и сумма (одной колонкой со знаком или парой «списание / поступление»). Выбор запомнится для таких файлов.</p>
        {FIELDS.map(([k, label]) => (
          <label key={k} className="field">{label}
            <select value={map[k] ?? ''} onChange={e => setMap({ ...map, [k]: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">—</option>
              {header.map((h, i) => <option key={i} value={i}>{h.trim() || `колонка ${i + 1}`}</option>)}
            </select></label>
        ))}
        {map.amount !== null && (map.debit !== null || map.credit !== null) && <p className="muted">Выбрана сумма со знаком — колонки списания и поступления не используются.</p>}
        <button className="btn primary big" disabled={!valid} onClick={() => setStep('preview')}>Дальше</button>
        <button className="btn ghost" onClick={() => setStep('file')}>Другой файл</button>
      </>}
      {step === 'preview' && parsed && sum && <>
        <ul className="fin-sum" aria-label="Предпросмотр">
          <li><b>{sum.fresh}</b><small>новых</small></li>
          <li><b>{sum.walletDup}</b><small>дублей Wallet</small></li>
          <li><b>{sum.seen}</b><small>уже было</small></li>
          <li><b>{parsed.skipped.length}</b><small>пропущено</small></li>
        </ul>
        {sum.walletDup > 0 && <p className="muted">Дубли Wallet добавятся помеченными и не войдут в суммы.</p>}
        {parsed.skipped.length > 0 && <details><summary>Пропущенные строки</summary>
          <ul className="muted">{parsed.skipped.slice(0, 50).map(s => <li key={s.line}>строка {s.line}: {REASON[s.reason]}</li>)}
            {parsed.skipped.length > 50 && <li>и ещё {parsed.skipped.length - 50}</li>}</ul></details>}
        <button className="btn primary big" disabled={w.busy || sum.fresh + sum.walletDup === 0} onClick={() => void add()}>
          {sum.fresh + sum.walletDup === 0 ? 'Новых строк нет' : `Добавить ${sum.fresh + sum.walletDup}`}</button>
        <button className="btn ghost" onClick={() => setStep('cols')}>Назад к колонкам</button>
      </>}
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
      {del && <Confirm title="Удалить импорт целиком? Его строки исчезнут из сумм." yes="Удалить" onYes={() => void remove()} onNo={() => setDel(null)} />}
    </Sheet>
  )
}
