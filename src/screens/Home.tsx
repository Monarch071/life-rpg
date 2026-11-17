import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { appendEvent, getSetting, setSetting } from '../db'
import { ACHIEVEMENTS } from '../domain/achievements'
import { fromMin, gameDate, toMin } from '../domain/day'
import { METRIC_INFO } from '../domain/metricInfo'
import { STATS } from '../domain/stats'
import type { GameState, Profile } from '../domain/types'
import { hhmmNow, now } from '../now'
import { imageNameFor } from '../ai/avatar'
import { useBlobUrl } from '../blobs'
import { Bot, Check, Coins, Flame, Hourglass, Moon, Zap } from 'lucide-react'
import Arena from '../ui/Arena'
import LevelBadge from '../ui/LevelBadge'
import XpBar from '../ui/XpBar'
import { StatIcon } from '../ui/icons'
import { useDialog } from '../ui/useDialog'
import { buildQuests } from './issue'
import Checkin from './Checkin'
import MyDay from './MyDay'
import QuickInput from './QuickInput'
import { replanAfterBusy } from './replan'

type Sheet = null | 'quick' | 'busy' | 'checkin'

// «Позже» на «Мой день» — до перезапуска приложения (переживает переключение вкладок)
let deferredDay = false

export default function Home({ state, profile }: { state: GameState; profile: Profile }) {
  const { today } = state
  const img = useBlobUrl(imageNameFor(state.avatarImages, state.tier))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pop, setPop] = useState<{ id: string; xp: number; k: number } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const pending = useRef(new Set<string>())
  const [issuing, setIssuing] = useState(false)
  const [later, setLaterState] = useState(deferredDay)
  const [fallback, setFallback] = useState(false)
  useEffect(() => { getSetting('aiFallback', '').then(d => setFallback(d === today.date)).catch(() => {}) }, [today.date, today.started])
  const setLater = (v: boolean) => { deferredDay = v; setLaterState(v) }
  const cutoffHour = useLiveQuery(() => getSetting<number>('cutoffHour', 4)) ?? 4
  useEffect(() => { pending.current.clear() }, [today.date])

  // новое достижение: полученное сегодня и ещё не показанное на этом устройстве
  const [toast, setToast] = useState<{ text: string; ids: string[] } | null>(null)
  useEffect(() => {
    let off = false
    void (async () => {
      const seen = await getSetting<string[]>('seenAchievements', [])
      const fresh = state.achievements.filter(a => a.date === today.date && !seen.includes(a.id))
      if (off || !fresh.length) return
      const text = fresh.map(a => `🏆 ${ACHIEVEMENTS.find(d => d.id === a.id)?.title ?? a.id}`).join(' · ')
      setToast(prev => prev?.text === text ? prev : { text, ids: fresh.map(a => a.id) })
    })().catch(() => {})
    return () => { off = true }
  }, [state.achievements, today.date])
  // «показано» — только после 4 с (или закрытия); если ушли с Главной раньше, покажем снова
  const dismiss = async () => {
    if (!toast) return
    setToast(null)
    try { await setSetting('seenAchievements', [...new Set([...await getSetting<string[]>('seenAchievements', []), ...toast.ids])]) } catch { /* не критично */ }
  }
  useEffect(() => { if (!toast) return; const t = setTimeout(() => void dismiss(), 4000); return () => clearTimeout(t) }, [toast]) // eslint-disable-line react-hooks/exhaustive-deps

  // запасной путь: день начат, а заданий нет
  const issue = async () => {
    if (issuing) return
    setIssuing(true)
    setErr(null)
    try {
      const quests = buildQuests(state, profile, today.work, today.wakeAt ?? hhmmNow())
      await appendEvent({ type: 'quests_issued', date: today.date, quests })
    } catch {
      setErr('Не удалось получить задания, попробуй ещё раз')
    } finally {
      setIssuing(false)
    }
  }

  const quests = useMemo(() => {
    const qs = today.busyUntil && today.wakeAt
      ? replanAfterBusy(today.quests, hhmmNow(), today.busyUntil, today.wakeAt, profile, today.work)
      : today.quests
    const key = (w: { start: string } | null) => (w ? (toMin(w.start) - toMin(today.wakeAt ?? profile.wake) + 1440) % 1440 : 1e9)
    return [...qs].sort((a, b) => key(a.window) - key(b.window))
  }, [today, profile])

  const complete = async (id: string, xp: number) => {
    if (pending.current.has(id)) return
    // игровые сутки уже сменились: не пишем (иначе «+XP» потом исчезнет), а пересчитываем день
    if (gameDate(now(), cutoffHour) !== today.date) return void document.dispatchEvent(new Event('visibilitychange'))
    pending.current.add(id)
    setErr(null)
    try {
      await appendEvent({ type: 'quest_completed', date: today.date, questId: id })
      setPop({ id, xp, k: Date.now() })
      setTimeout(() => setPop(p => (p?.id === id ? null : p)), 1200)
    } catch {
      pending.current.delete(id)
      setErr('Не удалось отметить задание, попробуй ещё раз')
    }
  }

  const allDone = today.quests.length > 0 && today.quests.every(q => q.done)
  const hour = new Date(now()).getHours()
  const checkinOpen = allDone || hour >= 18 || hour < cutoffHour // до cutoffHour игровой день ещё вчерашний
  const leader = today.xp > today.shadowXp ? 'me' : today.xp < today.shadowXp ? 'shadow' : null
  const share = today.xp + today.shadowXp > 0 ? (today.xp / (today.xp + today.shadowXp)) * 100 : 50

  return (
    <div className="home">
      <div role="status">{toast && <div className="toast" onClick={() => void dismiss()}>{toast.text}</div>}</div>
      <header className="hud">
        <div className="hud-top">
          <LevelBadge level={state.level} />
          <div className="who">
            <div className="name">{profile.name || 'Ты'}</div>
            <div className="cls">{state.className} · <em>«{state.title}»</em></div>
          </div>
          <span className="coins" aria-label={`Монеты: ${state.currency}`}><span className="coin" aria-hidden="true"><Coins size={13} /></span>{state.currency}</span>
        </div>
        <XpBar into={state.xpInto} need={state.xpNeed} />
        <p className="streak"><Flame size={14} aria-hidden="true" /> серия {state.streak} дн.{state.shadowWinStreak > 0 && <small> · побед над Тенью подряд: {state.shadowWinStreak}</small>}</p>
      </header>

      <Arena state={state} image={img} />

      <section className="score" aria-label="Счёт">
        <div className="row" aria-live="polite">
          <span className={leader === 'me' ? 'me lead' : 'me'}>Ты {today.xp} XP</span>
          <span className={leader === 'shadow' ? 'sh lead' : 'sh'}>Тень {today.shadowXp} XP</span>
        </div>
        <div className="tug"><i style={{ left: `${share}%` }} /></div>
        {today.shadowMetrics.length > 0 && (
          <div className="mtr" aria-label="Тень по метрикам">
            {today.shadowMetrics.map(s => {
              const i = METRIC_INFO[s.metric]
              const pct = s.you === null || !(s.target > 0) ? 0 : s.lowerIsBetter ? (s.you <= s.target ? 100 : Math.max(0, s.target / s.you * 100)) : Math.min(100, s.you / s.target * 100)
              const n = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ru-RU')
              return (
                <div key={s.metric}>
                  {i.label}
                  <b>{s.you === null ? '—' : n(s.you)} / {s.lowerIsBetter ? 'не больше ' : ''}{n(s.target)}</b>
                  <div className="mini" role="progressbar" aria-label={i.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><i style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </section>
      {today.aiNote && <p className="muted center ai-note"><Bot size={14} aria-hidden="true" /> {today.aiNote}</p>}
      {fallback && <p className="muted center" role="status">ИИ недоступен — задания по правилам</p>}

      <section className="quests" aria-label="Задания на сегодня">
        <h2>Задания дня {today.busyUntil && <small className="muted">· занят до {today.busyUntil}</small>}</h2>
        {quests.length === 0 && today.started && (
          <button className="btn primary big" disabled={issuing} onClick={issue}>Получить задания</button>
        )}
        {!today.started && later && (
          <button className="btn primary big" onClick={() => setLater(false)}>Начать день</button>
        )}
        <ul>
          {(today.started || !later) && quests.map((q, i) => (
            <li key={q.id} className={`q${q.done ? ' done' : ''}`} style={{ '--i': i } as React.CSSProperties}>
              <StatIcon stat={q.stat} />
              <div className="t">
                <b>{q.title}</b>
                <small>{STATS[q.stat].name} · {q.window ? `${q.window.start}–${q.window.end}` : 'в течение дня'}</small>
              </div>
              <span className="xpchip">+{q.xp}</span>
              <button className="chk" disabled={q.done} aria-label={`Выполнить: ${q.title}`} onClick={() => complete(q.id, q.xp)}>
                {q.done && <Check size={20} aria-hidden="true" />}
              </button>
              {pop?.id === q.id && (
                <span key={pop.k} className="burst" aria-hidden="true">
                  <span className="float">+{pop.xp} XP</span>
                  {[0, 1, 2, 3, 4].map(n => <i key={n} className="spark" />)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {err && <p className="err" role="alert">{err}</p>}
      </section>

      <div className="actions">
        <button className="btn" onClick={() => setSheet('quick')}><Zap size={18} aria-hidden="true" /> Быстрый ввод</button>
        <button className="btn ghost" onClick={() => setSheet('busy')}><Hourglass size={18} aria-hidden="true" /> Занят до…</button>
        {!today.checkedIn && (
          <button className="btn primary" disabled={!checkinOpen} onClick={() => setSheet('checkin')}
            title={checkinOpen ? undefined : 'Доступен после 18:00 или когда все задания выполнены'}>
            <Moon size={18} aria-hidden="true" /> Чек‑ин
          </button>
        )}
      </div>
      {!today.checkedIn && !checkinOpen && <p className="muted center">Чек‑ин откроется в 18:00 или когда выполнишь все задания</p>}
      {today.checkedIn && <p className="ok center"><Check size={14} aria-hidden="true" /> Чек‑ин сделан</p>}

      {sheet === 'quick' && <QuickInput state={state} onClose={() => setSheet(null)} />}
      {sheet === 'busy' && <BusyUntil date={today.date} onClose={() => setSheet(null)} />}
      {sheet === 'checkin' && <Checkin date={today.date} onClose={() => setSheet(null)} />}
      {!today.started && !later && <MyDay state={state} profile={profile} onLater={() => setLater(true)} />}
    </div>
  )
}

function BusyUntil({ date, onClose }: { date: string; onClose: () => void }) {
  const [until, setUntil] = useState(() => fromMin(Math.ceil((toMin(hhmmNow()) + 60) / 15) * 15))
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dlg = useDialog<HTMLDivElement>(onClose)
  const save = async () => {
    if (!/^\d\d:\d\d$/.test(until)) return setErr('Укажи время')
    setSaving(true)
    try {
      await appendEvent({ type: 'busy_until', date, until })
      onClose()
    } catch {
      setErr('Не удалось сохранить, попробуй ещё раз')
      setSaving(false)
    }
  }
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="busy-title">
        <div className="sheet-head">
          <h2 id="busy-title">Занят до…</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        <p className="muted">Невыполненные задания переедут на свободное время после этого часа.</p>
        <label className="field">Время<input type="time" value={until} onChange={e => setUntil(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary big" disabled={saving} onClick={save}>Сохранить</button>
      </div>
    </div>
  )
}
