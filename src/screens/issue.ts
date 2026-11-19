import { assembleDay, type AssembleCtx } from '../domain/assemble'
import type { DayType } from '../domain/dayType'
import type { SkillId } from '../domain/skillCatalog'
import type { GameState, HHMM, Quest } from '../domain/types'

/** Вход сборки дня из состояния игры. */
export function assembleCtx(state: GameState, dayType: DayType, wakeAt: HHMM, energy: number): AssembleCtx {
  if (!state.profile) throw new Error('нет профиля')
  return {
    // потолки рангов — уровень и навыки на начало дня: так replay проверяет переброс и свои задания
    date: state.today.date, dayType, wakeAt, energy, level: state.today.dayStart.level,
    skills: Object.fromEntries(Object.entries(state.skills).map(([id, s]) => [id, { level: state.today.dayStart.skills[id as SkillId], lastDate: s.lastDate }])) as AssembleCtx['skills'],
    stats: state.stats, statInfo: state.statInfo, theme: state.season.theme,
    bossStats: state.genInputs.bossStats, bossStep: state.genInputs.bossStep, chainStep: state.genInputs.chainStep,
    recent: state.genInputs.recent, profile: state.profile, multipliers: state.multipliers, bestSteps7: state.genInputs.bestSteps7,
    busy: state.today.calendar.map(({ start, end }) => ({ start, end })),
    fatigue: state.genInputs.fatigue, recovery: state.genInputs.recovery, afterRecovery: state.genInputs.afterRecovery,
  }
}

/** Задания на сегодня по текущему состоянию (без записи). */
export const buildQuests = (state: GameState, dayType: DayType, wakeAt: HHMM, energy: number): Quest[] =>
  assembleDay(assembleCtx(state, dayType, wakeAt, energy))
