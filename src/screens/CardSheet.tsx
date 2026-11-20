import { useEffect, useState } from 'react'
import { Bot, Clapperboard, Image as ImageIcon, Share2 } from 'lucide-react'
import { getAiConfig } from '../ai/config'
import { aiErrorText } from '../ai/providers'
import { aiSeasonReview } from '../ai/tasks'
import { cardOps, seasonCard, type CardModel } from '../domain/card'
import { seasonInput, seasonReviewByRules } from '../domain/masterReport'
import type { GameState } from '../domain/types'
import { useWrite } from '../ui/useWrite'
import Sheet from '../ui/Sheet'
import { cardImage, renderCard } from '../ui/cardCanvas'
import { saveFile } from '../ui/saveFile'
import { seasonMoments, VIDEO_MS, videoOps } from '../domain/seasonVideo'
import { recordVideo, videoMime } from '../ui/seasonVideo'

/** Лист карточки 9:16: превью PNG, «Сохранить / Поделиться». Рисуется на устройстве, никуда не загружается. */
export default function CardSheet({ model, name, onClose }: { model: CardModel; name: string; onClose: () => void }) {
  const [png, setPng] = useState<{ blob: Blob; url: string } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    let dead = false, url: string | null = null
    void (async () => {
      const [before, after] = await Promise.all([cardImage(model.before.avatar), cardImage(model.after.avatar)])
      const ops = cardOps(model)
      // испорченный (tainted) canvas в Safari: toBlob падает — рисуем силуэты без картинок
      const blob = await renderCard(ops, { before, after }).catch(() => renderCard(ops, { before: null, after: null }))
      if (!dead) setPng({ blob, url: (url = URL.createObjectURL(blob)) })
    })().catch(() => { if (!dead) setMsg({ ok: false, text: 'Не удалось нарисовать карточку' }) })
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [model])
  const save = async () => {
    if (!png) return
    try {
      const r = await saveFile(png.blob, name)
      setMsg(r === 'cancelled' ? null : { ok: true, text: r === 'shared' ? 'Готово' : 'Картинка скачана' })
    } catch { setMsg({ ok: false, text: 'Не удалось сохранить картинку' }) }
  }
  return (
    <Sheet id="card-title" title={model.title} onClose={onClose}>
      <div className="card-preview">
        {png ? <img src={png.url} alt={`Карточка «до и после»: ${model.title}, уровень ${model.before.level} → ${model.after.level}`} />
          : <p className="muted" aria-live="polite">Рисую карточку…</p>}
      </div>
      <button className="btn primary big" disabled={!png} onClick={() => void save()}><Share2 size={18} aria-hidden="true" /> Сохранить / Поделиться</button>
      <div aria-live="polite">{msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}</div>
    </Sheet>
  )
}

/** Финал сезона (спека §9): разбор Мастера (ИИ, если есть ключ, иначе правила) и карточка сезона. */
export function SeasonFinale({ state, seasonId, onClose }: { state: GameState; seasonId: string; onClose: () => void }) {
  const si = seasonInput(state, seasonId), ai = state.seasonReviews.find(r => r.seasonId === seasonId)?.text
  const [card, setCard] = useState<CardModel | null>(null)
  const [video, setVideo] = useState(false)
  const [hasAi, setHasAi] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [gen, setGen] = useState(false)
  const w = useWrite()
  useEffect(() => { getAiConfig().then(c => setHasAi(!!c)).catch(() => {}) }, [])
  const finished = state.today.date > si.end
  const ask = async () => {
    const cfg = await getAiConfig().catch(() => null)
    if (!cfg || gen) return
    setGen(true); setErr(null)
    try { await w.write({ type: 'ai_report', weekStart: si.start, text: await aiSeasonReview(cfg, state, seasonId), final: true, scope: 'season' }, 'Разбор готов') }
    catch (e) { setErr(aiErrorText(e)) }
    finally { setGen(false) }
  }
  const model = seasonCard(state, seasonId)
  return (
    <Sheet id="season-finale-title" title={`Итоги сезона «${si.season}»`} onClose={onClose}>
      <p className="muted">{ai ? 'Разбор Мастера (ИИ)' : 'Разбор по правилам'}</p>
      <p className="rep">{ai ?? seasonReviewByRules(si)}</p>
      {hasAi && finished && !ai && <button className="btn" disabled={gen || w.busy} onClick={() => void ask()}><Bot size={18} aria-hidden="true" /> {gen ? 'Мастер пишет…' : 'Разбор Мастера (ИИ)'}</button>}
      <div aria-live="polite">{err && <p role="alert" className="err">{err}</p>}{w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}</div>
      {model && <button className="btn primary big" onClick={() => setCard(model)}><ImageIcon size={18} aria-hidden="true" /> Карточка сезона</button>}
      {model && <button className="btn big" onClick={() => setVideo(true)}><Clapperboard size={18} aria-hidden="true" /> Ролик «до и после»</button>}
      {card && <CardSheet model={card} name={`card-${seasonId}.png`} onClose={() => setCard(null)} />}
      {video && model && <VideoSheet state={state} seasonId={seasonId} model={model} onClose={() => setVideo(false)} />}
    </Sheet>
  )
}

