import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { appendEvent, getSetting, setSetting } from '../db'
import { ACHIEVEMENTS } from '../domain/achievements'
import { addDays, fromMin, gameDate, toMin } from '../domain/day'
import type { DataFlag, DayQuest, GameState, Profile } from '../domain/types'
import { hhmmNow, now } from '../now'
import { imageNameFor, PHOTO_ERROR_TEXT, shrinkImage } from '../ai/avatar'
import { saveBlob, useBlobUrl } from '../blobs'
import { Bed, Bot, Check, Gem, Hourglass, NotebookPen, Moon, PenLine, Shuffle, Timer as TimerIcon, TriangleAlert, Zap, X } from 'lucide-react'
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
import Recovery from './Recovery'
import Timer, { readRunning, type TimerKind } from './Timer'
import { autoHint, bannerKey, VITAL_LABEL, type VitalId } from '../ui/vitalsView'
import { battleSeen, markBattleSeen, ritualChip } from '../ui/gameView'
import BattleSheet from '../ui/BattleSheet'
import { QuestAbility, QuestAbility2 } from '../ui/ClassCard'
import { questAbility, questAbility2 } from '../ui/skillView'
import SeasonPath from './SeasonPath'
import { getAiConfig } from '../ai/config'
import { aiWeeklyReport } from '../ai/tasks'
import { weekReportOf } from '../domain/masterReport'
import { cosmeticById } from '../domain/cosmetics'
import { monthCard, monthTitle, type CardModel } from '../domain/card'
import { seasonOf } from '../domain/calendar'
import CardSheet, { SeasonFinale } from './CardSheet'
import MonthReview from './MonthReview'
import { CalendarCheck, Image as ImageIcon, Trophy } from 'lucide-react'

type Sheet = null | 'quick' | 'busy' | 'checkin' | 'changed' | 'custom' | 'timer' | 'recovery' | 'season' | VitalId

// «Позже» на «Мой день» — до перезапуска приложения (переживает переключение вкладок)
let deferredDay = false

