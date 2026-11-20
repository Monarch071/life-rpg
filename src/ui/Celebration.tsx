import { useEffect, useMemo, useState } from 'react'
import { Check, Crown } from 'lucide-react'
import { getSetting, setSetting } from '../db'
import type { GameState } from '../domain/types'
import { pickCelebration, type Seen } from './pickCelebration'
import { useDialog } from './useDialog'

export default function Celebration({ state }: { state: GameState }) {
  const [seen, setSeen] = useState<Seen | null>(null) // null — настройки ещё читаются
  useEffect(() => {
    void (async () => {
      const level = await getSetting<number | undefined>('seenLevelV2', undefined)
      const perfectDate = await getSetting<string | undefined>('seenPerfectDate', undefined)
      const bossSeason = await getSetting<string | undefined>('seenBossSeason', undefined)
      if (level === undefined) await setSetting('seenLevelV2', state.level) // первый запуск v2: уровень с учётом стартового — только запомнить
      setSeen({ level: level ?? state.level, perfectDate, bossSeason })
    })().catch(() => setSeen({ level: state.level }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => (seen ? pickCelebration(state, seen) : null), [state, seen])
  if (!c) return null
  const close = () => {
    const next = c.kind === 'level' ? { ...seen, level: c.level } : c.kind === 'boss' ? { ...seen, bossSeason: c.seasonId } : { ...seen, perfectDate: c.date }
    setSeen(next)
    void (c.kind === 'level' ? setSetting('seenLevelV2', c.level) : c.kind === 'boss' ? setSetting('seenBossSeason', c.seasonId)
      : setSetting('seenPerfectDate', c.date)).catch(() => {})
  }
  return <Overlay key={c.kind} c={c} onClose={close} frame={state.cosmetics.equipped.frame ?? null} />
}

/** frame — надетая рамка пути сезона: повышение уровня в её цветах (спека §7). */
function Overlay({ c, onClose, frame }: { c: NonNullable<ReturnType<typeof pickCelebration>>; onClose: () => void; frame: string | null }) {
  const btn = useDialog<HTMLButtonElement>(onClose)
  const win = c.kind === 'perfect', boss = c.kind === 'boss'
  return (
    <div className={`lvlup${frame && c.kind === 'level' ? ` framed frame-${frame.split(':')[1]}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="cel-title">
      <div className="rays" aria-hidden="true" />
      {[8, 20, 33, 47, 60, 74, 88].map((l, i) => <i key={l} className="conf" aria-hidden="true" style={{ left: `${l}%`, animationDelay: `${i * 0.35}s`, background: i % 2 ? 'var(--gold)' : 'var(--fire2)' }} />)}
      <div className="k">{boss ? 'БОСС СЕЗОНА' : win ? 'ИДЕАЛЬНЫЙ ДЕНЬ' : 'НОВЫЙ УРОВЕНЬ'}</div>
      {c.kind === 'level' ? <div className="huge"><b>{c.level}</b></div>
        : <div className="huge"><b>{boss ? <Crown size={88} strokeWidth={3} aria-hidden="true" /> : <Check size={88} strokeWidth={4} aria-hidden="true" />}</b></div>}
      <h2 id="cel-title">{boss ? 'Босс сезона повержен' : win ? 'Все задания выполнены' : 'Новый уровень'}</h2>
      <p>{boss ? 'Три части позади. Корона сезона — на полке трофеев' : win ? 'Вчера ты закрыл все задания дня' : 'Ты стал сильнее вчерашнего себя'}</p>
      <button ref={btn} className="btn3d" onClick={onClose}>Продолжить</button>
    </div>
  )
}
