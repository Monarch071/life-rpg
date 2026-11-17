import { useDialog } from './useDialog'

export default function Confirm({ title, yes, onYes, onNo }: { title: string; yes: string; onYes: () => void; onNo: () => void }) {
  const dlg = useDialog<HTMLDivElement>(onNo)
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onNo()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cf-title">
        <h2 id="cf-title">{title}</h2>
        <button className="btn primary big" onClick={onYes}>{yes}</button>
        <button className="btn ghost big" onClick={onNo}>Отмена</button>
      </div>
    </div>
  )
}
