import { addDays } from '../domain/day'
import { generateDailyQuests } from '../domain/generate'
import type { Win } from '../domain/schedule'
import type { GameState, HHMM, Profile, Quest } from '../domain/types'

/** Задания на сегодня по текущему состоянию (без записи). */
export function buildQuests(state: GameState, profile: Profile, work: Win | null, wakeAt: HHMM): Quest[] {
  const { today, history, genInputs } = state
  const last = history.at(-1)
  return generateDailyQuests({
    date: today.date, profile, stats: state.stats, multipliers: state.multipliers, wakeAt, work,
    busy: [], // календарь — этап 2
    yesterday: last && last.date === addDays(today.date, -1) ? last : null,
    lastEnergy: today.lastEnergy, ...genInputs,
  })
}
