import { Check, Coins, Lock } from 'lucide-react'
import { BALANCE } from '../domain/balance'
import { cosmeticById } from '../domain/cosmetics'
import { stepRewards } from '../domain/seasonPath'
import type { GameState } from '../domain/types'
import Sheet from '../ui/Sheet'
import { leagueChip, pathLabel } from '../ui/statBar'

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`

/** Лист «Сезон»: 30 ступеней с наградами, цена ступени и поздний вход, лига и последние 8 недель. */
export default function SeasonPath({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { season, league, week } = state, S = BALANCE.season
  const path = pathLabel(season, state.today.date), lg = leagueChip(league)
  const kind = season.kind === 'prologue' ? null : season.kind
  return (
    <Sheet id="season-title" title={season.name} onClose={onClose}>
      <p><b>{path.title}</b><br /><small className="muted">{path.sub}</small></p>
      <div className="path-bar" role="progressbar" aria-label={`Путь сезона: ${path.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(path.pct)}>
        <i style={{ width: `${path.pct}%` }} />
      </div>
      {kind && <p className="muted">
        Ступень стоит {season.stepXp} XP{season.stepXp < S.stepXp && season.joined ? ` вместо ${S.stepXp}: ты вошёл в игру ${dm(season.joined)}, после начала сезона, — цена снижена по оставшимся дням` : ''}.
        Сезон {dm(season.start)}–{dm(season.end)}.
      </p>}

      <h3>Лига · {lg.name}</h3>
      <div className="bar" role="progressbar" aria-label={`Лига ${lg.name}: ${lg.into} из ${lg.of} очков до следующей ступени`} aria-valuemin={0} aria-valuemax={lg.of} aria-valuenow={lg.into}>
        <i style={{ width: `${(lg.into / lg.of) * 100}%` }} />
      </div>
      <small className="muted">{league.tier >= BALANCE.league.names.length - 1 ? `Высшая ступень · запас ${lg.into} из ${lg.of}` : `${lg.into} / ${lg.of} очков до «${BALANCE.league.names[league.tier + 1]}»`} · ранг недели S/A/B дают очки, D отнимает</small>

      <h3>Последние недели</h3>
      {week.results.length === 0 ? <p className="muted">Закрытых недель пока нет — ранг решается в воскресенье.</p> : (
        <ul className="weeks">{week.results.slice(0, 8).map(r => (
          <li key={r.weekStart}>
            <span className={`rk rk-${r.rank ?? 'E'}`} role="img" aria-label={r.rank ? `Ранг ${r.rank}` : 'Без ранга'}>{r.rank ?? '—'}</span>
            <span className="grow">с {dm(r.weekStart)}</span>
            <small>{Math.round(r.share * 100)}% · {r.xp} XP</small>
          </li>
        ))}</ul>
      )}

      {kind && <>
        <h3>Ступени</h3>
        <ol className="steps">
          {Array.from({ length: S.steps }, (_, i) => i + 1).map(k => {
            const r = stepRewards(kind, k), got = k <= season.step, next = k === season.step + 1
            const items = r.items.map(id => cosmeticById(id)?.title ?? id)
            return (
              <li key={k} className={got ? 'got' : next ? 'next' : 'locked'} aria-current={next ? 'step' : undefined}>
                <span className="sn" aria-hidden="true">{got ? <Check size={14} /> : next ? k : <Lock size={12} />}</span>
                <span className="grow"><b>Ступень {k}</b>
                  <small>{[...items, ...(r.title ? [`титул «${r.title}»`] : [])].join(' · ')}</small></span>
                <span className="price"><Coins size={13} aria-hidden="true" />{r.gold}</span>
                <span className="sr-only">{got ? 'получено' : next ? 'следующая' : 'закрыто'}</span>
              </li>
            )
          })}
        </ol>
      </>}
    </Sheet>
  )
}
