import { useEffect, useState } from 'react'
import { BookOpen, Coins, Compass, Footprints, Map as MapIcon, Music, Shield, Swords, type LucideIcon } from 'lucide-react'
import { rerollCandidates, type AssembleCtx } from '../domain/assemble'
import { ADVANCED, pathsOf } from '../domain/advanced'
import { BALANCE } from '../domain/balance'
import { seasonOf } from '../domain/calendar'
import { weekCard, type CardModel } from '../domain/card'
import { addDays, weekStart } from '../domain/day'
import { canMark, stageWindow } from '../domain/legend'
import { SKILL_CATALOG, type SkillId } from '../domain/skillCatalog'
import CardSheet from '../screens/CardSheet'
import { STATS } from '../domain/stats'
import type { AdvancedId, ClassId, DayQuest, GameState, Quest, Stat, WeeklyQuest } from '../domain/types'
import { now } from '../now'
import Confirm from './Confirm'
import Sheet from './Sheet'
import { StatIcon } from './icons'
import { abilityOff, abilityTarget, auditTips, classChangeText, pairForm, pairName, planQuests, POWER_TEXT, trialText } from './skillView'
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
      <small className="muted">{cls.trial || cls.advanced ? 'Пока идёт испытание или выбран продвинутый путь, класс не пересчитывается' : `Пересчёт класса ${dm(cls.nextRecalc)}`} · вес = Основа с поправкой на форму.</small>
      <AdvancedPath state={state} />
      <LegendPath state={state} />
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

const A = BALANCE.advanced

/** Запись второй способности (своя, раз в игровую неделю). */
function useAbility2(state: GameState) {
  const w = useWrite()
  const ab = state.cls.advanced?.ability
  const use = async (extra: { questId?: string; skill?: SkillId; facetId?: string } = {}): Promise<boolean> => {
    if (!ab) return false
    if (now() >= state.today.closesAt) { document.dispatchEvent(new Event('visibilitychange')); return false }
    return w.write({ type: 'ability_used', date: state.today.date, ability: ab.id, ...extra }, `«${ab.name}» применена`)
  }
  return { ...w, use }
}

/** «Продвинутый путь» (спека §8, §11): выбор пути и испытание, прогресс, продвинутый класс со второй способностью. */
function AdvancedPath({ state }: { state: GameState }) {
  const { cls, today } = state, adv = cls.advanced, trial = cls.trial
  const w = useWrite()
  const [ask, setAsk] = useState<null | { title: string; yes: string; run: () => void }>(null)
  const paths = pathsOf(cls.id)
  const confirm = (title: string, yes: string, run: () => void) => setAsk({ title, yes, run: () => { setAsk(null); run() } })
  const start = (id: AdvancedId) => confirm(`Начать испытание «${ADVANCED[id].name}»? ${A.trialDays} дней: от ${A.passDays} засчитанных дней и ${A.passQuests} заданий фокуса пути. Класс на это время не пересчитывается.`,
    'Начать испытание', () => void w.write({ type: 'advanced_trial_started', date: today.date, classId: id }, 'Испытание началось'))
  // первые дни сезона — смена пути того же базового без испытания
  const switchTo = adv && today.date < addDays(seasonOf(today.date).start, A.switchDays) ? paths.filter(p => p !== adv.id) : []
  return (
    <div className="card adv-path" role="group" aria-label="Продвинутый путь">
      <b>Продвинутый путь</b>
      {adv ? <AdvancedClass state={state} /> : trial ? <>
        <p>{ADVANCED[trial.classId].name}</p>
        <div className="bar" role="progressbar" aria-label={trialText(trial)} aria-valuemin={0} aria-valuemax={A.trialDays} aria-valuenow={trial.day}>
          <i style={{ width: `${(trial.day / A.trialDays) * 100}%` }} /></div>
        <small aria-live="polite">{trialText(trial)}</small>
        <button className="btn ghost" disabled={w.busy} onClick={() => confirm(`Отказаться от испытания? Повтор — через ${A.retryDays} дней.`, 'Отказаться',
          () => void w.write({ type: 'advanced_trial_abandoned', date: today.date }, 'Испытание прервано'))}>Отказаться</button>
      </> : <>
        {!cls.trialOptions.length && <small className="muted">{cls.nextTrial ? `Испытание можно начать с ${dm(cls.nextTrial)}` : `Откроется с уровня ${A.level} и через ${A.delayDays} дней игры`}</small>}
        <ul className="perk-list">{paths.map(id => { const d = ADVANCED[id], open = cls.trialOptions.includes(id); return (
          <li key={id}><span className="grow"><b>{d.name}</b><small>Пассив: {d.passive}</small><small>Способность «{d.abilityName}»: {d.abilityDesc}</small>
            {open && <button className="btn primary" disabled={w.busy} onClick={() => start(id)}>Начать испытание ({A.trialDays} дней)</button>}</span></li>) })}</ul>
      </>}
      {switchTo.map(id => <button key={id} className="btn ghost" disabled={w.busy} onClick={() => confirm(`Сменить путь на «${ADVANCED[id].name}» без испытания? Можно только в первые ${A.switchDays} дней сезона.`,
        'Сменить путь', () => void w.write({ type: 'advanced_path_switched', date: today.date, classId: id }, `Путь: ${ADVANCED[id].name}`))}>Сменить путь: {ADVANCED[id].name}</button>)}
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
      {ask && <Confirm title={ask.title} yes={ask.yes} onYes={ask.run} onNo={() => setAsk(null)} />}
    </div>
  )
}

