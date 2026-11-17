import type { GameState } from '../domain/types'
import Avatar from './Avatar'

export default function Arena({ state, image }: { state: GameState; image: string | null }) {
  const { xp, shadowXp } = state.today
  const lead = shadowXp > xp ? 'sh' : xp > shadowXp ? 'me' : ''
  return (
    <section className="arena" aria-label="Ты против Тени">
      <span className="tag l" aria-hidden="true">ТЫ</span>
      <span className="tag r" aria-hidden="true">ТЕНЬ</span>
      <div className={`fig me${lead === 'me' ? ' lead' : ''}`}><div className="aura" /><Avatar params={state.avatar} tier={state.tier} size={190} decorative image={image} /></div>
      <div className={`fig sh${lead === 'sh' ? ' lead' : ''}`}><div className="aura" /><div className="mirror"><Avatar params={state.avatar} tier={state.tier} size={190} shadow decorative image={image} /></div></div>
      <div className="vs" aria-hidden="true">VS</div>
    </section>
  )
}
