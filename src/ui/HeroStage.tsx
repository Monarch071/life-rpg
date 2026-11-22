import { ChevronRight, Coins, Flame, Ghost, Shield, Swords, Trophy, User } from 'lucide-react'
import { ACHIEVEMENTS } from '../domain/achievements'
import { SKILL_CATALOG } from '../domain/skillCatalog'
import { achievementIcon, RARITY_NAME, rarityOf } from './achievementLook'
import { Wordmark } from './Logo'
import StatRadar from './StatRadar'
import { now } from '../now'
import { STATS } from '../domain/stats'
import type { GameState, Profile, Stat, StatInfo } from '../domain/types'
import Avatar from './Avatar'
import { STAT_COLORS, STAT_ICONS } from './icons'
import { ghostLine, leagueChip, pathLabel } from './statBar'
import { freshness, vitalChips, type VitalId } from './vitalsView'

export const STATUS: Record<StatInfo['status'], string> = { new: 'новая', in_form: 'в форме', sagging: 'проседает', abandoned: 'заброшена' }
/** Полупрозрачная фигура сезонного призрака у его метки на полосе пути (со второго сезона). */
export function GhostMark({ state }: { state: GameState }) {
  const g = state.ghost.season, s = state.season
  if (!g || s.kind === 'prologue') return null
  const pct = g.step > s.step ? 100 : g.step < s.step ? 0 : Math.max(0, Math.min(100, ((g.xp - g.step * s.stepXp) / s.stepXp) * 100))
  return (
    <span className="ghost-mark" style={{ left: `${pct}%` }}>
      <Avatar params={state.avatar} tier={state.tier} size={30} decorative />
      <span className="sr-only">Призрак прошлого сезона: ступень {g.step}</span>
    </span>
  )
}

/** Строка призрака: текст живого региона зависит только от знака — объявляется лишь смена «впереди / позади / вровень». */
function GhostRow({ state }: { state: GameState }) {
  const g = state.ghost, sign = g.available ? Math.sign(g.lead) : null
  const max = Math.max(1, g.you, g.ghost)
  return (
    <div className="ghost-row">
      <p><Ghost size={15} aria-hidden="true" /> {ghostLine(g, state.today.date)}</p>
      <span className="sr-only" aria-live="polite">{sign === null ? '' : sign > 0 ? 'Ты обогнал призрака' : sign < 0 ? 'Призрак впереди' : 'Вровень с призраком'}</span>
      {g.available && <div className="ghost-bars" aria-hidden="true">
        <i className="you" style={{ width: `${(g.you / max) * 100}%` }} /><i className="gh" style={{ width: `${(g.ghost / max) * 100}%` }} />
      </div>}
    </div>
  )
}

const statAria = (name: string, base: number, i: StatInfo) =>
  i.form === null ? `${name} ${base}, форма ещё не посчитана` : `${name} ${base}, форма ${Math.round(i.form * 100)}%, ${STATUS[i.status]}`

const More = ({ onClick, label }: { onClick: () => void; label: string }) =>
  <button type="button" className="more" onClick={onClick} aria-label={label}>Подробнее<ChevronRight size={14} aria-hidden="true" /></button>