function AdvancedClass({ state }: { state: GameState }) {
  const adv = state.cls.advanced!, ab = adv.ability, target = abilityTarget(ab.id)
  const a = useAbility2(state)
  const [sheet, setSheet] = useState<null | 'confirm' | 'skill' | 'facet' | 'audit'>(null)
  const [card, setCard] = useState<CardModel | null>(null)
  const [skill, setSkill] = useState<SkillId | ''>('')
  const off = ab.available ? null : ab.usedOn ? `применена ${dm(ab.usedOn)} · снова в понедельник` : 'пока недоступна'
  const stake = A.invest.stake, poor = target === 'invest' && state.today.spendable < stake
  const facets = state.shadow.facets.filter(f => !f.banished)
  const run = async (extra = {}) => { if (await a.use(extra)) setSheet(null) }
  // «Сага»: отметка недели (если доступна) и карточка недели на устройстве
  const saga = async () => {
    if (ab.available && !(await a.use())) return
    const ws = weekStart(state.today.date), m = weekCard(state, ws) ?? weekCard(state, addDays(ws, -7))
    if (m) setCard(m); else a.setMsg({ ok: false, text: 'За неделю пока нет закрытых дней с заданиями' })
  }
  const press = () => target === 'card' ? void saga() : target === 'skill' ? setSheet('skill') : target === 'facet' ? setSheet('facet') : ab.id === 'audit' ? setSheet('audit') : setSheet('confirm')
  const what = target === 'invest' ? `Вложить ${stake} золота? Через ${A.invest.days} дней — ${A.invest.payout} при доле недели от ${Math.round(A.invest.share * 100)}%, иначе вклад сгорает.`
    : target === 'chain' ? `Применить «${ab.name}» сегодня? Цепочка, начатая сегодня, получит финал ×2.` : `Применить «${ab.name}» сегодня? ${ab.desc}.`
  const blocked = target !== 'card' && !!off
  return (
    <>
      <p><b>{adv.name}</b> <small className="muted">· до {dm(adv.until)}</small></p>
      <small>Доп. пассив: {adv.passive}</small>
      <small className="muted">«{ab.name}»: {ab.desc}. Раз в неделю.</small>
      {target === 'quest' ? <small className="fx">{off ?? `Применяется к заданию: открой его на Главной — кнопка «${ab.name}»`}</small>
        : <button className="btn primary" disabled={a.busy || blocked || poor} onClick={press}>
            {target === 'card' ? (ab.available ? `«${ab.name}»: карточка недели` : 'Открыть карточку недели') : target === 'invest' ? `Вложить ${stake} золота` : `Применить «${ab.name}»`}
            {blocked ? <small>{off}</small> : poor ? <small>мало золота ({state.today.spendable})</small> : null}</button>}
      <div aria-live="polite">{a.msg && <p role={a.msg.ok ? 'status' : 'alert'} className={a.msg.ok ? 'ok' : 'err'}>{a.msg.text}</p>}</div>
      {sheet === 'confirm' && <Confirm title={what} yes="Применить" onYes={() => void run()} onNo={() => setSheet(null)} />}
      {sheet === 'skill' && <Sheet id="vow-title" title={`«${ab.name}»: выбери навык`} onClose={() => setSheet(null)}>
        <p className="muted">{ab.desc}.</p>
        <label className="field">Навык<select value={skill} onChange={e => setSkill(e.target.value as SkillId)}>
          <option value="">—</option>{SKILL_CATALOG.map(k => <option key={k.id} value={k.id}>{k.title}</option>)}</select></label>
        <button className="btn primary big" disabled={!skill || a.busy} onClick={() => void run({ skill })}>Дать обет</button>
        <div aria-live="polite">{a.msg && !a.msg.ok && <p role="alert" className="err">{a.msg.text}</p>}</div>
      </Sheet>}
      {sheet === 'facet' && <Sheet id="fast-title" title={`«${ab.name}»: выбери грань`} onClose={() => setSheet(null)}>
        <p className="muted">{ab.desc}.</p>
        {facets.length ? <div className="chips" role="group" aria-label="Грань тени">{facets.map(f =>
          <button key={f.id} type="button" className="btn" disabled={a.busy} onClick={() => void run({ facetId: f.id })}>{f.name}</button>)}</div>
          : <p className="muted">Граней тени нет — добавь их на экране «Тень».</p>}
        <div aria-live="polite">{a.msg && !a.msg.ok && <p role="alert" className="err">{a.msg.text}</p>}</div>
      </Sheet>}
      {sheet === 'audit' && <Sheet id="audit-title" title="«Аудит»: три совета" onClose={() => setSheet(null)}>
        <p className="muted">Разбор трат месяца — по правилам, на этом устройстве. Финансы никуда не отправляются.</p>
        <ol className="audit">{auditTips(state.finance).map(t => <li key={t}>{t}</li>)}</ol>
        <button className="btn primary big" disabled={!!off || a.busy} onClick={() => void run()}>{off ?? 'Применить: задания Финансов дня ×2'}</button>
        <div aria-live="polite">{a.msg && !a.msg.ok && <p role="alert" className="err">{a.msg.text}</p>}</div>
      </Sheet>}
      {card && <CardSheet model={card} name={`saga-${card.after.date}.png`} onClose={() => setCard(null)} />}
    </>
  )
}

