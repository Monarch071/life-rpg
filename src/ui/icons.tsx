import { Dumbbell, Footprints, BookOpen, Target, MessageCircle, Coins, Flower2, Sun, Moon, Palmtree, BedDouble, type LucideIcon } from 'lucide-react'
import type { DayKind } from '../domain/dayType'
import type { Stat } from '../domain/types'

export const STAT_ICONS: Record<Stat, LucideIcon> = {
  str: Dumbbell, end: Footprints, int: BookOpen, dis: Target, cha: MessageCircle, fin: Coins, spi: Flower2,
}
export const DAY_ICONS: Record<DayKind, LucideIcon> = { day: Sun, evening: Moon, off: Palmtree, rest: BedDouble }
export const STAT_COLORS: Record<Stat, string> = {
  str: 'var(--str)', end: 'var(--end)', int: 'var(--int)', dis: 'var(--dis)', cha: 'var(--cha)', fin: 'var(--fin)', spi: 'var(--spi)',
}

export function StatIcon({ stat, size = 22 }: { stat: Stat; size?: number }) {
  const Icon = STAT_ICONS[stat]
  return <span className="ico" style={{ '--c': STAT_COLORS[stat] } as React.CSSProperties} aria-hidden="true"><Icon size={size} /></span>
}
