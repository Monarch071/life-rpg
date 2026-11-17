import type { AvatarParams } from '../domain/types'
import type { AiConfig } from './config'
import { generateImage } from './providers'

type Tier = 1 | 2 | 3 | 4

const TIER_LOOK: Record<Tier, string> = {
  1: 'simple casual clothes, soft light.',
  2: 'light armor and a cloak.',
  3: 'rich equipment with glowing accents.',
  4: 'a legendary hero with a radiant aura.',
}

export function avatarPrompt(params: AvatarParams, tier: Tier, _name: string): string {
  return `Anime-style full-body character portrait of the person in the photo. Keep their facial features, face shape and skin tone recognizable. `
    + `Hair: ${params.hair} ${params.hairColor}. Outfit main color ${params.outfitColor}. Tier ${tier}: ${TIER_LOOK[tier]} `
    + `Dark neon background, vertical 2:3, single character, no text, no watermark, safe for work.`
}

const MAX_BYTES = 600 * 1024

/** Следующее качество для повторного сжатия или null, если размер уже подходит / качество на минимуме. */
export function nextQuality(size: number, q: number): number | null {
  if (size <= MAX_BYTES) return null
  const n = q - 0.15
  return n >= 0.4 - 1e-9 ? n : null
}

async function encode(c: OffscreenCanvas | HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return 'convertToBlob' in c ? c.convertToBlob({ type, quality: q }).catch(() => null) : new Promise(r => c.toBlob(r, type, q))
}

export async function shrinkImage(blob: Blob, maxSide = 768): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  let type = 'image/webp'
  let q = 0.85
  let out = await encode(canvas, type, q)
  if (!out || out.type !== type) { type = 'image/jpeg'; out = await encode(canvas, type, q) } // Safari без webp отдаёт png
  for (let n = out && nextQuality(out.size, q); out && n !== null; n = nextQuality(out.size, q)) {
    q = n
    out = (await encode(canvas, type, q)) ?? out
  }
  if (!out) throw new Error('shrink failed')
  return out
}

export async function generateAvatar(cfg: AiConfig, photo: Blob, params: AvatarParams, tier: Tier, name: string, shrink = shrinkImage): Promise<Blob> {
  const raw = await generateImage(cfg, await shrink(photo, 1024), avatarPrompt(params, tier, name))
  return shrink(raw)
}

/** Картинка текущего тира или ближайшего меньшего. */
export function imageNameFor(images: Partial<Record<Tier, string>>, tier: Tier): string | null {
  for (let t = tier; t >= 1; t--) if (images[t as Tier]) return images[t as Tier]!
  return null
}
