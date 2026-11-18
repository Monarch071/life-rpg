import { StatIcon, STAT_COLORS } from '../ui/icons'
import { BALANCE } from '../domain/balance'
import { SKILL_CATALOG } from '../domain/skillCatalog'
import { STATS } from '../domain/stats'
import type { GameState, Stat } from '../domain/types'

/** 24 навыка по группам: уровень и прогресс до следующего (полный редизайн — позже). */
export default function Skills({ state }: { state: GameState }) {
  const groups: (Stat | 'team')[] = [...Object.keys(STATS) as Stat[], 'team']
  return (
    <section className="panel stack" aria-label="Навыки">
      <div className="sec"><h2>Навыки</h2></div>
      {groups.map(g => (
        <div key={g} className="stack" style={g === 'team' ? undefined : { '--c': STAT_COLORS[g] } as React.CSSProperties}>
          <h3>{g === 'team' ? 'Рабочие' : <><StatIcon stat={g} size={18} /> {STATS[g].name}</>}</h3>
          {SKILL_CATALOG.filter(s => s.stat === g).map(s => {
            const k = state.skills[s.id]
            const pct = k.need ? (k.into / k.need) * 100 : 100
            return (
              <div key={s.id} className="stat-row">
                <div className="stat"><span className="n">{s.title}</span><b className="v">Lv {k.level}/{BALANCE.skill.maxLevel}</b></div>
                <div className="bar" role="progressbar" aria-label={`${s.title}: ${k.into} из ${k.need} XP до следующего уровня`} aria-valuemin={0} aria-valuemax={k.need} aria-valuenow={k.into}>
                  <i style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
