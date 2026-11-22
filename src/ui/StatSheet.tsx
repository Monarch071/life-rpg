import { BALANCE } from '../domain/balance'
import { SKILL_CATALOG } from '../domain/skillCatalog'
import { STATS } from '../domain/stats'
import type { GameState, Stat } from '../domain/types'
import { STATUS } from './HeroStage'
import { STAT_COLORS, STAT_ICONS } from './icons'
import LineChart from './LineChart'
import Sheet from './Sheet'

/** Список характеристик с иконками и значениями; касание открывает карточку. */
export function StatList({ state, onPick }: { state: GameState; onPick: (s: Stat) => void }) {
  return (
    <ul className="stat-list">
      {(Object.keys(STATS) as Stat[]).map(k => {
        const Icon = STAT_ICONS[k], info = state.statInfo[k]
        return (
          <li key={k} style={{ '--c': STAT_COLORS[k] } as React.CSSProperties}>
            <button type="button" onClick={() => onPick(k)}
              aria-label={`${STATS[k].name} ${state.stats[k]}${info.form === null ? '' : `, форма ${Math.round(info.form * 100)}%`}. Подробнее`}>
              <Icon size={15} aria-hidden="true" /><span aria-hidden="true">{STATS[k].name}</span><b aria-hidden="true">{state.stats[k]}</b>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/** Карточка характеристики (бриф §5): уровень, форма, история за 30 дней, навыки, которые её качают, и задания для роста. */
export default function StatSheet({ stat, state, onClose }: { stat: Stat; state: GameState; onClose: () => void }) {
  const info = state.statInfo[stat], Icon = STAT_ICONS[stat], color = STAT_COLORS[stat]
  const hist = state.statHistory.slice(-30)
  const skills = SKILL_CATALOG.filter(s => s.stat === stat || (s.stat === 'team' && (stat === 'cha' || stat === 'dis')))
    .map(d => ({ d, k: state.skills[d.id] })).sort((a, b) => a.k.level - b.k.level)
  const max = info.base >= BALANCE.stat.max
  return (
    <Sheet id="stat-title" title={<span className="lbl"><Icon size={20} style={{ color }} aria-hidden="true" />{STATS[stat].name}</span>} onClose={onClose}>
      <div className="stat-hero" style={{ '--c': color } as React.CSSProperties}>
        <b>{state.stats[stat]}</b>
        <span>
          <small>Основа из {BALANCE.stat.max}</small>
          <small>{info.form === null ? 'форма ещё не посчитана' : `форма ${Math.round(info.form * 100)}% · ${STATUS[info.status]}`}</small>
        </span>
      </div>
      <div className="bar" style={{ '--c': color } as React.CSSProperties} role="progressbar" aria-label={`${info.into} из ${info.need} XP до следующего очка`} aria-valuemin={0} aria-valuemax={info.need || 1} aria-valuenow={info.into}>
        <i style={{ width: `${info.need ? (info.into / info.need) * 100 : 100}%` }} />
      </div>
      <small className="muted">{max ? 'Основа на максимуме' : `+${info.need - info.into} XP до следующего очка · за 14 дней ${info.xp14} XP`}</small>

      <h3>История</h3>
      <LineChart title={`${STATS[stat].name} за ${hist.length} дн.`} labels={hist.map(h => dm(h.date))} height={90}
        series={[{ label: STATS[stat].name, color, values: hist.map(h => h.stats[stat]) }]} />

      <h3>Что качает {STATS[stat].name.toLowerCase()}</h3>
      <ul className="stat-skills">
        {skills.map(({ d, k }) => (
          <li key={d.id}><span>{d.title}</span><small>ур. {k.level}</small></li>
        ))}
      </ul>

      <h3>Рекомендуем</h3>
      <ul className="perk-list ex">
        {skills.slice(0, 3).map(({ d, k }) => {
          const r = k.level >= 5 ? 'C' : 'E'
          return <li key={d.id}><span className={`rk rk-${r}`} role="img" aria-label={`Ранг ${r}`}>{r}</span><span><b>{d.examples[r].charAt(0).toUpperCase() + d.examples[r].slice(1)}</b><small className="muted">{d.title}, ур. {k.level}</small></span></li>
        })}
      </ul>
    </Sheet>
  )
}
