import { useState } from 'react'
import { Gem, HeartHandshake, Plus, Trash2 } from 'lucide-react'
import { BALANCE } from '../domain/balance'
import { facetSuggestions, isSerious } from '../domain/shadow'
import type { FacetKind, GameState } from '../domain/types'
import { BATTLE_RESULT } from '../ui/BattleSheet'
import Confirm from '../ui/Confirm'
import Sheet from '../ui/Sheet'
import { useWrite } from '../ui/useWrite'

const S = BALANCE.shadow
type Freq = keyof typeof S.start
const FREQ: [Freq, string][] = [['rare', 'Редко'], ['sometimes', 'Иногда'], ['often', 'Часто'], ['daily', 'Каждый день']]
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/** Серьёзная зависимость — не игра: только мягкий совет обратиться к специалисту, без пути «всё равно добавить». */
export function SafetyCard({ onClose }: { onClose: () => void }) {
  return (
    <Sheet id="safety-title" title={<><HeartHandshake size={20} aria-hidden="true" /> Здесь лучше не играть</>} onClose={onClose}>
      <p>Это похоже на серьёзную зависимость. Здесь не место игре — с таким лучше обратиться к специалисту: врачу или на горячую линию помощи.</p>
      <p className="muted">С этим трудно справиться в одиночку, и просить помощи — сильный шаг. Игра останется рядом для бытовых привычек.</p>
      <button className="btn primary big" onClick={onClose}>Понятно</button>
    </Sheet>
  )
}

/** Панель «Враг-тень» на экране «Герой». Названия граней — только здесь (экран владельца). */
export default function Shadow({ state }: { state: GameState }) {
  const { shadow, today } = state
  const w = useWrite()
  const [adding, setAdding] = useState(false)
  const [remove, setRemove] = useState<string | null>(null)
  const live = shadow.facets.filter(f => !f.banished)
  const last = shadow.lastBattle
  return (
    <section className="panel stack" id="shadow" aria-label="Враг-тень">
      <div className="sec"><h2>Враг-тень</h2><span aria-live="polite">{shadow.strength === null ? 'нет граней' : `сила ${shadow.strength}`}</span></div>
      {shadow.facets.length === 0 && <p className="muted">Тень — твои бытовые привычки, которые хочется ослабить. Назови до {S.maxFacets} граней: каждый чистый день тень слабеет.</p>}
      {shadow.facets.map(f => (
        <div key={f.id} className="card facet">
          <div className="row qhead">
            <b className="grow">{f.name}</b>
            {f.banished ? <small className="ok">изгнана</small> : <small className="muted">чисто {f.cleanRun} дн.</small>}
            <button className="icon-btn" aria-label={`Убрать грань: ${f.name}`} onClick={() => setRemove(f.id)}><Trash2 size={18} aria-hidden="true" /></button>
          </div>
          <div className="bar sh" role="progressbar" aria-label={`${f.name}: сила ${f.strength} из 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={f.strength}>
            <i style={{ width: `${f.strength}%` }} />
          </div>
          {!f.banished && (f.relapsedToday
            ? <small className="muted">Срыв сегодня отмечен</small>
            : <button className="btn ghost" disabled={w.busy}
                onClick={() => void w.write({ type: 'shadow_relapse', facetId: f.id, date: today.date }, `Отмечено. Честно — +${S.honestXp} XP`)}>Был срыв</button>)}
        </div>
      ))}
      {shadow.facets.length > 0 && <small className="muted">Срыв — это данные, а не наказание. Честная отметка даёт +{S.honestXp} XP.</small>}
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      {live.length < S.maxFacets && <button className="btn" onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" /> Добавить грань</button>}
      {live.length > 0 && <p className="muted">Битва — {dm(shadow.nextBattle)}: итог месяца по силе тени.</p>}
      {last && (
        <div className="card">
          <b>Прошлая битва {dm(last.date)}: {BATTLE_RESULT[last.result].title}</b>
          <small>Сила {last.strength}{last.xp > 0 ? ` · +${last.xp} XP` : ''}</small>
          {last.plan && <small className="why">План Мастера: {last.plan}</small>}
        </div>
      )}
      {state.trophies.length > 0 && (
        <div className="field"><span>Трофеи</span>
          <ul className="trophies">{state.trophies.map(t => (
            <li key={t.id} className={`trophy ${t.kind}`}><Gem size={18} aria-hidden="true" /><span>{t.title}<small>{dm(t.date)}</small></span></li>
          ))}</ul></div>
      )}
      {adding && <AddFacet state={state} onClose={() => setAdding(false)} />}
      {remove && <Confirm title="Убрать грань? Она исчезнет из тени." yes="Убрать" onNo={() => setRemove(null)}
        onYes={() => { const id = remove; setRemove(null); void w.write({ type: 'facet_removed', facetId: id }, 'Грань убрана') }} />}
    </section>
  )
}

function AddFacet({ state, onClose }: { state: GameState; onClose: () => void }) {
  const w = useWrite()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<FacetKind>('custom')
  const [freq, setFreq] = useState<Freq>('sometimes')
  const [serious, setSerious] = useState(false)
  const have = new Set(state.shadow.facets.map(f => f.name))
  const sugg = facetSuggestions(state.profile, state.interviewAnswers).filter(s => !have.has(s.name))
  const n = name.trim()
  const add = async () => {
    if (n.length < 2 || n.length > 40) return w.setMsg({ ok: false, text: 'Название — от 2 до 40 символов' })
    if (isSerious(n, kind, state.interviewAnswers, freq)) return setSerious(true)
    // текст без названия грани: сообщения не должны его показывать
    if (await w.write({ type: 'facet_added', facetId: crypto.randomUUID(), name: n, kind, start: S.start[freq] }, 'Грань добавлена')) onClose()
  }
  if (serious) return <SafetyCard onClose={onClose} />
  return (
    <Sheet id="af-title" title="Новая грань тени" onClose={onClose}>
      <p className="muted">Бытовая привычка, которую хочешь ослабить. Видишь её только ты — в ИИ и уведомления она не попадает.</p>
      {sugg.length > 0 && <div className="field"><span>Из анкеты</span>
        <div className="chips">{sugg.map(s => (
          <button key={s.name} type="button" className={`btn${n === s.name ? ' primary' : ''}`} aria-pressed={n === s.name}
            onClick={() => { setName(s.name); setKind(s.kind); setFreq(FREQ.find(([f]) => S.start[f] === s.start)?.[0] ?? 'sometimes') }}>{s.name}</button>
        ))}</div></div>}
      <label className="field">Название<input value={name} maxLength={40} placeholder="Например: телефон в кровати" onChange={e => { setName(e.target.value); setKind('custom') }} /></label>
      <div className="field"><span>Как часто</span>
        <div className="chips" role="group" aria-label="Как часто">{FREQ.map(([f, t]) => (
          <button key={f} type="button" className={`btn${freq === f ? ' primary' : ''}`} aria-pressed={freq === f} onClick={() => setFreq(f)}>{t}</button>
        ))}</div></div>
      {w.msg && <p role={w.msg.ok ? 'status' : 'alert'} className={w.msg.ok ? 'ok' : 'err'}>{w.msg.text}</p>}
      <button className="btn primary big" disabled={w.busy} onClick={() => void add()}>Добавить грань</button>
    </Sheet>
  )
}
