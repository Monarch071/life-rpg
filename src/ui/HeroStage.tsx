import { Coins, Swords, User } from 'lucide-react'
import { STATS } from '../domain/stats'
import type { GameState, Profile, Stat } from '../domain/types'
import Avatar from './Avatar'
import { STAT_COLORS, STAT_ICONS } from './icons'

/** Главный экран: арт героя на весь экран и стеклянные HUD-панели поверх. */
export default function HeroStage({ state, profile, image, cta, onCta }: {
  state: GameState; profile: Profile; image: string | null; cta: string | null; onCta: () => void
}) {
  const { today } = state
  const keys = Object.keys(STATS) as Stat[]
  const max = Math.max(20, ...keys.map(k => state.stats[k]))
  const quote = profile.goals[0]?.text || state.character?.archetype || 'Тень не дремлет. Каждый день — шаг вперёд.'
  const share = today.xp + today.shadowXp > 0 ? (today.xp / (today.xp + today.shadowXp)) * 100 : 50
  const pct = state.xpNeed > 0 ? Math.min(100, (state.xpInto / state.xpNeed) * 100) : 0

  return (
    <section className="stage" aria-label="Герой">
      <div className="stage-art" aria-hidden="true">
        {image ? <img src={image} alt="" /> : <div className="stage-fallback"><Avatar params={state.avatar} tier={state.tier} size={360} decorative /></div>}
      </div>

      <div className="stage-top">
        <div className="glass lvl-card">
          <div className="ring" aria-hidden="true">
            {image ? <i style={{ backgroundImage: `url(${image})` }} /> : <i className="empty"><User size={26} /></i>}
          </div>
          <div className="lvl-body">
            <b><small>Lv.</small>{state.level}</b>
            <div className="lvl-xp" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin={0} aria-valuemax={state.xpNeed} aria-valuenow={state.xpInto}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <small className="n"><em>{state.xpInto}</em> / {state.xpNeed} XP</small>
          </div>
        </div>
        <span className="glass coins-pill" aria-label={`Монеты: ${state.currency}`}><Coins size={16} aria-hidden="true" />{state.currency}</span>
      </div>

      <div className="glass quote-card">
        <small>{profile.name || 'Герой'} · {state.className} · «{state.title}»</small>
        «{quote}»
      </div>

      <ul className="glass stat-card" aria-label="Характеристики">
        {keys.map(k => { const Icon = STAT_ICONS[k]; return (
          <li key={k}>
            <span className="ic" style={{ color: STAT_COLORS[k] }}><Icon size={17} aria-hidden="true" /></span>
            <span>{STATS[k].name}</span>
            <b>{state.stats[k]}</b>
            <i className="sbar" aria-hidden="true"><i style={{ width: `${(state.stats[k] / max) * 100}%`, background: STAT_COLORS[k] }} /></i>
          </li>
        ) })}
      </ul>

      <div className="glass versus-card">
        <div className="vs-row" aria-live="polite">
          <span>Ты <b>{today.xp}</b></span>
          <small>сегодня · серия {state.streak} дн.</small>
          <span className="sh"><b>{today.shadowXp}</b> Тень</span>
        </div>
        <div className="rope" aria-hidden="true" style={{ '--p': `${share}%` } as React.CSSProperties} />
        {cta && <button className="btn primary big" onClick={onCta}><Swords size={18} aria-hidden="true" />{cta}</button>}
      </div>
    </section>
  )
}
