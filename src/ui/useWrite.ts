import { useEffect, useRef, useState } from 'react'
import { appendEvents } from '../db'

type Ev = Parameters<typeof appendEvents>[0][number]

/** Запись события (или нескольких атомарно) с защитой от двойного нажатия и русским сообщением об ошибке. */
export function useWrite() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const lock = useRef(false)
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 4000); return () => clearTimeout(t) }, [msg])
  const write = async (e: Ev | Ev[], okText: string): Promise<boolean> => {
    if (lock.current) return false
    lock.current = true; setBusy(true); setMsg(null)
    try { await appendEvents(Array.isArray(e) ? e : [e]); setMsg({ ok: true, text: okText }); return true }
    catch { setMsg({ ok: false, text: 'Не удалось сохранить, попробуй ещё раз' }); return false }
    finally { lock.current = false; setBusy(false) }
  }
  return { busy, msg, setMsg, write }
}
