import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { exportData, importData } from '../backup'
import { getSetting, setSetting } from '../db'
import { now } from '../now'
import { saveBackup } from '../ui/saveFile'
import { useDialog } from '../ui/useDialog'
import { useWrite } from '../ui/useWrite'
import ConfirmSheet from '../ui/Confirm'
import { DAY_ICONS } from '../ui/icons'
import { BALANCE } from '../domain/balance'
import { THEMES, type ThemeId } from '../domain/calendar'
import { DEFAULT_DAY_TYPES, validDayType, type DayType } from '../domain/dayType'
import { STATS } from '../domain/stats'
import type { GameState } from '../domain/types'
import type { SyncState } from '../useSync'
import AiPanel from './AiPanel'
import NotifyPanel from './NotifyPanel'
import SyncPanel from './SyncPanel'

function Confirm({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const dlg = useDialog<HTMLDivElement>(onNo)
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onNo()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="imp-title">
        <h2 id="imp-title">Заменить все данные? Текущий прогресс будет удалён.</h2>
        <button className="btn primary big" onClick={onYes}>Заменить</button>
        <button className="btn ghost big" onClick={onNo}>Отмена</button>
      </div>
    </div>
  )
}

export default function Settings({ state, sync }: { state: GameState; sync: SyncState }) {
  const [file, setFile] = useState<File | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const [lastExport, setLastExport] = useState<number | null>(null)
  useEffect(() => {
    void getSetting<number | null>('lastExportAt', null).then(setLastExport)
  }, [])

  const doExport = async () => {
    try {
      const r = await saveBackup(await exportData())
      if (r === 'cancelled') return setMsg(null)
      const t = now()
      setLastExport(t)
      void setSetting('lastExportAt', t)
      setMsg({ ok: true, text: 'Экспорт готов.' })
    } catch { setMsg({ ok: false, text: 'Не удалось выполнить экспорт.' }) }
  }
  const days = lastExport === null ? null : Math.floor((now() - lastExport) / 86_400_000)
  const reset = () => { setFile(null); if (input.current) input.current.value = '' }
  const doImport = async () => {
    const f = file; reset()
    if (!f) return
    try {
      const r = await importData(f)
      setMsg(r.ok ? { ok: true, text: `Импортировано событий: ${r.events}.` } : { ok: false, text: r.error })
    } catch { setMsg({ ok: false, text: 'Не удалось импортировать файл' }) }
  }

  return (
    <div className="home stack">
      <section className="panel stack">
        <h1>Настройки</h1>
        <button className="btn big" onClick={doExport}><Download size={18} aria-hidden="true" />Экспорт</button>
        <p style={days === null || days > 7 ? { color: 'var(--gold)' } : undefined} className={days === null || days > 7 ? undefined : 'muted'}>
          Последняя копия: {days === null ? 'ещё не делалась' : days < 1 ? 'сегодня' : `${days} дн. назад`}
        </p>
        <label className="btn big" style={{ cursor: 'pointer' }}><Upload size={18} aria-hidden="true" />Импорт
          <input ref={input} type="file" accept="application/json,.json" hidden aria-label="Импорт: выбрать файл"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setMsg(null) }} />
        </label>
        {msg && <p role="status" className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </section>
      <DayTypes key={JSON.stringify(state.dayTypes)} saved={state.dayTypes} />
      <SeasonTheme state={state} />
      <SyncPanel state={state} sync={sync} />
      <div id="ai-panel"><AiPanel /></div>
      <NotifyPanel sync={sync} />
      <p className="muted center">Версия {__APP_VERSION__}</p>
      {file && <Confirm onYes={doImport} onNo={reset} />}
    </div>
  )
}

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/** Шаблоны дней: подъём, занятость, отбой, слоты, подпись → day_types_set (последнее событие побеждает). */
function DayTypes({ saved }: { saved: DayType[] }) {
  const [draft, setDraft] = useState(saved)
  const [ask, setAsk] = useState(false)
  const w = useWrite()
  const set = (i: number, patch: Partial<DayType>) => { setDraft(draft.map((t, j) => (j === i ? { ...t, ...patch } : t))); w.setMsg(null) }
  const save = () => {
    const ts = draft.map(t => validDayType({ ...t, label: t.label.trim() }))
    const bad = ts.findIndex(t => !t)
    if (bad >= 0) return w.setMsg({ ok: false, text: `«${draft[bad].label.trim() || 'Без подписи'}»: проверь подпись (1–40 символов) и время` })
    void w.write({ type: 'day_types_set', types: ts as DayType[] }, 'Типы дней сохранены')
  }
  const reset = () => { setAsk(false); void w.write({ type: 'day_types_set', types: DEFAULT_DAY_TYPES }, 'Вернули типы дней по умолчанию') }
  const changed = JSON.stringify(draft) !== JSON.stringify(saved)
  return (
    <section className="panel stack" aria-label="Типы дней">
      <h2>Типы дней</h2>
      <p className="muted">Время подъёма, занятости и отбоя для «Моего дня». День закрывается через час после отбоя (не позже 04:00).</p>
      {draft.map((t, i) => {
        const Icon = DAY_ICONS[t.kind]
        const rest = t.kind === 'rest'
        return (
          <details key={t.id} className="card daytype">
            <summary><Icon size={18} aria-hidden="true" /><b className="grow">{t.label || 'Без подписи'}</b>
              <small className="muted">{rest ? 'без расписания' : `${t.wake ?? '—'}–${t.bed ?? '—'}`} · {t.slots} сл.</small></summary>
            <label className="field">Подпись<input value={t.label} maxLength={40} onChange={e => set(i, { label: e.target.value })} /></label>
            {!rest && <div className="row">
              <label className="field">Подъём<input type="time" value={t.wake ?? ''} onChange={e => set(i, { wake: e.target.value || null })} /></label>
              <label className="field">Отбой<input type="time" value={t.bed ?? ''} onChange={e => set(i, { bed: e.target.value || null })} /></label>
            </div>}
            {!rest && <div className="field"><span>Занят (работа, учёба)</span>
              <div className="seg-toggle" role="group" aria-label={`${t.label}: занятость`}>
                <button type="button" aria-pressed={!!t.busy} onClick={() => set(i, { busy: t.busy ?? { start: '10:00', end: '19:00' } })}>Есть</button>
                <button type="button" aria-pressed={!t.busy} onClick={() => set(i, { busy: null })}>Нет</button>
              </div></div>}
            {!rest && t.busy && <div className="row">
              <label className="field">С<input type="time" value={t.busy.start} onChange={e => set(i, { busy: { ...t.busy!, start: e.target.value } })} /></label>
              <label className="field">До<input type="time" value={t.busy.end} onChange={e => set(i, { busy: { ...t.busy!, end: e.target.value } })} /></label>
            </div>}
            <label className="field">Заданий в день (1–{BALANCE.day.maxSlots})
              <input type="number" inputMode="numeric" min={1} max={BALANCE.day.maxSlots} value={t.slots}
                onChange={e => set(i, { slots: Number(e.target.value) })} /></label>
          </details>
        )
      })}
      <button className="btn primary big" disabled={w.busy || !changed} onClick={save}>Сохранить типы дней</button>
      <button className="btn ghost" disabled={w.busy} onClick={() => setAsk(true)}>Сбросить к умолчаниям</button>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      {ask && <ConfirmSheet title="Вернуть типы дней по умолчанию?" yes="Сбросить" onYes={reset} onNo={() => setAsk(false)} />}
    </section>
  )
}

