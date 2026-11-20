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
  const { steps } = BALANCE.season, { stepXp } = season   // цена ступени — с поздним входом
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

/** Чип лиги: ступень и очки внутри неё (из perTier). */
export const leagueChip = (l: GameState['league']): { name: string; into: number; of: 6 } =>
  ({ name: l.name, into: Math.max(0, l.points - l.tier * BALANCE.league.perTier), of: BALANCE.league.perTier as 6 })

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

/** Строка призрака (спека §11); нет призрака — дата первого: 1-е число месяца, перед которым целый месяц сезона (не Пролога). */
export function ghostLine(g: Pick<GameState['ghost'], 'available' | 'lead'>, today?: ISODate): string {
  if (g.available) return g.lead > 0 ? `Ты впереди призрака на ${g.lead} XP` : g.lead < 0 ? `Отстаёшь от призрака на ${-g.lead} XP` : 'Вровень с призраком'
  if (!today) return 'Призрака пока нет'
  let first = addDays(`${today.slice(0, 7)}-28`, 4).slice(0, 7) + '-01'   // 1-е следующего месяца
  while (seasonOf(addDays(first, -1)).kind === 'prologue') first = addDays(`${first.slice(0, 7)}-28`, 4).slice(0, 7) + '-01'
  return `Призрак появится 1 ${MONTHS_GEN[+first.slice(5, 7) - 1]}`
}
