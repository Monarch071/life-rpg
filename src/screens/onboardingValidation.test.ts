import { describe, expect, it } from 'vitest'
import { validateStep, type Draft } from './onboardingValidation'

const base: Draft = {
  name: 'Рэй', wake: '07:00', sleep: '23:00', noWork: false,
  templates: [{ label: 'Офис', start: '09:00', end: '18:00' }],
  goals: [], sportLevel: 0, stepsUsual: 5000,
  savings: false, savingsText: '', savingsMonths: 6,
  goodHabits: [], badHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 },
  selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 },
}

describe('validateStep', () => {
  it('step 2 requires wake and sleep', () => {
    expect(validateStep(2, base)).toBeNull()
    expect(validateStep(2, { ...base, wake: '' })).not.toBeNull()
    expect(validateStep(2, { ...base, sleep: '' })).not.toBeNull()
  })
  it('step 3 requires a template or noWork', () => {
    expect(validateStep(3, { ...base, templates: [] })).not.toBeNull()
    expect(validateStep(3, { ...base, templates: [], noWork: true })).toBeNull()
  })
  it('template needs start and end', () => {
    expect(validateStep(3, { ...base, templates: [{ label: 'x', start: '09:00', end: '' }] })).toBe('Укажи начало и конец рабочих часов')
    expect(validateStep(3, { ...base, templates: [{ label: 'x', start: '', end: '18:00' }] })).toBe('Укажи начало и конец рабочих часов')
    expect(validateStep(3, base)).toBeNull()
  })
})
