import { BALANCE } from '../domain/balance'
import { AUTO_METRIC_INFO } from '../domain/metricInfo'
import type { DayData, DayQuest, Vitals } from '../domain/types'

export type VitalId = 'hp' | 'energy' | 'focus' | 'fatigue'
export type Tone = 'good' | 'mid' | 'bad' | 'none'
export const VITAL_LABEL: Record<VitalId, string> = { hp: 'HP', energy: 'Энергия', focus: 'Фокус', fatigue: 'Усталость' }

const { low, high } = BALANCE.energy
const tone = (x: number | null, inverse: boolean): Tone =>
  x === null ? 'none' : (inverse ? 100 - x : x) >= high ? 'good' : (inverse ? 100 - x : x) >= low ? 'mid' : 'bad'

/** Чипы HUD: Усталость — обратная шкала (много — плохо). */
export function vitalChips(v: Vitals): { id: VitalId; label: string; value: string; pct: number; tone: Tone }[] {
  return (['hp', 'energy', 'focus', 'fatigue'] as const).map(id => {
    const x = v[id]
    return { id, label: VITAL_LABEL[id], value: x === null ? '—' : String(x), pct: x ?? 0, tone: tone(x, id === 'fatigue') }
  })
}

export function freshness(last: number | null, now: number): { text: string; stale: boolean } {
  if (last === null) return { text: 'Данных из «Команд» ещё не было', stale: true }
  const min = Math.max(0, Math.floor((now - last) / 60e3)), h = Math.floor(min / 60)
  const ago = min < 1 ? 'только что' : min < 60 ? `${min} мин назад` : h < 24 ? `${h} ч назад` : `${Math.floor(h / 24)} дн. назад`
  return { text: `Данные: ${ago}`, stale: now - last > BALANCE.freshnessStaleH * 3600e3 }
}

const n = (x: number) => String(Math.round(x * 10) / 10).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** Подсказка авто-засчёта на карточке задания. */
export function autoHint(q: DayQuest, data: DayData): string | null {
  if (!q.auto || q.done) return null
  const { metric, op, value } = q.auto, i = AUTO_METRIC_INFO[metric], cur = data[metric]
  const goal = metric === 'steps' ? `шагов ${op === '>=' ? '≥' : '≤'} ${n(value)}` : `${i.label} ${op === '>=' ? '≥' : '≤'} ${n(value)} ${i.unit}`
  const now = cur === undefined ? 'данных пока нет' : `сейчас ${n(cur)}`
  return op === '<=' ? `Проверится при закрытии дня: ${goal} (${now})` : `Засчитается само: ${goal} (${now})`
}

export type Running = { timer: 'focus' | 'reading'; start: number }
/** Запуск таймера из localStorage (недоверенная строка). */
export function parseRunning(raw: string | null): Running | null {
  try {
    const r = JSON.parse(raw ?? '')
    return (r?.timer === 'focus' || r?.timer === 'reading') && Number.isFinite(r.start) ? { timer: r.timer, start: r.start } : null
  } catch { return null }
}
/** Интервал для timer_logged: по часам, не длиннее BALANCE.timer.maxMin; короче минуты — null (не пишем). */
export function timerSpan(start: number, end: number): { start: number; end: number; capped: boolean } | null {
  if (end - start < 60e3) return null
  const max = start + BALANCE.timer.maxMin * 60e3
  return { start, end: Math.min(end, max), capped: end > max }
}
