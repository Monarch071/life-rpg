import { useState, type ReactNode } from 'react'
import { appendEvent } from '../db'
import { classFor, initialStats, STATS } from '../domain/stats'
import type { Profile, Stat } from '../domain/types'
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

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [d, setD] = useState<Draft>(initial)
  const [err, setErr] = useState<string | null>(null)
  const [custom, setCustom] = useState({ good: '', bad: '' })
  const [saving, setSaving] = useState(false)
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
  const cls = classFor(stats)

  const next = async () => {
    const e = validateStep(step, d)
    setErr(e)
    if (e) return
    if (step < TOTAL) return setStep(step + 1)
    setSaving(true)
    try {
      await appendEvent({ type: 'onboarding_completed', profile })
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
              <button type="button" className="x" aria-label="Удалить" onClick={() => set({ templates: d.templates.filter((_, j) => j !== i) })}>✕</button>
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
              <button type="button" className="x" aria-label="Удалить" onClick={() => set({ goals: d.goals.filter((_, j) => j !== i) })}>✕</button>
            </div>
            <div className="chips" role="group" aria-label="Срок цели">
              {MONTHS.map((m) => <button key={m} type="button" aria-pressed={g.months === m} className={g.months === m ? 'on' : ''} onClick={() => setGoal(i, { months: m })}>{m} мес</button>)}
            </div>
            <div className="chips" role="group" aria-label="Характеристика цели">
              {STAT_IDS.map((s) => <button key={s} type="button" aria-pressed={g.stat === s} className={g.stat === s ? 'on' : ''} onClick={() => setGoal(i, { stat: s })}>{STATS[s].icon} {STATS[s].name}</button>)}
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
        <div className="chips" role="group" aria-label="Уровень спорта">
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
        <p>{STATS.int.icon} Интеллект</p>
        <Scale label="Интеллект" value={d.selfRating.int} max={10} onChange={(n) => rate('int', n)} />
        <p>{STATS.cha.icon} Харизма</p>
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
          <button type="button" className="ghost" aria-label="Добавить полезную привычку" onClick={() => addCustom('good')}>+</button>
        </div>
        <p>Вредные</p>
        <Chips label="Вредные привычки" options={[...BAD, ...customChips('badHabits', BAD)]} picked={d.badHabits} onToggle={(id) => toggle('badHabits', id)} />
        <div className="row">
          <input aria-label="Своя вредная привычка" value={custom.bad} placeholder="Своя вредная" onChange={(e) => setCustom({ ...custom, bad: e.target.value })} />
          <button type="button" className="ghost" aria-label="Добавить вредную привычку" onClick={() => addCustom('bad')}>+</button>
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
          <div key={s}><p>{STATS[s].icon} {STATS[s].name}</p><Scale label={STATS[s].name} value={d.selfRating[s]} max={10} onChange={(n) => rate(s, n)} /></div>
        ))}
      </>)
      break
    default:
      body = (<>
        <h2>{profile.name}</h2>
        <div className="hero">
          <div className="cls">{cls}</div>
          <div>Уровень 1</div>
        </div>
        {STAT_IDS.map((s) => (
          <div className="stat" key={s}>
            <span>{STATS[s].icon} {STATS[s].name}</span>
            <div className="bar"><i style={{ width: `${(stats[s] / 20) * 100}%` }} /></div>
            <b>{stats[s]}</b>
          </div>
        ))}
      </>)
  }

  return (
    <div className="onb">
      <div className="progress"><i style={{ width: `${(step / TOTAL) * 100}%` }} /></div>
      <div className="onb-body">
        <small>Шаг {step} из {TOTAL}</small>
        {body}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
      <div className="onb-nav">
        {step > 1 && <button type="button" className="ghost" onClick={back}>Назад</button>}
        <button type="button" className="primary" disabled={saving} onClick={next}>{step === TOTAL ? 'Начать' : 'Далее'}</button>
      </div>
    </div>
  )
}
