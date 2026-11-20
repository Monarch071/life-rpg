import { useEffect, useState } from 'react'
import { Bot, Check, MessageCircleQuestion, Plus, Trash2 } from 'lucide-react'
import { getAiConfig, type AiConfig } from '../ai/config'
import { aiLadderSteps } from '../ai/game'
import { BALANCE } from '../domain/balance'
import { genericLadder, LADDER_PRESETS, validLadderSteps } from '../domain/ladder'
import { isSerious } from '../domain/shadow'
import type { GameState, LadderKind, LadderStep } from '../domain/types'
import Confirm from '../ui/Confirm'
import Sheet from '../ui/Sheet'
import { useWrite } from '../ui/useWrite'
import { SafetyCard } from './Shadow'

type Ladder = GameState['ladders'][number]
type PresetId = keyof typeof LADDER_PRESETS
const L = BALANCE.ladder
const STEP_NAMES = ['Проба', 'Закрепление', 'Рост', 'Мастерство', 'Автоматизм']
const AI_TIMEOUT = 15_000

/** Ступени для правки: шаблон с тем же названием, иначе общая лестница (своих ступеней в состоянии нет). */
const baseSteps = (l: Pick<Ladder, 'title' | 'kind'>): LadderStep[] =>
  (Object.values(LADDER_PRESETS).find(p => p.title === l.title && p.kind === l.kind) ?? genericLadder(l.title, l.kind)).steps

export default function Ladders({ state }: { state: GameState }) {
  const w = useWrite()
  const [adding, setAdding] = useState(false)
  const [ask, setAsk] = useState<Ladder | null>(null)
  const [remove, setRemove] = useState<Ladder | null>(null)
  const by = (s: Ladder['status']) => state.ladders.filter(l => l.status === s)
  const active = by('active'), queued = by('queued'), auto = by('auto')
  return (
    <section className="panel stack" aria-label="Привычки">
      <div className="sec"><h1>Привычки</h1><span>активных {active.length} из {L.maxActive}</span></div>
      {state.ladders.length === 0 && <p className="muted">Лестница привычки — 5 ступеней от лёгкой пробы до автоматизма. Начни с одной.</p>}
      {active.map(l => <LadderCard key={l.id} l={l} onAsk={() => setAsk(l)} onRemove={() => setRemove(l)} />)}
      {queued.length > 0 && <>
        <h3>В очереди</h3>
        {queued.map((l, i) => (
          <div key={l.id} className="card row lad-q"><span className="grow">{i + 1}. {l.title}</span>
            <button className="icon-btn" aria-label={`Убрать: ${l.title}`} onClick={() => setRemove(l)}><Trash2 size={18} aria-hidden="true" /></button></div>
        ))}
        <small className="muted">Станет активной со следующего дня, когда освободится слот.</small>
      </>}
      {auto.length > 0 && <>
        <h3>Автоматизм</h3>
        {auto.map(l => <LadderCard key={l.id} l={l} onAsk={() => setAsk(l)} onRemove={() => setRemove(l)} />)}
      </>}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Новая лестница</button>
      {adding && <NewLadder state={state} full={active.length >= L.maxActive} onClose={() => setAdding(false)} />}
      {ask && <AskSheet l={ask} onClose={() => setAsk(null)} />}
      {remove && <Confirm title={`Убрать лестницу «${remove.title}»?`} yes="Убрать" onNo={() => setRemove(null)}
        onYes={() => { const id = remove.id; setRemove(null); void w.write({ type: 'ladder_removed', ladderId: id }, 'Лестница убрана') }} />}
    </section>
  )
}

