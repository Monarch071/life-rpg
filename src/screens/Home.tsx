import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { appendEvent, getSetting, setSetting } from '../db'
import { ACHIEVEMENTS } from '../domain/achievements'
import { fromMin, gameDate, toMin } from '../domain/day'
import type { DayQuest, GameState, Profile } from '../domain/types'
import { hhmmNow, now } from '../now'
import { imageNameFor, PHOTO_ERROR_TEXT, shrinkImage } from '../ai/avatar'
import { saveBlob, useBlobUrl } from '../blobs'
import { Bot, Check, Gem, Hourglass, Moon, PenLine, Shuffle, Zap, X } from 'lucide-react'
import HeroStage from '../ui/HeroStage'
import HeroExtras from '../ui/HeroExtras'
import QuestCard from '../ui/QuestCard'
import { PhotoCta, type Go } from './AvatarAi'
import { InterviewCta } from './Interview'
import { useDialog } from '../ui/useDialog'
import { rerollCandidate } from '../domain/assemble'
import { assembleCtx, buildQuests } from './issue'
import { BALANCE } from '../domain/balance'
import { legacyDayType } from '../domain/dayType'
import Checkin from './Checkin'
import CustomQuest from './CustomQuest'
import DayChanged from './DayChanged'
import MyDay from './MyDay'
import QuickInput from './QuickInput'
import { replanToday } from './replan'

type Sheet = null | 'quick' | 'busy' | 'checkin' | 'changed' | 'custom'

// «Позже» на «Мой день» — до перезапуска приложения (переживает переключение вкладок)
let deferredDay = false

