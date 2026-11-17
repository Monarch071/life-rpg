import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Check, Clock, Dumbbell, HeartPulse, Leaf, ScrollText, Sparkles, Target, Users, Wallet, X, type LucideIcon } from 'lucide-react'
import { appendEvent, getSetting, setSetting } from '../db'
import { QUESTIONS, SECTIONS, cleanAnswers, validAnswer, type Analysis, type Answers, type Question } from '../domain/interview'
import type { GameState } from '../domain/types'
import { getAiConfig, PROVIDER_NAMES, type AiConfig } from '../ai/config'
import { aiAnalysis, aiFollowups, type Followup } from '../ai/interview'
import StatRadar from '../ui/StatRadar'
import { parseDraft, splitScale, TOTAL, type Draft } from './interviewFlow'

const ICONS: Record<string, LucideIcon> = { Sparkles, Dumbbell, HeartPulse, Clock, BookOpen, Wallet, Users, Target, Leaf }
const DRAFT = 'interviewDraft'
type Val = string | number | string[] | undefined
type Phase = { k: 'intro' } | { k: 'q' } | { k: 'think' } | { k: 'fu'; list: Followup[]; i: number } | { k: 'end' } | { k: 'confirm' } | { k: 'analyze' } | { k: 'reveal'; fallback: boolean }

const secIdx = (i: number) => SECTIONS.findIndex(s => s.id === QUESTIONS[Math.min(i, TOTAL - 1)].section)
const countIn = (si: number) => QUESTIONS.filter(q => q.section === SECTIONS[si].id).length
const firstOf = (si: number) => QUESTIONS.findIndex(q => q.section === SECTIONS[si].id)
const empty = (v: Val) => v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> => {
  let t: ReturnType<typeof setTimeout> | undefined
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), ms) })]).finally(() => clearTimeout(t))
}
/** Значение поля → ответ (число из текста поля «number»). */
const toAnswer = (q: Question, v: Val): Val => q.kind === 'number' && typeof v === 'string' ? (v.trim() ? Number(v.replace(',', '.')) : undefined) : typeof v === 'string' ? v.trim() : v

/** Плашка-вход: «Создание персонажа» (Главная — с «Позже», Герой — без). */
export function InterviewCta({ onStart, onLater }: { onStart: () => void; onLater?: () => void }) {
  const draft = parseDraft(useLiveQuery(() => getSetting<unknown>(DRAFT, null)))
  return (
    <section className="ivw-cta" aria-label="Создание персонажа">
      <span className="ic" aria-hidden="true"><ScrollText size={22} /></span>
      <div><b>Создание персонажа</b><small>Большая анкета: ~{TOTAL} вопросов, 15–20 минут. По ответам ИИ создаст портрет героя и будет давать задания под тебя.</small></div>
      <div className="row">
        {onLater && <button type="button" className="btn ghost" onClick={onLater}>Позже</button>}
        <button type="button" className="btn primary" onClick={onStart}>{draft ? `Продолжить (${draft.idx}/${TOTAL})` : 'Начать'}</button>
      </div>
    </section>
  )
}

/** Карточка «Портрет» на вкладке «Герой». */
export function Portrait({ c, onRetake }: { c: NonNullable<GameState['character']>; onRetake: () => void }) {
  return (
    <section className="panel stack portrait" aria-label="Портрет">
      <div className="sec"><h2>Портрет</h2><span>{c.date.slice(8, 10)}.{c.date.slice(5, 7)}</span></div>
      <div className="arch">{c.archetype}</div>
      {c.summary && <p>{c.summary}</p>}
      <Chips title="Сильные стороны" items={c.strengths} cls="good" />
      <Chips title="Зоны роста" items={c.focus.length ? c.focus : c.weaknesses} cls="grow" />
      <button type="button" className="btn" onClick={onRetake}>Пройти анкету заново</button>
      <small className="muted">Старые ответы подставятся, характеристики не понизятся.</small>
    </section>
  )
}

function Chips({ title, items, cls }: { title: string; items: string[]; cls: string }) {
  if (!items.length) return null
  return <div className="trait"><small>{title}</small><div className="chips">{items.map(s => <span key={s} className={`tchip ${cls}`}>{s}</span>)}</div></div>
}

