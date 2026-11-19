import { useRef, useState } from 'react'
import { Briefcase, Palmtree, Clock } from 'lucide-react'
import { appendEvents, setSetting } from '../db'
import { getAiConfig } from '../ai/config'
import { aiQuestTexts, applyTexts } from '../ai/tasks'
import { getSyncConfig, syncNow } from '../sync'
import { loadState } from '../useGame'
import type { Win } from '../domain/schedule'
import type { GameState, Profile, Quest } from '../domain/types'
import { hhmmNow } from '../now'
import { useDialog } from '../ui/useDialog'
import { generateWeeklyQuests } from '../domain/weekly'
import { BALANCE } from '../domain/balance'
import { legacyDayType } from '../domain/dayType'
import { buildQuests } from './issue'

/** Модальное «Мой день»: выбор режима дня → day_started, затем выдача заданий (если их ещё нет). */
export default function MyDay({ state, profile, onLater }: { state: GameState; profile: Profile; onLater: () => void }) {
  const [custom, setCustom] = useState(false)
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const lock = useRef(false)
  const dlg = useDialog<HTMLDivElement>() // закрывается только «Позже»: лист перекрывает панель вкладок

  const begin = async (work: Win | null) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      const wakeAt = hhmmNow()
      const date = state.today.date
      // первое устройство выдаёт задания: подтянуть чужие события и смотреть уже свежее состояние
      let cur = state
      try {
        if (await getSyncConfig()) {
          let timer: ReturnType<typeof setTimeout> | undefined
          await Promise.race([syncNow().catch(() => null), new Promise((r) => { timer = setTimeout(r, 4000) })])
          clearTimeout(timer)
          cur = await loadState()
        }
      } catch { /* синк не должен мешать началу дня */ }
      // тип дня синтезируется из выбора смены (полноценный выбор типа — позже)
      const dayType = legacyDayType(work, wakeAt, profile.sleep)
      // сначала сборка по правилам (+ тексты ИИ), потом одна атомарная запись — день не останется без заданий
      let quests: Quest[] | null = null
      if (cur.today.quests.length === 0) {
        const energy = cur.today.lastEnergy !== null ? cur.today.lastEnergy * 10 : BALANCE.energy.fallback
        quests = buildQuests(cur, dayType, wakeAt, energy)
        const cfg = await getAiConfig().catch(() => null)
        if (cfg) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            const texts = await Promise.race([aiQuestTexts(cfg, cur, quests),
              new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), 25_000) })])
            quests = applyTexts(quests, texts)
          } catch { await setSetting('aiFallback', date).catch(() => {}) } // тихо на тексты правил; пометку покажет Home
          clearTimeout(timer)
        }
      }
      await appendEvents([
        { type: 'day_started', date, work, wakeAt, dayType },
        ...(cur.weekly.quests.length === 0
          ? [{ type: 'weekly_issued' as const, weekStart: cur.weekly.weekStart, quests: generateWeeklyQuests(cur.genWeekly) }] : []),
        ...(quests ? [{ type: 'quests_issued' as const, date, quests }] : []),
      ])
    } catch {
      setErr('Не удалось начать день, попробуй ещё раз')
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <div className="sheet-wrap">
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="myday-title">
        <h2 id="myday-title">Мой день</h2>
        <p className="muted">Какой сегодня день? Задания подстроятся под расписание.</p>
        <div className="stack">
          {profile.workTemplates.map((t, i) => (
            <button key={i} className="btn day-card" disabled={busy} onClick={() => begin({ start: t.start, end: t.end })}>
              <Briefcase size={22} aria-hidden="true" /> <span>{t.label}</span> <small>{t.start}–{t.end}</small>
            </button>
          ))}
          <button className="btn day-card" disabled={busy} onClick={() => begin(null)}><Palmtree size={22} aria-hidden="true" /> <span>Выходной</span></button>
          <button className="btn day-card ghost" disabled={busy} aria-expanded={custom} onClick={() => setCustom(!custom)}><Clock size={22} aria-hidden="true" /> <span>Другое время</span></button>
          {custom && (
            <div className="row">
              <label className="field">С<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
              <label className="field">До<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
            </div>
          )}
          {custom && (
            <button className="btn primary" disabled={busy || !start || !end || start === end} onClick={() => begin({ start, end })}>
              Начать день
            </button>
          )}
        </div>
        <p role="status" className="muted">{busy ? 'Подбираю задания… это может занять до 30 секунд' : ''}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn ghost" disabled={busy} onClick={onLater}>Позже</button>
      </div>
    </div>
  )
}