export default function Home({ state, profile, go, interview }: { state: GameState; profile: Profile; go: Go; interview: () => void }) {
  const { today } = state
  const img = useBlobUrl(imageNameFor(state.avatarImages, state.tier))
  const [sheet, setSheet] = useState<Sheet>(null)
  const [timerKind, setTimerKind] = useState<TimerKind>('focus')
  const openTimer = (k: TimerKind) => { setTimerKind(k); setSheet('timer') }
  const timerOn = sheet === null ? readRunning() : null // перечитываем после закрытия листа
  const [hideBanner, setHideBanner] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  // «Вернуться» из баннера: дата — игровая (тап между полуночью и закрытием дня не теряется)
  const leaveRecovery = async () => {
    if (leaving) return
    setLeaving(true)
    setErr(null)
    try { await appendEvent({ type: 'recovery_ended', date: today.date }) } catch { setErr('Не удалось сохранить, попробуй ещё раз') } finally { setLeaving(false) }
  }
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
  const [toast, setToast] = useState<{ text: string; ids: string[]; kind: string } | null>(null)
  useEffect(() => {
    let off = false
    void (async () => {
      const seen = await getSetting<string[]>('seenAchievements', [])
      const fresh = state.achievements.filter(a => a.date === today.date && !seen.includes(a.id))
      // ступени пути сезона, полученные сегодня (id как у строки леджера path:<сезон>:<ступень>) — в том же списке «показано»
      const pathId = (step: number) => `path:${state.season.id}:${step}`
      const steps = state.season.rewards.filter(r => r.date === today.date && !seen.includes(pathId(r.step)))
      if (off || (!fresh.length && !steps.length)) return
      const text = fresh.length ? fresh.map(a => ACHIEVEMENTS.find(d => d.id === a.id)?.title ?? a.id).join(' · ')
        : steps.map(r => [`Ступень ${r.step} — +${r.gold} золота`, ...r.items.map(id => cosmeticById(id)?.title ?? id)].join(', ')).join(' · ')
      const ids = fresh.length ? fresh.map(a => a.id) : steps.map(r => pathId(r.step))
      setToast(prev => prev?.text === text ? prev : { text, ids, kind: fresh.length ? 'ДОСТИЖЕНИЕ' : 'ПУТЬ СЕЗОНА' })
    })().catch(() => {})
    return () => { off = true }
  }, [state.achievements, state.season.rewards, state.season.id, today.date])
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
  // ритуал — честное слово за игровую дату
  const ritual = (id: string) => guarded(`rit:${id}`, 'Не удалось отметить ритуал, попробуй ещё раз', async () => {
    await appendEvent({ type: 'ritual_done', ladderId: id, date: today.date })
    return true
  })
  const rituals = state.ladders.filter(l => l.status === 'active' || l.status === 'auto')
  const battle = state.shadow.lastBattle
  const [battleOpen, setBattleOpen] = useState(() => !!battle && !battleSeen(battle.date))
  useEffect(() => { if (battle && !battleSeen(battle.date)) setBattleOpen(true) }, [battle?.date]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeBattle = () => { if (battle) markBattleSeen(battle.date); setBattleOpen(false) }
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
  const ctxNow = () => {
    const wakeAt = today.wakeAt ?? hhmmNow()
    return assembleCtx(state, today.dayType ?? legacyDayType(today.work, wakeAt, profile.sleep), wakeAt, today.energy ?? BALANCE.energy.fallback)
  }
  const [abQuest, setAbQuest] = useState<DayQuest | null>(null)
  const [ab2Quest, setAb2Quest] = useState<DayQuest | null>(null)
  const rerollOne = async (q: DayQuest) => {
    const r = rerollCandidate(ctxNow(), q, today.quests)
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
      <div role="status">{toast && <div className="toast" onClick={() => void dismiss()}><Gem size={22} aria-hidden="true" /><span><small>{toast.kind}</small>{toast.text}</span></div>}</div>
      <HeroStage state={state} profile={profile} image={img}
        cta={!today.started ? 'Начать день' : remaining > 0 ? `Задания дня · осталось ${remaining}` : null}
        onCta={() => (!today.started ? setLater(false) : document.getElementById('quests')?.scrollIntoView({ behavior: 'smooth' }))}
        onVital={id => setSheet(id)} onSyncHelp={() => go('Настройки', 'sync-panel')} onPath={() => setSheet('season')} />
      <Banner state={state} hidden={hideBanner} onHide={setHideBanner} busy={leaving}
        onRecovery={() => setSheet('recovery')} onLeave={() => void leaveRecovery()} onChangeDay={() => setSheet('changed')} />
      {state.recovery.active && (
        <div className="glass tavern">
          <Bed size={22} aria-hidden="true" />
          <span><b>Отдых в таверне</b><small>{state.recovery.frozenToday ? 'Серия заморожена' : 'Лимит отдыха исчерпан — день не заморожен'} · заданий: {state.recovery.quests}</small></span>
          <button className="btn sm" onClick={() => setSheet('recovery')}>Режим</button>
        </div>
      )}
      {!img && <PhotoCta go={go} />}
      <PeriodCards state={state} />
      <WeekReport state={state} />
      {!state.character && !ivwSeen && <InterviewCta onStart={() => { hideIvw(); interview() }} onLater={hideIvw} />}

      {today.aiNote && <p className="muted center ai-note"><Bot size={14} aria-hidden="true" /> {today.aiNote}</p>}
      {fallback && <p className="muted center" role="status">ИИ недоступен — задания по правилам</p>}

      {rituals.length > 0 && (
        <section className="rituals" aria-label="Ритуалы">
          <h2>Ритуалы</h2>
          <ul>{rituals.map(l => {
            const c = ritualChip(l), on = c.state === 'done' || c.state === 'auto'
            return (
              <li key={l.id}>
                <button className={`ritual ${c.state}`} aria-pressed={on} disabled={on || c.state === 'later' || busyIds.has(`rit:${l.id}`)}
                  aria-label={`${c.text}, ${c.sub}${c.state === 'auto' ? ', засчитано по данным' : c.state === 'later' ? ', отметь в вечернем чек-ине' : on ? ', выполнено' : ''}`}
                  onClick={() => void ritual(l.id)}>
                  <span className="rd" aria-hidden="true">{on && <Check size={16} />}</span>
                  <span className="rt"><b>{c.text}</b><small>{c.state === 'auto' ? 'авто · ' : ''}{c.state === 'later' ? 'засчитается вечером · ' : ''}{c.sub}</small></span>
                </button>
              </li>
            )
          })}</ul>
        </section>
      )}

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
              hint={autoHint(q, today.data)}
              ability={questAbility(state, q) ? { name: state.cls.ability.name, onUse: () => setAbQuest(q) } : null}
              ability2={questAbility2(state, q) ? { name: state.cls.advanced!.ability.name, onUse: () => setAb2Quest(q) } : null}
              onTimer={!q.done && (q.templateId === 'focus' || q.templateId === 'read') ? () => openTimer(q.templateId === 'read' ? 'reading' : 'focus') : null}
              onDone={() => void complete(q.id)} onPhoto={f => void photo(q.id, f)} onReroll={() => void reroll(q)} />
          ))}
        </ul>
        {err && <p className="err" role="alert">{err}</p>}
      </section>

      <div className="actions">
        <button className="btn" onClick={() => setSheet('quick')}><Zap size={18} aria-hidden="true" /> Быстрый ввод</button>
        <button className="btn ghost" onClick={() => setSheet('busy')}><Hourglass size={18} aria-hidden="true" /> Занят до…</button>
        <button className="btn ghost" onClick={() => openTimer(timerOn ? timerOn.timer : 'focus')}>
          <TimerIcon size={18} aria-hidden="true" /> {timerOn ? 'Таймер · идёт' : 'Таймер'}
        </button>
        {!state.recovery.active && <button className="btn ghost" onClick={() => setSheet('recovery')}><Bed size={18} aria-hidden="true" /> Отдых</button>}
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
      {sheet === 'checkin' && <Checkin state={state} onClose={() => setSheet(null)} />}
      {battle && battleOpen && (today.started || later) && <BattleSheet battle={battle} avatar={state.avatar} tier={state.tier} onClose={closeBattle} />}
      {sheet === 'changed' && <DayChanged state={state} onClose={() => setSheet(null)} />}
      {sheet === 'custom' && <CustomQuest state={state} onClose={() => setSheet(null)} />}
      {sheet === 'timer' && <Timer initial={timerKind} onClose={() => setSheet(null)} />}
      {ab2Quest && state.cls.advanced && <QuestAbility2 state={state} q={ab2Quest} onClose={() => setAb2Quest(null)} />}
      {abQuest && <QuestAbility state={state} q={abQuest} ctx={ctxNow} onClose={() => setAbQuest(null)} />}
      {sheet === 'season' && <SeasonPath state={state} onClose={() => setSheet(null)} />}
      {sheet === 'recovery' && <Recovery state={state} onClose={() => setSheet(null)} />}
      {(sheet === 'hp' || sheet === 'energy' || sheet === 'focus' || sheet === 'fatigue') && <VitalInfo id={sheet} state={state} onClose={() => setSheet(null)} />}
      {!today.started && !later && <MyDay state={state} onLater={() => setLater(true)} />}
    </div>
  )
}

