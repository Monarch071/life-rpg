import { addDays } from '../domain/day'
import type { GameState } from '../domain/types'

export type Celebration = { kind: 'level'; level: number } | { kind: 'boss'; seasonId: string } | { kind: 'record'; key: string; text: string } | { kind: 'perfect'; date: string }
export interface Seen { level?: number; perfectDate?: string; bossSeason?: string; records?: string[] }

const int = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

export function pickCelebration(state: Pick<GameState, 'level' | 'history' | 'today'> & { seasonBoss?: Pick<NonNullable<GameState['seasonBoss']>, 'seasonId' | 'defeated'> | null; records?: GameState['records'] }, seen: Seen): Celebration | null {
  if (seen.level === undefined) return null // первый запуск: только запомнить уровень
  if (state.level > seen.level) return { kind: 'level', level: state.level }
  const b = state.seasonBoss
  if (b?.defeated && seen.bossSeason !== b.seasonId) return { kind: 'boss', seasonId: b.seasonId }
  // рекорд побит (не первое значение) вчера или сегодня; накопления — без суммы
  const yd = addDays(state.today.date, -1)
  const r = (state.records ?? []).find(x => x.value !== null && x.date !== null && x.date >= yd && x.prev !== null && x.prev > 0 && !seen.records?.includes(`${x.id}:${x.date}`))
  if (r) return { kind: 'record', key: `${r.id}:${r.date}`, text: `Новый рекорд: ${r.id === 'savings_month' ? r.title.toLowerCase() : `${int(r.value!)} ${r.unit}`}` }
  const y = state.history.at(-1)
  if (y && y.perfect && y.date === yd && seen.perfectDate !== y.date) return { kind: 'perfect', date: y.date }
  return null
}
