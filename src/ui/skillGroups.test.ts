import { expect, test } from 'vitest'
import { SKILL_CATALOG } from '../domain/skillCatalog'
import { CATEGORIES, categoryOf, skillsOf } from './skillGroups'

test('каждый навык ровно в одной категории брифа', () => {
  const all = CATEGORIES.flatMap(skillsOf).map(s => s.id)
  expect(all.sort()).toEqual(SKILL_CATALOG.map(s => s.id).sort())
  expect(categoryOf('reading').title).toBe('Образование')
  expect(categoryOf('cardio').title).toBe('Физическое развитие')
  expect(categoryOf(undefined).title).toBe('Личное развитие')
})
