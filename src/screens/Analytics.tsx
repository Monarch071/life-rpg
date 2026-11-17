import { useState } from 'react'
import { METRIC_INFO } from '../domain/metricInfo'
import { STATS } from '../domain/stats'
import type { GameState, Metric, Stat } from '../domain/types'
import LineChart from '../ui/LineChart'

const PERIODS = [7, 30, 90] as const
const METRICS: Metric[] = ['steps', 'sleepHours', 'weightKg', 'mood', 'screenMin', 'spend', 'water', 'readPages']
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
const shift = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10)

export default function Analytics({ state }: { state: GameState }) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [stat, setStat] = useState<Stat | null>(null)
  const from = shift(state.today.date, days - 1)
  const hist = state.history.filter(h => h.date >= from)
  const sh = state.statHistory.filter(h => h.date >= from)
  const mh = state.metricHistory.filter(h => h.date >= from)
  const metricCharts = METRICS.map(m => ({ m, values: mh.map(h => h.metrics[m] ?? null) })).filter(c => c.values.filter(v => v !== null).length >= 3)
  const best = (Object.keys(STATS) as Stat[]).reduce((a, b) => (state.stats[b] > state.stats[a] ? b : a))
  const sel = stat ?? best
  const issued = hist.reduce((s, h) => s + h.issued, 0)
  const cards: [string, string][] = [
    ['Выполнено заданий', `${issued ? Math.round(hist.reduce((s, h) => s + h.completed, 0) / issued * 100) : 0}%`],
    ['Побед над Тенью', String(hist.filter(h => h.won).length)],
    ['Средний XP в день', (hist.length ? Math.round(hist.reduce((s, h) => s + h.xp, 0) / hist.length) : 0).toLocaleString('ru-RU')],
    ['Серия', String(state.streak)],
  ]
  return (
    <section className="analytics">
      <h1>Анализ</h1>
      <div className="scale" role="group" aria-label="Период">
        {PERIODS.map(p => <button key={p} className={`btn${p === days ? ' primary' : ''}`} aria-pressed={p === days} onClick={() => setDays(p)}>{p} дн</button>)}
      </div>
      <div className="cards">
        {cards.map(([k, v]) => <div key={k} className="panel card"><b>{v}</b><small className="muted">{k}</small></div>)}
      </div>
      {hist.length === 0 && sh.length === 0 && metricCharts.length === 0 && <p className="muted center">Графики появятся после нескольких дней игры</p>}
      {hist.length > 0 && <div className="panel"><h2>XP: ты и Тень</h2>
        <LineChart title="XP: ты и Тень" labels={hist.map(h => dm(h.date))} series={[
          { label: 'Ты', color: 'var(--accent)', values: hist.map(h => h.xp) },
          { label: 'Тень', color: 'var(--shadow)', values: hist.map(h => h.shadowXp) }]} /></div>}
      {sh.length > 0 && <div className="panel"><h2>Характеристики</h2>
        <div className="chips" role="group" aria-label="Характеристика">
          {(Object.keys(STATS) as Stat[]).map(s => <button key={s} className={`btn${s === sel ? ' primary' : ''}`} aria-pressed={s === sel} onClick={() => setStat(s)}>{STATS[s].icon} {STATS[s].name}</button>)}
        </div>
        <LineChart title={STATS[sel].name} labels={sh.map(h => dm(h.date))} series={[{ label: STATS[sel].name, color: 'var(--gold)', values: sh.map(h => h.stats[sel] ?? null) }]} /></div>}
      {metricCharts.map(({ m, values }) => { const i = METRIC_INFO[m]; return (
        <div key={m} className="panel"><h2>{i.icon} {i.label} <small className="muted">({i.unit})</small></h2>
          <LineChart title={i.label} unit={i.unit} labels={mh.map(h => dm(h.date))} series={[{ label: i.label, color: 'var(--accent)', values }]} /></div>
      ) })}
      <button className="btn" disabled>Недельный отчёт ИИ — на этапе 4</button>
    </section>
  )
}
