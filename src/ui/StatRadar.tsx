import { BALANCE } from '../domain/balance'
import { STATS } from '../domain/stats'
import type { Stat } from '../domain/types'
import { STAT_COLORS, STAT_ICONS } from './icons'

/** Вершины многоугольника: ось i под углом −90° + i·360/n, значение ограничено 0..max. */
export function radarPoints(values: number[], max: number, r: number, cx: number, cy: number): [number, number][] {
  return values.map((v, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / values.length
    const d = (r * Math.min(max, Math.max(0, v))) / max
    return [cx + d * Math.cos(a), cy + d * Math.sin(a)]
  })
}

/** Шкала паутинки — вся Основа 1–100, чтобы форма не «прыгала» с ростом максимума. */
export const RADAR_MAX = BALANCE.stat.max
const C = 150, R = 100
const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

/** Семиугольная «паутинка» характеристик; prev — пунктирный контур «неделю назад». */
/** compact — без подписей у вершин (значения выводятся рядом списком). */
export default function StatRadar({ stats, prev = null, size = 340, compact = false }: { stats: Record<Stat, number>; prev?: Record<Stat, number> | null; size?: number; compact?: boolean }) {
  const keys = Object.keys(STATS) as Stat[]
  const vals = keys.map(s => stats[s])
  // компактная — относительно лучшей характеристики, чтобы форма читалась и при малых значениях
  const max = compact ? Math.min(RADAR_MAX, Math.max(20, Math.ceil(Math.max(...vals) * 1.15 / 10) * 10)) : RADAR_MAX
  const now = radarPoints(vals, max, R, C, C)
  const rim = radarPoints(keys.map(() => max), max, R, C, C)
  const lab = radarPoints(keys.map(() => max), max, R + 30, C, C)
  return (
    <svg className={`radar${compact ? ' compact' : ''}`} viewBox={compact ? '40 40 220 220' : '0 0 300 300'} style={{ maxWidth: size }} role="img"
      aria-label={keys.map(s => `${STATS[s].name} ${stats[s]}`).join(', ')}>
      <defs><radialGradient id="radar-fill"><stop offset="0" stopColor="#8757ff" stopOpacity={0.15} /><stop offset="1" stopColor="#8757ff" stopOpacity={0.55} /></radialGradient></defs>
      <g fill="none" stroke="var(--line)" strokeWidth={1}>
        {[1, 2, 3, 4].map(k => <polygon key={k} points={pts(radarPoints(keys.map(() => max), max, (R * k) / 4, C, C))} />)}
        {rim.map(([x, y], i) => <line key={i} x1={C} y1={C} x2={x} y2={y} />)}
      </g>
      {prev && <polygon points={pts(radarPoints(keys.map(s => prev[s]), max, R, C, C))} fill="none" stroke="var(--shadow)" strokeWidth={1.5} strokeDasharray="4 4" />}
      <g className="radar-now">
        <polygon points={pts(now)} fill="url(#radar-fill)" stroke="var(--fire2)" strokeWidth={2} strokeLinejoin="round" />
        {now.map(([x, y], i) => <circle key={keys[i]} cx={x} cy={y} r={4} fill={STAT_COLORS[keys[i]]} stroke="var(--bg)" strokeWidth={1.5} />)}
      </g>
      {!compact && lab.map(([x, y], i) => {
        const Icon = STAT_ICONS[keys[i]]
        return (
          <g key={keys[i]} aria-hidden="true">
            <Icon x={x - 8} y={y - 19} width={16} height={16} style={{ color: STAT_COLORS[keys[i]] }} />
            <text x={x} y={y + 11} textAnchor="middle" className="radar-v">{stats[keys[i]]}</text>
          </g>
        )
      })}
    </svg>
  )
}
