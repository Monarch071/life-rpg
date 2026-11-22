import { useEffect, useRef, useState } from 'react'
import { Camera, Image as ImageIcon, Upload } from 'lucide-react'
import { ART_SIDE, generateAvatar, PHOTO_ERROR_TEXT, PhotoError, shrinkImage } from '../ai/avatar'
import { getAiConfig, PROVIDER_NAMES, type AiConfig } from '../ai/config'
import { aiErrorText } from '../ai/providers'
import { saveBlob, useBlobUrl } from '../blobs'
import type { GameState } from '../domain/types'
import Confirm from '../ui/Confirm'
import { useWrite } from '../ui/useWrite'

const TIERS = [1, 2, 3, 4] as const

export type Go = (tab: 'Герой' | 'Настройки', id: string) => void

/** Призыв сделать образ по фото: к блоку «Аватар от ИИ», а без ключа — к настройкам ИИ. */
export function PhotoCta({ go }: { go: Go }) {
  const [cfg, setCfg] = useState<AiConfig | null | undefined>(undefined)
  useEffect(() => { let on = true; getAiConfig().then(c => { if (on) setCfg(c) }, () => { if (on) setCfg(null) }); return () => { on = false } }, [])
  if (cfg === undefined) return null
  const ready = !!cfg?.imageModel
  return (
    <section className="photo-cta" aria-label="Образ по фото">
      <span className="ic" aria-hidden="true"><Camera size={20} /></span>
      <div><b>Поставь своего героя на главный экран</b><small>{ready ? 'ИИ нарисует тебя по фото в полный рост' : 'Загрузи свой арт или включи синхронизацию — ИИ нарисует героя'}</small></div>
      <button type="button" className="btn primary" onClick={() => go('Герой', 'avatar-ai')}>{ready ? 'Создать' : 'Добавить'}</button>
    </section>
  )
}

function Slot({ tier, name }: { tier: number; name: string | undefined }) {
  const url = useBlobUrl(name ?? null)
  return (
    <figure>
      {url ? <img src={url} alt={`Образ тира ${tier}`} style={{ width: '100%', aspectRatio: '2 / 3', objectFit: 'cover', borderRadius: 8 }} />
        : <div className="muted" style={{ width: '100%', aspectRatio: '2 / 3', display: 'grid', placeItems: 'center', border: '1px dashed var(--line)', borderRadius: 8 }}>—</div>}
      <figcaption className="muted center">Тир {tier}</figcaption>
    </figure>
  )
}

export default function AvatarAi({ state }: { state: GameState }) {
  const [cfg, setCfg] = useState<AiConfig | null | undefined>(undefined)
  const [photo, setPhoto] = useState<File | null>(null)
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Blob | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const alive = useRef(true)
  const saveLock = useRef(false)
  const { write, busy: saving, msg } = useWrite()
  useEffect(() => { alive.current = true; void getAiConfig().then(c => { if (alive.current) setCfg(c) }); return () => { alive.current = false } }, [])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!result) return setUrl(null)
    const u = URL.createObjectURL(result); setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [result])

  if (cfg === undefined) return null
  const ai = cfg?.imageModel ? cfg : null
  const upload = async (f: File | undefined) => {
    if (!f) return
    setErr(null); setPhoto(null)
    try { setResult(await shrinkImage(f, ART_SIDE)) } catch { setErr(PHOTO_ERROR_TEXT) }
  }

  const run = async () => {
    if (!photo || !ai) return
    setAsk(false); setBusy(true); setErr(null); setResult(null)
    try {
      const b = await generateAvatar(ai, photo, state.avatar, state.tier, state.profile?.name ?? '')
      if (alive.current) setResult(b)
    } catch (e) { if (alive.current) setErr(e instanceof PhotoError ? PHOTO_ERROR_TEXT : aiErrorText(e)) }
    if (alive.current) setBusy(false)
  }
  const save = async () => {
    if (!result || saveLock.current) return
    saveLock.current = true
    try { await doSave(result) } finally { saveLock.current = false }
  }
  const doSave = async (result: Blob) => {
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('')
    const name = `avatar-t${state.tier}-${rnd}`
    try { await saveBlob(name, result) } catch { setErr('Не удалось сохранить, попробуй ещё раз'); return }
    if (await write({ type: 'avatar_image', tier: state.tier, blob: name }, 'Образ сохранён.')) { setResult(null); setPhoto(null) }
  }
  const saved = TIERS.filter(t => state.avatarImages[t])
  const newTier = saved.length > 0 && Math.max(...saved) < state.tier

  return (
    <section className="panel stack" aria-label="Аватар от ИИ">
      <h2><ImageIcon size={18} aria-hidden="true" /> Арт героя</h2>
      <p className="muted">Картинка в полный рост встанет фоном главного экрана. Лучше всего — вертикальная, герой справа.</p>
      {newTier && <p role="status">Новый тир! Создай новый образ</p>}
      <label className="btn big" style={{ cursor: 'pointer' }}>
        <Upload size={18} aria-hidden="true" />Загрузить свою картинку
        <input type="file" accept="image/*" hidden disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {!ai && <p className="muted">Чтобы ИИ нарисовал героя по твоему фото, подключи Gemini или OpenAI в настройках.</p>}
      {ai && <label className="btn big" style={{ cursor: 'pointer' }}>
        <Camera size={18} aria-hidden="true" />Нарисовать по фото (ИИ)
        <input type="file" accept="image/*" hidden disabled={busy}
          onChange={e => { setPhoto(e.target.files?.[0] ?? null); setResult(null); setErr(null); e.target.value = '' }} />
      </label>}
      {photo && !result && <button className="btn primary big" disabled={busy} onClick={() => setAsk(true)}>Создать аватар</button>}
      {busy && <p role="status">Рисую аватар… это может занять до минуты</p>}
      {err && <p role="alert">{err}</p>}
      {url && (<>
        <div className="center"><img src={url} alt="Новый аватар" style={{ width: 160, height: 240, objectFit: 'cover', borderRadius: 12 }} /></div>
        <button className="btn primary big" disabled={saving} onClick={save}>Сохранить для тира {state.tier}</button>
        {photo && <button className="btn ghost big" disabled={busy} onClick={() => setAsk(true)}>Попробовать ещё раз</button>}
      </>)}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className="center">{msg.text}</p>}
      <div className="tier-slots">{TIERS.map(t => <Slot key={t} tier={t} name={state.avatarImages[t]} />)}</div>
      {ask && ai && <Confirm title={`Фото будет отправлено в ${PROVIDER_NAMES[ai.provider]} для создания аватара. Исходное фото нигде не сохраняется. Продолжить?`}
        yes="Продолжить" onYes={() => void run()} onNo={() => setAsk(false)} />}
    </section>
  )
}
