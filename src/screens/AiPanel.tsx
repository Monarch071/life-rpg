import { useEffect, useRef, useState } from 'react'
import { Bot } from 'lucide-react'
import { clearAiConfig, getAiConfig, PROVIDER_NAMES, saveAiConfig, type AiConfig, type AiProvider } from '../ai/config'
import { aiErrorText, listModels } from '../ai/providers'
import Confirm from '../ui/Confirm'

const PROVIDERS = Object.keys(PROVIDER_NAMES) as AiProvider[]
const SEL = { fontSize: 16, minHeight: 44 }

export default function AiPanel() {
  const [cfg, setCfg] = useState<AiConfig | null | undefined>(undefined)
  const [edit, setEdit] = useState(false)
  const [provider, setProvider] = useState<AiProvider>('gemini')
  const [key, setKey] = useState('')
  const [models, setModels] = useState<{ text: string[]; image: string[] } | null>(null)
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmOff, setConfirmOff] = useState(false)
  const req = useRef(0) // номер актуального запроса; смена провайдера/ключа его обнуляет
  useEffect(() => { void getAiConfig().then(setCfg) }, [])

  const check = async () => {
    if (!key.trim()) return setMsg({ ok: false, text: 'Введи ключ' })
    const id = ++req.current
    setBusy(true); setMsg(null)
    try {
      const m = await listModels(provider, key.trim())
      if (id !== req.current) return
      if (!m.text.length) throw new Error('empty')
      setModels(m)
      setText(provider === 'claude' && m.text.includes('claude-opus-5-5') ? 'claude-opus-5-5' : m.text[0])
      setImage(m.image[0] ?? '')
    } catch (e) { if (id !== req.current) return; setModels(null); setMsg({ ok: false, text: e instanceof Error && e.message === 'empty' ? 'Список моделей пуст' : aiErrorText(e) }) }
    setBusy(false)
  }
  const save = async () => {
    const c: AiConfig = { provider, key: key.trim(), textModel: text, imageModel: image || null }
    try { await saveAiConfig(c); setCfg(c); setEdit(false); setKey(''); setModels(null); setMsg(null) }
    catch { setMsg({ ok: false, text: 'Не удалось сохранить, попробуй ещё раз' }) }
  }
  const off = async () => {
    setConfirmOff(false)
    await clearAiConfig()
    setCfg(null); setEdit(false); setKey(''); setModels(null); setMsg(null)
  }
  const change = () => { setProvider(cfg!.provider); setKey(''); setModels(null); setMsg(null); setEdit(true) }

  if (cfg === undefined) return null
  return (
    <section className="panel stack">
      <h2><Bot size={18} aria-hidden="true" /> ИИ</h2>
      {cfg && !edit ? (<>
        <p role="status">ИИ включён: {PROVIDER_NAMES[cfg.provider]}, {cfg.textModel}</p>
        <button className="btn big" onClick={change}>Изменить</button>
        <button className="btn ghost big" onClick={() => setConfirmOff(true)}>Отключить ИИ</button>
      </>) : (<>
        <div className="chips" role="group" aria-label="Провайдер ИИ">
          {PROVIDERS.map((p) => (
            <button key={p} type="button" className={`btn${provider === p ? ' primary' : ''}`} aria-pressed={provider === p}
              disabled={busy} onClick={() => { req.current++; setProvider(p); setModels(null); setMsg(null) }}>
              {PROVIDER_NAMES[p]}{p === 'gemini' ? ' — бесплатно, рекомендуем' : ''}
            </button>
          ))}
        </div>
        <label className="field">Ключ API
          <input type="password" autoComplete="off" autoCapitalize="off" value={key} onChange={(e) => { req.current++; setBusy(false); setKey(e.target.value); setModels(null) }} />
        </label>
        <p className="muted">Ключ хранится только на этом устройстве и отправляется только в {PROVIDER_NAMES[provider]}.</p>
        <button className="btn big" disabled={busy} onClick={check}>Проверить ключ и загрузить модели</button>
        {models && (<>
          <label className="field">Модель для текста
            <select value={text} style={SEL} onChange={(e) => setText(e.target.value)}>
              {models.text.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {provider === 'claude'
            ? <p className="muted">Claude не рисует картинки — для аватара выбери Gemini или OpenAI</p>
            : (
              <label className="field">Модель для картинок
                <select value={image} style={SEL} onChange={(e) => setImage(e.target.value)}>
                  <option value="">Не использовать</option>
                  {models.image.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            )}
          <button className="btn primary big" onClick={save}>Сохранить</button>
        </>)}
        {cfg && <button className="btn ghost big" onClick={() => { setEdit(false); setMsg(null) }}>Отмена</button>}
      </>)}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'ok' : 'err'}>{msg.text}</p>}
      {confirmOff && <Confirm title="Отключить ИИ и удалить ключ с этого устройства?" yes="Отключить" onYes={off} onNo={() => setConfirmOff(false)} />}
    </section>
  )
}