/** Ролик сезона 9:16 на 18 секунд: записывается на устройстве в реальном времени, никуда не загружается. */
function VideoSheet({ state, seasonId, model, onClose }: { state: GameState; seasonId: string; model: CardModel; onClose: () => void }) {
  const [p, setP] = useState(0)
  const [vid, setVid] = useState<{ blob: Blob; url: string } | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [snap] = useState(() => ({ state, model }))   // состояние меняется при синхронизации — запись идёт по снимку
  useEffect(() => {
    const { state, model } = snap
    let dead = false, url: string | null = null
    if (!videoMime()) { setMsg({ ok: false, text: 'Этот браузер не умеет записывать видео — сохрани карточку сезона' }); return }
    void (async () => {
      const [before, after] = await Promise.all([cardImage(model.before.avatar), cardImage(model.after.avatar)])
      const moments = seasonMoments(state, model)
      const run = (imgs: { before: CanvasImageSource | null; after: CanvasImageSource | null }) =>
        recordVideo(t => videoOps(model, moments, t), imgs, VIDEO_MS, share => { if (!dead) setP(share) })
      // испорченный canvas в Safari — запись без картинок (силуэты)
      const blob = await run({ before, after }).catch(() => run({ before: null, after: null }))
      if (!dead) setVid({ blob, url: (url = URL.createObjectURL(blob)) })
    })().catch(() => { if (!dead) setMsg({ ok: false, text: 'Не удалось записать ролик' }) })
    return () => { dead = true; if (url) URL.revokeObjectURL(url) }
  }, [snap, seasonId])
  const save = async () => {
    if (!vid) return
    try {
      const r = await saveFile(vid.blob, `season-${seasonId}.${vid.blob.type.includes('mp4') ? 'mp4' : 'webm'}`)
      setMsg(r === 'cancelled' ? null : { ok: true, text: r === 'shared' ? 'Готово' : 'Ролик скачан' })
    } catch { setMsg({ ok: false, text: 'Не удалось сохранить ролик' }) }
  }
  return (
    <Sheet id="video-title" title="Ролик «до и после»" onClose={onClose}>
      <div className="card-preview">
        {vid ? <video src={vid.url} controls playsInline muted autoPlay loop aria-label={`Ролик сезона: уровень ${model.before.level} → ${model.after.level}`} />
          : !msg && <div className="stack"><p className="muted" aria-live="polite">Записываю ролик… Не сворачивай приложение {Math.round(VIDEO_MS / 1000)} секунд.</p>
            <div className="bar" role="progressbar" aria-label="Запись ролика" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ width: `${p * 100}%` }} /></div></div>}
      </div>
      <button className="btn primary big" disabled={!vid} onClick={() => void save()}><Share2 size={18} aria-hidden="true" /> Сохранить / Поделиться</button>
      <div aria-live="polite">{msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}</div>
    </Sheet>
  )
}
