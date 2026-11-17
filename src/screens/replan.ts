import { toMin } from '../domain/day'
import { freeWindows, placeQuests, type Win } from '../domain/schedule'
import type { HHMM, Profile, Quest } from '../domain/types'

type DayQuest = Quest & { done: boolean }

/** Для отображения после «Занят до…»: невыполненные задания с окном переставляются в свободное время
 *  с max(now, busyUntil) до отбоя (минус работа); не влезло — «в течение дня». Выполненные не трогаем. */
export function replanAfterBusy(
  quests: DayQuest[], nowAt: HHMM, busyUntil: HHMM, wakeAt: HHMM, profile: Profile, work: Win | null,
): DayQuest[] {
  // сравнение относительно подъёма, чтобы время после полуночи считалось «позже»
  const rel = (h: HHMM) => (toMin(h) - toMin(wakeAt) + 1440) % 1440
  const from = rel(nowAt) > rel(busyUntil) ? nowAt : busyUntil
  const movable = quests.filter(q => !q.done && q.window)
  const placed = placeQuests(movable, freeWindows(from, profile.sleep, work ? [work] : []), profile.energy, from)
  const byId = new Map(placed.map(q => [q.id, q.window]))
  return quests.map(q => (byId.has(q.id) ? { ...q, window: byId.get(q.id)! } : q))
}
