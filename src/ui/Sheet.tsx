import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialog } from './useDialog'

/** Нижний лист в стиле приложения: фон закрывает, Escape закрывает, фокус внутрь. */
export default function Sheet({ id, title, onClose, children }: { id: string; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const dlg = useDialog<HTMLDivElement>(onClose)
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
