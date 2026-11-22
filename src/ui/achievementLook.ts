import { CalendarCheck, Crown, Flame, Footprints, Medal, Moon, ShoppingBag, Sparkles, Star, Swords, Trophy, type LucideIcon } from 'lucide-react'
import { ACHIEVEMENTS } from '../domain/achievements'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export const RARITY_NAME: Record<Rarity, string> = { common: 'обычное', rare: 'редкое', epic: 'эпическое', legendary: 'легендарное' }
const LEGENDARY = new Set(['streak_100', 'level_30', 'quests_500', 'season_boss'])
const COMMON = new Set(['first_quest', 'quests_10', 'streak_3', 'level_5', 'checkin_7', 'perfect_day', 'steps_10k', 'weekly_first', 'first_purchase', 'first_skill'])

/** Редкость: легендарные — вершины, эпические — с титулом или сотней, обычные — первые шаги. */
export function rarityOf(id: string): Rarity {
  if (LEGENDARY.has(id)) return 'legendary'
  if (COMMON.has(id)) return 'common'
  const def = ACHIEVEMENTS.find(a => a.id === id)
  return def?.titleReward || id === 'quests_100' ? 'epic' : 'rare'
}

/** Иконка достижения по префиксу id. */
export function achievementIcon(id: string): LucideIcon {
  if (id.startsWith('streak')) return Flame
  if (id.startsWith('level')) return Trophy
  if (id.startsWith('steps')) return Footprints
  if (id === 'perfect_day') return Star
  if (id.startsWith('checkin')) return Moon
  if (id.endsWith('purchase')) return ShoppingBag
  if (id.endsWith('skill')) return Sparkles
  if (id.startsWith('weekly')) return CalendarCheck
  if (id.startsWith('boss') || id === 'shadow_win') return Swords
  if (id === 'season_boss') return Crown
  return Medal
}
