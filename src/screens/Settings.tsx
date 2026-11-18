import { useEffect, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { exportData, importData } from '../backup'
import { getSetting, setSetting } from '../db'
import { now } from '../now'
import { saveBackup } from '../ui/saveFile'
import { useDialog } from '../ui/useDialog'
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
      <SyncPanel state={state} sync={sync} />
      <div id="ai-panel"><AiPanel /></div>
      <NotifyPanel sync={sync} />
      <p className="muted center">Версия {__APP_VERSION__}</p>
      {file && <Confirm onYes={doImport} onNo={reset} />}
    </div>
  )
}