function Field({ q, val, set }: { q: Question; val: Val; set: (v: Val) => void }) {
  switch (q.kind) {
    case 'choice': return (
      <div className="chips opts" role="radiogroup" aria-label={q.text}>
        {q.options!.map(o => <button key={o} type="button" role="radio" aria-checked={val === o} className={val === o ? 'on' : ''} onClick={() => set(o)}>{o}</button>)}
      </div>)
    case 'multi': {
      const arr = Array.isArray(val) ? val : []
      return (
        <div className="chips opts" role="group" aria-label={q.text}>
          {q.options!.map(o => { const on = arr.includes(o); return (
            <button key={o} type="button" aria-pressed={on} className={on ? 'on' : ''} onClick={() => set(on ? arr.filter(x => x !== o) : [...arr, o])}>
              <span className="box" aria-hidden="true">{on && <Check size={16} strokeWidth={3} />}</span>{o}
            </button>) })}
        </div>)
    }
    case 'scale': {
      const { lo, hi } = splitScale(q.text)
      return (
        <div className="ivw-scale">
          <div className="scale" role="radiogroup" aria-label={`${q.text}: 1 — ${lo}, 5 — ${hi}`}>
            {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={val === n} className={val === n ? 'on' : ''} onClick={() => set(n)}>{n}</button>)}
          </div>
          <div className="edges" aria-hidden="true"><span>{lo}</span><span>{hi}</span></div>
        </div>)
    }
    case 'number': return (
      <label className="ivw-num">
        <input type="text" inputMode="decimal" autoComplete="off" aria-label={q.text} placeholder="0" value={val === undefined ? '' : String(val)} onChange={e => set(e.target.value)} />
        {q.unit && <span>{q.unit}</span>}
      </label>)
    case 'text': return <textarea className="ivw-text" aria-label={q.text} rows={4} maxLength={2000} placeholder="Напиши как есть…" value={typeof val === 'string' ? val : ''} onChange={e => set(e.target.value)} />
  }
}

