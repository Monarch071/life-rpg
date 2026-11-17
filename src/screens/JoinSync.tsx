import { useState } from 'react'
import { DEFAULT_SYNC_URL, joinSync } from '../sync'
import { useDialog } from '../ui/useDialog'

export const isHttpUrl = (u: string) => { try { return /^https?:$/.test(new URL(u).protocol) } catch { return false } }

/** Подключение к уже существующей синхронизации (ПК / новая установка). */
export default function JoinSync({ initial, onDone }: { initial?: { url: string; token: string } | null; onDone: () => void }) {
  const [url, setUrl] = useState(initial?.url ?? DEFAULT_SYNC_URL)
  const [token, setToken] = useState(initial?.token ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dlg = useDialog<HTMLDivElement>(() => { if (!busy) onDone() })

  const go = async () => {
    if (!isHttpUrl(url.trim())) return setErr('Введи адрес сервера')
    if (!token.trim()) return setErr('Введи токен')
    setBusy(true)
    setErr(null)
    const r = await joinSync(url.trim(), token.trim()).catch(() => ({ ok: false as const, error: 'Не удалось подключиться' }))
    setBusy(false)
    if (r.ok) onDone()
    else setErr(r.error)
  }

  return (
    <div className="sheet-wrap" style={{ zIndex: 100 }}>
      <div className="sheet stack" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="join-title">
        <h2 id="join-title">Подключение к синхронизации</h2>
        <label className="field">Адрес сервера<input value={url} inputMode="url" autoCapitalize="off" onChange={(e) => setUrl(e.target.value)} /></label>
        <label className="field">Токен<input value={token} autoCapitalize="off" autoComplete="off" onChange={(e) => setToken(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        {busy && <p className="muted" role="status">Подключаю…</p>}
        <button className="btn primary big" disabled={busy} onClick={go}>Подключить</button>
        <button className="btn ghost big" disabled={busy} onClick={onDone}>Отмена</button>
      </div>
    </div>
  )
}
