import { addDays } from '../domain/day'
import type { GameState } from '../domain/types'

export type Celebration = { kind: 'level'; level: number } | { kind: 'boss'; seasonId: string } | { kind: 'perfect'; date: string }
export interface Seen { level?: number; perfectDate?: string; bossSeason?: string }

export function pickCelebration(state: Pick<GameState, 'level' | 'history' | 'today'> & { seasonBoss?: Pick<NonNullable<GameState['seasonBoss']>, 'seasonId' | 'defeated'> | null }, seen: Seen): Celebration | null {
  if (seen.level === undefined) return null // первый запуск: только запомнить уровень
  if (state.level > seen.level) return { kind: 'level', level: state.level }
  const b = state.seasonBoss
  if (b?.defeated && seen.bossSeason !== b.seasonId) return { kind: 'boss', seasonId: b.seasonId }
  const y = state.history.at(-1)
  if (y && y.perfect && y.date === addDays(state.today.date, -1) && seen.perfectDate !== y.date) return { kind: 'perfect', date: y.date }
  return null
}
