import { useState } from 'react'
import { Camera, Check, Hand, Play, Shuffle, Sparkles, Timer, Zap } from 'lucide-react'
import { SKILL_CATALOG, skillStatShares } from '../domain/skillCatalog'
import { STATS } from '../domain/stats'
import type { DayQuest, Stat, Verify } from '../domain/types'
import { STAT_COLORS, STAT_ICONS } from './icons'
import { categoryOf, DIFFICULTY } from './skillGroups'

const VERIFY: Record<Verify, { Icon: typeof Zap; text: string }> = {
  auto: { Icon: Zap, text: 'Проверка: автоматически по данным' },
  photo: { Icon: Camera, text: 'Проверка: фото' },
  honest: { Icon: Hand, text: 'Проверка: честное слово' },
}
// «Начать» — отметка на этом устройстве, что задание в работе (на награду не влияет)
const startKey = (id: string) => `qstart:${id}`
const wasStarted = (id: string) => { try { return localStorage.getItem(startKey(id)) === '1' } catch { return false } }
const markStarted = (id: string) => { try { localStorage.setItem(startKey(id), '1') } catch { /* не критично */ } }
/** Характеристики, которые качает задание, — по долям навыков. */
export const questStats = (skills: readonly string[]): Stat[] =>
  [...new Set(skills.flatMap(id => Object.keys(skillStatShares(id as never)) as Stat[]))]

const skillTitle = (id: string) => SKILL_CATALOG.find(s => s.id === id)?.title ?? id

/** Карточка задания: ранг, навыки и окно, «почему», способ проверки, «+XP», галочка, фото и переброс. */
export default function QuestCard({ q, i, pop, busy, reroll, hint, ability = null, ability2 = null, onDone, onPhoto, onReroll, onTimer }: {
  q: DayQuest; i: number; pop: number | null; busy: boolean
  hint: string | null                                     // «засчитается само: …»
  onTimer: (() => void) | null                            // таймер фокуса/чтения для этого задания
  reroll: { label: string; off: string | null } | null   // null — переброс недоступен для этого задания
  ability?: { name: string; onUse: () => void } | null   // способность класса на этом задании (только когда доступна)
  ability2?: { name: string; onUse: () => void } | null  // вторая способность продвинутого класса («Рекорд», «Союз», «Сбор»)
  onDone: () => void; onPhoto: (f: File) => void; onReroll: () => void
}) {
  const v = VERIFY[q.done ? q.verify ?? 'honest' : q.auto ? 'auto' : 'honest']
  const xp = q.done ? q.xpFinal ?? q.xp : q.xp
  const open = !q.done && !q.legacy
  const [started, setStarted] = useState(() => wasStarted(q.id))
  const cat = categoryOf(q.skills[0]), stats = questStats(q.skills)
  return (
    <li className={`q${q.done ? ' done' : ''}${started && open ? ' going' : ''}`} style={{ '--i': i } as React.CSSProperties}>
      <span className={`rk rk-${q.rank}`} role="img" aria-label={`Ранг ${q.rank}`}>{q.rank}</span>
      <div className="t">
        <b>{(q.kind === 'boss' || q.kind === 'chain') && <em className={`qbadge ${q.kind}`}>{q.kind === 'boss' ? 'Босс' : 'Сюжет'}</em>}{q.title}</b>
        <span className="q-meta">
          <em className="q-cat" style={{ '--c': cat.color } as React.CSSProperties}><cat.Icon size={12} aria-hidden="true" />{cat.title}</em>
          <em className={`q-dif rk-${q.rank}`}>{DIFFICULTY[q.rank]}</em>
          {stats.map(st => { const I = STAT_ICONS[st]; return <I key={st} size={14} style={{ color: STAT_COLORS[st] }} role="img" aria-label={`Качает: ${STATS[st].name}`} /> })}
          {started && open && <em className="q-going">в процессе</em>}
        </span>
        <small>{q.skills.map(skillTitle).join(' + ')} · {q.window ? `${q.window.start}–${q.window.end}` : 'в течение дня'}</small>
        {q.why && <small className="why">{q.why}</small>}
        {hint && <small className="auto-hint">{hint}</small>}
      </div>
      <span className="vf" title={v.text} aria-label={v.text} role="img"><v.Icon size={16} aria-hidden="true" /></span>
      <span className="xpchip" role="img" aria-label={q.done ? `Получено ${xp} XP` : `Около ${xp} XP`}>
        +{xp}{q.kind === 'restore' && <em className="x2">×2</em>}
      </span>
      <button className="chk" disabled={q.done || busy} aria-label={`Выполнить (честное слово): ${q.title}`} onClick={onDone}>
        {q.done && <Check size={20} aria-hidden="true" />}
      </button>
      {open && (
        <div className="q-acts">
          {started
            ? <button className="btn primary sm" disabled={busy} onClick={onDone} aria-label={`Завершить: ${q.title}`}><Check size={16} aria-hidden="true" /> Завершить</button>
            : <button className="btn sm" disabled={busy} onClick={() => { markStarted(q.id); setStarted(true) }} aria-label={`Начать: ${q.title}`}><Play size={16} aria-hidden="true" /> Начать</button>}
          <label className={`btn ghost sm${busy ? ' off' : ''}`}>
            <Camera size={16} aria-hidden="true" /> Фото
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy}
              aria-label={`Выполнить с фото: ${q.title}`}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f) }} />
          </label>
          {onTimer && (
            <button className="btn ghost sm" disabled={busy} onClick={onTimer} aria-label={`Таймер для задания: ${q.title}`}>
              <Timer size={16} aria-hidden="true" /> Таймер
            </button>
          )}
          {ability && (
            <button className="btn ghost sm ab" disabled={busy} onClick={ability.onUse} aria-label={`Способность «${ability.name}»: ${q.title}`}>
              <Sparkles size={16} aria-hidden="true" /> {ability.name}
            </button>
          )}
          {ability2 && (
            <button className="btn ghost sm ab" disabled={busy} onClick={ability2.onUse} aria-label={`Способность «${ability2.name}»: ${q.title}`}>
              <Sparkles size={16} aria-hidden="true" /> {ability2.name}
            </button>
          )}
          {reroll && (
            <button className="btn ghost sm" disabled={busy || !!reroll.off} onClick={onReroll}
              aria-label={`Перебросить за ${reroll.label}${reroll.off ? `: ${reroll.off}` : ''}`}>
              <Shuffle size={16} aria-hidden="true" /> {reroll.label}{reroll.off && <small> · {reroll.off}</small>}
            </button>
          )}
        </div>
      )}
      {pop !== null && (
        <span key={pop} className="burst" aria-hidden="true">
          <span className="float">+{xp} XP</span>
          {[0, 1, 2, 3, 4].map(n => <i key={n} className="spark" />)}
        </span>
      )}
    </li>
  )
}
