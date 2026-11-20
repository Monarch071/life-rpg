import { Check, X } from 'lucide-react'
import { BALANCE } from '../domain/balance'
import { monthTitle, reviewInput } from '../domain/card'
import { monthReview } from '../domain/rival'
import type { GameState } from '../domain/types'
import Sheet from '../ui/Sheet'

const SHIFT = { ladder: 'лестница привычки прошла ступень', saving: 'есть накопления', base: `Основа выросла на ${BALANCE.rival.decision.baseGain}+`, skill: 'навык поднялся на уровень' } as const

/** Итоги месяца (спека §10): три проверки и вердикт. Суммы не показываются. */
export default function MonthReview({ state, month, onClose }: { state: GameState; month: string; onClose: () => void }) {
  const i = reviewInput(state, month), r = monthReview(i), D = BALANCE.rival.decision
  const need = Math.ceil(i.days * D.openedShare - 1e-9)
  const rows: [boolean, string, string][] = [
    [r.opened, 'Открывал приложение', `${i.opened} из ${i.days} дней (нужно от ${need})`],
    [r.completion, 'Выполнял задания', `${Math.round(r.share * 100)}% (нужно от ${Math.round(D.completion * 100)}%)`],
    [r.shift, 'Реальный сдвиг', i.shifts.length ? i.shifts.map(s => SHIFT[s]).join(', ') : 'пока нет'],
  ]
  return (
    <Sheet id="month-review-title" title={`Итоги: ${monthTitle(month)}`} onClose={onClose}>
      <ul className="perk-list review">{rows.map(([ok, t, sub]) => (
        <li key={t}><span className={`rv ${ok ? 'ok' : 'err'}`} role="img" aria-label={ok ? 'выполнено' : 'не выполнено'}>{ok ? <Check size={18} /> : <X size={18} />}</span>
          <span className="grow"><b>{t}</b><small>{sub}</small></span></li>))}</ul>
      <p className={`verdict ${r.pass ? 'ok' : ''}`}><b>{r.pass ? 'Всё так — можно звать друзей (вторая фаза)' : 'Смотрим, что мешает, и упрощаем'}</b></p>
    </Sheet>
  )
}
