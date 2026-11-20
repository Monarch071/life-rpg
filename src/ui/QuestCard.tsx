import { Camera, Check, Hand, Shuffle, Sparkles, Timer, Zap } from 'lucide-react'
import { SKILL_CATALOG } from '../domain/skillCatalog'
import type { DayQuest, Verify } from '../domain/types'

const VERIFY: Record<Verify, { Icon: typeof Zap; text: string }> = {
  auto: { Icon: Zap, text: 'Проверка: автоматически по данным' },
  photo: { Icon: Camera, text: 'Проверка: фото' },
  honest: { Icon: Hand, text: 'Проверка: честное слово' },
}
const skillTitle = (id: string) => SKILL_CATALOG.find(s => s.id === id)?.title ?? id

/** Карточка задания: ранг, навыки и окно, «почему», способ проверки, «+XP», галочка, фото и переброс. */
export default function QuestCard({ q, i, pop, busy, reroll, hint, ability = null, onDone, onPhoto, onReroll, onTimer }: {
  q: DayQuest; i: number; pop: number | null; busy: boolean
  hint: string | null                                     // «засчитается само: …»
  onTimer: (() => void) | null                            // таймер фокуса/чтения для этого задания
  reroll: { label: string; off: string | null } | null   // null — переброс недоступен для этого задания
  ability?: { name: string; onUse: () => void } | null   // способность класса на этом задании (только когда доступна)
  onDone: () => void; onPhoto: (f: File) => void; onReroll: () => void
}) {
  const v = VERIFY[q.done ? q.verify ?? 'honest' : q.auto ? 'auto' : 'honest']
  const xp = q.done ? q.xpFinal ?? q.xp : q.xp
  const open = !q.done && !q.legacy
  return (
    <li className={`q${q.done ? ' done' : ''}`} style={{ '--i': i } as React.CSSProperties}>
      <span className={`rk rk-${q.rank}`} role="img" aria-label={`Ранг ${q.rank}`}>{q.rank}</span>
      <div className="t">
        <b>{(q.kind === 'boss' || q.kind === 'chain') && <em className={`qbadge ${q.kind}`}>{q.kind === 'boss' ? 'Босс' : 'Сюжет'}</em>}{q.title}</b>
        <small>{q.skills.map(skillTitle).join(' + ')} · {q.window ? `${q.window.start}–${q.window.end}` : 'в течение дня'}</small>
        {q.why && <small className="why">{q.why}</small>}
        {hint && <small className="auto-hint">{hint}</small>}
      </div>
      <span className="vf" title={v.text} aria-label={v.text} role="img"><v.Icon size={16} aria-hidden="true" /></span>
      <span className="xpchip" role="img" aria-label={q.done ? `Получено ${xp} XP` : `Около ${xp} XP`}>
        +{xp}{q.kind === 'restore' && <em className="x2">×2</em>}
      </span>
      <button className="chk" disabled={q.done || busy} aria-label={`Выполнить (честное слово): ${q.title}`} onClick={onDone}>
        {q.done && <Check size={20} aria-hidden="true" />}
      </button>
      {open && (
        <div className="q-acts">
          <label className={`btn ghost sm${busy ? ' off' : ''}`}>
            <Camera size={16} aria-hidden="true" /> Фото
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy}
              aria-label={`Выполнить с фото: ${q.title}`}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
          </label>
          {onTimer && (
            <button className="btn ghost sm" disabled={busy} onClick={onTimer} aria-label={`Таймер для задания: ${q.title}`}>
              <Timer size={16} aria-hidden="true" /> Таймер
            </button>
          )}
          {ability && (
            <button className="btn ghost sm ab" disabled={busy} onClick={ability.onUse} aria-label={`Способность «${ability.name}»: ${q.title}`}>
              <Sparkles size={16} aria-hidden="true" /> {ability.name}
            </button>
          )}
          {reroll && (
            <button className="btn ghost sm" disabled={busy || !!reroll.off} onClick={onReroll}
              aria-label={`Перебросить за ${reroll.label}${reroll.off ? `: ${reroll.off}` : ''}`}>
              <Shuffle size={16} aria-hidden="true" /> {reroll.label}{reroll.off && <small> · {reroll.off}</small>}
            </button>
          )}
        </div>
      )}
      {pop !== null && (
        <span key={pop} className="burst" aria-hidden="true">
          <span className="float">+{xp} XP</span>
          {[0, 1, 2, 3, 4].map(n => <i key={n} className="spark" />)}
        </span>
      )}
    </li>
  )
}
