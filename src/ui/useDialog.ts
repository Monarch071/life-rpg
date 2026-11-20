import { useEffect, useRef } from 'react'

const open: object[] = []   // открытые диалоги; Escape закрывает только верхний

/** Фокус в диалог при открытии; Escape закрывает (если onClose задан). */
export function useDialog<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const me = {}
    open.push(me)
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open.at(-1) === me) close.current?.() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); open.splice(open.indexOf(me), 1) }
  }, [])
  return ref
}