/** Тема сезона: +20% XP к её характеристикам с сегодняшней игровой даты до конца сезона. */
function SeasonTheme({ state }: { state: GameState }) {
  const w = useWrite()
  const s = state.season
  const prologue = s.kind === 'prologue'
  const pct = Math.round(BALANCE.bonus.theme * 100)
  return (
    <section className="panel stack" aria-label="Тема сезона">
      <h2>Тема сезона</h2>
      <p className="muted">{prologue ? 'Темы откроются с 1 декабря, когда начнётся первый сезон.'
        : `${s.name} до ${dm(s.end)}. Задания темы дают +${pct}% XP; смена действует с сегодняшнего дня до конца сезона.`}</p>
      <div className="stack" role="group" aria-label="Тема сезона">
        {(Object.keys(THEMES) as ThemeId[]).map(id => {
          const t = THEMES[id], on = s.theme === id
          const what = [...t.stats.map(k => STATS[k].name), ...(t.teamSkills ? ['рабочие навыки'] : [])].join(', ')
          return (
            <button key={id} type="button" className={`btn theme-btn${on ? ' primary' : ''}`} aria-pressed={on} disabled={prologue || w.busy || on}
              onClick={() => void w.write({ type: 'season_theme_set', theme: id }, `Тема: ${t.name}`)}>
              <b>{t.name}</b><small>{prologue ? 'с 1 декабря' : `+${pct}%: ${what}`}</small>
            </button>
          )
        })}
      </div>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
    </section>
  )
}
