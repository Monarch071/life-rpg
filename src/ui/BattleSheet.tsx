import Avatar from './Avatar'
import Sheet from './Sheet'
import type { AvatarParams, GameState } from '../domain/types'

type Battle = NonNullable<GameState['shadow']['lastBattle']>

export const BATTLE_RESULT: Record<Battle['result'], { title: string; text: string }> = {
  crush: { title: 'Сокрушительная победа', text: 'Тень разбита. Осколок тени — на полку трофеев.' },
  win: { title: 'Победа', text: 'Тень отступила. Так держать.' },
  draw: { title: 'Ничья', text: 'Тень держится. Мастер составил план на месяц — он на экране «Герой».' },
  lost: { title: 'Тень сильнее', text: 'Это просто данные. Упрости лестницу «не делать» на ступень — и возьмём реванш.' },
}

const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return true } }

/** Битва с тенью (спека §4.5): ~1,5 с сближения и вспышки, затем итог; «уменьшить движение» — сразу итог. Без названий граней. */
export default function BattleSheet({ battle, avatar, tier, onClose }: { battle: Battle; avatar: AvatarParams; tier: 1 | 2 | 3 | 4; onClose: () => void }) {
  const r = BATTLE_RESULT[battle.result]
  return (
    <Sheet id="battle-title" title="Битва с тенью" onClose={onClose}>
      {!reduced() && (
        <div className="battle" aria-hidden="true">
          <span className="bt-me"><Avatar params={avatar} tier={tier} size={150} decorative /></span>
          <span className="bt-sh mirror"><Avatar params={avatar} tier={tier} size={150} shadow decorative /></span>
          <i className="bt-flash" />
        </div>
      )}
      <div className="battle-result" role="status">
        <b>{r.title}</b>
        <p>Сила тени {battle.strength}{battle.xp > 0 ? ` · +${battle.xp} XP` : ''}</p>
        <p className="muted">{r.text}</p>
      </div>
      <button className="btn primary big" onClick={onClose}>Продолжить</button>
    </Sheet>
  )
}
