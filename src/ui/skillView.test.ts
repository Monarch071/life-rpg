import { expect, test } from 'vitest'
import type { DayQuest, GameState, PerkView, SkillState, WeeklyQuest } from '../domain/types'
import { abilityOff, classChangeText, perkDot, planQuests, questAbility, rustBadge } from './skillView'

test('бейдж ржавчины', () => {
  expect(rustBadge({ idleDays: 25, rusty: false } as SkillState)).toEqual({ text: 'ржавеет через 5 дн.', tone: 'warn' })
  expect(rustBadge({ idleDays: 31, rusty: true } as SkillState)).toEqual({ text: 'ржавый', tone: 'bad' })
  expect(rustBadge({ idleDays: 10, rusty: false } as SkillState)).toBeNull(); expect(rustBadge({ idleDays: null, rusty: false } as SkillState)).toBeNull()
})

test('точки перков', () => {
  expect(perkDot(undefined)).toBe('locked'); expect(perkDot({ power: 0.5 } as PerkView)).toBe('half'); expect(perkDot({ power: 0 } as PerkView)).toBe('off')
  expect(perkDot({ power: 1 } as PerkView)).toBe('on')
})

test('«План»: невыполненные недельные заменяются заданиями фокуса, выполненные остаются', () => {
  const ws = '2026-11-23'
  const w = (id: string, kind: WeeklyQuest['kind'], done: boolean) =>
    ({ id: `${ws}:w:${id}`, weekStart: ws, kind, stat: kind === 'stat_quests' ? 'str' : null, target: 3, title: id, xp: 100, progress: 0, done })
  const stats = { str: 10, end: 20, int: 30, dis: 40, cha: 50, fin: 60, spi: 70 }
  const state = {
    stats, weekly: { weekStart: ws, quests: [w('active_days', 'active_days', true), w('stat_quests', 'stat_quests', false), w('steps_total', 'steps_total', false)] },
    genWeekly: { weekStart: ws, stats, multipliers: {}, prevActiveDays: 4, prevStatQuests: 5, bestSteps7: 8000, themeStat: null, easy: false },
  } as unknown as GameState
  const qs = planQuests(state, 'spi')
  expect(qs).toHaveLength(2)
  expect(qs[0]).toMatchObject({ kind: 'stat_quests', stat: 'spi', weekStart: ws })
  expect(qs.every(q => q.kind !== 'active_days')).toBe(true)   // выполненный вид не дублируется
  expect(new Set(qs.map(q => q.id)).size).toBe(2)
  expect(qs.some(q => state.weekly.quests.some(k => k.id === q.id))).toBe(false)
  expect(planQuests({ ...state, weekly: { ...state.weekly, quests: state.weekly.quests.map(q => ({ ...q, done: true })) } }, 'spi')).toEqual([])
})

test('способность на задании и причина недоступности', () => {
  const cls = (id: string, available = true, usedOn: string | null = null) => ({ cls: { ability: { id, available, usedOn } } }) as unknown as GameState
  const q = (o: Partial<DayQuest>) => ({ done: false, dropped: false, legacy: false, kind: 'daily', skills: ['strength'], ...o }) as DayQuest
  expect(questAbility(cls('rush'), q({}))).toBe(true)
  expect(questAbility(cls('rush'), q({ skills: ['reading'] }))).toBe(false)
  expect(questAbility(cls('insight'), q({ kind: 'restore' }))).toBe(false)
  expect(questAbility(cls('universal'), q({ kind: 'custom' }))).toBe(false)
  expect(questAbility(cls('universal'), q({ done: true }))).toBe(false)
  expect(questAbility(cls('shield'), q({}))).toBe(false)
  expect(questAbility(cls('rush', false), q({}))).toBe(false)
  expect(abilityOff(cls('rush'))).toBeNull()
  expect(abilityOff(cls('rush', false, '2026-11-24'))).toBe('применена 24.11 · снова в понедельник')
})

test('объяснение смены класса', () => {
  const weights = { str: 60, end: 50, int: 40, dis: 10, cha: 10, fin: 10, spi: 10 }
  const base = { name: 'Воин', pair: ['str', 'end'], weights, changedFrom: { id: 'sage', date: '2026-12-01' } } as unknown as GameState['cls']
  expect(classChangeText(base)).toBe('Пара «Сила + Выносливость» обогнала «Выносливость + Интеллект» на 22% — теперь ты Воин.')
  expect(classChangeText({ ...base, pair: null, name: 'Странник' })).toBe('Характеристики выровнялись — теперь ты Странник, а не Мудрец.')
})