function LadderCard({ l, onAsk, onRemove }: { l: Ladder; onAsk: () => void; onRemove: () => void }) {
  const week = l.status === 'auto'
  return (
    <div className="card lad">
      <div className="row qhead">
        <b className="grow">{l.title}{l.kind === 'dont' && <small className="muted"> · не делать</small>}</b>
        {l.todayDone && <small className="ok"><Check size={14} aria-hidden="true" /> сегодня</small>}
        <button className="icon-btn" aria-label={`Убрать: ${l.title}`} onClick={onRemove}><Trash2 size={18} aria-hidden="true" /></button>
      </div>
      <ol className="lad-steps" aria-label={`Ступень ${l.step} из ${L.steps}: ${STEP_NAMES[l.step - 1]}`}>
        {STEP_NAMES.map((n, i) => <li key={n} className={i < l.step ? 'on' : undefined} title={n} aria-hidden="true" />)}
      </ol>
      <small>{STEP_NAMES[l.step - 1]} · {l.label} · +{l.xp} XP{l.attempt === 2 ? ' · вторая попытка' : ''}</small>
      <div className="bar" role="progressbar" aria-label={`${l.title}: ${l.done} из ${l.required} за ${week ? 'неделю' : 'окно'}`}
        aria-valuemin={0} aria-valuemax={l.required} aria-valuenow={Math.min(l.done, l.required)}>
        <i style={{ width: `${l.required ? Math.min(100, (l.done / l.required) * 100) : 0}%` }} />
      </div>
      <small className="muted">{week ? 'Неделя' : 'Окно'}: {l.done}/{l.required} · день {l.windowDays} из {week ? 7 : L.windowDays}</small>
      {l.ask && <button className="btn primary" onClick={onAsk}><MessageCircleQuestion size={18} aria-hidden="true" /> Что мешает?</button>}
    </div>
  )
}

/** «Что мешает?» — Мастер предлагает переформулировать ступени; действует со следующего окна. */
function AskSheet({ l, onClose }: { l: Ladder; onClose: () => void }) {
  const [steps, setSteps] = useState(() => baseSteps(l).map(s => ({ ...s })))
  const w = useWrite()
  const set = (i: number, p: Partial<LadderStep>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...p } : s)))
  const save = async () => {
    const v = validLadderSteps(steps)
    if (!v) return w.setMsg({ ok: false, text: 'У каждой ступени — текст до 60 символов' })
    if (await w.write({ type: 'ladder_updated', ladderId: l.id, steps: v }, 'Ступени обновлены')) onClose()
  }
  return (
    <Sheet id="ask-title" title="Что мешает?" onClose={onClose}>
      <p className="muted">Окно не удалось — это нормально. Сделай ступени проще: меньше раз в неделю или легче шаг. Новые ступени — со следующего окна.</p>
      {steps.map((s, i) => (
        <div key={i} className="row lad-edit">
          <label className="field">{STEP_NAMES[i]}<input value={s.label} maxLength={60} onChange={e => set(i, { label: e.target.value })} /></label>
          <label className="field per7">Раз в неделю
            <select className="select" value={s.per7} onChange={e => set(i, { per7: Number(e.target.value) as LadderStep['per7'] })}>
              {[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n}</option>)}
            </select></label>
        </div>
      ))}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn primary big" disabled={w.busy} onClick={save}>Сохранить ступени</button>
    </Sheet>
  )
}