export default function Home({ state, profile, go, interview }: { state: GameState; profile: Profile; go: Go; interview: () => void }) {
  const { today } = state
  const img = useBlobUrl(imageNameFor(state.avatarImages, state.tier))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pop, setPop] = useState<{ id: string; k: number } | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const pending = useRef(new Set<string>())
  const [issuing, setIssuing] = useState(false)
  const [later, setLaterState] = useState(deferredDay)
  const [fallback, setFallback] = useState(false)
  useEffect(() => { getSetting('aiFallback', '').then(d => setFallback(d === today.date)).catch(() => {}) }, [today.date, today.started])
  const setLater = (v: boolean) => { deferredDay = v; setLaterState(v) }
  const ivwSeen = useLiveQuery(() => getSetting('seenInterviewPrompt', false)) ?? true // плашка анкеты — один раз
  const hideIvw = () => void setSetting('seenInterviewPrompt', true).catch(() => {})
  useEffect(() => { pending.current.clear() }, [today.date])

  // новое достижение: полученное сегодня и ещё не показанное на этом устройстве
  const [toast, setToast] = useState<{ text: string; ids: string[] } | null>(null)
  useEffect(() => {
    let off = false
    void (async () => {
      const seen = await getSetting<string[]>('seenAchievements', [])
      const fresh = state.achievements.filter(a => a.date === today.date && !seen.includes(a.id))
      if (off || !fresh.length) return
      const text = fresh.map(a => ACHIEVEMENTS.find(d => d.id === a.id)?.title ?? a.id).join(' · ')
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
      const wakeAt = today.wakeAt ?? hhmmNow()
      const quests = buildQuests(state, today.dayType ?? legacyDayType(today.work, wakeAt, profile.sleep), wakeAt, today.energy ?? BALANCE.energy.fallback)
      await appendEvent({ type: 'quests_issued', date: today.date, quests })
    } catch {
      setErr('Не удалось получить задания, попробуй ещё раз')
    } finally {
      setIssuing(false)
    }
  }

  const quests = useMemo(() => {
    const qs = replanToday(today, hhmmNow(), profile)
    const key = (w: { start: string } | null) => (w ? (toMin(w.start) - toMin(today.wakeAt ?? profile.wake) + 1440) % 1440 : 1e9)
    return [...qs].sort((a, b) => key(a.window) - key(b.window))
  }, [today, profile])

  // одно действие на задание за раз; игровые сутки сменились — не пишем (иначе «+XP» потом исчезнет), а пересчитываем день.
  // act → true: задание закрыто, остаётся заблокированным до смены дня
  const guarded = async (id: string, fail: string, act: () => Promise<boolean>) => {
    if (pending.current.has(id)) return
    if (now() >= today.closesAt) return void document.dispatchEvent(new Event('visibilitychange'))
    pending.current.add(id)
    setErr(null)
    setBusyIds(new Set(pending.current))
    let keep = false
    try { keep = await act() } catch (e) { setErr(e instanceof Error && e.message === PHOTO_ERROR_TEXT ? PHOTO_ERROR_TEXT : fail) }
    if (!keep) pending.current.delete(id)
    setBusyIds(new Set(pending.current))
  }
  const celebrate = (id: string) => {
    setPop({ id, k: Date.now() })
    setTimeout(() => setPop(p => (p?.id === id ? null : p)), 1200)
    return true
  }
  const complete = (id: string) => guarded(id, 'Не удалось отметить задание, попробуй ещё раз', async () => {
    await appendEvent({ type: 'quest_completed', date: today.date, questId: id })
    return celebrate(id)
  })
  // фото хранится только на этом устройстве (proof-*): синк его не выгружает
  const photo = (id: string, f: File) => guarded(id, 'Не удалось сохранить фото, попробуй ещё раз', async () => {
    const blob = await shrinkImage(f).catch(() => { throw new Error(PHOTO_ERROR_TEXT) })
    const name = `proof-${crypto.randomUUID()}`
    await saveBlob(name, blob)
    await appendEvent({ type: 'quest_completed', date: today.date, questId: id, verify: 'photo', photo: name })
    return celebrate(id)
  })
  const rerollable = (q: DayQuest) => !q.done && !q.legacy && !q.dropped && (q.kind === 'daily' || q.kind === 'challenge')
  const cost = today.nextRerollCost
  // платный переброс — только из золота прошлых дней (spendable), как его проверяет replay
  const rerollInfo = { label: cost ? String(cost) : 'бесплатно', off: cost > today.spendable ? `мало золота (${today.spendable})` : null }
  // один переброс в полёте на все задания: цена и занятые шаблоны устаревают до перезагрузки состояния
  const rerollRef = useRef(false)
  const [rerolling, setRerolling] = useState(false)
  useEffect(() => { rerollRef.current = false; setRerolling(false) }, [today.rerollsUsed])
  const reroll = (q: DayQuest) => {
    if (rerollRef.current || pending.current.has(q.id)) return
    rerollRef.current = true
    setRerolling(true)
    const free = () => { rerollRef.current = false; setRerolling(false) }
    return guarded(q.id, 'Не удалось перебросить, попробуй ещё раз', async () => {
      try { await rerollOne(q) } finally { free() }
      return false
    })
  }
  const rerollOne = async (q: DayQuest) => {
    const wakeAt = today.wakeAt ?? hhmmNow()
    const ctx = assembleCtx(state, today.dayType ?? legacyDayType(today.work, wakeAt, profile.sleep), wakeAt, today.energy ?? BALANCE.energy.fallback)
    const r = rerollCandidate(ctx, q, today.quests)
    if (!r) { setErr('Замены того же ранга нет'); return }
    await appendEvent({ type: 'quest_rerolled', date: today.date, questId: q.id, replacement: r })
  }

  const allDone = today.quests.length > 0 && today.quests.every(q => q.done || q.dropped)
  const hour = new Date(now()).getHours()
  const checkinOpen = allDone || hour >= 18 || gameDate(now(), 0) !== today.date // после полуночи игровой день ещё вчерашний
  const remaining = today.quests.filter(q => !q.done && !q.dropped).length
  const customFull = today.customCount >= BALANCE.custom.perDay

  return (
    <div className="home">
      <div role="status">{toast && <div className="toast" onClick={() => void dismiss()}><Gem size={22} aria-hidden="true" /><span><small>ДОСТИЖЕНИЕ</small>{toast.text}</span></div>}</div>
      <HeroStage state={state} profile={profile} image={img}
        cta={!today.started ? 'Начать день' : remaining > 0 ? `Задания дня · осталось ${remaining}` : null}
        onCta={() => (!today.started ? setLater(false) : document.getElementById('quests')?.scrollIntoView({ behavior: 'smooth' }))} />
      {!img && <PhotoCta go={go} />}
      {!state.character && !ivwSeen && <InterviewCta onStart={() => { hideIvw(); interview() }} onLater={hideIvw} />}

      {today.aiNote && <p className="muted center ai-note"><Bot size={14} aria-hidden="true" /> {today.aiNote}</p>}
      {fallback && <p className="muted center" role="status">ИИ недоступен — задания по правилам</p>}

      <section className="quests" id="quests" aria-label="Задания на сегодня">
        <h2>Задания дня {today.busyUntil && <small className="muted">· занят до {today.busyUntil}</small>}</h2>
        {quests.length === 0 && today.started && (
          <button className="btn primary big" disabled={issuing} onClick={issue}>Получить задания</button>
        )}
        {!today.started && later && (
          <button className="btn primary big" onClick={() => setLater(false)}>Начать день</button>
        )}
        <ul>
          {(today.started || !later) && quests.map((q, i) => (
            <QuestCard key={q.id} q={q} i={i} pop={pop?.id === q.id ? pop.k : null} busy={busyIds.has(q.id)}
              reroll={rerollable(q) ? { ...rerollInfo, off: rerolling ? 'подожди…' : rerollInfo.off } : null}
              onDone={() => void complete(q.id)} onPhoto={f => void photo(q.id, f)} onReroll={() => void reroll(q)} />
          ))}
        </ul>
        {err && <p className="err" role="alert">{err}</p>}
      </section>

      <div className="actions">
        <button className="btn" onClick={() => setSheet('quick')}><Zap size={18} aria-hidden="true" /> Быстрый ввод</button>
        <button className="btn ghost" onClick={() => setSheet('busy')}><Hourglass size={18} aria-hidden="true" /> Занят до…</button>
        {today.started && <>
          <button className="btn ghost" onClick={() => setSheet('changed')}><Shuffle size={18} aria-hidden="true" /> День изменился</button>
          <button className="btn ghost" disabled={customFull} aria-describedby={customFull ? 'custom-full' : undefined} onClick={() => setSheet('custom')}>
            <PenLine size={18} aria-hidden="true" /> Своё задание
          </button>
        </>}
        {!today.checkedIn && (
          <button className="btn primary" disabled={!checkinOpen} onClick={() => setSheet('checkin')}
            title={checkinOpen ? undefined : 'Доступен после 18:00 или когда все задания выполнены'}>
            <Moon size={18} aria-hidden="true" /> Чек‑ин
          </button>
        )}
      </div>
      {today.started && customFull && <p className="muted center" id="custom-full">Своих заданий сегодня уже {BALANCE.custom.perDay} — это максимум</p>}
      {!today.checkedIn && !checkinOpen && <p className="muted center">Чек‑ин откроется в 18:00 или когда выполнишь все задания</p>}
      {today.checkedIn && <p className="ok center"><Check size={14} aria-hidden="true" /> Чек‑ин сделан</p>}

      <HeroExtras state={state} />

      {sheet === 'quick' && <QuickInput state={state} onClose={() => setSheet(null)} />}
      {sheet === 'busy' && <BusyUntil date={today.date} onClose={() => setSheet(null)} />}
      {sheet === 'checkin' && <Checkin date={today.date} onClose={() => setSheet(null)} />}
      {sheet === 'changed' && <DayChanged state={state} onClose={() => setSheet(null)} />}
      {sheet === 'custom' && <CustomQuest state={state} onClose={() => setSheet(null)} />}
      {!today.started && !later && <MyDay state={state} onLater={() => setLater(true)} />}
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
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="muted">Невыполненные задания переедут на свободное время после этого часа.</p>
        <label className="field">Время<input type="time" value={until} onChange={e => setUntil(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary big" disabled={saving} onClick={save}>Сохранить</button>
      </div>
    </div>
  )
}
