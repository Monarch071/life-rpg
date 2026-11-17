import { describe, expect, it } from 'vitest'
import { chartPath } from './LineChart'

describe('chartPath', () => {
  it('строит линию', () => expect(chartPath([1, 2, 3], 100, 10, 1, 3)).toBe('M0,10L50,5L100,0'))
  it('разрыв на null', () => expect(chartPath([1, null, 3], 100, 10, 1, 3)).toBe('M0,10M100,0'))
  it('пусто', () => expect(chartPath([], 100, 10, 0, 1)).toBe(''))
})
