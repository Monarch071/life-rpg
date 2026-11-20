import { useEffect, useState } from 'react'
import { BookOpen, Coins, Compass, Footprints, Map as MapIcon, Music, Shield, Swords, type LucideIcon } from 'lucide-react'
import { rerollCandidates, type AssembleCtx } from '../domain/assemble'
import { STATS } from '../domain/stats'
import type { ClassId, DayQuest, GameState, Quest, Stat, WeeklyQuest } from '../domain/types'
import { now } from '../now'
import Confirm from './Confirm'
import Sheet from './Sheet'
import { StatIcon } from './icons'
import { abilityOff, classChangeText, pairForm, pairName, planQuests, POWER_TEXT } from './skillView'
import { useWrite } from './useWrite'

const ICONS: Record<ClassId, LucideIcon> = { warrior: Swords, paladin: Shield, ranger: Compass, sage: BookOpen, strategist: MapIcon, merchant: Coins, bard: Music, wanderer: Footprints }
const KEYS = Object.keys(STATS) as Stat[]
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

type Extra = { questId?: string; stat?: Stat; replacement?: Quest; quests?: WeeklyQuest[] }

/** Запись ability_used за игровую дату; игровой день закрылся — не пишем, а пересчитываем состояние. */
export function useAbility(state: GameState) {
  const w = useWrite()
  const ab = state.cls.ability
  const use = async (extra: Extra = {}): Promise<boolean> => {
    if (now() >= state.today.closesAt) { document.dispatchEvent(new Event('visibilitychange')); return false }
    return w.write({ type: 'ability_used', date: state.today.date, ability: ab.id, ...extra }, `«${ab.name}» применена`)
  }
  return { ...w, use }
}

const SEEN = 'classSeen'
const seen = (d: string) => { try { return localStorage.getItem(SEEN) === d } catch { return true } }
const markSeen = (d: string) => { try { localStorage.setItem(SEEN, d) } catch { /* не критично */ } }