/** Главный экран по брифу: шапка с уровнем, герой в полный рост, карточки характеристик, навыков, достижений и дня. */
export default function HeroStage({ state, profile, image, cta, onCta, onVital, onSyncHelp, onPath, onMore }: {
  state: GameState; profile: Profile; image: string | null; cta: string | null; onCta: () => void
  onVital: (id: VitalId) => void; onSyncHelp: () => void; onPath: () => void; onMore: (id: 'stats' | 'skills' | 'achievements') => void
}) {
  const { today } = state
  const keys = Object.keys(STATS) as Stat[]
  const path = pathLabel(state.season, today.date)
  const fresh = freshness(state.sync.last, now())
  const lg = leagueChip(state.league), rank = state.week.preview.rank
  const { background, frame } = state.cosmetics.equipped
  const pct = state.xpNeed > 0 ? Math.min(100, (state.xpInto / state.xpNeed) * 100) : 0
  const legend = !!state.cls.legend && state.cls.legend.since <= today.date
  const topSkills = SKILL_CATALOG.map(d => ({ d, k: state.skills[d.id] })).sort((a, b) => b.k.xp - a.k.xp).slice(0, 4)
  const recent = [...state.achievements].reverse().slice(0, 3)
  const nextAch = ACHIEVEMENTS.find(a => !state.achievements.some(x => x.id === a.id))
  const quests = today.quests.filter(q => !q.dropped), done = quests.filter(q => q.done).length

  return (
    <section className="dash" aria-label="Герой">
      <header className="dash-head">
        <Wordmark />
        <span className="coins-pill" aria-label={`Золото: ${state.gold}`}><Coins size={15} aria-hidden="true" />{state.gold}</span>
      </header>

      <div className="glass profile-bar">
        <div className={`ring${frame ? ` frame-${frame.split(':')[1]}` : ''}`} aria-hidden="true">
          {image ? <i style={{ backgroundImage: `url(${image})` }} /> : <i className="empty"><User size={24} /></i>}
        </div>
        <div className="pb-body">
          <div className="pb-top">
            <span className="pb-name"><b>{profile.name || 'Герой'}</b><small>{legend ? state.cls.legend!.title : `${state.className} · «${state.title}»`}</small></span>
            <span className="pb-lvl"><small>LV</small>{state.level}</span>
          </div>
          <div className="xp-line" role="progressbar" aria-label="Опыт до следующего уровня" aria-valuemin={0} aria-valuemax={state.xpNeed} aria-valuenow={state.xpInto}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <small className="pb-xp"><span>{state.xpInto.toLocaleString('ru')} / {state.xpNeed.toLocaleString('ru')} XP</span><span>ещё {Math.max(0, state.xpNeed - state.xpInto).toLocaleString('ru')} до {state.level + 1}</span></small>
        </div>
      </div>

      <div className="stage">
        <div className={`stage-art${background ? ` bg-${background.split(':')[1]}` : ''}${legend ? ' legend' : ''}`} aria-hidden="true">
          {background && <i className="stage-bg" />}
          {image ? <img src={image} alt="" /> : <div className="stage-fallback"><Avatar params={state.avatar} tier={state.tier} size={340} decorative wear={state.cosmetics.equipped} /></div>}
        </div>
        <ul className="vitals" aria-label="Состояние дня">
          {vitalChips(today.vitals).map(c => (
            <li key={c.id}>
              <button className={`vital t-${c.tone}`} onClick={() => onVital(c.id)}
                aria-label={`${c.label}: ${c.value === '—' ? 'нет данных' : `${c.value} из 100`}. Подробнее`}>
                <small aria-hidden="true">{c.label}</small>
                <b aria-hidden="true">{c.value}</b>
                <i aria-hidden="true"><i style={{ width: `${c.pct}%` }} /></i>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {fresh.stale && <p className="fresh stale">{fresh.text}{state.sync.last !== null && ' · «Команды» давно не присылали данные'} <button className="link" onClick={onSyncHelp}>Настроить</button></p>}

      <section className="glass dcard" aria-label="Характеристики">
        <div className="dcard-h"><h2>Характеристики</h2><More onClick={() => onMore('stats')} label="Все характеристики" /></div>
        <div className="radar-row">
          <StatRadar stats={state.stats} size={170} compact />
          <ul className="stat-list">
            {keys.map(k => {
              const Icon = STAT_ICONS[k], info = state.statInfo[k]
              return (
                <li key={k} style={{ '--c': STAT_COLORS[k] } as React.CSSProperties}>
                  <span className="sr-only">{statAria(STATS[k].name, state.stats[k], info)}</span>
                  <Icon size={15} aria-hidden="true" />
                  <span aria-hidden="true">{STATS[k].name}</span>
                  <b aria-hidden="true">{state.stats[k]}</b>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section className="glass dcard" aria-label="Навыки">
        <div className="dcard-h"><h2>Навыки</h2><More onClick={() => onMore('skills')} label="Все навыки" /></div>
        <ul className="skill-list">
          {topSkills.map(({ d, k }) => {
            const I = d.stat === 'team' ? Swords : STAT_ICONS[d.stat]
            return (
              <li key={d.id} style={{ '--c': d.stat === 'team' ? 'var(--fire)' : STAT_COLORS[d.stat] } as React.CSSProperties}>
                <span className="sk-ic" aria-hidden="true"><I size={16} /></span>
                <span className="sk-n">{d.title}</span>
                <span className="sk-l">ур. <b>{k.level}</b></span>
                <i className="sk-bar" role="progressbar" aria-label={`${d.title}: уровень ${k.level}`} aria-valuemin={0} aria-valuemax={k.need || 1} aria-valuenow={k.into}><i style={{ width: `${k.need ? (k.into / k.need) * 100 : 100}%` }} /></i>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="glass dcard" aria-label="Достижения">
        <div className="dcard-h"><h2>Достижения <small>{state.achievements.length} / {ACHIEVEMENTS.length}</small></h2><More onClick={() => onMore('achievements')} label="Все достижения" /></div>
        {recent.length ? (
          <ul className="ach-row">
            {recent.map(a => {
              const def = ACHIEVEMENTS.find(x => x.id === a.id), Icon = achievementIcon(a.id), r = rarityOf(a.id)
              return def && <li key={a.id} className={`ach r-${r}`}><span className="ach-ic" aria-hidden="true"><Icon size={20} /></span><b>{def.title}</b><small>{RARITY_NAME[r]}</small></li>
            })}
          </ul>
        ) : <p className="muted">Первое достижение — за первое выполненное задание.</p>}
        {nextAch && <p className="ach-next"><Trophy size={14} aria-hidden="true" /> Следующее: <b>{nextAch.title}</b> — {nextAch.desc.charAt(0).toLowerCase() + nextAch.desc.slice(1)}</p>}
      </section>

      <section className="glass dcard today-card" aria-label="Сегодня">
        <div className="today-nums" aria-live="polite">
          <span><b>{done}</b><small>выполнено</small></span>
          <span><b>{quests.length - done}</b><small>осталось</small></span>
          <span><b className="acc">+{today.xp}</b><small>XP сегодня</small></span>
          <span><b className="hot"><Flame size={16} aria-hidden="true" />{state.streak}</b><small>серия, дн.</small></span>
        </div>
        <GhostRow state={state} />
        <div className="league-row">
          <span className="league-chip" role="progressbar" aria-label={`Лига ${lg.name}: ${lg.into} из ${lg.of} очков`} aria-valuemin={0} aria-valuemax={lg.of} aria-valuenow={lg.into}>
            <Shield size={14} aria-hidden="true" />{lg.name}<small aria-hidden="true">{lg.into}/{lg.of}</small>
          </span>
          <span className="rank-pre">
            <span className="sr-only">{rank ? `Ранг недели, если день закроется так: ${rank}` : 'Ранга недели пока нет'}</span>
            <span aria-hidden="true">неделя <b className={rank ? `rk-${rank}` : undefined}>{rank ?? '—'}</b></span>
          </span>
        </div>
        <div className="path">
          <button type="button" className="path-t" onClick={onPath} aria-label={`${path.title}, ${path.sub}. Открыть путь сезона и лигу`}>
            <b aria-hidden="true">{path.title}</b><small aria-hidden="true">{path.sub}<ChevronRight size={14} /></small>
          </button>
          <div className="path-track">
            <div className="path-bar" role="progressbar" aria-label={`Путь сезона: ${path.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(path.pct)}>
              <i style={{ width: `${path.pct}%` }} />
            </div>
            <GhostMark state={state} />
          </div>
        </div>
        {cta && <button className="btn primary big" onClick={onCta}><Swords size={18} aria-hidden="true" />{cta}</button>}
      </section>
    </section>
  )
}
