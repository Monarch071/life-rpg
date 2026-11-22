import { expect, test } from 'vitest'
import { ACHIEVEMENTS } from '../domain/achievements'
import { rarityOf } from './achievementLook'

test('у каждого достижения есть редкость, все четыре встречаются', () => {
  const r = new Set(ACHIEVEMENTS.map(a => rarityOf(a.id)))
  expect([...r].sort()).toEqual(['common', 'epic', 'legendary', 'rare'])
  expect(rarityOf('streak_100')).toBe('legendary')
  expect(rarityOf('first_quest')).toBe('common')
  expect(rarityOf('streak_7')).toBe('epic')
})