/** Карточка класса на экране «Герой»: пассив с силой, способность недели, веса характеристик. */
export default function ClassCard({ state }: { state: GameState }) {
  const { cls } = state, ab = cls.ability, Icon = ICONS[cls.id]
  const a = useAbility(state)
  const [ask, setAsk] = useState(false)
  const [plan, setPlan] = useState(false)
  const [change, setChange] = useState(false)
  useEffect(() => { if (cls.changedFrom && !seen(cls.changedFrom.date)) setChange(true) }, [cls.changedFrom?.date]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeChange = () => { if (cls.changedFrom) markSeen(cls.changedFrom.date); setChange(false) }
  const off = abilityOff(state) ?? (ab.id === 'plan' && !state.weekly.quests.some(q => !q.done) ? 'нет невыполненных недельных' : null)
  const maxW = Math.max(...KEYS.map(k => cls.weights[k]), 1)
  const form = pairForm(state)
  const passive = cls.passive.power === 1 ? POWER_TEXT[1] : `${POWER_TEXT[cls.passive.power]}: форма ${cls.pair ? 'пары' : 'всех характеристик'} ${form}%`
  return (
    <section className="panel stack class-card" aria-label="Класс">
      <div className="row qhead">
        <span className="ico" style={{ '--c': 'var(--fire)' } as React.CSSProperties} aria-hidden="true"><Icon size={22} /></span>
        <div className="grow"><h2>{cls.name}</h2><small className="muted">{cls.pair ? `пара ${pairName(cls.pair)}` : 'все характеристики ровно'}{cls.since ? ` · с ${dm(cls.since)}` : ''}</small></div>
      </div>
      <p className={`passive p${cls.passive.power * 2}`}><b>Пассив:</b> {cls.passive.text} — {passive}</p>
      <div className="card ability">
        <div className="row qhead"><b className="grow">Способность недели: «{ab.name}»</b></div>
        <small>{ab.desc}</small>
        {ab.target === 'quest'
          ? <small className="fx">{off ?? 'Применяется к заданию: открой его на Главной — кнопка «' + ab.name + '»'}</small>
          : <button className="btn primary" disabled={a.busy || !!off} onClick={() => (ab.id === 'plan' ? setPlan(true) : setAsk(true))}>
              {ab.id === 'plan' ? 'Выбрать фокус недели' : `Применить «${ab.name}» сегодня`}{off && <small>{off}</small>}
            </button>}
        <div aria-live="polite">{a.msg && <p role={a.msg.ok ? 'status' : 'alert'} className={a.msg.ok ? 'ok' : 'err'}>{a.msg.text}</p>}</div>
      </div>
      <ul className="weights" aria-label="Вес характеристик в выборе класса">
        {KEYS.map(k => (
          <li key={k} aria-label={`${STATS[k].name}: вес ${Math.round(cls.weights[k])}`}>
            <span aria-hidden="true">{STATS[k].name}</span>
            <i aria-hidden="true" style={{ '--c': `var(--${k})` } as React.CSSProperties}><i style={{ width: `${(cls.weights[k] / maxW) * 100}%` }} /></i>
          </li>
        ))}
      </ul>
      <small className="muted">Пересчёт класса {dm(cls.nextRecalc)} · вес = Основа с поправкой на форму. Продвинутые классы откроются позже.</small>
      {ask && <Confirm title={`Применить «${ab.name}» сегодня? Следующий раз — в понедельник.`} yes="Применить" onNo={() => setAsk(false)}
        onYes={() => { setAsk(false); void a.use() }} />}
      {plan && <PlanSheet state={state} onClose={() => setPlan(false)} />}
      {change && cls.changedFrom && (
        <Sheet id="class-change" title={`Новый класс: ${cls.name}`} onClose={closeChange}>
          <div className="center"><span className="ico big-ico" style={{ '--c': 'var(--fire)' } as React.CSSProperties} aria-hidden="true"><Icon size={40} /></span></div>
          <p>{classChangeText(cls)}</p>
          <p className="muted">Смена без потерь: уровень, навыки и золото остаются. Пассив — «{cls.passive.text}», способность — «{ab.name}».</p>
          <button className="btn primary big" onClick={closeChange}>Понятно</button>
        </Sheet>
      )}
    </section>
  )
}

function PlanSheet({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [focus, setFocus] = useState<Stat | null>(null)
  const a = useAbility(state)
  const qs = focus ? planQuests(state, focus) : []
  const apply = async () => { if (qs.length && await a.use({ quests: qs })) onClose() }
  return (
    <Sheet id="plan-title" title="«План»: фокус недели" onClose={onClose}>
      <p className="muted">Невыполненные недельные задания заменятся новыми под выбранную характеристику.</p>
      <div className="chips" role="group" aria-label="Фокус">
        {KEYS.map(k => <button key={k} type="button" className={`btn${focus === k ? ' primary' : ''}`} aria-pressed={focus === k} onClick={() => setFocus(k)}>
          <StatIcon stat={k} size={16} />{STATS[k].name}</button>)}
      </div>
      {focus && <ul className="perk-list" aria-label="Новые недельные задания">{qs.map(q => <li key={q.id}><span><b>{q.title}</b><small>+{q.xp} XP</small></span></li>)}</ul>}
      <div aria-live="polite">{a.msg && !a.msg.ok && <p role="alert" className="err">{a.msg.text}</p>}</div>
      <button className="btn primary big" disabled={!qs.length || a.busy} onClick={() => void apply()}>Применить план</button>
    </Sheet>
  )
}

/** Способность класса на задании: «Рывок» — подтверждение, «Прозрение» — выбор из 3, «Универсал» — выбор характеристики. */
export function QuestAbility({ state, q, ctx, onClose }: { state: GameState; q: DayQuest; ctx: () => AssembleCtx; onClose: () => void }) {
  const ab = state.cls.ability
  const a = useAbility(state)
  const [opts] = useState(() => (ab.id === 'insight' ? rerollCandidates(ctx(), q, state.today.quests, 3) : []))
  const go = async (extra: Extra) => { if (await a.use({ questId: q.id, ...extra })) onClose() }
  return (
    <Sheet id="qa-title" title={`«${ab.name}»: ${q.title}`} onClose={onClose}>
      <p className="muted">{ab.desc}. Раз в неделю — следующий раз в понедельник.</p>
      {ab.id === 'rush' && <button className="btn primary big" disabled={a.busy} onClick={() => void go({})}>Применить «Рывок»</button>}
      {ab.id === 'insight' && (opts.length ? (
        <ul className="perk-list" aria-label="Варианты замены">{opts.map(o => (
          <li key={o.id}><button type="button" className="btn ghost opt" disabled={a.busy} onClick={() => void go({ replacement: o })}>
            <span className={`rk rk-${o.rank}`} aria-hidden="true">{o.rank}</span>
            <span className="grow"><b>{o.title}</b><small>{o.minutes} мин · {STATS[o.stat].name}</small></span>
          </button></li>))}</ul>
      ) : <p className="muted">Подходящих замен того же ранга нет.</p>)}
      {ab.id === 'universal' && (
        <div className="chips" role="group" aria-label="Новая характеристика задания">
          {KEYS.filter(k => k !== q.stat).map(k => <button key={k} type="button" className="btn" disabled={a.busy} onClick={() => void go({ stat: k })}>
            <StatIcon stat={k} size={16} />{STATS[k].name}</button>)}
        </div>
      )}
      <div aria-live="polite">{a.msg && !a.msg.ok && <p role="alert" className="err">{a.msg.text}</p>}</div>
    </Sheet>
  )
}
