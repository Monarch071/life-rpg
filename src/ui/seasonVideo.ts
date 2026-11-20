import type { CardOp } from '../domain/card'
import { drawOps, type CardImages } from './cardCanvas'

/** Формат записи: mp4 (Safari) или webm; нет MediaRecorder — null. */
export const videoMime = (): string | null => typeof MediaRecorder === 'undefined' ? null
  : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) ?? null

/** Записать ролик в реальном времени: кадры opsAt(t) на canvas 720×1280 → MediaRecorder. Всё на устройстве. */
export function recordVideo(opsAt: (t: number) => CardOp[], images: CardImages, ms: number, onProgress: (share: number) => void): Promise<Blob> {
  const mime = videoMime()
  const cv = document.createElement('canvas')
  cv.width = 720; cv.height = 1280
  const g = cv.getContext('2d')
  if (!mime || !g || typeof cv.captureStream !== 'function') return Promise.reject(new Error('unsupported'))
  drawOps(g, opsAt(0), images)
  const stream = cv.captureStream(30)   // испорченный (tainted) canvas бросает SecurityError — вызывающий повторит без картинок
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  return new Promise((ok, fail) => {
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); chunks.length ? ok(new Blob(chunks, { type: mime.split(';')[0] })) : fail(new Error('empty')) }
    rec.onerror = () => { stream.getTracks().forEach(t => t.stop()); fail(new Error('recorder')) }
    rec.start(1000)
    const t0 = performance.now()
    const tick = () => {
      const t = performance.now() - t0
      drawOps(g, opsAt(Math.min(t, ms)), images); onProgress(Math.min(1, t / ms))
      if (t >= ms) rec.stop(); else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
