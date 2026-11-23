import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Camera, X, Plus } from 'lucide-react'
import { generateAvatar } from '../ai/avatar'
import { getAiConfig } from '../ai/config'
import { saveBlob } from '../blobs'
import { StatIcon } from '../ui/icons'
import { appendEvent } from '../db'
import { classNameOf } from '../domain/classes'
import { initialStats, STATS } from '../domain/stats'
import type { Profile, Stat } from '../domain/types'
import JoinSync from './JoinSync'
import { validateStep, type Draft } from './onboardingValidation'

const TOTAL = 11
const STAT_IDS = Object.keys(STATS) as Stat[]
const SPORT = ['Не занимаюсь', 'Иногда', '1–2 раза в неделю', 'Регулярно']
const MONTHS = [3, 6, 9, 12]
const BAD = [['games', 'Игры'], ['social', 'Соцсети'], ['late', 'Поздний отбой'], ['junk', 'Фастфуд'], ['smoke', 'Курение'], ['procr', 'Прокрастинация']]
const GOOD = [['sport', 'Спорт'], ['read', 'Чтение'], ['water', 'Вода'], ['walk', 'Прогулки'], ['meditate', 'Медитация']]
const PARTS = [['morning', 'Утро'], ['day', 'День'], ['evening', 'Вечер'], ['night', 'Ночь']] as const

const initial: Draft = {
  name: '', wake: '07:00', sleep: '23:00', noWork: false,
  templates: [{ label: 'Работа', start: '09:00', end: '18:00' }],
  goals: [], sportLevel: 1, stepsUsual: 5000,
  savings: false, savingsText: '', savingsMonths: 6,
  goodHabits: [], badHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 },
  selfRating: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 },
}

function toProfile(d: Draft): Profile {
  const goals = d.goals.filter((g) => g.text.trim()).map((g) => ({ ...g, text: g.text.trim() }))
  if (d.savings) goals.push({ text: d.savingsText.trim() || 'Накопить', months: d.savingsMonths, stat: 'fin' })
  return {
    name: d.name.trim(), wake: d.wake, sleep: d.sleep,
    workTemplates: d.noWork ? [] : d.templates,
    goals, sportLevel: d.sportLevel, stepsUsual: d.stepsUsual,
    badHabits: d.badHabits, goodHabits: d.goodHabits, energy: d.energy, selfRating: d.selfRating,
  }
}

function Scale({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (n: number) => void }) {
  return (
    <div className="scale" role="group" aria-label={label}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button key={n} type="button" aria-pressed={n === value} className={n === value ? 'on' : ''} onClick={() => onChange(n)}>{n}</button>
      ))}
    </div>
  )
}

function Chips({ options, picked, label, onToggle }: { options: string[][]; picked: string[]; label: string; onToggle: (id: string) => void }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([id, label]) => (
        <button key={id} type="button" aria-pressed={picked.includes(id)} className={picked.includes(id) ? 'on' : ''} onClick={() => onToggle(id)}>{label}</button>
      ))}
    </div>
  )
}

type Art = { status: 'idle' | 'busy' | 'done' | 'fail'; url?: string }

/** Рисует персонажа по фото в фоне; готовую картинку сохраняет как образ тира 1, когда анкета завершена. */
function useHeroArt() {
  const [art, setArt] = useState<Art>({ status: 'idle' })
  const job = useRef<Promise<Blob | null>>(Promise.resolve(null))
  useEffect(() => () => { if (art.url) URL.revokeObjectURL(art.url) }, [art.url])
  const start = (photo: File) => {
    setArt({ status: 'busy' })
    job.current = getAiConfig()
      .then(cfg => generateAvatar(cfg!, photo, { className: 'Странник' }, 1))
      .then(b => { setArt({ status: 'done', url: URL.createObjectURL(b) }); return b }, () => { setArt({ status: 'fail' }); return null })
  }
  // после onboarding_completed экран размонтируется, но обещание доживёт и сохранит картинку
  const saveWhenReady = () => void job.current.then(async b => {
    if (!b) return
    const name = `avatar-t1-${Array.from(crypto.getRandomValues(new Uint8Array(4)), x => x.toString(16).padStart(2, '0')).join('')}`
    await saveBlob(name, b)
    await appendEvent({ type: 'avatar_image', tier: 1, blob: name })
  }).catch(() => {})
  return { art, start, saveWhenReady }
}

