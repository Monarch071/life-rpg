import type { AutoMetric, Metric } from './types'

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

/** Подписи авто-метрик для карточки задания «засчитается само: …». Ключи — список допустимых метрик `Quest.auto`. */
export const AUTO_METRIC_INFO: Record<AutoMetric, { label: string; unit: string }> = {
  steps: { label: 'шаги', unit: 'шагов' },
  sleepHours: { label: 'сон', unit: 'ч' },
  weightKg: { label: 'вес', unit: 'кг' },
  workoutMin: { label: 'тренировка', unit: 'мин' },
  strengthMin: { label: 'силовая', unit: 'мин' },
  mobilityMin: { label: 'растяжка', unit: 'мин' },
  cardioMin: { label: 'кардио', unit: 'мин' },
  sportsMin: { label: 'спорт', unit: 'мин' },
  mindfulMin: { label: 'осознанность', unit: 'мин' },
  focusMin: { label: 'фокус', unit: 'мин' },
  readMin: { label: 'чтение', unit: 'мин' },
  gymVisits: { label: 'зал', unit: 'раз' },
  socialMin: { label: 'соцсети', unit: 'мин' },
  gamesMin: { label: 'игры', unit: 'мин' },
}
