import type { HHMM, Stat, WorkTemplate } from '../domain/types'

export interface Draft {
  name: string
  wake: HHMM; sleep: HHMM
  noWork: boolean
  templates: WorkTemplate[]
  goals: { text: string; months: number; stat: Stat }[]
  sportLevel: 0 | 1 | 2 | 3
  stepsUsual: number
  savings: boolean; savingsText: string; savingsMonths: number
  goodHabits: string[]; badHabits: string[]
  energy: { morning: number; day: number; evening: number; night: number }
  selfRating: Record<Stat, number>
}

/** Russian error message for the step, or null when it can be left. */
export function validateStep(step: number, d: Draft): string | null {
  if (step === 1 && !d.name.trim()) return 'Введи имя героя'
  if (step === 2 && (!d.wake || !d.sleep)) return 'Укажи время подъёма и отбоя'
  if (step === 3 && !d.noWork) {
    if (d.templates.length < 1) return 'Добавь рабочие часы или отметь «Не работаю»'
    if (d.templates.some((t) => !t.start || !t.end)) return 'Укажи начало и конец рабочих часов'
  }
  return null
}
