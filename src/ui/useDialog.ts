import { useEffect, useRef } from 'react'

/** Фокус в диалог при открытии; Escape закрывает (если onClose задан). */
export function useDialog<T extends HTMLElement>(onClose?: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current?.() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return ref
}
