import { BALANCE } from '../domain/balance'
import { seasonOf } from '../domain/calendar'
import { addDays } from '../domain/day'
import type { GameState, ISODate } from '../domain/types'

const r2 = (x: number) => Math.round(x * 100) / 100

/** Ширины двухслойной полосы в %: тёмная — Основа /100, яркая — Основа × Форма (нет формы — как Основа). */
export const statBar = (base: number, form: number | null): { base: number; form: number } =>
  ({ base: r2(base), form: r2(base * (form ?? 1)) })

const dayNum = (d: ISODate) => { const [y, m, x] = d.split('-').map(Number); return Date.UTC(y, m - 1, x) / 864e5 }

/** Подпись пути сезона: Пролог — дни до следующего сезона; сезон — ступень N/30 и XP до следующей. */
export function pathLabel(season: GameState['season'], today: ISODate): { title: string; sub: string; pct: number } {
  const { stepXp, steps } = BALANCE.season
  if (season.kind === 'prologue') {
    const next = addDays(season.end, 1)
    return { title: `Пролог · до ${seasonOf(next).name === 'Зима' ? 'Зимы' : seasonOf(next).name} ${dayNum(next) - dayNum(today)} дн.`,
      sub: 'Опыт идёт в уровень, путь сезона откроется с 1 декабря', pct: 0 }
  }
  const title = `${season.name} · ступень ${season.step}/${steps}`
  if (season.step >= steps) return { title, sub: 'Путь сезона пройден', pct: 100 }
  const into = season.xp - season.step * stepXp
  return { title, sub: `до ступени ${season.step + 1}: ${into} / ${stepXp} XP`, pct: (into / stepXp) * 100 }
}
