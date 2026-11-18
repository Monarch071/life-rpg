import { useEffect, useState } from 'react'
import { Bell, BellOff, Send } from 'lucide-react'
import { getSyncConfig, type SyncConfig } from '../sync'
import { disablePush, enablePush, iosNotInstalled, loadPrefs, pushSupported, testPush, type NotifyPrefs } from '../push'
import type { SyncState } from '../useSync'

function TimeRow({ label, value, fallback, onChange }: { label: string; value: string | null; fallback: string; onChange: (v: string | null) => void }) {
  return (
    <div className="row" style={{ alignItems: 'center', gap: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, flex: 1 }}>
        <input type="checkbox" checked={value !== null} onChange={e => onChange(e.target.checked ? fallback : null)}
          style={{ width: 22, height: 22 }} />
        {label}
      </label>
      {value !== null && (
        <input type="time" aria-label={`${label}: время`} value={value} style={{ fontSize: 16, minHeight: 44 }}
          onChange={e => e.target.value && onChange(e.target.value)} />
      )}
    </div>
  )
}

export default function NotifyPanel({ sync }: { sync: SyncState }) {
  const [cfg, setCfg] = useState<SyncConfig | null | undefined>(undefined)
  const [p, setP] = useState<NotifyPrefs | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { void getSyncConfig().then(setCfg) }, [sync.status])
  useEffect(() => { void loadPrefs().then(setP) }, [])

  const act = (f: () => Promise<void>, ok: string) => async () => {
    setBusy(true); setMsg(null)
    try { await f(); setMsg({ ok: true, text: ok }) }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'Не получилось' }) }
    finally { setBusy(false); setP(await loadPrefs()) }
  }

  const hint = !pushSupported() ? 'Этот браузер не умеет присылать уведомления.'
    : iosNotInstalled() ? 'На iPhone уведомления приходят только в приложение с экрана «Домой»: Поделиться → «На экран Домой», потом открой его оттуда.'
    : cfg === null ? 'Сначала включи синхронизацию выше: напоминания присылает твой сервер.'
    : null

  return (
    <section className="panel stack" aria-labelledby="notify-title">
      <h2 id="notify-title"><Bell size={18} aria-hidden="true" /> Уведомления</h2>
      {hint ? <p className="muted">{hint}</p> : p && cfg && (
        <>
          <p className="muted">Утром — напоминание про чек-ин и задания, вечером — отметить сделанное. Время по часовому поясу этого устройства.</p>
          <TimeRow label="Утро" value={p.morning} fallback="08:00" onChange={v => setP({ ...p, morning: v })} />
          <TimeRow label="Вечер" value={p.evening} fallback="21:00" onChange={v => setP({ ...p, evening: v })} />
          <button className="btn primary big" disabled={busy || (p.morning === null && p.evening === null)}
            onClick={act(() => enablePush(cfg, p), p.on ? 'Время сохранено.' : 'Уведомления включены.')}>
            <Bell size={18} aria-hidden="true" />{p.on ? 'Сохранить время' : 'Включить уведомления'}
          </button>
          {p.on && (
            <>
              <button className="btn big" disabled={busy} onClick={act(() => testPush(cfg), 'Отправлено — уведомление придёт через несколько секунд.')}>
                <Send size={18} aria-hidden="true" />Прислать тестовое
              </button>
              <button className="btn ghost big" disabled={busy} onClick={act(() => disablePush(cfg), 'Уведомления выключены.')}>
                <BellOff size={18} aria-hidden="true" />Выключить
              </button>
            </>
          )}
        </>
      )}
      {msg && <p role="status" className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
    </section>
  )
}
