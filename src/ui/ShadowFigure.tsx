import Avatar from './Avatar'
import { shadowScale } from './gameView'
import type { AvatarParams } from '../domain/types'

/** Силуэт тени за аватаром (спека §4.8); граней нет — ничего. */
export default function ShadowFigure({ strength, avatar, tier }: { strength: number | null; avatar: AvatarParams; tier: 1 | 2 | 3 | 4 }) {
  if (strength === null) return null
  const { scale, opacity } = shadowScale(strength)
  return (
    <div className="shadow-fig" role="img" aria-label={`Враг-тень, сила ${strength}`} style={{ transform: `scale(${scale})`, opacity }}>
      <Avatar params={avatar} tier={tier} size={260} shadow decorative />
    </div>
  )
}