/** Большая анкета: полноэкранный поток. Черновик — в interviewDraft после каждого шага. */
export default function Interview({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(null)
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [phase, setPhase] = useState<Phase>({ k: 'intro' })
  const [val, setVal] = useState<Val>(undefined)
  const [dir, setDir] = useState(1)
  const [err, setErr] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    void (async () => {
      setCfg(await getAiConfig().catch(() => null))
      const saved = parseDraft(await getSetting<unknown>(DRAFT, null).catch(() => null))
      const draft = saved ?? { answers: { ...(state.interviewAnswers ?? {}) }, idx: 0, followups: [], asked: [] }
      setD(draft)
      setPhase(draft.idx >= TOTAL ? { k: 'end' } : draft.idx === firstOf(secIdx(draft.idx)) ? { k: 'intro' } : { k: 'q' })
      if (draft.idx < TOTAL) setVal(draft.answers[QUESTIONS[draft.idx].id])
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (nd: Draft) => { setD(nd); void setSetting(DRAFT, nd).catch(() => setErr('Не удалось сохранить черновик')) }
  const goTo = (nd: Draft, forward: boolean) => {
    setDir(forward ? 1 : -1); setErr(null)
    save(nd)
    if (nd.idx >= TOTAL) return setPhase({ k: 'end' })
    setVal(nd.answers[QUESTIONS[nd.idx].id])
    setPhase(forward && nd.idx === firstOf(secIdx(nd.idx)) ? { k: 'intro' } : { k: 'q' })
  }

  // Enter → «Далее» (кроме textarea и кнопок навигации)
  const nextRef = useRef(() => {})
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === 'Escape') return onClose()
      if (e.key !== 'Enter' || e.shiftKey || t.tagName === 'TEXTAREA' || t.closest('.onb-nav, .ivw-top, .sheet, .lvlup')) return
      e.preventDefault(); nextRef.current()
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  if (!d) return <div className="ivw" />
  const q = QUESTIONS[Math.min(d.idx, TOTAL - 1)]
  const si = secIdx(d.idx)
  const sec = SECTIONS[si]
  const SecIcon = ICONS[sec.icon] ?? Sparkles
  const fu = phase.k === 'fu' ? phase.list[phase.i] : null
  const cur: Question | null = fu ? { id: fu.id, section: sec.id, kind: fu.kind, text: fu.text, options: fu.options, min: 1, max: 5, optional: true } : phase.k === 'q' ? q : null
  const ans = cur ? toAnswer(cur, val) : undefined
  const ready = !cur || (empty(ans) ? !!cur.optional : validAnswer(cur, ans))

  // после раздела — уточнения ИИ (один раз на раздел), ошибка — тихо дальше
  const afterSection = async (nd: Draft) => {
    const s = QUESTIONS[nd.idx - 1].section
    if (!cfg || nd.asked.includes(s) || (nd.idx < TOTAL && QUESTIONS[nd.idx].section === s)) return goTo(nd, true)
    const withAsk = { ...nd, asked: [...nd.asked, s] }
    save(withAsk); setPhase({ k: 'think' })
    const list = await withTimeout(aiFollowups(cfg, s, nd.answers), 20_000).catch(() => [] as Followup[])
    if (list.length) { setDir(1); setVal(undefined); setPhase({ k: 'fu', list, i: 0 }) } else goTo(withAsk, true)
  }

  const next = () => {
    if (!ready || busy.current) return
    if (phase.k === 'intro') { setDir(1); return setPhase({ k: 'q' }) }
    if (phase.k === 'q') {
      const answers: Answers = { ...d.answers }
      if (empty(ans)) delete answers[q.id]; else answers[q.id] = ans!
      return void afterSection({ ...d, answers, idx: d.idx + 1 })
    }
    if (phase.k === 'fu' && fu) {
      const nd = empty(ans) ? d : { ...d, followups: [...d.followups, { q: fu.text, a: Array.isArray(ans) ? ans.join(', ') : String(ans) }] }
      if (phase.i + 1 < phase.list.length) { save(nd); setDir(1); setVal(undefined); return setPhase({ ...phase, i: phase.i + 1 }) }
      return goTo(nd, true)
    }
    if (phase.k === 'end') return cfg ? setPhase({ k: 'confirm' }) : void finish(false)
  }
  const skip = () => { setVal(undefined); if (phase.k === 'q') { const answers = { ...d.answers }; delete answers[q.id]; return void afterSection({ ...d, answers, idx: d.idx + 1 }) }; if (phase.k === 'fu') { if (phase.i + 1 < phase.list.length) setPhase({ ...phase, i: phase.i + 1 }); else goTo(d, true) } }
  const back = () => goTo({ ...d, idx: Math.max(0, d.idx - 1) }, false)

  const finish = async (useAi: boolean) => {
    if (busy.current) return
    busy.current = true; setErr(null); setPhase({ k: 'analyze' })
    let analysis: Analysis | null = null
    if (useAi && cfg) analysis = await withTimeout(aiAnalysis(cfg, d.answers, d.followups), 60_000).catch(() => null)
    try {
      await appendEvent({ type: 'interview_completed', answers: cleanAnswers(d.answers), followups: d.followups, analysis })
      await setSetting(DRAFT, null).catch(() => {})
      setPhase({ k: 'reveal', fallback: useAi && !analysis })
    } catch {
      setErr('Не удалось сохранить, попробуй ещё раз'); setPhase({ k: 'end' })
    } finally { busy.current = false }
  }

  nextRef.current = next

  if (phase.k === 'reveal') {
    const c = state.character
    return (
      <div className="lvlup reveal" role="dialog" aria-modal="true" aria-labelledby="rv-title">
        <div className="rays" aria-hidden="true" />
        <div className="k">ТВОЙ ПЕРСОНАЖ</div>
        <h2 id="rv-title" className="arch">{c?.archetype ?? state.className}</h2>
        {phase.fallback && <p role="status">ИИ недоступен — характеристики посчитаны по правилам</p>}
        <div className="rv-radar"><StatRadar stats={state.stats} /></div>
        {c?.summary && <p className="sum">{c.summary}</p>}
        {c && <Chips title="Сильные стороны" items={c.strengths} cls="good" />}
        {c && <Chips title="Зоны роста" items={c.focus.length ? c.focus : c.weaknesses} cls="grow" />}
        <button className="btn3d" autoFocus onClick={onClose}>В путь</button>
      </div>
    )
  }

  const pos = phase.k === 'end' ? TOTAL : d.idx + 1
  const qt = cur ? (cur.kind === 'scale' ? splitScale(cur.text).text : cur.text) : ''
  let body: React.ReactNode
  if (phase.k === 'intro') body = (
    <div className="ivw-intro">
      <span className="big-ic" aria-hidden="true"><SecIcon size={44} /></span>
      <small>Раздел {si + 1} из {SECTIONS.length}</small>
      <h2>{sec.title}</h2>
      <p>{countIn(si)} вопросов</p>
      {cfg && <p className="muted note">После раздела ответы уйдут в {PROVIDER_NAMES[cfg.provider]}, чтобы ИИ задал уточняющие вопросы.</p>}
    </div>)
  else if (phase.k === 'think' || phase.k === 'analyze') body = (
    <div className="ivw-intro" role="status">
      <span className="big-ic pulse" aria-hidden="true"><Sparkles size={44} /></span>
      <h2>{phase.k === 'think' ? 'ИИ думает над уточнениями…' : 'Создаю персонажа…'}</h2>
    </div>)
  else if (phase.k === 'end' || phase.k === 'confirm') body = (
    <div className="ivw-intro">
      <span className="big-ic" aria-hidden="true"><Check size={44} /></span>
      <h2>Анкета заполнена</h2>
      <p>Осталось создать персонажа{cfg ? ' — ИИ напишет портрет' : ' — характеристики посчитаем по ответам'}.</p>
    </div>)
  else body = (<>
    {fu && <small className="ai-tag"><Sparkles size={14} aria-hidden="true" /> Уточнение от ИИ</small>}
    <h2 className="ivw-q">{qt}</h2>
    {cur && <Field q={cur} val={val} set={setVal} />}
    {cur?.kind === 'number' && !empty(ans) && !ready && <p className="err" role="alert">Введи число от {cur.min ?? 0} до {cur.max}</p>}
  </>)

  const canBack = (phase.k === 'q' || phase.k === 'intro' || phase.k === 'end') && d.idx > 0
  const canSkip = !!cur?.optional
  const nextLabel = phase.k === 'intro' ? 'Начать раздел' : phase.k === 'end' ? 'Создать персонажа' : 'Далее'
  const working = phase.k === 'think' || phase.k === 'analyze'
  return (
    <div className="ivw" role="dialog" aria-modal="true" aria-label="Создание персонажа">
      <div className="onb">
        <header className="ivw-top">
          <div className="row">
            <span className="sec-ic" aria-hidden="true"><SecIcon size={18} /></span>
            <b>{sec.title}</b>
            <small>Вопрос {Math.min(pos, TOTAL)} из {TOTAL}</small>
            <button type="button" className="x" aria-label="Закрыть, ответы сохранятся" onClick={onClose}><X size={20} aria-hidden="true" /></button>
          </div>
          <div className="ivw-segs" role="progressbar" aria-label="Прогресс анкеты" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={Math.min(d.idx, TOTAL)}>
            {SECTIONS.map((s, i) => {
              const f = firstOf(i), n = countIn(i)
              return <i key={s.id} className={i === si ? 'cur' : undefined}><b style={{ width: `${Math.min(100, Math.max(0, (d.idx - f) / n * 100))}%` }} /></i>
            })}
          </div>
        </header>
        <div className="onb-body">
          <div className="ivw-step" key={`${phase.k}${d.idx}${phase.k === 'fu' ? phase.i : ''}`} style={{ '--dir': dir } as React.CSSProperties}>{body}</div>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
        <div className="onb-nav">
          {canBack && <button type="button" className="ghost" onClick={back}>Назад</button>}
          {canSkip && <button type="button" className="ghost" onClick={skip}>Пропустить</button>}
          <button type="button" className="primary" disabled={!ready || working} onClick={next}>{nextLabel}</button>
        </div>
      </div>
      {phase.k === 'confirm' && cfg && (
        <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && setPhase({ k: 'end' })}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ivw-cf">
            <h2 id="ivw-cf">Ответы будут отправлены в {PROVIDER_NAMES[cfg.provider]} для анализа. Продолжить?</h2>
            <button className="btn primary big" autoFocus onClick={() => void finish(true)}>Отправить</button>
            <button className="btn big" onClick={() => void finish(false)}>Без ИИ — по правилам</button>
            <button className="btn ghost big" onClick={() => setPhase({ k: 'end' })}>Отмена</button>
          </div>
        </div>
      )}
    </div>
  )
}
