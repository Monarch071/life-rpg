import { BALANCE } from '../domain/balance'
import { CLASSES, CLASS_PAIRS, TRAINING } from '../domain/classes'
import { STATS } from '../domain/stats'
import { generateWeeklyQuests } from '../domain/weekly'
import type { DayQuest, GameState, PerkView, SkillState, Stat, WeeklyQuest } from '../domain/types'

/** Бейдж навыка: с warnDays дней простоя — «ржавеет через N дн.», ржавый — «ржавый». */
export function rustBadge(k: Pick<SkillState, 'idleDays' | 'rusty'>): { text: string; tone: 'warn' | 'bad' } | null {
  if (k.rusty) return { text: 'ржавый', tone: 'bad' }
  if (k.idleDays === null || k.idleDays < BALANCE.rust.warnDays) return null
  return { text: `ржавеет через ${Math.max(1, BALANCE.rust.days - k.idleDays)} дн.`, tone: 'warn' }
}

/** Точка перка: не открыт — locked; иначе по силе. */
export const perkDot = (p: Pick<PerkView, 'power'> | undefined): 'locked' | 'on' | 'half' | 'off' =>
  !p ? 'locked' : p.power === 1 ? 'on' : p.power === 0.5 ? 'half' : 'off'

export const POWER_TEXT = { 1: 'в полную силу', 0.5: 'вполовину', 0: 'выключен' } as const
export const passiveText = (cls: Pick<GameState['cls'], 'passive'>): string => `${cls.passive.text} — ${POWER_TEXT[cls.passive.power]}`

/** «План»: замены невыполненных недельных с фокусом на stat. Выполненные виды не повторяются; id — свои, чтобы не совпасть с оставленными. */
export function planQuests(state: Pick<GameState, 'weekly' | 'genWeekly' | 'stats'>, focus: Stat): WeeklyQuest[] {
  const { weekStart, quests } = state.weekly
  const kept = quests.filter(q => q.done), open = quests.length - kept.length
  if (!open) return []
  const gen = generateWeeklyQuests({ ...state.genWeekly, weekStart, themeStat: focus, stats: { ...state.stats, [focus]: -Infinity } })
  const same = (a: WeeklyQuest, b: WeeklyQuest) => a.kind === b.kind && (a.kind !== 'stat_quests' || a.stat === b.stat)
  return gen.filter(g => !kept.some(k => same(k, g)))
    .sort((a, b) => Number(b.stat === focus) - Number(a.stat === focus))
    .slice(0, open)
    .map(g => ({ ...g, id: g.id.replace(':w:', ':w:plan:') }))
}

const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
export const pairName = (p: readonly [Stat, Stat]) => `«${STATS[p[0]].name} + ${STATS[p[1]].name}»`

/** Почему способность сейчас нельзя применить (null — можно). */
export function abilityOff(state: Pick<GameState, 'cls'>): string | null {
  const ab = state.cls.ability
  if (ab.available) return null
  return ab.usedOn ? `применена ${dm(ab.usedOn)} · снова в понедельник` : `откроется с ${dm(BALANCE.depthSince)}`
}

/** Задание — цель способности класса (как проверяет replay). */
export function questAbility(state: Pick<GameState, 'cls'>, q: DayQuest): boolean {
  const ab = state.cls.ability
  if (!ab.available || q.done || q.dropped || q.legacy || q.kind === 'custom' || q.kind === 'boss' || q.kind === 'chain') return false
  return ab.id === 'rush' ? TRAINING.includes(q.skills[0]) : ab.id === 'insight' ? q.kind === 'daily' || q.kind === 'challenge' : ab.id === 'universal'
}

/** Средняя форма пары класса (Странник — всех 7), %; новая форма = 100%. */
export const pairForm = (state: Pick<GameState, 'cls' | 'statInfo'>): number => {
  const st = state.cls.pair ?? (Object.keys(STATS) as Stat[])
  return Math.round(st.reduce((a, s) => a + (state.statInfo[s].form ?? 1), 0) / st.length * 100)
}

/** Объяснение смены класса Мастером (по текущим весам). */
export function classChangeText(cls: GameState['cls']): string {
  const from = cls.changedFrom ? CLASSES[cls.changedFrom.id].name : null
  if (!cls.pair || !cls.changedFrom || !from) return `Характеристики выровнялись — теперь ты ${cls.name}${from ? `, а не ${from}` : ''}.`
  if (cls.changedFrom.id === 'wanderer') return `Пара ${pairName(cls.pair)} вырвалась вперёд — теперь ты ${cls.name}.`
  const s = (p: readonly [Stat, Stat]) => cls.weights[p[0]] + cls.weights[p[1]]
  const old = CLASS_PAIRS[cls.changedFrom.id].reduce((p, q) => (s(q) > s(p) ? q : p))
  const pct = s(old) > 0 ? Math.round((s(cls.pair) / s(old) - 1) * 100) : 0
  return `Пара ${pairName(cls.pair)} обогнала ${pairName(old)}${pct > 0 ? ` на ${pct}%` : ''} — теперь ты ${cls.name}.`
}
