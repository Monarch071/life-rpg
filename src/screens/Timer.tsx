import { useEffect, useRef, useState } from 'react'
import { BookOpen, Brain, Play, Square, X } from 'lucide-react'
import { appendEvent } from '../db'
import { BALANCE } from '../domain/balance'
import { now } from '../now'
import { useDialog } from '../ui/useDialog'
import { parseRunning, timerOverdue, timerSpan, type Running } from '../ui/vitalsView'

export type TimerKind = Running['timer']
const KEY = 'lifeRpgTimer'
const LABEL: Record<TimerKind, string> = { focus: 'Фокус', reading: 'Чтение' }
// старт хранится по часам: свёрнутая/закрытая вкладка на iPhone не сбивает счёт
export const readRunning = (): Running | null => { try { return parseRunning(localStorage.getItem(KEY)) } catch { return null } }
const save = (r: Running | null) => { try { if (r) localStorage.setItem(KEY, JSON.stringify(r)); else localStorage.removeItem(KEY) } catch { /* приватный режим — таймер живёт до закрытия листа */ } }
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`
}

/** Таймер фокуса/чтения: один на устройство; «Стоп» пишет timer_logged (источник «авто»). */
export default function Timer({ initial, onClose }: { initial: TimerKind; onClose: () => void }) {
  const [run, setRun] = useState(readRunning)
  const [mode, setMode] = useState<TimerKind>(run?.timer ?? initial)
  const [t, setT] = useState(now)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const dlg = useDialog<HTMLDivElement>(busy ? undefined : onClose)
  useEffect(() => {
    if (!run) return
    const tick = () => setT(now())
    tick()
    const i = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(i); document.removeEventListener('visibilitychange', tick) }
  }, [run])

  const start = () => {
    const cur = readRunning() // уже идёт (другая вкладка, двойное нажатие) — второй не запускаем
    const r = cur ?? { timer: mode, start: now() }
    if (!cur) save(r)
    setRun(r); setMode(r.timer); setMsg(null)
  }
  const stop = async () => {
    const cur = readRunning() ?? run
    if (lock.current || !cur) return
    lock.current = true
    setBusy(true)
    const span = timerSpan(cur.start, now())
    try {
      if (span) await appendEvent({ type: 'timer_logged', timer: cur.timer, start: span.start, end: span.end })
      save(null); setRun(null)
      setMsg(span
        ? { ok: true, text: `${LABEL[cur.timer]}: записано ${Math.round((span.end - span.start) / 60e3)} мин${span.capped ? ` (больше ${BALANCE.timer.maxMin} мин не засчитывается)` : ''}` }
        : { ok: false, text: 'Меньше минуты — не записано' })
    } catch {
      setMsg({ ok: false, text: 'Не удалось сохранить, попробуй ещё раз' }) // таймер не сбрасываем — время не теряется
    } finally { lock.current = false; setBusy(false) }
  }
  const reset = () => { save(null); setRun(null); setMsg({ ok: false, text: 'Таймер сброшен без записи' }) }

  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="timer-title">
        <div className="sheet-head">
          <h2 id="timer-title">Таймер</h2>
          <button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <div className="row" role="group" aria-label="Режим">
          {(['focus', 'reading'] as const).map(k => (
            <button key={k} className={`btn${mode === k ? ' primary' : ''}`} style={{ flex: 1 }} disabled={!!run} aria-pressed={mode === k} onClick={() => setMode(k)}>
              {k === 'focus' ? <Brain size={18} aria-hidden="true" /> : <BookOpen size={18} aria-hidden="true" />} {LABEL[k]}
            </button>
          ))}
        </div>
        <p className="timer-face" role="timer" aria-label={run ? `${LABEL[run.timer]}: идёт ${clock(t - run.start)}` : 'Таймер остановлен'}>{run ? clock(t - run.start) : '0:00'}</p>
        <p className="muted center">Время считается по часам — можно свернуть приложение. Минуты засчитаются в задания «{LABEL[mode].toLowerCase()}».</p>
        {!run
          ? <button className="btn primary big" onClick={start}><Play size={18} aria-hidden="true" /> Старт</button>
          : <>
            {timerOverdue(run.start, t)
              ? <>
                <p className="muted center">Таймер идёт дольше {BALANCE.timer.maxMin} мин — похоже, его забыли остановить.</p>
                <button className="btn primary big" disabled={busy} onClick={reset}><X size={18} aria-hidden="true" /> Сбросить</button>
                <button className="btn ghost" disabled={busy} onClick={() => void stop()}>Записать {BALANCE.timer.maxMin} мин</button>
              </>
              : <>
                <button className="btn primary big" disabled={busy} onClick={() => void stop()}><Square size={18} aria-hidden="true" /> Стоп и записать</button>
                <button className="btn ghost" disabled={busy} onClick={reset}>Сбросить без записи</button>
              </>}
          </>}
        {msg && <p role="status" className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      </div>
    </div>
  )
}
