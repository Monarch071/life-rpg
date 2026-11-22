import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon } from 'lucide-react'
import { generateAvatar, imageNameFor, PHOTO_ERROR_TEXT, PhotoError } from '../ai/avatar'
import { getAiConfig, PROVIDER_NAMES, type AiConfig } from '../ai/config'
import { aiErrorText } from '../ai/providers'
import { saveBlob, useBlobUrl } from '../blobs'
import type { GameState } from '../domain/types'
import { useWrite } from '../ui/useWrite'

export type Go = (tab: 'Герой' | 'Настройки', id: string) => void

/** Призыв сделать персонажа по фото: к блоку «Арт героя». */
export function PhotoCta({ go }: { go: Go }) {
  return (
    <section className="photo-cta" aria-label="Персонаж по фото">
      <span className="ic" aria-hidden="true"><Camera size={20} /></span>
      <div><b>Создай своего персонажа</b><small>Загрузи фото — ИИ нарисует тебя аниме-героем в полный рост</small></div>
      <button type="button" className="btn primary" onClick={() => go('Герой', 'avatar-ai')}>Создать</button>
    </section>
  )
}

function Current({ name }: { name: string | null }) {
  const url = useBlobUrl(name)
  return url ? <div className="center"><img src={url} alt="Твой персонаж" style={{ width: 200, aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 12 }} /></div> : null
}

/** Арт героя: любое загруженное фото сразу превращается ИИ в аниме-персонажа и ставится героем. */
export default function AvatarAi({ state }: { state: GameState }) {
  const [cfg, setCfg] = useState<AiConfig | null | undefined>(undefined)
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const alive = useRef(true)
  const { write, msg } = useWrite()
  useEffect(() => { alive.current = true; void getAiConfig().then(c => { if (alive.current) setCfg(c) }); return () => { alive.current = false } }, [])

  if (cfg === undefined) return null
  const ai = cfg?.imageModel ? cfg : null
  const c = state.character
  const hero = { className: state.className, archetype: c?.archetype, strengths: c?.strengths, sportLevel: state.profile?.sportLevel }

  const run = async (f: File) => {
    if (!ai || busy) return
    setPhoto(f); setBusy(true); setErr(null)
    try {
      const b = await generateAvatar(ai, f, hero, state.tier)
      const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), x => x.toString(16).padStart(2, '0')).join('')
      const name = `avatar-t${state.tier}-${rnd}`
      await saveBlob(name, b)
      if (await write({ type: 'avatar_image', tier: state.tier, blob: name }, 'Персонаж готов и стоит на главном экране.') && alive.current) setPhoto(null)
    } catch (e) { if (alive.current) setErr(e instanceof PhotoError ? PHOTO_ERROR_TEXT : aiErrorText(e)) }
    if (alive.current) setBusy(false)
  }

  return (
    <section className="panel stack" aria-label="Арт героя">
      <h2><ImageIcon size={18} aria-hidden="true" /> Арт героя</h2>
      <Current name={imageNameFor(state.avatarImages, state.tier)} />
      {ai ? <>
        <label className="btn primary big" style={{ cursor: busy ? 'default' : 'pointer' }} aria-disabled={busy}>
          <Camera size={18} aria-hidden="true" />{busy ? 'Создаю персонажа…' : 'Загрузите фотографию, чтобы сделать своего персонажа'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(f) }} />
        </label>
        <small className="muted">Фото уходит в {PROVIDER_NAMES[ai.provider]} только для рисунка и нигде не хранится. Персонаж учитывает твой класс и результаты анкеты.</small>
      </> : <p className="muted">Чтобы ИИ нарисовал персонажа по фото, включи синхронизацию или подключи Gemini/OpenAI в настройках.</p>}
      {busy && <p role="status">Рисую персонажа… это может занять до 2–3 минут</p>}
      {err && <p role="alert">{err}</p>}
      {err && photo && !busy && <button className="btn big" onClick={() => void run(photo)}>Попробовать ещё раз</button>}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className="center">{msg.text}</p>}
    </section>
  )
}