const seenKey = (id: string) => `periodSeen:${id}`
const isSeen = (id: string) => { try { return localStorage.getItem(seenKey(id)) === '1' } catch { return false } }
const markPeriodSeen = (id: string) => { try { localStorage.setItem(seenKey(id), '1') } catch { /* не критично */ } }

/** Карточки периода (спека §6, §9, §10): карточка месяца 1–7 числа, итоги сезона, итоги месяца в точке решения. Скрытие — на этом устройстве. */
function PeriodCards({ state }: { state: GameState }) {
  const today = state.today.date, R = BALANCE.rival
  const [, bump] = useState(0)
  const [open, setOpen] = useState<null | { kind: 'card'; model: CardModel; name: string } | { kind: 'season'; id: string } | { kind: 'review'; month: string }>(null)
  const prevMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7)
  const mc = +today.slice(8) <= R.cardDays ? monthCard(state, prevMonth) : null
  const s = state.season, prev = seasonOf(addDays(s.start, -1))
  const finale = s.kind !== 'prologue' && today === s.end ? s : prev.kind !== 'prologue' && today <= addDays(prev.end, R.cardDays) ? prev : null
  const decision = today >= R.decisionDate && today <= addDays(R.decisionDate, R.cardDays) ? R.decisionDate.slice(0, 7) : null
  const items = [
    ...(mc ? [{ id: `month:${prevMonth}`, Icon: ImageIcon, text: `Твоя карточка за ${monthTitle(prevMonth).split(' ')[0]}`, go: () => setOpen({ kind: 'card', model: mc, name: `card-${prevMonth}.png` }) }] : []),
    ...(finale ? [{ id: `season:${finale.id}`, Icon: Trophy, text: `Итоги сезона «${finale.name}»`, go: () => setOpen({ kind: 'season', id: finale.id }) }] : []),
    ...(decision ? [{ id: `review:${decision}`, Icon: CalendarCheck, text: `Итоги месяца: ${monthTitle(decision).split(' ')[0]}`, go: () => setOpen({ kind: 'review', month: decision }) }] : []),
  ].filter(x => !isSeen(x.id))
  return (
    <>
      {items.map(x => (
        <div key={x.id} className="glass period-card">
          <x.Icon size={22} aria-hidden="true" />
          <button className="link grow" onClick={x.go}>{x.text}</button>
          <button className="icon-btn" aria-label={`Скрыть: ${x.text}`} onClick={() => { markPeriodSeen(x.id); bump(n => n + 1) }}><X size={18} aria-hidden="true" /></button>
        </div>
      ))}
      {open?.kind === 'card' && <CardSheet model={open.model} name={open.name} onClose={() => setOpen(null)} />}
      {open?.kind === 'season' && <SeasonFinale state={state} seasonId={open.id} onClose={() => setOpen(null)} />}
      {open?.kind === 'review' && <MonthReview state={state} month={open.month} onClose={() => setOpen(null)} />}
    </>
  )
}

