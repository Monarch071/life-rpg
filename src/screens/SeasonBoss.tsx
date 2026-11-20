import { useEffect, useState } from 'react'
import { Bot, Check, PenLine, Swords } from 'lucide-react'
import { getAiConfig, type AiConfig } from '../ai/config'
import { aiBossOptions } from '../ai/game'
import { BALANCE } from '../domain/balance'
import { validBossDraft } from '../domain/boss'
import { SKILL_CATALOG, type SkillId } from '../domain/skillCatalog'
import type { BossDraft, GameState } from '../domain/types'
import Confirm from '../ui/Confirm'
import Sheet from '../ui/Sheet'
import { partView } from '../ui/gameView'
import { useWrite } from '../ui/useWrite'

const B = BALANCE.boss
const AI_TIMEOUT = 20_000
const skillTitle = (id: string) => SKILL_CATALOG.find(s => s.id === id)?.title ?? id
const STATUS: Record<NonNullable<GameState['seasonBoss']>['parts'][number]['status'], string> = {
  upcoming: 'впереди', active: 'идёт', late: 'догоняем', defeated: 'побеждён',
}
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/** «Босс сезона»: выбор из 3 вариантов или свой; потом три месячные части с HP. */
export default function SeasonBoss({ state }: { state: GameState }) {
  const w = useWrite()
  const [giveUp, setGiveUp] = useState(false)
  const b = state.seasonBoss
  if (state.season.kind === 'prologue') return (
    <section className="panel stack" aria-label="Босс сезона"><h1>Босс сезона</h1>
      <p className="muted">Босс появится с началом сезона. Пролог идёт до {dm(state.season.end)}.</p></section>
  )
  if (!b) return <BossPicker state={state} />
  return (
    <section className="panel stack" aria-label="Босс сезона">
      <div className="sec"><h1>Босс сезона</h1><span>{state.season.name}</span></div>
      <div className="row qhead">
        <span className="ico" style={{ '--c': 'var(--shadow)' } as React.CSSProperties} aria-hidden="true"><Swords size={22} /></span>
        <b className="grow">{b.title}{b.defeated ? ' — повержен!' : ''}</b>
      </div>
      <small className="muted">Навык: {skillTitle(b.skill)} · шаги приходят заданиями дня, удары — задания той же характеристики</small>
      {b.parts.map((p, i) => {
        const v = partView(p)
        return (
          <div key={i} className={`card part ${v.tone}`}>
            <div className="row qhead"><b className="grow">{v.label}</b><small>{STATUS[p.status]} · {dm(p.start)}–{dm(p.end)}</small></div>
            <div className="bar hp" role="progressbar" aria-label={`${p.title}: HP ${p.hp} из 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.hp}>
              <i style={{ width: `${p.hp}%` }} />
            </div>
            <ol className="stages">{p.steps.map((s, j) => (
              <li key={j} className={s.done ? 'done' : undefined}>{s.done && <Check size={14} aria-hidden="true" />}{s.title}</li>
            ))}</ol>
            <small className="muted">Ударов {p.hits} из {B.hitCap}{v.next ? ` · следующий шаг: ${v.next}` : ''}</small>
          </div>
        )
      })}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      {!b.defeated && <button className="btn ghost" disabled={w.busy} onClick={() => setGiveUp(true)}>Сдаться</button>}
      {giveUp && <Confirm title="Сдаться? Прогресс босса пропадёт, можно выбрать нового." yes="Сдаться" onNo={() => setGiveUp(false)}
        onYes={() => { setGiveUp(false); void w.write({ type: 'season_boss_abandoned', seasonId: b.seasonId }, 'Босс брошен') }} />}
    </section>
  )
}

function BossPicker({ state }: { state: GameState }) {
  const w = useWrite()
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  useEffect(() => { let on = true; getAiConfig().then(c => { if (on) setCfg(c) }, () => {}); return () => { on = false } }, [])
  const [ai, setAi] = useState<BossDraft[] | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [own, setOwn] = useState(false)
  const options = ai ?? state.bossOptions
  // дата и сезон — игровые (replay сверяет сезон с игровой датой события)
  const pick = (boss: BossDraft) => w.write({ type: 'season_boss_set', seasonId: state.season.id, boss }, 'Босс выбран — первый шаг придёт заданием дня')
  const askAi = async () => {
    if (!cfg) return
    setAiBusy(true); w.setMsg(null)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      setAi(await Promise.race([aiBossOptions(cfg, (state.profile?.goals ?? []).map(g => g.text), state.bossOptions),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), AI_TIMEOUT) })]))
    } catch { w.setMsg({ ok: false, text: 'Мастер не ответил — остаются варианты по правилам' }) }
    clearTimeout(timer); setAiBusy(false)
  }
  return (
    <section className="panel stack" aria-label="Босс сезона">
      <div className="sec"><h1>Босс сезона</h1><span>{state.season.name}</span></div>
      <p className="muted">Большая цель на сезон: три части по месяцу. Выбери одного.</p>
      {options.map((o, i) => (
        <div key={i} className="card boss">
          <b>{o.title}</b>
          <small className="muted">{skillTitle(o.skill)} · {o.parts.map(p => p.title).join(' → ')}</small>
          <button className="btn primary" disabled={w.busy} onClick={() => void pick(o)}>Выбрать</button>
        </div>
      ))}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      {cfg && <button className="btn" disabled={aiBusy} onClick={() => void askAi()}><Bot size={18} aria-hidden="true" /> {aiBusy ? 'Мастер думает…' : 'Варианты от Мастера'}</button>}
      <button className="btn ghost" onClick={() => setOwn(true)}><PenLine size={18} aria-hidden="true" /> Свой босс</button>
      {own && <OwnBoss state={state} onPick={pick} onClose={() => setOwn(false)} />}
    </section>
  )
}

function OwnBoss({ state, onPick, onClose }: { state: GameState; onPick: (b: BossDraft) => Promise<boolean>; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [skill, setSkill] = useState<SkillId>(state.bossOptions[0]?.skill ?? SKILL_CATALOG[0].id)
  const [parts, setParts] = useState(() => Array.from({ length: B.parts }, (_, i) => {
    const p = state.bossOptions[0]?.parts[i]
    return { title: p?.title ?? '', steps: p?.steps.join('\n') ?? '' }
  }))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (i: number, p: Partial<{ title: string; steps: string }>) => { setParts(parts.map((x, j) => (j === i ? { ...x, ...p } : x))); setErr(null) }
  const save = async () => {
    const d = validBossDraft({ title: title.trim(), skill, parts: parts.map(p => ({ title: p.title.trim(), steps: p.steps.split('\n').map(s => s.trim()).filter(Boolean) })) })
    if (!d) return setErr(`Название до 60 символов; в каждой части — название и ${B.stepsMin}–${B.stepsMax} шагов до 80 символов, по одному на строку`)
    setBusy(true)
    if (await onPick(d)) onClose(); else setBusy(false)
  }
  return (
    <Sheet id="ob-title" title="Свой босс" onClose={onClose}>
      <label className="field">Цель сезона<input value={title} maxLength={60} onChange={e => { setTitle(e.target.value); setErr(null) }} /></label>
      <label className="field">Навык
        <select className="select" value={skill} onChange={e => setSkill(e.target.value as SkillId)}>
          {SKILL_CATALOG.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select></label>
      {parts.map((p, i) => (
        <fieldset key={i} className="stack part-edit">
          <legend>Часть {i + 1}</legend>
          <label className="field">Название<input value={p.title} maxLength={60} onChange={e => set(i, { title: e.target.value })} /></label>
          <label className="field">Шаги ({B.stepsMin}–{B.stepsMax}, по одному на строку)<textarea rows={4} value={p.steps} onChange={e => set(i, { steps: e.target.value })} /></label>
        </fieldset>
      ))}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary big" disabled={busy} onClick={() => void save()}>Выбрать этого босса</button>
    </Sheet>
  )
}
