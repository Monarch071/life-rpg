import type { CardOp } from '../domain/card'
import { drawOps, type CardImages } from './cardCanvas'

/** Формат записи: mp4 (Safari) или webm; нет MediaRecorder — null. */
export const videoMime = (): string | null => typeof MediaRecorder === 'undefined' ? null
  : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) ?? null

/** Записать ролик в реальном времени: кадры opsAt(t) на canvas 720×1280 → MediaRecorder. Всё на устройстве.
 * async: синхронные ошибки (SecurityError испорченного canvas) — отказ промиса. signal — остановить без результата; свернули приложение — 'hidden'. */
export async function recordVideo(opsAt: (t: number) => CardOp[], images: CardImages, ms: number, onProgress: (share: number) => void, signal?: AbortSignal): Promise<Blob> {
  const mime = videoMime()
  const cv = document.createElement('canvas')
  cv.width = 720; cv.height = 1280
  const g = cv.getContext('2d')
  if (!mime || !g || typeof cv.captureStream !== 'function') throw new Error('unsupported')
  if (signal?.aborted) throw new Error('aborted')
  drawOps(g, opsAt(0), images)
  const stream = cv.captureStream(30)   // испорченный (tainted) canvas бросает SecurityError — вызывающий повторит без картинок
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
  const chunks: Blob[] = []
  return await new Promise((ok, fail) => {
    let why: string | null = null
    const end = (reason: string) => { if (why === null) { why = reason; if (rec.state !== 'inactive') rec.stop() } }
    const onAbort = () => end('aborted'), onHide = () => { if (document.hidden) end('hidden') }
    const cleanup = () => { stream.getTracks().forEach(t => t.stop()); signal?.removeEventListener('abort', onAbort); document.removeEventListener('visibilitychange', onHide) }
    signal?.addEventListener('abort', onAbort); document.addEventListener('visibilitychange', onHide)
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
    rec.onstop = () => { cleanup(); why === 'done' && chunks.length ? ok(new Blob(chunks, { type: mime.split(';')[0] })) : fail(new Error(why ?? 'empty')) }
    rec.onerror = () => { cleanup(); fail(new Error('recorder')) }
    rec.start(1000)
    const t0 = performance.now()
    const tick = () => {
      if (why !== null) return
      const t = performance.now() - t0
      drawOps(g, opsAt(Math.min(t, ms)), images); onProgress(Math.min(1, t / ms))
      if (t >= ms) end('done'); else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
