import { expect, test, vi } from 'vitest'

const gen = vi.hoisted(() => vi.fn())
vi.mock('./providers', () => ({ generateImage: gen }))

import { avatarPrompt, generateAvatar, nextQuality } from './avatar'
import type { AiConfig } from './config'

const params = { hair: 'long', hairColor: '#c2185b', outfitColor: '#2fb5ff', eyes: 'round' }
const cfg: AiConfig = { provider: 'gemini', key: 'K', textModel: 'g', imageModel: 'gi' }

test('avatarPrompt: цвет волос и описание тира', () => {
  const p = avatarPrompt(params, 3, 'Эд')
  expect(p).toContain('#c2185b')
  expect(p).toContain('glowing accents')
  expect(p).toContain('no watermark')
  expect(avatarPrompt(params, 4, 'Эд')).toContain('radiant legendary')
  expect(p).toContain('black oversized hoodie')
})

test('nextQuality: ≤600 КБ — готово, иначе q−0.15 до 0.4', () => {
  expect(nextQuality(600 * 1024, 0.85)).toBeNull()
  expect(nextQuality(601 * 1024, 0.85)).toBeCloseTo(0.7)
  expect(nextQuality(900 * 1024, 0.7)).toBeCloseTo(0.55)
  expect(nextQuality(900 * 1024, 0.55)).toBeCloseTo(0.4)
  expect(nextQuality(900 * 1024, 0.4)).toBeNull()
})

test('generateAvatar: ужать фото → картинка → ужать результат', async () => {
  const calls: string[] = []
  const photo = new Blob(['p']), small = new Blob(['s']), raw = new Blob(['r']), out = new Blob(['o'])
  const shrink = vi.fn(async (b: Blob, side?: number) => { calls.push(`shrink${side ?? ''}`); return b === photo ? small : out })
  gen.mockImplementation(async () => { calls.push('gen'); return raw })
  const res = await generateAvatar(cfg, photo, params, 2, 'Эд', shrink)
  expect(res).toBe(out)
  expect(calls).toEqual(['shrink1024', 'gen', 'shrink1280'])
  expect(gen).toHaveBeenCalledWith(cfg, small, expect.stringContaining('Tier 2'))
})
