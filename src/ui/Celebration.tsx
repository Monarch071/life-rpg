import { useEffect, useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { getSetting, setSetting } from '../db'
import type { GameState } from '../domain/types'
import { pickCelebration, type Seen } from './pickCelebration'
import { useDialog } from './useDialog'

export default function Celebration({ state }: { state: GameState }) {
  const [seen, setSeen] = useState<Seen | null>(null) // null — настройки ещё читаются
  useEffect(() => {
    void (async () => {
      const level = await getSetting<number | undefined>('seenLevel', undefined)
      const winDate = await getSetting<string | undefined>('seenWinDate', undefined)
      if (level === undefined) await setSetting('seenLevel', state.level) // первый запуск
      setSeen({ level: level ?? state.level, winDate })
    })().catch(() => setSeen({ level: state.level }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const c = useMemo(() => (seen ? pickCelebration(state, seen) : null), [state, seen])
  if (!c) return null
  const close = () => {
    const next = c.kind === 'level' ? { ...seen, level: c.level } : { ...seen, winDate: c.date }
    setSeen(next)
    void (c.kind === 'level' ? setSetting('seenLevel', c.level) : setSetting('seenWinDate', c.date)).catch(() => {})
  }
  return <Overlay key={c.kind} c={c} onClose={close} />
}

function Overlay({ c, onClose }: { c: NonNullable<ReturnType<typeof pickCelebration>>; onClose: () => void }) {
  const btn = useDialog<HTMLButtonElement>(onClose)
  const win = c.kind === 'win'
  return (
    <div className="lvlup" role="dialog" aria-modal="true" aria-labelledby="cel-title">
      <div className="rays" aria-hidden="true" />
      {[8, 20, 33, 47, 60, 74, 88].map((l, i) => <i key={l} className="conf" aria-hidden="true" style={{ left: `${l}%`, animationDelay: `${i * 0.35}s`, background: i % 2 ? 'var(--gold)' : 'var(--fire2)' }} />)}
      <div className="k">{win ? 'ПОБЕДА' : 'НОВЫЙ УРОВЕНЬ'}</div>
      {win ? <div className="huge"><b><Check size={88} strokeWidth={4} aria-hidden="true" /></b></div> : <div className="huge"><b>{c.level}</b></div>}
      <h2 id="cel-title">{win ? 'Победа над Тенью' : 'Тень отступает'}</h2>
      <p>{win ? 'Вчера ты оказался сильнее своей Тени' : 'Ты стал сильнее вчерашнего себя'}</p>
      <div className="rew">{win ? <span className="g">+{c.bonus} XP</span> : <span className="p">+1 очко навыка</span>}</div>
      <button ref={btn} className="btn3d" onClick={onClose}>Продолжить</button>
    </div>
  )
}
