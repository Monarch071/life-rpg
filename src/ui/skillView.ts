import { BALANCE } from '../domain/balance'
import { CLASSES, CLASS_PAIRS, TRAINING } from '../domain/classes'
import { STATS } from '../domain/stats'
import { generateWeeklyQuests } from '../domain/weekly'
import { ADVANCED, ADVANCED_IDS, inFocus } from '../domain/advanced'
import type { AbilityId2, DayQuest, GameState, PerkView, SkillState, Stat, WeeklyQuest } from '../domain/types'
import { catTone } from './finView'

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

/** «Испытание: день 6/14 · засчитано 5/10 · заданий фокуса 4/8». */
export const trialText = (t: NonNullable<GameState['cls']['trial']>): string =>
  `Испытание: день ${t.day}/${BALANCE.advanced.trialDays} · засчитано ${t.counted}/${t.need.days} · заданий фокуса ${t.focusDone}/${t.need.quests}`

/** Чем выбирается цель второй способности (кнопки по механике). */
export function abilityTarget(id: AbilityId2): 'quest' | 'day' | 'skill' | 'facet' | 'invest' | 'chain' | 'card' {
  const mech = ADVANCED[ADVANCED_IDS.find(a => ADVANCED[a].ability === id)!].mech
  return mech === 'quest_mult' ? 'quest' : mech === 'pledge' ? (id === 'fast' ? 'facet' : 'skill') : mech === 'invest' || mech === 'chain' || mech === 'card' ? mech : 'day'
}

/** Задание — цель второй способности «на задание» (как проверяет replay: главный навык из фокуса пути). */
export function questAbility2(state: Pick<GameState, 'cls'>, q: DayQuest): boolean {
  const adv = state.cls.advanced
  if (!adv?.ability.available || abilityTarget(adv.ability.id) !== 'quest') return false
  if (q.done || q.dropped || q.legacy || q.kind === 'custom' || q.kind === 'boss' || q.kind === 'chain') return false
  return inFocus(adv.id, q.skills[0])
}

/** «Аудит» Казначея: три совета по правилам из финансов месяца — на устройстве, без сумм. */
export function auditTips(fin: Pick<GameState['finance'], 'month' | 'categories' | 'uncategorized'>): string[] {
  const m = fin.month, title = (id: string) => fin.categories.find(c => c.id === id)?.title ?? 'Прочее'
  const top = [...m.byCat].sort((a, b) => b.spent - a.spent)[0]
  const over = m.byCat.filter(c => catTone(c.spent, c.limit) === 'over'), warn = m.byCat.filter(c => catTone(c.spent, c.limit) === 'warn')
  const save = Math.round(BALANCE.finance.saveShare * 100)
  return [
    top && m.expense > 0 ? `Больше всего уходит на «${title(top.id)}» — ${Math.round((top.spent / m.expense) * 100)}% расходов. Найди там одну трату, без которой можно обойтись.`
      : 'Расходов в этом месяце пока нет — записывай траты, чтобы видеть картину.',
    over.length ? `Сверх лимита: ${over.map(c => `«${title(c.id)}»`).join(', ')}. До конца месяца — только необходимое в этих категориях.`
      : warn.length ? `Близко к лимиту: ${warn.map(c => `«${title(c.id)}»`).join(', ')}. Притормози там на неделю.`
      : m.byCat.some(c => c.limit !== null) ? 'Все лимиты в норме — так держать.' : `Поставь лимит на «${top ? title(top.id) : 'Продукты'}» — с ним проще держать темп.`,
    m.income > 0 && m.saving < m.income * BALANCE.finance.saveShare ? `Отложи в копилку ${save}% дохода — это первый шаг к подушке.`
      : fin.uncategorized > 0 ? `Разбери записи без категории: ${fin.uncategorized} — тогда советы станут точнее.` : 'Копилка растёт — продолжай в том же ритме.',
  ]
}
