import { BALANCE } from '../domain/balance'
import { toMin } from '../domain/day'
import type { DayType } from '../domain/dayType'
import { freeWindows, latestEnd, placeQuests, type Win } from '../domain/schedule'
import type { GameState, HHMM, Profile, Quest } from '../domain/types'

type DayQuest = Quest & { done: boolean }

/** Для отображения после «Занят до…»: невыполненные задания с окном переставляются в свободное время
 *  с max(now, busyUntil) до отбоя (минус работа); не влезло — «в течение дня». Выполненные не трогаем. */
export function replanAfterBusy<Q extends DayQuest>(
  quests: Q[], nowAt: HHMM, busyUntil: HHMM, wakeAt: HHMM, profile: Profile, work: Win | null,
): Q[] {
  // сравнение относительно подъёма, чтобы время после полуночи считалось «позже»
  const rel = (h: HHMM) => (toMin(h) - toMin(wakeAt) + 1440) % 1440
  const from = rel(nowAt) > rel(busyUntil) ? nowAt : busyUntil
  const movable = quests.filter(q => !q.done && q.window)
  // занят до отбоя или позже — сегодня окон уже нет (иначе freeWindows развернётся на следующие сутки)
  if (rel(from) >= rel(profile.sleep)) return quests.map(q => (!q.done && q.window ? { ...q, window: null } : q))
  const placed = placeQuests(movable, freeWindows(from, profile.sleep, work ? [work] : []), profile.energy, from)
  const byId = new Map(placed.map(q => [q.id, q.window]))
  return quests.map(q => (byId.has(q.id) ? { ...q, window: byId.get(q.id)! } : q))
}

/** Для отображения после «День изменился»: dropped скрыты; невыполненные с окном — в свободное время нового типа
 *  с nowAt до его отбоя (вечерняя смена — только до её начала); не влезло — «в течение дня». Выполненные не трогаем. */
export function replanForDayType<Q extends DayQuest & { dropped: boolean }>(quests: Q[], nowAt: HHMM, t: DayType, profile: Profile): Q[] {
  const shown = quests.filter(q => !q.dropped)
  const bed = t.bed ?? profile.sleep, min = BALANCE.day.minWindowMin
  const rel = (h: HHMM) => (toMin(h) - toMin(t.wake ?? profile.wake) + 1440) % 1440
  if (rel(nowAt) >= rel(bed)) return shown.map(q => (!q.done && q.window ? { ...q, window: null } : q))
  let ws = freeWindows(nowAt, bed, t.busy ? [t.busy] : [], min)
  if (t.kind === 'evening' && t.busy) ws = latestEnd(ws, t.busy.start, nowAt, min)
  const placed = placeQuests(shown.filter(q => !q.done && q.window), ws, profile.energy, nowAt)
  const byId = new Map(placed.map(q => [q.id, q.window]))
  return shown.map(q => (byId.has(q.id) ? { ...q, window: byId.get(q.id)! } : q))
}

/** Что показать на Главной: после «День изменился» — окна нового типа, начиная не раньше «Занят до…»;
 *  без смены — перестановка после «Занят до…»; dropped скрыты всегда. */
export function replanToday<Q extends DayQuest & { dropped: boolean }>(
  t: Pick<GameState['today'], 'changed' | 'dayType' | 'busyUntil' | 'wakeAt' | 'work'> & { quests: Q[] }, nowAt: HHMM, profile: Profile,
): Q[] {
  if (t.changed && t.dayType) {
    const rel = (h: HHMM) => (toMin(h) - toMin(t.wakeAt ?? profile.wake) + 1440) % 1440
    return replanForDayType(t.quests, t.busyUntil && rel(t.busyUntil) > rel(nowAt) ? t.busyUntil : nowAt, t.dayType, profile)
  }
  const shown = t.quests.filter(q => !q.dropped)
  return t.busyUntil && t.wakeAt ? replanAfterBusy(shown, nowAt, t.busyUntil, t.wakeAt, profile, t.work) : shown
}
