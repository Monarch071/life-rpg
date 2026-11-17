import type { Metric } from './types'

export const METRIC_INFO: Record<Metric, { icon: string; label: string; unit: string }> = {
  steps: { icon: '👣', label: 'Шаги', unit: 'шагов' },
  sleepHours: { icon: '😴', label: 'Сон', unit: 'ч' },
  weightKg: { icon: '⚖️', label: 'Вес', unit: 'кг' },
  screenMin: { icon: '📱', label: 'Экранное время', unit: 'мин' },
  spend: { icon: '💸', label: 'Траты', unit: '₽' },
  mood: { icon: '🙂', label: 'Настроение', unit: 'из 5' },
  water: { icon: '💧', label: 'Вода', unit: 'стаканов' },
  readPages: { icon: '📖', label: 'Чтение', unit: 'стр' },
  workoutMin: { icon: '🏋️', label: 'Тренировка', unit: 'мин' },
}