function NewLadder({ state, full, onClose }: { state: GameState; full: boolean; onClose: () => void }) {
  const w = useWrite()
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  useEffect(() => { let on = true; getAiConfig().then(c => { if (on) setCfg(c) }, () => {}); return () => { on = false } }, [])
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<LadderKind>('do')
  const [workdays, setWorkdays] = useState(false)
  const [facetId, setFacetId] = useState<string | null>(null)
  const [aiSteps, setAiSteps] = useState<LadderStep[] | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [serious, setSerious] = useState(false)
  const t = title.trim()
  const have = new Set(state.ladders.map(l => l.title))
  const good = state.profile?.goodHabits ?? []
  const presets = (Object.keys(LADDER_PRESETS) as PresetId[])
    .sort((a, b) => Number(good.includes(b)) - Number(good.includes(a)))
    .filter(id => !have.has(LADDER_PRESETS[id].title))
  const facets = state.shadow.facets.filter(f => !f.banished)
  const create = async (p: { title: string; kind: LadderKind; skill: Ladder['skill']; steps: LadderStep[] }, extra: { suitable?: 'workdays'; facetId?: string } = {}) => {
    if (await w.write({ type: 'ladder_created', ladderId: crypto.randomUUID(), ...p, ...extra }, full ? 'Лестница в очереди' : 'Лестница начата')) onClose()
  }
  const custom = () => {
    if (t.length < 2 || t.length > 40) return w.setMsg({ ok: false, text: 'Название — от 2 до 40 символов' })
    if (isSerious(t, 'custom', state.interviewAnswers)) return setSerious(true)
    const g = genericLadder(t, kind)
    void create({ ...g, steps: kind === 'do' && aiSteps ? aiSteps : g.steps },
      { ...(workdays ? { suitable: 'workdays' as const } : {}), ...(kind === 'dont' && facetId ? { facetId } : {}) })
  }
  // название «не делать» в ИИ не уходит (aiLadderSteps откажет сам)
  const askAi = async () => {
    if (!cfg || kind !== 'do' || t.length < 2) return
    setAiBusy(true); w.setMsg(null)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      setAiSteps(await Promise.race([aiLadderSteps(cfg, t, kind), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), AI_TIMEOUT) })]))
    } catch { w.setMsg({ ok: false, text: 'Мастер не ответил — возьмём ступени по правилам' }) }
    clearTimeout(timer); setAiBusy(false)
  }
  if (serious) return <SafetyCard onClose={onClose} />
  return (
    <Sheet id="nl-title" title="Новая лестница" onClose={onClose}>
      {full && <p className="muted">Активных уже {L.maxActive} — новая встанет в очередь.</p>}
      {presets.length > 0 && <div className="field"><span>Готовые</span>
        <div className="chips">{presets.map(id => {
          const p = LADDER_PRESETS[id]
          return <button key={id} type="button" className="btn" disabled={w.busy} onClick={() => void create(p)}>
            {p.title}{p.kind === 'dont' ? ' (не делать)' : ''} <small>{p.steps[0].label}, {p.steps[0].per7}/7</small></button>
        })}</div></div>}
      <h3>Своя</h3>
      <label className="field">Привычка<input value={title} maxLength={40} placeholder="Например: растяжка" onChange={e => { setTitle(e.target.value); setAiSteps(null) }} /></label>
      <div className="seg-toggle" role="group" aria-label="Вид">
        <button type="button" aria-pressed={kind === 'do'} onClick={() => setKind('do')}>Делать</button>
        <button type="button" aria-pressed={kind === 'dont'} onClick={() => { setKind('dont'); setAiSteps(null) }}>Не делать</button>
      </div>
      <div className="seg-toggle" role="group" aria-label="Подходящие дни">
        <button type="button" aria-pressed={!workdays} onClick={() => setWorkdays(false)}>Каждый день</button>
        <button type="button" aria-pressed={workdays} onClick={() => setWorkdays(true)}>Рабочие дни</button>
      </div>
      {kind === 'dont' && facets.length > 0 && <div className="field"><span>Ослабляет грань тени</span>
        <div className="chips">{[{ id: null, name: 'Нет' }, ...facets].map(f => (
          <button key={f.id ?? '-'} type="button" className={`btn${facetId === f.id ? ' primary' : ''}`} aria-pressed={facetId === f.id} onClick={() => setFacetId(f.id)}>{f.name}</button>
        ))}</div></div>}
      {kind === 'do' && cfg && (
        <button type="button" className="btn" disabled={aiBusy || t.length < 2} onClick={() => void askAi()}>
          <Bot size={18} aria-hidden="true" /> {aiBusy ? 'Мастер думает…' : 'Построить ступени'}</button>
      )}
      <ol className="stages" aria-live="polite">
        {(kind === 'do' && aiSteps ? aiSteps : genericLadder(t || 'Привычка', kind).steps).map((s, i) => <li key={i}>{STEP_NAMES[i]}: {s.label}, {s.per7}/7</li>)}
      </ol>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn primary big" disabled={w.busy || aiBusy} onClick={custom}>Начать лестницу</button>
    </Sheet>
  )
}
