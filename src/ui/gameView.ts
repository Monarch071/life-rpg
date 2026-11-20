import type { GameState, ISODate } from '../domain/types'

type Ladder = GameState['ladders'][number]

/** Чип ритуала на Главной: «не делать» засчитывается к вечеру (данные при закрытии дня или чек-ин). */
export function ritualChip(l: Ladder): { text: string; sub: string; state: 'done' | 'auto' | 'later' | 'todo' } {
  const state = l.todayDone ? (l.todayVerify === 'auto' ? 'auto' : 'done') : l.kind === 'dont' ? 'later' : 'todo'
  return { text: `${l.title} · ${l.label}`, sub: `ступень ${l.step} · ${l.done}/${l.required}`, state }
}

const r2 = (x: number) => Math.round(x * 100) / 100

/** Фигура тени (спека §4.8): масштаб 0,7–1,2, непрозрачность 0,25–0,85 по силе 0–100. */
export function shadowScale(strength: number): { scale: number; opacity: number } {
  const s = Math.min(100, Math.max(0, Number.isFinite(strength) ? strength : 0)) / 100
  return { scale: r2(0.7 + 0.5 * s), opacity: r2(0.25 + 0.6 * s) }
}

const KEY = 'battleSeen'
const ls = (): Storage | null => { try { return globalThis.localStorage ?? null } catch { return null } }

/** «Анимация битвы показана» — удобство одного устройства (спека §4.5). */
export function battleSeen(date: ISODate, store: Storage | null = ls()): boolean {
  try { return store?.getItem(KEY) === date } catch { return false }
}

export function markBattleSeen(date: ISODate, store: Storage | null = ls()): void {
  try { store?.setItem(KEY, date) } catch { /* не критично */ }
}

type Part = NonNullable<GameState['seasonBoss']>['parts'][number]
const TONE: Record<Part['status'], 'muted' | 'active' | 'late' | 'won' | 'lost'> = { upcoming: 'muted', active: 'active', late: 'late', defeated: 'won', escaped: 'lost' }

/** Карточка части босса: подпись с HP, тон по статусу, следующий шаг (у законченной — нет). */
export function partView(p: Omit<Part, 'steps'> & { steps: readonly Part['steps'][number][] }): { label: string; tone: 'muted' | 'active' | 'late' | 'won' | 'lost'; next: string | null } {
  const over = p.status === 'defeated' || p.status === 'escaped'
  return { label: `${p.title} · HP ${p.hp}`, tone: TONE[p.status], next: over ? null : p.steps.find(s => !s.done)?.title ?? null }
}