function PhotoIntro({ onPhoto, onSkip }: { onPhoto: (f: File) => void; onSkip: () => void }) {
  return (
    <div className="onb">
      <div className="onb-body onb-photo">
        <h2>Стань героем своей игры</h2>
        <p>Загрузи фото — ИИ нарисует тебя аниме-персонажем. Пока он рисует, ответь на пару вопросов о себе.</p>
        <label className="btn primary big" style={{ cursor: 'pointer' }}>
          <Camera size={20} aria-hidden="true" />Загрузить фото и создать персонажа
          <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
        </label>
        <small className="muted">Фото уходит в Google Gemini только для рисунка и нигде не хранится.</small>
      </div>
      <div className="onb-nav"><button type="button" className="ghost" onClick={onSkip}>Позже</button></div>
    </div>
  )
}

export default function Onboarding() {
  const { art, start, saveWhenReady } = useHeroArt()
  const [intro, setIntro] = useState(true)
  const [step, setStep] = useState(1)
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState<string | null>(null)
  const [custom, setCustom] = useState({ good: '', bad: '' })
  const [saving, setSaving] = useState(false)
  const [join, setJoin] = useState(false)
  const [stepsText, setStepsText] = useState('5000')
  const set = (p: Partial<Draft>) => setD((o) => ({ ...o, ...p }))
  const rate = (s: Stat, n: number) => setD((o) => ({ ...o, selfRating: { ...o.selfRating, [s]: n } }))
  const toggle = (k: 'goodHabits' | 'badHabits', id: string) =>
    set({ [k]: d[k].includes(id) ? d[k].filter((x) => x !== id) : [...d[k], id] })
  const addCustom = (k: 'good' | 'bad') => {
    const t = custom[k].trim()
    if (!t) return
    const key = k === 'good' ? 'goodHabits' : 'badHabits'
    if (!d[key].includes(t)) set({ [key]: [...d[key], t] })
    setCustom({ ...custom, [k]: '' })
  }
  const customChips = (k: 'goodHabits' | 'badHabits', std: string[][]) =>
    d[k].filter((id) => !std.some(([s]) => s === id)).map((id) => [id, id])

  const steps = Math.min(100000, Math.max(0, Math.round(Number(stepsText)) || 0))
  const profile = { ...toProfile(d), stepsUsual: steps }
  const stats = initialStats(profile)
  const cls = classNameOf(stats)

  const next = async () => {
    const e = validateStep(step, d)
    setErr(e)
    if (e) return
    if (step < TOTAL) return setStep(step + 1)
    setSaving(true)
    try {
      await appendEvent({ type: 'onboarding_completed', profile })
      saveWhenReady()
    } catch {
      setSaving(false)
      setErr('Не удалось сохранить, попробуй ещё раз')
    }
  }
  const back = () => { setErr(null); setStep(step - 1) }

  const setTpl = (i: number, p: Partial<Draft['templates'][0]>) =>
    set({ templates: d.templates.map((t, j) => (j === i ? { ...t, ...p } : t)) })
  const setGoal = (i: number, p: Partial<Draft['goals'][0]>) =>
    set({ goals: d.goals.map((g, j) => (j === i ? { ...g, ...p } : g)) })

  let body: ReactNode
  switch (step) {
    case 1:
      body = (<>
        <h2>Как зовут героя?</h2>
        <input aria-label="Имя героя" value={d.name} maxLength={30} placeholder="Имя" onChange={(e) => set({ name: e.target.value })} />
        <button type="button" className="ghost" onClick={() => setJoin(true)}>У меня уже есть прогресс — войти</button>
      </>)
      break
    case 2:
      body = (<>
        <h2>Сон</h2>
        <label>Обычный подъём<input aria-label="Время подъёма" type="time" value={d.wake} onChange={(e) => set({ wake: e.target.value })} /></label>
        <label>Обычный отбой<input aria-label="Время отбоя" type="time" value={d.sleep} onChange={(e) => set({ sleep: e.target.value })} /></label>
      </>)
      break
    case 3:
      body = (<>
        <h2>Работа</h2>
        <label className="check"><input type="checkbox" checked={d.noWork} onChange={(e) => set({ noWork: e.target.checked })} /> Не работаю</label>
        {!d.noWork && d.templates.map((t, i) => (
          <div className="card" key={i}>
            <input aria-label="Название рабочих часов" value={t.label} placeholder="Название" onChange={(e) => setTpl(i, { label: e.target.value })} />
            <div className="row">
              <input aria-label="Начало работы" type="time" value={t.start} onChange={(e) => setTpl(i, { start: e.target.value })} />
              <input aria-label="Конец работы" type="time" value={t.end} onChange={(e) => setTpl(i, { end: e.target.value })} />
              <button type="button" className="x" aria-label="Удалить" onClick={() => set({ templates: d.templates.filter((_, j) => j !== i) })}><X size={18} aria-hidden="true" /></button>
            </div>
          </div>
        ))}
        {!d.noWork && d.templates.length < 3 && (
          <button type="button" className="ghost" onClick={() => set({ templates: [...d.templates, { label: 'Работа', start: '', end: '' }] })}>+ Добавить</button>
        )}
      </>)
      break
    case 4:
      body = (<>
        <h2>Цели на 3–12 месяцев</h2>
        {d.goals.map((g, i) => (
          <div className="card" key={i}>
            <div className="row">
              <input aria-label="Цель" value={g.text} placeholder="Цель" onChange={(e) => setGoal(i, { text: e.target.value })} />
              <button type="button" className="x" aria-label="Удалить" onClick={() => set({ goals: d.goals.filter((_, j) => j !== i) })}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="chips" role="group" aria-label="Срок цели">
              {MONTHS.map((m) => <button key={m} type="button" aria-pressed={g.months === m} className={g.months === m ? 'on' : ''} onClick={() => setGoal(i, { months: m })}>{m} мес</button>)}
            </div>
            <div className="chips" role="group" aria-label="Характеристика цели">
              {STAT_IDS.map((s) => <button key={s} type="button" aria-pressed={g.stat === s} className={g.stat === s ? 'on' : ''} onClick={() => setGoal(i, { stat: s })}><StatIcon stat={s} size={16} />{STATS[s].name}</button>)}
            </div>
          </div>
        ))}
        {d.goals.length < 3 && (
          <button type="button" className="ghost" onClick={() => set({ goals: [...d.goals, { text: '', months: 6, stat: 'dis' }] })}>+ Добавить цель</button>
        )}
      </>)
      break
    case 5:
      body = (<>
        <h2>Здоровье и спорт</h2>
        <div className="chips opts" role="group" aria-label="Уровень спорта">
          {SPORT.map((s, i) => <button key={s} type="button" aria-pressed={d.sportLevel === i} className={d.sportLevel === i ? 'on' : ''} onClick={() => set({ sportLevel: i as 0 | 1 | 2 | 3 })}>{s}</button>)}
        </div>
        <label>Обычно шагов в день
          <input type="number" inputMode="numeric" min={0} step={500} value={stepsText}
            onChange={(e) => setStepsText(e.target.value)} />
        </label>
      </>)
      break
    case 6:
      body = (<>
        <h2>Финансы</h2>
        <p>Как оцениваешь свои финансы?</p>
        <Scale label="Оценка финансов" value={d.selfRating.fin} max={10} onChange={(n) => rate('fin', n)} />
        <label className="check"><input type="checkbox" checked={d.savings} onChange={(e) => set({ savings: e.target.checked })} /> Есть цель накоплений</label>
        {d.savings && (<>
          <input aria-label="На что копишь" value={d.savingsText} placeholder="На что копишь" onChange={(e) => set({ savingsText: e.target.value })} />
          <div className="chips" role="group" aria-label="Срок накоплений">
            {MONTHS.map((m) => <button key={m} type="button" aria-pressed={d.savingsMonths === m} className={d.savingsMonths === m ? 'on' : ''} onClick={() => set({ savingsMonths: m })}>{m} мес</button>)}
          </div>
        </>)}
      </>)
      break
    case 7:
      body = (<>
        <h2>Навыки и отношения</h2>
        <p className="lbl"><StatIcon stat="int" size={16} /> Интеллект</p>
        <Scale label="Интеллект" value={d.selfRating.int} max={10} onChange={(n) => rate('int', n)} />
        <p className="lbl"><StatIcon stat="cha" size={16} /> Харизма</p>
        <Scale label="Харизма" value={d.selfRating.cha} max={10} onChange={(n) => rate('cha', n)} />
      </>)
      break
    case 8:
      body = (<>
        <h2>Привычки</h2>
        <p>Полезные</p>
        <Chips label="Полезные привычки" options={[...GOOD, ...customChips('goodHabits', GOOD)]} picked={d.goodHabits} onToggle={(id) => toggle('goodHabits', id)} />
        <div className="row">
          <input aria-label="Своя полезная привычка" value={custom.good} placeholder="Своя полезная" onChange={(e) => setCustom({ ...custom, good: e.target.value })} />
          <button type="button" className="ghost" aria-label="Добавить полезную привычку" onClick={() => addCustom('good')}><Plus size={18} aria-hidden="true" /></button>
        </div>
        <p>Вредные</p>
        <Chips label="Вредные привычки" options={[...BAD, ...customChips('badHabits', BAD)]} picked={d.badHabits} onToggle={(id) => toggle('badHabits', id)} />
        <div className="row">
          <input aria-label="Своя вредная привычка" value={custom.bad} placeholder="Своя вредная" onChange={(e) => setCustom({ ...custom, bad: e.target.value })} />
          <button type="button" className="ghost" aria-label="Добавить вредную привычку" onClick={() => addCustom('bad')}><Plus size={18} aria-hidden="true" /></button>
        </div>
      </>)
      break
    case 9:
      body = (<>
        <h2>Энергия по времени суток</h2>
        {PARTS.map(([k, label]) => (
          <div key={k}><p>{label}</p><Scale label={`Энергия: ${label}`} value={d.energy[k]} max={5} onChange={(n) => set({ energy: { ...d.energy, [k]: n } })} /></div>
        ))}
      </>)
      break
    case 10:
      body = (<>
        <h2>Самооценка</h2>
        {STAT_IDS.map((s) => (
          <div key={s}><p className="lbl"><StatIcon stat={s} size={16} /> {STATS[s].name}</p><Scale label={STATS[s].name} value={d.selfRating[s]} max={10} onChange={(n) => rate(s, n)} /></div>
        ))}
      </>)
      break
    default:
      body = (<>
        <h2>{profile.name}</h2>
        {art.status === 'done' && <img className="onb-art" src={art.url} alt="Твой персонаж" />}
        {art.status === 'busy' && <p role="status" className="muted">Персонаж ещё рисуется — появится на главном экране, как будет готов.</p>}
        {art.status === 'fail' && <p className="muted">Персонажа нарисовать не вышло — попробуй ещё раз в «Профиль» → «Арт героя».</p>}
        <div className="hero">
          <div className="cls">{cls}</div>
          <div>Уровень 1</div>
        </div>
        {STAT_IDS.map((s) => (
          <div className="stat" key={s}>
            <span className="lbl"><StatIcon stat={s} size={16} /> {STATS[s].name}</span>
            <div className="bar"><i style={{ width: `${(stats[s] / 20) * 100}%` }} /></div>
            <b>{stats[s]}</b>
          </div>
        ))}
      </>)
  }

  if (intro) return <PhotoIntro onPhoto={f => { start(f); setIntro(false) }} onSkip={() => setIntro(false)} />
  return (
    <div className="onb">
      {art.status === 'busy' && <small className="onb-art-busy" role="status">Рисую персонажа…</small>}
      <div className="progress" role="progressbar" aria-label="Прогресс" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step}><i style={{ width: `${(step / TOTAL) * 100}%` }} /></div>
      <div className="onb-body">
        <small className="step">Шаг {step} из {TOTAL}</small>
        <div className="onb-step" key={step}>{body}</div>
        {err && <p className="err" role="alert">{err}</p>}
      </div>
      <div className="onb-nav">
        {step > 1 && <button type="button" className="ghost" onClick={back}>Назад</button>}
        <button type="button" className="primary" disabled={saving} onClick={next}>{step === TOTAL ? 'Начать' : 'Далее'}</button>
      </div>
      {join && <JoinSync onDone={() => setJoin(false)} />}
    </div>
  )
}
