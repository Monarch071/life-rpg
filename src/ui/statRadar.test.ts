import { describe, expect, it } from 'vitest'
import { radarPoints, RADAR_MAX } from './StatRadar'

describe('radarPoints', () => {
  const full = radarPoints(Array(7).fill(20), 20, 100, 0, 0)
  it('первая ось смотрит вверх', () => {
    expect(full[0][0]).toBeCloseTo(0)
    expect(full[0][1]).toBeCloseTo(-100)
  })
  it('все вершины на радиусе при значении max', () => {
    expect(full).toHaveLength(7)
    for (const [x, y] of full) expect(Math.hypot(x, y)).toBeCloseTo(100)
  })
  it('ноль — в центре', () => {
    const [p] = radarPoints([0, 5, 5, 5, 5, 5, 5], 20, 100, 50, 60)
    expect(p[0]).toBeCloseTo(50)
    expect(p[1]).toBeCloseTo(60)
  })
  it('значение больше max и меньше 0 ограничивается', () => {
    const p = radarPoints([40, -3, 10, 10, 10, 10, 10], 20, 100, 0, 0)
    expect(p[0][1]).toBeCloseTo(-100)
    expect(Math.hypot(...p[1])).toBeCloseTo(0)
  })
  it('Основа 100 при шкале RADAR_MAX = 100 лежит на ободе', () => {
    expect(RADAR_MAX).toBe(100)
    const [p] = radarPoints([100, 1, 1, 1, 1, 1, 1], RADAR_MAX, 100, 0, 0)
    expect(Math.hypot(...p)).toBeCloseTo(100)
  })
})