/** «Разбор недели» в воскресенье (текущая) и понедельник (прошлая): ИИ-текст, если есть, иначе правила; с ключом ИИ — одна генерация за открытие. */
function WeekReport({ state }: { state: GameState }) {
  const dow = new Date(`${state.today.date}T00:00:00Z`).getUTCDay()   // 0 — воскресенье, 1 — понедельник
  const show = dow === 0 || dow === 1
  const r = show ? weekReportOf(state) : null
  const tried = useRef<string | null>(null)
  const [gen, setGen] = useState(false)
  useEffect(() => {
    const redo = dow === 1 && r?.ai && !r.final   // понедельник: предварительный воскресный отчёт пересобираем один раз
    if (!r || (r.ai && !redo) || tried.current === r.weekStart) return
    tried.current = r.weekStart   // защита от двойного запуска: одна попытка за открытие Главной
    let on = true
    void (async () => {
      const cfg = await getAiConfig()
      if (!on) return
      if (!cfg && redo) { try { await appendEvent({ type: 'ai_report', weekStart: r.weekStart, text: r.text, final: true }) } catch { /* повтор при следующем открытии */ } return }
      if (!cfg) return
      setGen(true)
      try { await appendEvent({ type: 'ai_report', weekStart: r.weekStart, text: await aiWeeklyReport(cfg, state, r.weekStart), final: dow === 1 }) }
      catch { /* остаётся текст правил */ }
      finally { if (on) setGen(false) }
    })().catch(() => {})
    return () => { on = false }
  }, [r?.weekStart, r?.ai, r?.final]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null
  const [first, ...rest] = r.text.split(/\n\n/)
  return (
    <section className="glass week-report" aria-label="Разбор недели">
      <h2><NotebookPen size={18} aria-hidden="true" /> Разбор недели <small className="muted">с {r.weekStart.slice(8, 10)}.{r.weekStart.slice(5, 7)} · {r.ai ? 'Мастер (ИИ)' : 'по правилам'}</small></h2>
      <p aria-live="polite" className="muted">{gen ? 'Мастер пишет разбор…' : ''}</p>
      <p className="rep">{first}</p>
      {rest.length > 0 && <details><summary>Читать полностью</summary><p className="rep">{rest.join('\n\n')}</p></details>}
    </section>
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

const FLAG_TEXT: Record<DataFlag['reason'], string> = {
  too_many_steps: 'Шагов больше, чем правдоподобно — проверь источник в «Командах»',
  too_long_sleep: 'Сон длиннее, чем правдоподобно — проверь «Здоровье»',
  overlap: 'Тренировки пересекаются — время посчитано без двойного счёта',
}

/** Один баннер по приоритету: today.suggest, иначе пометка правдоподобия данных. */
function Banner({ state, hidden, onHide, busy, onRecovery, onLeave, onChangeDay }: {
  state: GameState; hidden: string | null; onHide: (key: string) => void; busy: boolean
  onRecovery: () => void; onLeave: () => void; onChangeDay: () => void
}) {
  const { suggest, data, vitals } = state.today
  const lowHp = vitals.hp !== null && vitals.hp < BALANCE.recovery.enterHp
  const b = suggest === 'recovery_enter' ? { text: `Мастер предлагает режим восстановления: ${lowHp ? `HP ${vitals.hp}` : `Усталость ${vitals.fatigue}`}`, act: 'Включить режим', go: onRecovery }
    : suggest === 'recovery_exit' ? { text: 'Силы вернулись — HP держится уже два дня. Пора из таверны?', act: 'Вернуться', go: onLeave }
    : suggest === 'day_change_work' ? { text: 'Похоже, ты на работе — сменить тип дня?', act: 'Сменить тип дня', go: onChangeDay }
    : data.flags[0] ? { text: FLAG_TEXT[data.flags[0].reason], act: null, go: null }
    : null
  const key = bannerKey(state.today)
  if (!b || hidden === key) return null
  return (
    <div className="glass banner" role="status">
      <TriangleAlert size={20} aria-hidden="true" />
      <p>{b.text}</p>
      {b.act && b.go && <button className="btn primary sm" disabled={busy} onClick={b.go}>{b.act}</button>}
      <button className="icon-btn" aria-label="Скрыть подсказку" onClick={() => key && onHide(key)}><X size={18} aria-hidden="true" /></button>
    </div>
  )
}

const PART_LABEL: Record<string, string> = { sleep: 'Сон', steps: 'Шаги', rhr: 'Пульс', feel: 'Самочувствие', focus: 'Фокусирование', social: 'Соцсети' }

/** Разбор параметра HUD: из чего он сложился сегодня. */
function VitalInfo({ id, state, onClose }: { id: VitalId; state: GameState; onClose: () => void }) {
  const v = state.today.vitals, ei = v.energyInputs
  const dlg = useDialog<HTMLDivElement>(onClose)
  const parts = (p: Record<string, number | undefined>) => Object.entries(p).filter(([, x]) => x !== undefined).map(([k, x]) => `${PART_LABEL[k] ?? k} ${x}`).join(' · ')
  const body = id === 'hp' ? parts(v.parts.hp) || 'Нет данных: нужны сон, шаги или пульс из «Команд», либо вечерний чек‑ин'
    : id === 'focus' ? parts(v.parts.focus) || 'Нет данных: включай «Фокусирование» через «Команды» или запусти таймер'
    : id === 'energy' ? [ei.sleep !== null && `Сон ночью ${Math.round(ei.sleep * 10) / 10} ч`, ei.hp !== null && `HP ${ei.hp}`, ei.weekMorning !== null && `Утро в среднем ${Math.round(ei.weekMorning * 10) / 10}/10`]
      .filter(Boolean).join(' · ') || 'Нет данных: оцени утро в «Моём дне»'
    : `Растёт от коротких ночей и тяжёлых дней, спадает от долгого сна и отдыха. С ${BALANCE.vitals.fatigue.suggestAt} Мастер предложит режим восстановления.`
  return (
    <div className="sheet-wrap" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="vital-title">
        <div className="sheet-head">
          <h2 id="vital-title">{VITAL_LABEL[id]}: {v[id] ?? '—'}</h2>
          <button className="icon-btn" aria-label="Закрыть" onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <p>{body}</p>
      </div>
    </div>
  )
}
