import { useEffect, useState } from 'react'
import { Bot, Droplets, Footprints, BookOpen, Moon, Scale, Smartphone, Smile, Wallet, Dumbbell, type LucideIcon } from 'lucide-react'
import { STAT_COLORS, StatIcon } from '../ui/icons'
import { getAiConfig, type AiConfig } from '../ai/config'
import { aiErrorText } from '../ai/providers'
import { aiWeeklyReport } from '../ai/tasks'
import { weekStart } from '../domain/day'
import { reportWeek } from '../domain/masterReport'
import { useWrite } from '../ui/useWrite'
import { METRIC_INFO } from '../domain/metricInfo'
import { STATS } from '../domain/stats'
import type { GameState, Metric, Stat } from '../domain/types'
import LineChart from '../ui/LineChart'
import Finance, { useCurrency } from './Finance'
import CardSheet from './CardSheet'
import HallOfFame from './HallOfFame'
import MonthReview from './MonthReview'
import { monthCard, monthTitle, type CardModel } from '../domain/card'
import { CalendarCheck, Image as ImageIcon, TrendingUp } from 'lucide-react'

const PERIODS = [7, 30, 90] as const
const METRICS: Metric[] = ['steps', 'sleepHours', 'weightKg', 'mood', 'screenMin', 'spend', 'water', 'readPages']
const METRIC_ICONS: Record<Metric, LucideIcon> = { steps: Footprints, sleepHours: Moon, weightKg: Scale, mood: Smile, screenMin: Smartphone, spend: Wallet, water: Droplets, readPages: BookOpen, workoutMin: Dumbbell }
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
const shift = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10)

// вкладка «Анализ» помнит выбор до перезапуска приложения
let lastView: 'progress' | 'finance' = 'progress'

export default function Analytics({ state }: { state: GameState }) {
  const [view, setViewState] = useState(lastView)
  const setView = (v: typeof view) => { lastView = v; setViewState(v) }
  return (
    <section className="analytics">
      <h1>Анализ</h1>
      <div className="seg-toggle" role="group" aria-label="Раздел анализа">
        <button type="button" aria-pressed={view === 'progress'} onClick={() => setView('progress')}>Прогресс</button>
        <button type="button" aria-pressed={view === 'finance'} onClick={() => setView('finance')}>Финансы</button>
      </div>
      {view === 'progress' ? <Progress state={state} /> : <Finance state={state} />}
    </section>
  )
}