/** Вторая способность на задании («Рекорд», «Союз», «Сбор»): подтверждение. */
export function QuestAbility2({ state, q, onClose }: { state: GameState; q: DayQuest; onClose: () => void }) {
  const ab = state.cls.advanced!.ability
  const a = useAbility2(state)
  return (
    <Sheet id="qa2-title" title={`«${ab.name}»: ${q.title}`} onClose={onClose}>
      <p className="muted">{ab.desc}. Раз в неделю — следующий раз в понедельник.</p>
      <button className="btn primary big" disabled={a.busy} onClick={() => void a.use({ questId: q.id }).then(ok => { if (ok) onClose() })}>Применить «{ab.name}»</button>
      <div aria-live="polite">{a.msg && !a.msg.ok && <p role="alert" className="err">{a.msg.text}</p>}</div>
    </Sheet>
  )
}

const LG = BALANCE.legend

/** Легендарный класс (личная версия): испытание 30 дней — 4 недельных этапа по целям на годы и финал; потом своё название. */
function LegendPath({ state }: { state: GameState }) {
  const { cls, today, profile } = state, t = cls.legendTrial, lg = cls.legend
  const w = useWrite()
  const [form, setForm] = useState<null | { stages: string[]; final: string }>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [ask, setAsk] = useState(false)
  if (!lg && !t && !cls.legendOpen && !cls.advanced) return null
  const goals = [...(profile?.goals ?? [])].sort((a, b) => b.months - a.months).map(g => g.text)
  const open = () => setForm({ stages: Array.from({ length: LG.stages }, (_, i) => goals.length ? `Шаг к цели «${goals[i % goals.length]}»` : ''), final: goals[0] ? `Главный шаг к цели «${goals[0]}»` : '' })
  const ok = form && form.stages.every(s => s.trim()) && form.final.trim()
  const start = async () => { if (form && await w.write({ type: 'legend_trial_started', date: today.date, stages: form.stages, final: form.final }, 'Легендарное испытание началось')) setForm(null) }
  const mark = (k: number) => void w.write({ type: 'legend_stage_done', date: today.date, stage: k }, k === LG.stages ? 'Финал засчитан' : `Этап ${k + 1} засчитан`)
  const saveTitle = async () => { if (title !== null && await w.write({ type: 'legend_title_set', date: today.date, title }, 'Название сохранено')) setTitle(null) }
  return (
    <div className="card adv-path" role="group" aria-label="Легендарный класс">
      <b>Легендарный класс</b>
      {lg ? <>
        <p className="legend-name">{lg.title}</p>
        <small>Навсегда: +{Math.round(LG.xpBonus * 100)}% XP за задания и сияющий аватар. С {dm(lg.since)}.</small>
        {title === null ? <button className="btn ghost" onClick={() => setTitle(lg.title)}>Изменить название</button> : <>
          <label className="field">Название (можно дописать город)<input value={title} maxLength={LG.titleMax} onChange={e => setTitle(e.target.value)} /></label>
          <button className="btn primary" disabled={w.busy || !title.trim()} onClick={() => void saveTitle()}>Сохранить</button>
        </>}
      </> : t ? <>
        <small>День {Math.min(t.day, LG.days)} из {LG.days}. Нужно {LG.need} этапа из {LG.stages} и финал.</small>
        <ul className="perk-list">{[...t.stages, t.final].map((s, k) => {
          const [a, b] = stageWindow(t.start, k), done = k === LG.stages ? t.finalDone : t.done[k], can = canMark({ ...t, done: [...t.done] }, k, today.date)
          return (<li key={k}><span className="grow"><b>{k === LG.stages ? 'Финал (ранг S)' : `Этап ${k + 1}`}</b><small>{s}</small>
            <small className="muted">{done ? 'выполнено' : `${dm(a)}–${dm(b)}`}</small>
            {can && <button className="btn primary" disabled={w.busy} onClick={() => mark(k)}>Выполнено (+{k === LG.stages ? LG.finalXp : LG.stageXp} XP)</button>}</span></li>)
        })}</ul>
        <button className="btn ghost" disabled={w.busy} onClick={() => setAsk(true)}>Отказаться</button>
      </> : cls.legendOpen ? <>
        <small>Испытание на {LG.days} дней: {LG.stages} недельных этапа по твоим целям на годы и финальное задание ранга S. Награда — своё легендарное название, сияющий аватар и +{Math.round(LG.xpBonus * 100)}% XP за задания навсегда.</small>
        <button className="btn primary" disabled={w.busy} onClick={open}>Начать легендарное испытание</button>
      </> : <small className="muted">{cls.legendFail ? `Повтор испытания — с ${dm(addDays(cls.legendFail, LG.retryDays))}` : `Откроется с уровня ${LG.level}, когда продвинутый класс будет с тобой целый сезон`}</small>}
      <div aria-live="polite">{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
      {form && <Sheet id="legend-title" title="Легендарное испытание" onClose={() => setForm(null)}>
        <p className="muted">Опиши, что сделаешь за каждую неделю. Отмечаешь честно, только в неделю этапа.</p>
        {form.stages.map((s, i) => <label key={i} className="field">Этап {i + 1} (неделя {i + 1})
          <input value={s} maxLength={LG.textMax} onChange={e => setForm({ ...form, stages: form.stages.map((x, j) => (j === i ? e.target.value : x)) })} /></label>)}
        <label className="field">Финал — задание ранга S (последние {LG.finalDays} дня)
          <input value={form.final} maxLength={LG.textMax} onChange={e => setForm({ ...form, final: e.target.value })} /></label>
        <button className="btn primary big" disabled={!ok || w.busy} onClick={() => void start()}>Начать ({LG.days} дней)</button>
      </Sheet>}
      {ask && <Confirm title={`Отказаться от испытания? Повтор — через ${LG.retryDays} дней.`} yes="Отказаться" onNo={() => setAsk(false)}
        onYes={() => { setAsk(false); void w.write({ type: 'legend_trial_abandoned', date: today.date }, 'Испытание прервано') }} />}
    </div>
  )
}
