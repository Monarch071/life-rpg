import { createElement } from 'react'
import { getBlob } from '../blobs'
import type { CardAvatar, CardOp } from '../domain/card'
import Avatar from './Avatar'

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src })

/** Картинка аватара для карточки: арт из истории (локальный блоб) или SVG-аватар; не вышло — null (силуэт-заглушка). */
export async function cardImage(a: CardAvatar): Promise<CanvasImageSource | null> {
  try {
    if ('blob' in a) {
      const b = await getBlob(a.blob)
      if (!b) return null
      const url = URL.createObjectURL(b)
      try { return await loadImage(url) } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
    }
    const { renderToStaticMarkup } = await import('react-dom/server')   // только при рисовании карточки
    const svg = renderToStaticMarkup(createElement(Avatar, { params: a.params, tier: a.tier, size: 620, decorative: true }))
      .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
    return await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
  } catch { return null }
}

/** Выполнить операции раскладки на canvas → PNG. Всё на устройстве. */
export async function renderCard(ops: CardOp[], images: Record<'before' | 'after', CanvasImageSource | null>): Promise<Blob> {
  const bg = ops[0] as Extract<CardOp, { op: 'rect' }>
  const cv = document.createElement('canvas')
  cv.width = bg.w; cv.height = bg.h
  const g = cv.getContext('2d')
  if (!g) throw new Error('canvas')
  const round = (x: number, y: number, w: number, h: number, r = 0) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h) }
  for (const o of ops) {
    if (o.op === 'rect') {
      g.fillStyle = o.fill; round(o.x, o.y, o.w, o.h, o.r); g.fill()
      if (o.glow) {
        const gr = g.createRadialGradient(o.w / 2, 0, 0, o.w / 2, 0, o.h * 0.6)
        gr.addColorStop(0, o.glow); gr.addColorStop(1, 'transparent')
        g.fillStyle = gr; g.fillRect(o.x, o.y, o.w, o.h)
      }
    } else if (o.op === 'text') {
      g.font = `${o.weight ?? 700} ${o.size}px system-ui, -apple-system, sans-serif`
      g.fillStyle = o.color; g.textAlign = o.align ?? 'center'; g.textBaseline = 'alphabetic'
      g.fillText(o.text, o.x, o.y, bg.w - 80)
    } else if (o.op === 'bar') {
      g.fillStyle = 'rgba(255,255,255,0.1)'; round(o.x, o.y, o.w, o.h, o.h / 2); g.fill()
      g.fillStyle = o.color; round(o.x, o.y, Math.max(o.h, (o.w * o.pct) / 100), o.h, o.h / 2); g.fill()
    } else {
      const img = images[o.slot]
      if (img) {
        // вписать с сохранением пропорций, по низу
        const iw = (img as HTMLImageElement).width || o.w, ih = (img as HTMLImageElement).height || o.h, s = Math.min(o.w / iw, o.h / ih)
        g.drawImage(img, o.x + (o.w - iw * s) / 2, o.y + o.h - ih * s, iw * s, ih * s)
      } else {   // силуэт-заглушка
        g.fillStyle = 'rgba(169,209,255,0.18)'
        g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h * 0.25, o.w * 0.16, 0, Math.PI * 2); g.fill()
        round(o.x + o.w * 0.22, o.y + o.h * 0.45, o.w * 0.56, o.h * 0.55, o.w * 0.2); g.fill()
      }
    }
  }
  return new Promise((ok, fail) => cv.toBlob(b => (b ? ok(b) : fail(new Error('toBlob'))), 'image/png'))
}
