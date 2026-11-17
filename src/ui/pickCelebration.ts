import { addDays } from '../domain/day'
import type { GameState } from '../domain/types'

export type Celebration = { kind: 'level'; level: number } | { kind: 'win'; date: string; bonus: number }
export interface Seen { level?: number; winDate?: string }

// бонус за победу — как в replay: max(10, round(0.15·xp))
export function pickCelebration(state: Pick<GameState, 'level' | 'history' | 'today'>, seen: Seen): Celebration | null {
  if (seen.level === undefined) return null // первый запуск: только запомнить уровень
  if (state.level > seen.level) return { kind: 'level', level: state.level }
  const y = state.history.at(-1)
  if (y && y.won && y.date === addDays(state.today.date, -1) && seen.winDate !== y.date)
    return { kind: 'win', date: y.date, bonus: Math.max(10, Math.round(0.15 * y.xp)) }
  return null
}
