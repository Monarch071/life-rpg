// Ролик «до и после» в конце сезона (спека §9): 18 секунд 9:16 — аватар в начале и в конце, уровни, 3 лучших момента.
// Чистая раскладка кадра по времени; запись — в ui/seasonVideo. Без финансовых сумм и названий граней Тени (ролик выкладывают).
import { BALANCE } from './balance'
import type { CardModel, CardOp } from './card'
import { addDays } from './day'
import type { GameState } from './types'

export interface Moment { title: string; value: string }
export const VIDEO_MS = 18_000
const int = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** До 3 моментов сезона: победа над боссом, рекорды (кроме накоплений), изгнанные грани; не хватает — серия и рост уровня. */
/** Период — из карточки сезона: со дня после «было» по «стало». */
export function seasonMoments(state: GameState, m: CardModel): Moment[] {
  const start = addDays(m.before.date, 1), end = m.after.date, inS = (d: string | null) => !!d && d >= start && d <= end
  const out: Moment[] = []
  if (state.ledger.some(r => r.source === 'boss' && r.xp === BALANCE.boss.seasonXp && inS(r.date))) out.push({ title: 'Сезонный босс повержен', value: `+${int(BALANCE.boss.seasonXp)} XP` })
  for (const r of state.records.filter(r => r.id !== 'savings_month' && r.value !== null && inS(r.date))
    .sort((a, b) => (b.prev ? b.value! / b.prev : 1) - (a.prev ? a.value! / a.prev : 1))) out.push({ title: `Рекорд: ${r.title.toLowerCase()}`, value: `${int(r.value!)} ${r.unit}` })
  const gone = state.shadow.facets.filter(f => inS(f.banishedOn)).length
  if (gone) out.push({ title: gone > 1 ? 'Грани Тени изгнаны' : 'Грань Тени изгнана', value: gone > 1 ? `${gone}` : 'навсегда' })
  if (m.streak > 0) out.push({ title: 'Лучшая серия', value: `${m.streak} дн.` })
  if (m.after.level > m.before.level) out.push({ title: 'Рост за сезон', value: `+${m.after.level - m.before.level} ур.` })
  return out.slice(0, 3)
}

/** Видимость отрезка [a, b) с плавным входом и выходом. */
const fade = (t: number, a: number, b: number, f = 400) => Math.max(0, Math.min(1, (t - a) / f, (b - t) / f))

/** Кадр в момент t (мс): 0–3,5 с «было», 3–7 с «стало» со счётчиком уровня, 7–16 с три момента, 16–18 с итог. */
export function videoOps(m: CardModel, moments: Moment[], t: number, w = 720, h = 1280): CardOp[] {
  const k = w / 1080, X = (x: number) => Math.round(x * k), Y = (y: number) => Math.round(y * (h / 1920))
  const C = { text: '#f4f6ff', muted: '#929db8', fire: '#8757ff', fire2: '#b49bff', card: '#151d32' }
  const tx = (x: number, y: number, text: string, size: number, color: string, alpha: number, weight = 800): CardOp =>
    ({ op: 'text', x: X(x), y: Y(y), text, size: Math.round(size * k), color, align: 'center', weight, alpha })
  const img = (slot: 'before' | 'after', alpha: number): CardOp => ({ op: 'image', slot, x: X(140), y: Y(330), w: X(800), h: Y(1200), alpha })
  const ops: CardOp[] = [{ op: 'rect', x: 0, y: 0, w, h, fill: '#070b18', glow: '#2a1d5c' }, tx(540, 170, m.title, 60, C.fire2, Math.min(1, t / 600), 900)]
  // «было» → «стало»: смена аватара 3–4 с, уровень растёт 4–6 с
  const a = fade(t, 0, 3600), b = fade(t, 3000, 7400, 1000)
  if (a > 0) ops.push(img('before', a), tx(540, 1640, 'Было', 44, C.muted, a), tx(540, 1760, `Ур. ${m.before.level}`, 96, C.text, a, 900))
  if (b > 0) {
    const lv = Math.round(m.before.level + (m.after.level - m.before.level) * Math.max(0, Math.min(1, (t - 4000) / 2000)))
    ops.push(img('after', b), tx(540, 1640, 'Стало', 44, C.fire2, b), tx(540, 1760, `Ур. ${lv}`, 96, C.fire2, b, 900))
  }
  // моменты по 3 с поверх приглушённого «стало»
  if (t >= 7000 && t < 16000) {
    ops.push(img('after', 0.3 * fade(t, 7000, 16000)))
    moments.forEach((mo, i) => {
      const s = 7000 + i * 3000, v = fade(t, s, s + 3000, 300)
      if (v <= 0) return
      ops.push({ op: 'rect', x: X(90), y: Y(760), w: X(900), h: Y(420), fill: C.card, r: Math.round(36 * k), alpha: 0.92 * v },
        tx(540, 900, `Момент ${i + 1}`, 36, C.muted, v), tx(540, 1010, mo.title, 54, C.text, v), tx(540, 1120, mo.value, 64, C.fire, v, 900))
    })
  }
  // итог
  const e = fade(t, 16000, VIDEO_MS + 1000)
  if (e > 0) {
    ops.push(img('after', 0.45 * e), tx(540, 820, 'Индекс роста', 44, C.muted, e), tx(540, 980, m.index === null ? '—' : String(m.index), 150, C.fire, e, 900),
      tx(540, 1120, `Ур. ${m.before.level} → ${m.after.level} · серия ${m.streak} дн.`, 40, C.text, e))
  }
  return ops
}
