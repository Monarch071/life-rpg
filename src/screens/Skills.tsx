import { useState } from 'react'
import { StatIcon, STAT_COLORS } from '../ui/icons'
import { BALANCE } from '../domain/balance'
import { PERKS, skillForm } from '../domain/perks'
import { SKILL_CATALOG, type SkillDef } from '../domain/skillCatalog'
import { STATS } from '../domain/stats'
import type { GameState, PerkView, Stat } from '../domain/types'
import Sheet from '../ui/Sheet'
import { perkDot, rustBadge } from '../ui/skillView'

const DOT_TEXT = { locked: 'ещё закрыт', on: 'работает в полную силу', half: 'работает вполовину', off: 'выключен' } as const

/** 24 навыка по группам: уровень, полоса, точки перков 3/6/10, бейдж ржавчины; касание — лист навыка. */
export default function Skills({ state }: { state: GameState }) {
  const groups: (Stat | 'team')[] = [...Object.keys(STATS) as Stat[], 'team']
  const [open, setOpen] = useState<SkillDef | null>(null)
  return (
    <section className="panel stack" aria-label="Навыки">
      <div className="sec"><h2>Навыки</h2><span>перки на 3, 6 и 10 уровне</span></div>
      {groups.map(g => (
        <div key={g} className="stack" style={g === 'team' ? undefined : { '--c': STAT_COLORS[g] } as React.CSSProperties}>
          <h3>{g === 'team' ? 'Рабочие' : <><StatIcon stat={g} size={18} /> {STATS[g].name}</>}</h3>
          {SKILL_CATALOG.filter(s => s.stat === g).map(s => {
            const k = state.skills[s.id], badge = rustBadge(k)
            const pct = k.need ? (k.into / k.need) * 100 : 100
            return (
              <button key={s.id} type="button" className="stat-row skill-row" onClick={() => setOpen(s)}
                aria-label={`${s.title}, уровень ${k.level} из ${BALANCE.skill.maxLevel}${badge ? `, ${badge.text}` : ''}. Подробнее`}>
                <span className="stat" aria-hidden="true">
                  <span className="n">{s.title}</span>
                  {badge && <em className={`rust ${badge.tone}`}>{badge.text}</em>}
                  <span className="perk-dots">{BALANCE.perks.levels.map(l => <i key={l} className={`pd ${perkDot(k.perks.find(p => p.level === l))}`} />)}</span>
                  <b className="v">Lv {k.level}/{BALANCE.skill.maxLevel}</b>
                </span>
                <span className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
              </button>
            )
          })}
        </div>
      ))}
      {open && <SkillSheet s={open} state={state} onClose={() => setOpen(null)} />}
    </section>
  )
}

function SkillSheet({ s, state, onClose }: { s: SkillDef; state: GameState; onClose: () => void }) {
  const k = state.skills[s.id], badge = rustBadge(k)
  const forms = Object.fromEntries((Object.keys(STATS) as Stat[]).map(x => [x, state.statInfo[x].form])) as Record<Stat, number | null>
  const form = Math.round(skillForm(s.id, forms) * 100)
  const why = (p: PerkView) => p.power === 1 ? 'работает' : p.why === 'rust' ? 'ржавчина — выключен'
    : `форма ${form}% — ${p.power === 0.5 ? 'вполовину' : 'выключен'}`
  return (
    <Sheet id="skill-title" title={`${s.title} · Lv ${k.level}`} onClose={onClose}>
      <div className="bar" role="progressbar" aria-label={`${k.into} из ${k.need} XP до следующего уровня`} aria-valuemin={0} aria-valuemax={k.need} aria-valuenow={k.into}>
        <i style={{ width: `${k.need ? (k.into / k.need) * 100 : 100}%` }} />
      </div>
      {badge && <p className={`rust-note ${badge.tone}`} role="status">
        {k.rusty ? `Навык ржавый — перки выключены. Первое задание снимет ржавчину и даст +${BALANCE.rust.bonus * 100}% к награде.`
          : `Навык ${badge.text}: без практики перки выключатся. Одно задание или ритуал — и счётчик сбросится.`}
      </p>}
      <h3>Перки</h3>
      <ul className="perk-list">
        {PERKS.filter(p => p.skill === s.id).map(def => {
          const p = k.perks.find(x => x.id === def.id), dot = perkDot(p)
          return (
            <li key={def.id} className={dot}>
              <i className={`pd ${dot}`} role="img" aria-label={`Перк ${def.level} «${def.title}»: ${DOT_TEXT[dot]}`} />
              <span><b>{def.level} · {def.title}</b><small>{def.desc}</small>
                <small className="muted">{p ? why(p) : `откроется на уровне ${def.level}`}</small></span>
            </li>
          )
        })}
      </ul>
      <h3>Примеры заданий</h3>
      <ul className="perk-list ex">
        {(['E', 'C', 'A'] as const).map(r => <li key={r}><span className={`rk rk-${r}`} role="img" aria-label={`Ранг ${r}`}>{r}</span><span>{s.examples[r]}</span></li>)}
      </ul>
      <small className="muted">Проверка: {s.verify}</small>
    </Sheet>
  )
}
