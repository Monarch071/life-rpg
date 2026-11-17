import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { GameState } from '../domain/types'
import { now } from '../now'
import { DEFAULT_SYNC_URL, disableSync, enableSync, getSyncConfig, loginLink, rotateToken, type SyncConfig } from '../sync'
import type { SyncState } from '../useSync'
import { useDialog } from '../ui/useDialog'
import JoinSync, { isHttpUrl } from './JoinSync'

function ConfirmRotate({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const dlg = useDialog<HTMLDivElement>(onNo)
  return (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onNo()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rot-title">
        <h2 id="rot-title">Другие устройства и «Команды» перестанут синхронизироваться, пока не введёшь новый токен</h2>
        <button className="btn primary big" onClick={onYes}>Сбросить</button>
        <button className="btn ghost big" onClick={onNo}>Отмена</button>
      </div>
    </div>
  )
}

function ConfirmOff({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  const dlg = useDialog<HTMLDivElement>(onNo)
  return (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && onNo()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="off-title">
        <h2 id="off-title">Сначала сохрани токен (например, в Заметки) — без него не получится подключиться снова. Отключить синхронизацию на этом устройстве?</h2>
        <button className="btn primary big" onClick={onYes}>Отключить</button>
        <button className="btn ghost big" onClick={onNo}>Отмена</button>
      </div>
    </div>
  )
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const ago = (t: number) => {
  const m = Math.max(0, Math.floor((now() - t) / 60_000))
  return m < 60 ? `${m} мин назад` : hhmm(t)
}

export default function SyncPanel({ state, sync }: { state: GameState; sync: SyncState }) {
  const [cfg, setCfg] = useState<SyncConfig | null | undefined>(undefined)
  const [url, setUrl] = useState(DEFAULT_SYNC_URL)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const [join, setJoin] = useState(false)
  const [rotate, setRotate] = useState(false)
  const [confirmOff, setConfirmOff] = useState(false)
  const reload = () => getSyncConfig().then(setCfg)
  useEffect(() => { void reload() }, [sync.status])
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60_000); return () => clearInterval(t) }, [])

  const done = () => { setJoin(false); void reload(); sync.run() }
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setManual(null)
      setMsg({ ok: true, text: `${what}: скопировано в буфер` })
    } catch {
      setMsg({ ok: false, text: 'Не удалось скопировать — скопируй вручную:' })
      setManual(text)
    }
  }
  const enable = async () => {
    if (!isHttpUrl(url.trim())) return setMsg({ ok: false, text: 'Введи адрес сервера' })
    setBusy(true)
    setMsg(null)
    const r = await enableSync(url.trim()).catch(() => ({ ok: false as const, error: 'Не удалось включить синхронизацию' }))
    setBusy(false)
    await reload() // конфиг мог сохраниться, даже если первый синк упал
    if (r.ok) sync.run()
    else setMsg({ ok: false, text: r.error })
  }
  const doRotate = async () => {
    setRotate(false)
    const r = await rotateToken().catch(() => ({ ok: false as const, error: 'Не удалось сбросить токен' }))
    setMsg(r.ok ? { ok: true, text: 'Токен сброшен. Введи новый на других устройствах и в «Командах»' } : { ok: false, text: r.error })
    void reload()
  }
  const off = async () => {
    setConfirmOff(false)
    await disableSync()
    setMsg(null); setManual(null); setShow(false)
    void reload()
    sync.run()
  }

  if (cfg === undefined) return null
  const h = state.lastHealth
  return (
    <section className="panel stack">
      <h2><RefreshCw size={18} aria-hidden="true" /> Синхронизация</h2>
      {!cfg ? (<>
        <label className="field">Адрес сервера<input value={url} inputMode="url" autoCapitalize="off" placeholder="https://…" onChange={(e) => setUrl(e.target.value)} /></label>
        <button className="btn primary big" disabled={busy} onClick={enable}>Включить синхронизацию</button>
        <button className="btn ghost big" onClick={() => setJoin(true)}>У меня уже есть токен</button>
      </>) : (<>
        <p className="muted">Последняя синхронизация: {sync.lastSyncAt ? `${hhmm(sync.lastSyncAt)} / ${ago(sync.lastSyncAt)}` : 'ещё не было'}</p>
        {sync.error && <p className="err" role="alert">{sync.error}</p>}
        <button className="btn big" disabled={sync.status === 'syncing'} onClick={sync.run}>Синхронизировать сейчас</button>
        <h3>Для «Команд»</h3>
        <p style={{ wordBreak: 'break-all' }}>Адрес: {cfg.url}/sync</p>
        <p style={{ wordBreak: 'break-all' }}>Токен: {show ? cfg.token : '••••••••••••'}</p>
        <button className="btn ghost" onClick={() => setShow(!show)}>{show ? 'Скрыть' : 'Показать'}</button>
        <button className="btn" onClick={() => copy(`${cfg.url}/sync`, 'Адрес')}>Скопировать адрес</button>
        <button className="btn" onClick={() => copy(cfg.token, 'Токен')}>Скопировать токен</button>
        <p className="muted">
          Последние данные из «Команд»: {h
            ? `${new Date(h.ts).toLocaleString('ru-RU')}${h.health.steps != null ? `, шаги ${h.health.steps}` : ''}${h.health.sleepHours != null ? `, сон ${h.health.sleepHours} ч` : ''}`
            : 'ещё не приходили'}
        </p>
        <button className="btn" onClick={() => copy(loginLink(cfg, location.origin + import.meta.env.BASE_URL), 'Ссылка')}>Ссылка для входа с компьютера</button>
        <button className="btn ghost" onClick={() => setRotate(true)}>Сбросить токен</button>
        <button className="btn ghost" onClick={() => setConfirmOff(true)}>Отключить на этом устройстве</button>
      </>)}
      {msg && <p role="status" className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      {manual && <input readOnly aria-label="Текст для ручного копирования" value={manual} onFocus={(e) => e.target.select()} />}
      {join && <JoinSync onDone={done} />}
      {confirmOff && <ConfirmOff onYes={off} onNo={() => setConfirmOff(false)} />}
      {rotate && <ConfirmRotate onYes={doRotate} onNo={() => setRotate(false)} />}
    </section>
  )
}