function Progress({ state }: { state: GameState }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [stat, setStat] = useState<Stat | null>(null)
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [gen, setGen] = useState(false)
  const [repErr, setRepErr] = useState<string | null>(null)
  const { busy, msg, write } = useWrite()
  useEffect(() => { getAiConfig().then(setCfg).catch(() => {}) }, [])
  const prevWeek = reportWeek(state.today.date)
  const report = state.reports[0]
  const makeReport = async () => {
    if (!cfg || gen) return
    setGen(true); setRepErr(null)
    try { await write({ type: 'ai_report', weekStart: prevWeek, text: await aiWeeklyReport(cfg, state, prevWeek), final: weekStart(state.today.date) !== prevWeek }, 'Отчёт готов') }
    catch (e) { setRepErr(aiErrorText(e)) }
    finally { setGen(false) }
  }
  const from = shift(state.today.date, days - 1)
  const hist = state.history.filter(h => h.date >= from)
  const sh = state.statHistory.filter(h => h.date >= from)
  const mh = state.metricHistory.filter(h => h.date >= from)
  const cur = useCurrency()
  const metricCharts = METRICS.map(m => ({ m, values: mh.map(h => h.metrics[m] ?? null) })).filter(c => c.values.filter(v => v !== null).length >= 3)
  const best = (Object.keys(STATS) as Stat[]).reduce((a, b) => (state.stats[b] > state.stats[a] ? b : a))
  const sel = stat ?? best
  const issued = hist.reduce((s, h) => s + h.issued, 0)
  const cards: [string, string][] = [
    ['Выполнено заданий', `${issued ? Math.round(hist.reduce((s, h) => s + h.completed, 0) / issued * 100) : 0}%`],
    ['Засчитано дней', String(hist.filter(h => h.counted).length)],
    ['Средний XP в день', (hist.length ? Math.round(hist.reduce((s, h) => s + h.xp, 0) / hist.length) : 0).toLocaleString('ru-RU')],
    ['Серия', String(state.streak)],
  ]
  return (
    <>
      <div className="scale" role="group" aria-label="Период">
        {PERIODS.map(p => <button key={p} className={`btn${p === days ? ' primary' : ''}`} aria-pressed={p === days} onClick={() => setDays(p)}>{p} дн</button>)}
      </div>
      <div className="cards">
        {cards.map(([k, v]) => <div key={k} className="panel card"><b>{v}</b><small className="muted">{k}</small></div>)}
      </div>
      {hist.length === 0 && sh.length === 0 && metricCharts.length === 0 && <p className="muted center">Графики появятся после нескольких дней игры</p>}
      {hist.length > 0 && <div className="panel"><h2>XP по дням</h2>
        <LineChart title="XP по дням" labels={hist.map(h => dm(h.date))} series={[
          { label: 'XP', color: 'var(--fire)', values: hist.map(h => h.xp) }]} /></div>}
      {sh.length > 0 && <div className="panel"><h2>Основа</h2>
        <div className="chips" role="group" aria-label="Характеристика">
          {(Object.keys(STATS) as Stat[]).map(s => <button key={s} className={`btn${s === sel ? ' primary' : ''}`} aria-pressed={s === sel} onClick={() => setStat(s)}><StatIcon stat={s} size={16} />{STATS[s].name}</button>)}
        </div>
        <LineChart title={STATS[sel].name} labels={sh.map(h => dm(h.date))} series={[{ label: STATS[sel].name, color: STAT_COLORS[sel], values: sh.map(h => h.stats[sel] ?? null) }]} /></div>}
      {metricCharts.map(({ m, values }) => { const i = METRIC_INFO[m], Ic = METRIC_ICONS[m], u = m === 'spend' ? cur : i.unit; return (
        <div key={m} className="panel"><h2><Ic size={18} aria-hidden="true" /> {i.label} <small className="muted">({u})</small></h2>
          <LineChart title={i.label} unit={u} labels={mh.map(h => dm(h.date))} series={[{ label: i.label, color: 'var(--fire)', values }]} /></div>
      ) })}
      <Rival state={state} />
      <div className="panel"><h2><Bot size={18} aria-hidden="true" /> Недельный отчёт ИИ</h2>
        {!cfg && <p className="muted">Подключи ИИ в настройках, чтобы получать недельный отчёт</p>}
        {cfg && !state.reports.some(r => r.weekStart === prevWeek && r.final) &&
          <button className="btn" disabled={gen || busy} onClick={makeReport}>{gen ? 'Составляю…' : 'Составить отчёт за прошлую неделю'}</button>}
        {report && <><h3>Неделя с {dm(report.weekStart)}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{report.text}</p></>}
        {repErr && <p className="err" role="alert">{repErr}</p>}
        {msg && <p className={msg.ok ? 'muted' : 'err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      </div>
    </>
  )
}

/** Соперник — ты прошлый: индекс роста, зал славы, карточки месяцев, итоги месяца. */
function Rival({ state }: { state: GameState }) {
  const cur = useCurrency()
  const [card, setCard] = useState<{ model: CardModel; name: string } | null>(null)
  const [review, setReview] = useState<string | null>(null)
  const g = state.growth, months12 = g.months.slice(0, 11).reverse().concat([{ ...g.current }])
  const cards = g.months.map(m => m.month).slice(0, 12)
  const reviews = [g.current.month, ...g.months.slice(0, 2).map(m => m.month)]
  const openCard = (m: string) => { const model = monthCard(state, m); if (model) setCard({ model, name: `card-${m}.png` }) }
  return (
    <>
      <div className="panel"><h2><TrendingUp size={18} aria-hidden="true" /> Индекс роста</h2>
        <p className="growth"><b>{g.current.index ?? '—'}</b>
          <small className="muted">{monthTitle(g.current.month)} · {g.current.days ? `${Math.round(g.current.xpPerDay)} XP в день за ${g.current.days} дн.` : 'закрытых рабочих дней пока нет'} · против {g.current.base === 'base' ? 'базы' : 'прошлого месяца'}{' '}(100 — вровень)</small></p>
        {months12.length >= 2 && <LineChart title="Индекс роста по месяцам" labels={months12.map(m => `${m.month.slice(5)}.${m.month.slice(2, 4)}`)}
          series={[{ label: 'Индекс', color: 'var(--fire)', values: months12.map(m => m.index) }]} />}
      </div>
      <HallOfFame state={state} cur={cur} />
      <div className="panel"><h2><ImageIcon size={18} aria-hidden="true" /> Карточки и итоги месяцев</h2>
        <div className="chips">
          {cards.filter(m => monthCard(state, m)).map(m => <button key={m} className="btn" onClick={() => openCard(m)}><ImageIcon size={16} aria-hidden="true" /> Карточка: {monthTitle(m)}</button>)}
          {reviews.map(m => <button key={`r${m}`} className="btn ghost" onClick={() => setReview(m)}><CalendarCheck size={16} aria-hidden="true" /> Итоги: {monthTitle(m)}{m === g.current.month ? ' (пока)' : ''}</button>)}
        </div>
      </div>
      {card && <CardSheet model={card.model} name={card.name} onClose={() => setCard(null)} />}
      {review && <MonthReview state={state} month={review} onClose={() => setReview(null)} />}
    </>
  )
}
