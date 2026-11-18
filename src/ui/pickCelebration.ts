import { addDays } from '../domain/day'
import type { GameState } from '../domain/types'

export type Celebration = { kind: 'level'; level: number } | { kind: 'perfect'; date: string }
export interface Seen { level?: number; perfectDate?: string }

export function pickCelebration(state: Pick<GameState, 'level' | 'history' | 'today'>, seen: Seen): Celebration | null {
  if (seen.level === undefined) return null // первый запуск: только запомнить уровень
  if (state.level > seen.level) return { kind: 'level', level: state.level }
  const y = state.history.at(-1)
  if (y && y.perfect && y.date === addDays(state.today.date, -1) && seen.perfectDate !== y.date) return { kind: 'perfect', date: y.date }
  return null
}
