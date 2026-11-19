import { useState } from 'react'
import { X } from 'lucide-react'
import { appendEvent } from '../db'
import { getAiConfig } from '../ai/config'
import { aiCustomRank } from '../ai/tasks'
import { BALANCE } from '../domain/balance'
import { questReward, rankCap, rankShift } from '../domain/progression'
import { primaryStat, SKILL_CATALOG, type SkillId } from '../domain/skillCatalog'
import type { GameState, Quest, Rank } from '../domain/types'
import { useDialog } from '../ui/useDialog'

const AI_TIMEOUT = 15_000

/** «Своё задание»: название и навык; ранг ставит ИИ (не выше потолка), без ИИ — на ранг ниже потолка. */
export default function CustomQuest({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { today } = state
  const [title, setTitle] = useState('')
  const [skill, setSkill] = useState<SkillId>(SKILL_CATALOG[0].id)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const dlg = useDialog<HTMLDivElement>(busy ? undefined : onClose)
  const t = title.trim()
  const full = today.customCount >= BALANCE.custom.perDay
  // потолок — уровень и навык на начало дня (так проверяет replay)
  const cap = rankCap(today.dayStart.level, today.dayStart.skills[skill])

  const add = async () => {
    if (t.length < 3 || t.length > 80) return setErr('Название — от 3 до 80 символов')
    setBusy(true)
    setErr(null)
    let rank: Rank = rankShift(cap, -1)
    const cfg = await getAiConfig().catch(() => null)
    if (cfg) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        rank = await Promise.race([aiCustomRank(cfg, t, SKILL_CATALOG.find(s => s.id === skill)!.title, cap),
          new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), AI_TIMEOUT) })])
      } catch { /* остаётся правило «на ранг ниже потолка» */ }
      clearTimeout(timer)
    }
    const quest: Quest = {
      id: `${today.date}:custom:${crypto.randomUUID()}`, date: today.date, title: t, stat: primaryStat([skill]), minutes: 0, window: null,
      xp: questReward({ rank, verify: 'honest', bonuses: [], penalties: [] }).xp, auto: null, templateId: 'custom',
      rank, skills: [skill], kind: 'custom', why: 'Своё задание',
    }
    try {
      await appendEvent({ type: 'custom_quest_added', date: today.date, quest })
      onClose()
    } catch {
      setErr('Не удалось сохранить, попробуй ещё раз')
      setBusy(false)
    }
  }

  return (
    <div className="sheet-wrap" onClick={e => !busy && e.target === e.currentTarget && onClose()}>
      <div className="sheet" ref={dlg} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="cq-title">
        <div className="sheet-head">
          <h2 id="cq-title">Своё задание</h2>
          <button className="icon-btn" aria-label="Закрыть" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
        </div>
        <p className="muted">До {BALANCE.custom.perDay} в день. Свои задания дают не больше четверти XP дня. Сегодня добавлено: {today.customCount}.</p>
        <label className="field">Что сделаешь
          <input value={title} maxLength={80} placeholder="Например: разобрать почту" onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="field">Навык
          <select className="select" value={skill} onChange={e => setSkill(e.target.value as SkillId)}>
            {SKILL_CATALOG.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <p className="muted small">Потолок ранга по этому навыку: {cap}</p>
        <p role="status" className="muted">{busy ? 'Оцениваю трудность… до 15 секунд' : ''}</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy || full || t.length < 3} onClick={add}>
          {full ? 'Лимит на сегодня исчерпан' : 'Добавить'}
        </button>
      </div>
    </div>
  )
}
