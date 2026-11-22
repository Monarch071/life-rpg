import type { AvatarParams } from '../domain/types'
import type { AiConfig } from './config'
import { generateImage } from './providers'

type Tier = 1 | 2 | 3 | 4

// одежда не меняется с тиром (лицо и образ узнаваемы), растёт только свечение
const TIER_LOOK: Record<Tier, string> = {
  1: 'no aura, soft rim light.',
  2: 'a faint violet energy glow around the hands.',
  3: 'a visible violet and cyan energy aura, glowing accents on the clothes.',
  4: 'a radiant legendary violet-gold aura with floating light particles.',
}

export function avatarPrompt(params: AvatarParams, tier: Tier, _name: string): string {
  return `Semi-realistic anime illustration, full-body portrait of the person in the photo standing confidently, head to shoes visible. `
    + `Keep their facial features, face shape and skin tone recognizable. `
    + `Hair: ${params.hair} ${params.hairColor}. Outfit: black oversized hoodie, black cropped slacks, clean sneakers, one white AirPod in the ear, a thin red string bracelet on the wrist. Tier ${tier}: ${TIER_LOOK[tier]} `
    + `Character centered, full body, slightly low camera angle. `
    + `Background: futuristic city at night, neon violet and cyan lights, deep blue-black sky, wet reflective street, light haze, cinematic lighting, premium dark anime RPG key art. `
    + `Vertical 2:3, single character, no text, no UI, no logos, no watermark, safe for work.`
}

export class PhotoError extends Error {}
export const PHOTO_ERROR_TEXT = 'Не удалось прочитать фото. Выбери фото в формате JPEG или PNG.'

const MAX_BYTES = 600 * 1024
/** Сторона арта на весь экран. */
export const ART_SIDE = 1280

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
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(blob))
  try {
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
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
  } finally { bmp.close() }
}

export async function generateAvatar(cfg: AiConfig, photo: Blob, params: AvatarParams, tier: Tier, name: string, shrink = shrinkImage): Promise<Blob> {
  const small = await shrink(photo, 1024).catch(() => { throw new PhotoError('photo') })
  const raw = await generateImage(cfg, small, avatarPrompt(params, tier, name))
  return shrink(raw, ART_SIDE)
}

/** Картинка текущего тира или ближайшего меньшего. */
export function imageNameFor(images: Partial<Record<Tier, string>>, tier: Tier): string | null {
  for (let t = tier; t >= 1; t--) if (images[t as Tier]) return images[t as Tier]!
  return null
}
