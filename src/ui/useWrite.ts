import { useRef, useState } from 'react'
import { appendEvent } from '../db'

type Ev = Parameters<typeof appendEvent>[0]

/** Запись события с защитой от двойного нажатия и русским сообщением об ошибке. */
export function useWrite() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const lock = useRef(false)
  const write = async (e: Ev, okText: string): Promise<boolean> => {
    if (lock.current) return false
    lock.current = true; setBusy(true); setMsg(null)
    try { await appendEvent(e); setMsg({ ok: true, text: okText }); return true }
    catch { setMsg({ ok: false, text: 'Не удалось сохранить, попробуй ещё раз' }); return false }
    finally { lock.current = false; setBusy(false) }
  }
  return { busy, msg, setMsg, write }
}
