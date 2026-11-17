export interface Series { label: string; color: string; values: (number | null)[] }

/** 'M..L..'; разрыв на null — новый 'M'; пусто → ''. */
export function chartPath(values: (number | null)[], w: number, h: number, min: number, max: number): string {
  const n = values.length
  let d = ''
  let pen = false
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) { pen = false; return }
    const x = n > 1 ? (i / (n - 1)) * w : w / 2
    const y = max === min ? h / 2 : h - ((v - min) / (max - min)) * h
    d += `${pen ? 'L' : 'M'}${+x.toFixed(1)},${+y.toFixed(1)}`
    pen = true
  })
  return d
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toLocaleString('ru-RU')
const W = 300

export default function LineChart({ labels, series, height = 120, unit, title }: { labels: string[]; series: Series[]; height?: number; unit?: string; title: string }) {
  const all = series.flatMap(s => s.values).filter((v): v is number => v !== null && Number.isFinite(v))
  if (!all.length) return <p className="muted">Нет данных</p>
  if (labels.length < 2) return <p className="muted">График появится со второго дня</p> // одна точка не рисуется линией
  let min = Math.min(...all), max = Math.max(...all)
  if (min === max) { min -= 1; max += 1 }
  const last = series.map(s => {
    const v = [...s.values].reverse().find(x => x !== null && Number.isFinite(x))
    return v === undefined ? null : `${s.label}: ${fmt(v as number)}${unit ? ' ' + unit : ''}`
  }).filter(Boolean).join(', ')
  const n = labels.length
  const ticks = n ? [...new Set([0, Math.floor((n - 1) / 2), n - 1])] : []
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`${title}. ${last}`} preserveAspectRatio="none" style={{ height }}>
        {series.map(s => <path key={s.label} d={chartPath(s.values, W, height, min, max)} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="chart-axis" aria-hidden="true">
        <span>{fmt(min)}–{fmt(max)}{unit ? ' ' + unit : ''}</span>
      </div>
      <div className="chart-axis" aria-hidden="true">{ticks.map(i => <span key={i}>{labels[i]}</span>)}</div>
      <figcaption className="chart-legend">
        {series.map(s => <span key={s.label}><i style={{ background: s.color }} /> {s.label}</span>)}
      </figcaption>
    </figure>
  )
}
