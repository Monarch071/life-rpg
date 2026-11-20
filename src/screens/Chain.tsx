import { useEffect, useState } from 'react'
import { Bot, Check, ScrollText } from 'lucide-react'
import { getAiConfig, type AiConfig } from '../ai/config'
import { aiChainSteps } from '../ai/game'
import { BALANCE } from '../domain/balance'
import { chainByRules, validChainSteps } from '../domain/boss'
import { DEFAULT_SKILL_BY_STAT } from '../domain/questBank'
import { SKILL_CATALOG, type SkillId } from '../domain/skillCatalog'
import { cleanText } from '../domain/text'
import type { GameState } from '../domain/types'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'

const C = BALANCE.chain
const AI_TIMEOUT = 15_000

/** «Сюжет»: активная цепочка или «Начать из цели» (шаги правилами или от Мастера, правка перед стартом). */
export default function Chain({ state }: { state: GameState }) {
  const w = useWrite()
  const [drop, setDrop] = useState(false)
  const c = state.chain
  if (!c) return <NewChain state={state} />
  return (
    <section className="panel stack" aria-label="Сюжет">
      <div className="sec"><h1>Сюжет</h1><span>шаг {Math.min(c.current + 1, c.steps.length)} из {c.steps.length}</span></div>
      <div className="row qhead">
        <span className="ico" style={{ '--c': 'var(--ice)' } as React.CSSProperties} aria-hidden="true"><ScrollText size={22} /></span>
        <b className="grow">{c.title}</b>
      </div>
      <ol className="stages">{c.steps.map((s, i) => (
        <li key={i} className={s.done ? 'done' : undefined} aria-current={i === c.current ? 'step' : undefined}>
          {s.done ? <Check size={14} aria-hidden="true" /> : i === c.current ? '→ ' : ''}{s.title}</li>
      ))}</ol>
      <small className="muted">Текущий шаг приходит заданием дня и переносится, пока не сделан. Финал — +{C.doneXp} XP.</small>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn ghost" disabled={w.busy} onClick={() => setDrop(true)}>Бросить</button>
      {drop && <Confirm title="Бросить сюжет? Пройденные шаги останутся в журнале." yes="Бросить" onNo={() => setDrop(false)}
        onYes={() => { setDrop(false); void w.write({ type: 'chain_abandoned', chainId: c.id }, 'Сюжет брошен') }} />}
    </section>
  )
}

function NewChain({ state }: { state: GameState }) {
  const w = useWrite()
  const goals = state.profile?.goals ?? []
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  useEffect(() => { let on = true; getAiConfig().then(x => { if (on) setCfg(x) }, () => {}); return () => { on = false } }, [])
  const [goal, setGoal] = useState('')
  const [skill, setSkill] = useState<SkillId>('routine')
  const [steps, setSteps] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const g = goal.trim()
  const choose = (text: string, sk: SkillId) => { setGoal(text.slice(0, 60)); setSkill(sk); setSteps(chainByRules(text).join('\n')); w.setMsg(null) }
  const askAi = async () => {
    if (!cfg || !g) return
    setAiBusy(true); w.setMsg(null)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      setSteps((await Promise.race([aiChainSteps(cfg, g), new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), AI_TIMEOUT) })])).join('\n'))
    } catch { w.setMsg({ ok: false, text: 'Мастер не ответил — оставь шаги по правилам' }) }
    clearTimeout(timer); setAiBusy(false)
  }
  const start = async () => {
    const title = cleanText(g, 60), st = validChainSteps(steps.split('\n').map(s => s.trim()).filter(Boolean))
    if (!title) return w.setMsg({ ok: false, text: 'Укажи цель — до 60 символов' })
    if (!st) return w.setMsg({ ok: false, text: `Нужно ${C.stepsMin}–${C.stepsMax} шагов до 80 символов, по одному на строку` })
    if (await w.write({ type: 'chain_started', chainId: crypto.randomUUID(), title, skill, steps: st }, 'Сюжет начат — первый шаг придёт заданием дня')) { setGoal(''); setSteps('') }
  }
  return (
    <section className="panel stack" aria-label="Сюжет">
      <div className="sec"><h1>Сюжет</h1>{state.chainsDone > 0 && <span>пройдено {state.chainsDone}</span>}</div>
      <p className="muted">Цепочка из {C.stepsMin}–{C.stepsMax} шагов к цели: по шагу в день, пока не дойдёшь.</p>
      {goals.length > 0 && <div className="field"><span>Начать из цели</span>
        <div className="chips">{goals.map((x, i) => (
          <button key={i} type="button" className={`btn${goal === x.text.slice(0, 60) ? ' primary' : ' ghost'}`} aria-pressed={goal === x.text.slice(0, 60)}
            onClick={() => choose(x.text, DEFAULT_SKILL_BY_STAT[x.stat])}>{x.text}</button>
        ))}</div></div>}
      <label className="field">Цель<input value={goal} maxLength={60} placeholder="Своя цель" onChange={e => { setGoal(e.target.value); w.setMsg(null) }} /></label>
      <label className="field">Навык
        <select className="select" value={skill} onChange={e => setSkill(e.target.value as SkillId)}>
          {SKILL_CATALOG.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
        </select></label>
      <div className="chips">
        <button type="button" className="btn" disabled={!g} onClick={() => setSteps(chainByRules(g).join('\n'))}>Шаги по правилам</button>
        {cfg && <button type="button" className="btn" disabled={!g || aiBusy} onClick={() => void askAi()}><Bot size={18} aria-hidden="true" /> {aiBusy ? 'Мастер думает…' : 'Шаги от Мастера'}</button>}
      </div>
      <label className="field">Шаги (по одному на строку, можно править)<textarea rows={5} value={steps} aria-live="polite" onChange={e => { setSteps(e.target.value); w.setMsg(null) }} /></label>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn primary big" disabled={w.busy || aiBusy} onClick={() => void start()}>Начать сюжет</button>
    </section>
  )
}
