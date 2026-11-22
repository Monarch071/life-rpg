import { useState } from 'react'
import { STAT_COLORS, STAT_ICONS } from '../ui/icons'
import { CATEGORIES, skillsOf } from '../ui/skillGroups'
import { BALANCE } from '../domain/balance'
import { PERKS, skillForm } from '../domain/perks'
import type { SkillDef } from '../domain/skillCatalog'
import { STATS } from '../domain/stats'
import type { GameState, PerkView, Stat } from '../domain/types'
import Sheet from '../ui/Sheet'
import { perkDot, rustBadge } from '../ui/skillView'

const DOT_TEXT = { locked: 'ещё закрыт', on: 'работает в полную силу', half: 'работает вполовину', off: 'выключен' } as const

/** 24 навыка по группам: уровень, полоса, точки перков 3/6/10, бейдж ржавчины; касание — лист навыка. */
export default function Skills({ state }: { state: GameState }) {
  const [open, setOpen] = useState<SkillDef | null>(null)
  return (
    <section className="panel stack" id="skills" aria-label="Навыки">
      <div className="sec"><h2>Навыки</h2><span>перки на 3, 6 и 10 уровне</span></div>
      {CATEGORIES.map(c => (
        <div key={c.id} className="stack" style={{ '--c': c.color } as React.CSSProperties}>
          <h3 className="cat-h"><c.Icon size={17} aria-hidden="true" /> {c.title}</h3>
          <div className="skill-grid">
            {skillsOf(c).map(s => {
              const k = state.skills[s.id], badge = rustBadge(k)
              const pct = k.need ? (k.into / k.need) * 100 : 100
              const col = s.stat === 'team' ? c.color : STAT_COLORS[s.stat]
              const Icon = s.stat === 'team' ? c.Icon : STAT_ICONS[s.stat]
              return (
                <button key={s.id} type="button" className={`skill-card${k.level > 1 ? '' : ' fresh'}`} style={{ '--c': col } as React.CSSProperties} onClick={() => setOpen(s)}
                  aria-label={`${s.title}, уровень ${k.level} из ${BALANCE.skill.maxLevel}${badge ? `, ${badge.text}` : ''}. Подробнее`}>
                  <span className="sc-top" aria-hidden="true">
                    <span className="sk-ic"><Icon size={16} /></span>
                    <span className="sc-lv"><small>LV</small>{k.level}</span>
                  </span>
                  <b aria-hidden="true">{s.title}</b>
                  {badge && <em className={`rust ${badge.tone}`} aria-hidden="true">{badge.text}</em>}
                  <span className="sk-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                  <span className="sc-foot" aria-hidden="true">
                    <span className="perk-dots">{BALANCE.perks.levels.map(l => <i key={l} className={`pd ${perkDot(k.perks.find(p => p.level === l))}`} />)}</span>
                    <small>{k.into}/{k.need} XP</small>
                  </span>
                </button>
              )
            })}
          </div>
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
      <p className="muted">Всего {k.xp} XP · с уровня {k.start} до {k.level}{k.lastDate ? ` · последняя прокачка ${k.lastDate.slice(8, 10)}.${k.lastDate.slice(5, 7)}` : ' · ещё не качался'}</p>
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
      <h3>Связанные задания</h3>
      <ul className="perk-list ex">
        {(['E', 'C', 'A'] as const).map(r => <li key={r}><span className={`rk rk-${r}`} role="img" aria-label={`Ранг ${r}`}>{r}</span><span>{s.examples[r]}</span></li>)}
      </ul>
      <small className="muted">Проверка: {s.verify}</small>
    </Sheet>
  )
}
