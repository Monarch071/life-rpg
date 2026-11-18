import { Crown, Sparkles } from 'lucide-react'
import { ACHIEVEMENTS } from '../domain/achievements'
import { SKILLS } from '../domain/skills'
import { STATS } from '../domain/stats'
import type { GameState, Stat } from '../domain/types'

/** Черты, навыки и прогресс под главным экраном — как на референсе. */
export default function HeroExtras({ state }: { state: GameState }) {
  const traits = state.character?.strengths.slice(0, 3) ?? []
  const skills = (Object.keys(STATS) as Stat[])
    .map(stat => {
      const all = SKILLS.filter(s => s.stat === stat)
      const lv = all.filter(s => state.skills.unlocked.includes(s.id)).length
      return { stat, lv, pct: (lv / all.length) * 100 }
    })
    .sort((a, b) => b.lv - a.lv || state.stats[b.stat] - state.stats[a.stat])
    .slice(0, 3)

  return (
    <>
      <div className="two-col">
        <section className="glass mini-card" aria-label="Черты">
          <h3>Черты</h3>
          {traits.length
            ? <ul className="traits">{traits.map(t => <li key={t}><Sparkles size={15} aria-hidden="true" />{t}</li>)}</ul>
            : <p className="muted small">Пройди анкету во вкладке «Герой» — черты появятся здесь</p>}
        </section>
        <section className="glass mini-card" aria-label="Навыки">
          <h3>Навыки</h3>
          <ul className="skl">
            {skills.map(s => (
              <li key={s.stat}>
                <div><span>{STATS[s.stat].name}</span><small>Lv. {s.lv}</small></div>
                <i aria-hidden="true"><b style={{ width: `${Math.max(4, s.pct)}%` }} /></i>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="glass mini-card progress-card" aria-label="Прогресс">
        <Crown size={28} aria-hidden="true" />
        <p><b>Прогресс</b><br />Реальные дела прокачивают героя. До уровня {state.level + 1} — {Math.max(0, state.xpNeed - state.xpInto)} XP · достижений {state.achievements.length} из {ACHIEVEMENTS.length}.</p>
      </section>
    </>
  )
}
