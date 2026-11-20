// Карточка «до и после» 9:16 (спека §6, §9): модель периода и чистая раскладка операций рисования. Без финансовых сумм.
import { BALANCE } from './balance'
import { seasonOf } from './calendar'
import { addDays } from './day'
import { periodTotals } from './finance'
import { seasonInput } from './masterReport'
import { skillFromXp } from './progression'
import { STATS, tierFor } from './stats'
import type { AvatarParams, GameState, ISODate, Stat } from './types'
import { levelFromXp } from './xp'

export type CardAvatar = { blob: string } | { params: AvatarParams; tier: 1 | 2 | 3 | 4 }
export interface CardPoint { date: ISODate; level: number; avatar: CardAvatar }
export interface CardModel { kind: 'month' | 'season' | 'week'; title: string; before: CardPoint; after: CardPoint; index: number | null;
  record: { title: string; value: string } | null; gains: { stat: Stat; delta: number }[]; streak: number; step: number | null }
export type CardOp =
  | { op: 'rect'; x: number; y: number; w: number; h: number; fill: string; glow?: string; r?: number }
  | { op: 'text'; x: number; y: number; text: string; size: number; color: string; weight?: number; align?: 'left' | 'center' | 'right' }
  | { op: 'image'; slot: 'before' | 'after'; x: number; y: number; w: number; h: number }
  | { op: 'bar'; x: number; y: number; w: number; h: number; pct: number; color: string }

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
export const monthTitle = (m: string) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`
const lastDayOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return addDays(`${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01`, -1) }
const dm = (d: ISODate) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
const int = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
const KEYS = Object.keys(STATS) as Stat[]
// на карточке (её выкладывают в сторис) — без финансовых сумм
const RECORD_TITLE: Partial<Record<string, string>> = { steps_day: 'Максимум шагов за день', savings_month: 'Рекорд накоплений' }

export const levelAt = (state: Pick<GameState, 'ledger' | 'startLevel'>, date: ISODate): number =>
  levelFromXp(state.ledger.reduce((a, r) => a + (r.date <= date ? r.xp : 0), 0), state.startLevel).level

const avatarAt = (state: GameState, date: ISODate): CardAvatar => {
  const img = state.avatarHistory.filter(a => a.date <= date).at(-1)
  // shortcut: параметры SVG-аватара — текущие (avatar_updated без истории по датам), тир — по уровню на дату
  return img ? { blob: img.blob } : { params: state.avatar, tier: tierFor(levelAt(state, date)) }
}
const statsAt = (state: GameState, d: ISODate) => (state.statHistory.filter(h => h.date <= d).at(-1) ?? state.statHistory[0])?.stats ?? state.stats

function period(state: GameState, kind: CardModel['kind'], title: string, from: ISODate, to: ISODate, index: number | null, step: number | null): CardModel | null {
  const end = to < state.today.date ? to : state.today.date
  const hist = state.history.filter(h => h.date >= from && h.date <= end)
  if (!hist.some(h => h.issued > 0)) return null
  const pt = (d: ISODate): CardPoint => ({ date: d, level: levelAt(state, d), avatar: avatarAt(state, d) })
  const before = pt(addDays(from, -1)), after = pt(end)
  const s0 = statsAt(state, before.date), s1 = statsAt(state, end)
  const gains = KEYS.map(stat => ({ stat, delta: Math.round((s1[stat] ?? 0) - (s0[stat] ?? 0)) })).filter(g => g.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
  // лучший рекорд периода: наибольший относительный прирост, иначе поздний
  const recs = state.records.filter(r => r.value !== null && r.date !== null && r.date >= from && r.date <= end)
    .map(r => ({ r, gain: r.prev && r.prev > 0 ? (r.value! - r.prev) / r.prev : 0 }))
    .sort((a, b) => b.gain - a.gain || (a.r.date! < b.r.date! ? 1 : -1))
  const best = recs[0]?.r
  const record = best ? { title: RECORD_TITLE[best.id] ?? best.title, value: best.id === 'savings_month' ? '' : `${int(best.value!)} ${best.unit}` } : null
  return { kind, title, before, after, index, record, gains, streak: hist.reduce((a, h) => Math.max(a, h.streak), 0), step }
}

const stepAt = (state: GameState, d: ISODate) => { const sn = seasonOf(d); return sn.kind === 'prologue' ? null : seasonInput(state, sn.id).step }

/** null — в месяце нет закрытых дней с заданиями. */
export function monthCard(state: GameState, month: string): CardModel | null {
  const g = state.growth.current.month === month ? state.growth.current : state.growth.months.find(m => m.month === month)
  const to = lastDayOf(month), end = to < state.today.date ? to : state.today.date
  if (`${month}-01` > state.today.date) return null
  return period(state, 'month', `Итоги: ${monthTitle(month)}`, `${month}-01`, to, g?.index ?? null, stepAt(state, end))
}

export function seasonCard(state: GameState, seasonId: string): CardModel | null {
  const si = seasonInput(state, seasonId)
  if (si.start > state.today.date) return null
  return period(state, 'season', `Сезон «${si.season}»`, si.start, si.end, si.growth.index, si.step)
}

/** «Сага» Рассказчика: неделя без индекса роста. */
export function weekCard(state: GameState, weekStart: ISODate): CardModel | null {
  const end = addDays(weekStart, 6)
  return period(state, 'week', `Неделя ${dm(weekStart)}–${dm(end)}`, weekStart, end, null, stepAt(state, end < state.today.date ? end : state.today.date))
}

/** Раскладка 9:16 в «стеклянной ночи»: фон со свечением, колонки «было / стало», крупный индекс, прирост характеристик. */
export function cardOps(m: CardModel, w = 1080, h = 1920): CardOp[] {
  const k = w / 1080, X = (x: number) => Math.round(x * k), Y = (y: number) => Math.round(y * (h / 1920))
  const C = { text: '#eef2ff', muted: '#9aa6c6', fire: '#f3bd5a', fire2: '#ffd98a', ice: '#a9d1ff', card: '#121a33' }
  const t = (x: number, y: number, text: string, size: number, color = C.text, align: 'left' | 'center' | 'right' = 'center', weight = 700): CardOp =>
    ({ op: 'text', x: X(x), y: Y(y), text, size: Math.round(size * k), color, align, weight })
  const col = (p: CardPoint, x: number, label: string, slot: 'before' | 'after'): CardOp[] => [
    { op: 'rect', x: X(x), y: Y(300), w: X(450), h: Y(900), fill: C.card, r: Math.round(32 * k) },
    t(x + 225, 360, label, 38, slot === 'after' ? C.fire2 : C.muted, 'center', 800),
    t(x + 225, 410, dm(p.date), 30, C.muted),
    { op: 'image', slot, x: X(x + 25), y: Y(440), w: X(400), h: Y(620) },
    t(x + 225, 1150, `Ур. ${p.level}`, 64, slot === 'after' ? C.fire2 : C.text, 'center', 900),
  ]
  const ops: CardOp[] = [
    { op: 'rect', x: 0, y: 0, w, h, fill: '#070b18', glow: '#1c2b52' },
    t(540, 150, m.title, 56, C.fire2, 'center', 900),
    t(540, 220, 'до и после', 32, C.muted),
    ...col(m.before, 60, 'Было', 'before'), ...col(m.after, 570, 'Стало', 'after'),
  ]
  let y = 1290
  if (m.kind !== 'week') { ops.push(t(540, y, 'Индекс роста', 34, C.muted), t(540, y + 110, m.index === null ? '—' : String(m.index), 110, C.fire, 'center', 900)); y += 170 }
  if (m.record) { ops.push(t(540, y, m.record.title, 34, C.ice, 'center', 800)); if (m.record.value) ops.push(t(540, y + 48, m.record.value, 40, C.text, 'center', 800)); y += m.record.value ? 110 : 70 }
  const top = Math.max(1, ...m.gains.map(g => g.delta))
  for (const g of m.gains) {
    ops.push(t(60, y, STATS[g.stat].name, 32, C.text, 'left'), { op: 'bar', x: X(360), y: Y(y - 22), w: X(520), h: Y(18), pct: Math.round((g.delta / top) * 100), color: C.fire },
      t(1020, y, `+${g.delta}`, 32, C.fire2, 'right', 800))
    y += 56
  }
  ops.push(t(540, 1860, [`Серия ${m.streak} дн.`, ...(m.step !== null ? [`ступень ${m.step}/${BALANCE.season.steps}`] : [])].join(' · '), 32, C.muted))
  return ops
}

/** Вход итогов месяца (спека §10) из состояния: дни открытия, задания, реальные сдвиги (без сумм). */
export function reviewInput(state: GameState, month: string): { days: number; opened: number; issued: number; done: number; shifts: ('ladder' | 'saving' | 'base' | 'skill')[] } {
  const from = `${month}-01`, to = lastDayOf(month), prev = addDays(from, -1), inM = (d: ISODate) => d >= from && d <= to
  const hist = state.history.filter(h => inM(h.date))
  const s0 = statsAt(state, prev), s1 = statsAt(state, to)
  const skillXp = (id: string, d: ISODate) => state.ledger.reduce((a, r) => a + (r.date <= d ? r.skills.reduce((b, [s, x]) => b + (s === id ? x : 0), 0) : 0), 0)
  const skillUp = Object.entries(state.skills).some(([id, k]) => skillFromXp(k.start, skillXp(id, to)).level > skillFromXp(k.start, skillXp(id, prev)).level)
  const shifts = [
    ...(state.ledger.some(r => r.source === 'ladder' && inM(r.date)) ? ['ladder' as const] : []),
    ...(periodTotals(state.finance.entries, from, to).saving > 0 ? ['saving' as const] : []),
    ...(KEYS.some(s => (s1[s] ?? 0) - (s0[s] ?? 0) >= BALANCE.rival.decision.baseGain) ? ['base' as const] : []),
    ...(skillUp ? ['skill' as const] : []),
  ]
  return { days: +to.slice(8), opened: state.activity.opened.filter(inM).length, issued: hist.reduce((a, h) => a + h.issued, 0),
    done: hist.reduce((a, h) => a + h.completed, 0), shifts }
}
