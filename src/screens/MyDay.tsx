import { useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import { appendEvents, setSetting } from '../db'
import { getAiConfig } from '../ai/config'
import { aiQuestTexts, applyTexts } from '../ai/tasks'
import { getSyncConfig, syncNow } from '../sync'
import { loadState } from '../useGame'
import { closeMinutes, closesAtTs, type DayType } from '../domain/dayType'
import { addDays, weekStart } from '../domain/day'
import type { GameState, Quest } from '../domain/types'
import { hhmmNow, now } from '../now'
import { useDialog } from '../ui/useDialog'
import { generateWeeklyQuests } from '../domain/weekly'
import { BALANCE } from '../domain/balance'
import { energyScore } from '../domain/vitals'
import { DAY_ICONS } from '../ui/icons'
import { buildQuests } from './issue'

/** Модальное «Мой день»: тип дня и (необязательно) утренняя энергия → day_started, затем выдача заданий (если их ещё нет). */
export default function MyDay({ state, onLater }: { state: GameState; onLater: () => void }) {
  const [energy, setEnergy] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const lock = useRef(false)
  const dlg = useDialog<HTMLDivElement>() // закрывается только «Позже»: лист перекрывает панель вкладок

  const begin = async (dayType: DayType) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      const wakeAt = hhmmNow()
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
      // выбранный тип уже закрылся бы (01:30 при «Дневной смене») — начинаем следующую игровую дату, иначе replay отклонит старт
      const next = now() >= closesAtTs(cur.today.date, closeMinutes(dayType))
      const date = next ? addDays(cur.today.date, 1) : cur.today.date
      if (next) cur = { ...cur, today: { ...cur.today, date, quests: [] } }
      const work = dayType.busy
      // сначала сборка по правилам (+ тексты ИИ), потом одна атомарная запись — день не останется без заданий
      let quests: Quest[] | null = null
      // утренняя Energy пишется в day_started (целое 1–10, как его принимает replay) — переброс и Home берут её, а не поздний чек-ин;
      // сборка использует то же значение, что потом даст replay: energyScore (сон, оценка, HP), нет данных — fallback; оценка — своя утренняя, иначе последнего чек-ина
      const morning = energy !== null ? energy : cur.today.lastEnergy !== null ? Math.min(10, Math.max(1, Math.round(cur.today.lastEnergy))) : null
      if (cur.today.quests.length === 0) {
        const ei = cur.today.vitals.energyInputs
        quests = buildQuests(cur, dayType, wakeAt, energyScore({ sleepLast: ei.sleep, hp: ei.hp, weekMorning: ei.weekMorning, morning }) ?? BALANCE.energy.fallback)
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
        { type: 'day_started', date, work, wakeAt, dayType, ...(morning !== null ? { energy: morning } : {}) },
        // новая неделя при старте следующей даты — недельные выдаст следующий старт
        ...(cur.weekly.quests.length === 0 && weekStart(date) === cur.weekly.weekStart
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
        <div className="field">
          <span className="lbl"><Zap size={16} aria-hidden="true" /> Сколько сил с утра? {energy ? `${energy}/10` : '(необязательно)'}</span>
          <div className="scale energy">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} style={{ '--e': n } as React.CSSProperties} className={`btn${energy === n ? ' on' : ''}`} disabled={busy}
                aria-label={`Энергия ${n} из 10`} aria-pressed={energy === n} onClick={() => setEnergy(energy === n ? null : n)}>{n}</button>
            ))}
          </div>
        </div>
        <div className="stack">
          {state.dayTypes.map(t => {
            const Icon = DAY_ICONS[t.kind]
            return (
              <button key={t.id} className="btn day-card" disabled={busy} onClick={() => begin(t)}>
                <Icon size={22} aria-hidden="true" /> <span>{t.label}</span>
                <small>{t.busy ? `${t.busy.start}–${t.busy.end}` : t.kind === 'rest' ? `без давления · осталось ${state.today.restDaysLeft}` : 'весь день свободен'}</small>
              </button>
            )
          })}
        </div>
        <p role="status" className="muted">{busy ? 'Подбираю задания… это может занять до 30 секунд' : ''}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn ghost" disabled={busy} onClick={onLater}>Позже</button>
      </div>
    </div>
  )
}
