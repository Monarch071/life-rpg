import { Coins, Flame, Swords, User } from 'lucide-react'
import { STATS } from '../domain/stats'
import type { GameState, Profile, Stat, StatInfo } from '../domain/types'
import Avatar from './Avatar'
import { STAT_COLORS, STAT_ICONS } from './icons'
import { pathLabel, statBar } from './statBar'

export const STATUS: Record<StatInfo['status'], string> = { new: 'новая', in_form: 'в форме', sagging: 'проседает', abandoned: 'заброшена' }
const statAria = (name: string, base: number, i: StatInfo) =>
  i.form === null ? `${name} ${base}, форма ещё не посчитана` : `${name} ${base}, форма ${Math.round(i.form * 100)}%, ${STATUS[i.status]}`

/** Главный экран: арт героя на весь экран и стеклянные HUD-панели поверх. */
export default function HeroStage({ state, profile, image, cta, onCta }: {
  state: GameState; profile: Profile; image: string | null; cta: string | null; onCta: () => void
}) {
  const { today } = state
  const keys = Object.keys(STATS) as Stat[]
  const quote = profile.goals[0]?.text || state.character?.archetype || 'Каждый день — шаг вперёд.'
  const path = pathLabel(state.season, today.date)
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
        <span className="glass coins-pill" aria-label={`Золото: ${state.gold}`}><Coins size={16} aria-hidden="true" />{state.gold}<small aria-hidden="true">Золото</small></span>
      </div>

      <div className="glass quote-card">
        <small>{profile.name || 'Герой'} · {state.className} · «{state.title}»</small>
        «{quote}»
      </div>

      <ul className="glass stat-card" aria-label="Характеристики">
        {keys.map(k => {
          const Icon = STAT_ICONS[k], info = state.statInfo[k], w = statBar(state.stats[k], info.form)
          return (
            <li key={k}>
              <span className="sr-only">{statAria(STATS[k].name, state.stats[k], info)}</span>
              <span className="ic" style={{ color: STAT_COLORS[k] }} aria-hidden="true"><Icon size={17} /></span>
              <span aria-hidden="true">{STATS[k].name}</span>
              <b aria-hidden="true"><i className={`fdot f-${info.status}`} />{state.stats[k]}</b>
              <i className="sbar" aria-hidden="true" style={{ '--c': STAT_COLORS[k] } as React.CSSProperties}>
                <i className="sb-base" style={{ width: `${w.base}%` }} />
                <i className="sb-form" style={{ width: `${w.form}%` }} />
              </i>
            </li>
          )
        })}
      </ul>

      <div className="glass versus-card">
        <div className="vs-row" aria-live="polite">
          <span>Сегодня <b>{today.xp}</b> XP</span>
          <span className="streak-n"><Flame size={18} aria-hidden="true" />серия <b>{state.streak}</b> дн.</span>
        </div>
        <div className="path">
          <div className="path-t"><b>{path.title}</b><small>{path.sub}</small></div>
          <div className="path-bar" role="progressbar" aria-label={`Путь сезона: ${path.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(path.pct)}>
            <i style={{ width: `${path.pct}%` }} />
          </div>
        </div>
        {cta && <button className="btn primary big" onClick={onCta}><Swords size={18} aria-hidden="true" />{cta}</button>}
      </div>
    </section>
  )
}
