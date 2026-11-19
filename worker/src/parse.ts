export interface HealthPacket {
  date: string; kind: 'morning' | 'evening' | 'other'
  health: { steps?: number; sleepHours?: number; workoutMin?: number; activeKcal?: number; restingHR?: number; weightKg?: number
    mindfulMin?: number; workouts?: { type: string; start?: number; end?: number; minutes: number }[] }
  calendar: { title: string; start: string; end: string }[]
}

export type Signal =
  | { kind: 'arrive'; place: 'gym' | 'work' | 'home' }
  | { kind: 'app'; app: 'social' | 'games'; state: 'open' | 'close' }
  | { kind: 'focus'; state: 'on' | 'off' }
  | { kind: 'wallet'; amount: number; merchant: string }
export type SyncPacket = { kind: 'health'; packet: HealthPacket } | { kind: 'signal'; at: number; signal: Signal }

export function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  const s = v.replace(/[\s\u00a0\u202f₸₽$€]/g, '').replace(',', '.')
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function inRange(n: number | undefined, min: number, max: number): number | undefined {
  return n !== undefined && n >= min && n <= max ? n : undefined
}

const AT_PAST = 7 * 86_400_000, AT_FUTURE = 10 * 60_000 // окно времени сигнала от «Команд»
const WORKOUTS_MAX = 50
const stripCtl = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, '')

function parseSignal(body: Obj, now: number): { ok: true; value: SyncPacket } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error })
  let at = now
  if (body.at !== undefined) {
    const p = typeof body.at === 'string' ? Date.parse(body.at) : (num(body.at) ?? NaN)
    if (Number.isFinite(p)) { // не разобралось — время сервера (§3.1)
      if (p < now - AT_PAST || p > now + AT_FUTURE) return bad('Время at вне допустимого окна')
      at = p
    }
  }
  let signal: Signal | null = null
  if (body.kind === 'arrive' && (body.place === 'gym' || body.place === 'work' || body.place === 'home')) signal = { kind: 'arrive', place: body.place }
  else if (body.kind === 'app' && (body.app === 'social' || body.app === 'games') && (body.state === 'open' || body.state === 'close')) signal = { kind: 'app', app: body.app, state: body.state }
  else if (body.kind === 'focus' && (body.state === 'on' || body.state === 'off')) signal = { kind: 'focus', state: body.state }
  else if (body.kind === 'wallet') {
    const amount = num(body.amount)
    if (amount === undefined || amount === 0 || Math.abs(amount) > 1e7) return bad('Некорректная сумма')
    const merchant = (typeof body.merchant === 'string' ? body.merchant : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60)
    signal = { kind: 'wallet', amount, merchant }
  }
  return signal ? { ok: true, value: { kind: 'signal', at, signal } } : bad('Некорректный сигнал')
}

export function parseSyncPayload(body: unknown, now: number): { ok: true; value: SyncPacket } | { ok: false; error: string } {
  if (!isObj(body)) return { ok: false, error: 'Ожидался JSON-объект' }
  if (body.kind === 'arrive' || body.kind === 'app' || body.kind === 'focus' || body.kind === 'wallet') return parseSignal(body, now)
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Поле date должно быть в формате ГГГГ-ММ-ДД' }
  const kind = body.kind === 'morning' || body.kind === 'evening' ? body.kind : 'other'

  // вложенный health побеждает плоские поля
  const nested = isObj(body.health) ? body.health : {}
  const get = (k: string) => num(nested[k]) ?? num(body[k])

  let workoutMin = get('workoutMin')
  if (workoutMin === undefined) {
    const list = Array.isArray(nested.workouts) ? nested.workouts : Array.isArray(body.workouts) ? body.workouts : null
    if (list) {
      const vals = list.map(w => (isObj(w) ? num(w.minutes) : num(w))).filter((x): x is number => x !== undefined)
      if (vals.length) workoutMin = vals.reduce((a, b) => a + b, 0)
    }
  }
  let sleepHours = get('sleepHours')
  if (sleepHours === undefined) {
    const m = get('sleepMinutes')
    if (m !== undefined) sleepHours = Math.round((m / 60) * 100) / 100
  }
  const steps = inRange(get('steps'), 0, 200000)

  const health: HealthPacket['health'] = {}
  const set = <K extends Exclude<keyof HealthPacket['health'], 'workouts'>>(k: K, v: number | undefined) => { if (v !== undefined) health[k] = v }
  set('steps', steps === undefined ? undefined : Math.round(steps))
  set('sleepHours', inRange(sleepHours, 0, 24))
  set('workoutMin', inRange(workoutMin, 0, 1440))
  set('activeKcal', inRange(get('activeKcal'), 0, 20000))
  set('restingHR', inRange(get('restingHR'), 20, 250))
  set('weightKg', inRange(get('weightKg'), 20, 400))

  set('mindfulMin', inRange(get('mindfulMinutes') ?? get('mindfulMin'), 0, 1440))
  const rawW = Array.isArray(nested.workouts) ? nested.workouts : Array.isArray(body.workouts) ? body.workouts : []
  const workouts: NonNullable<HealthPacket['health']['workouts']> = []
  for (const w of rawW) {
    if (workouts.length >= WORKOUTS_MAX) break
    if (!isObj(w)) continue
    const s = typeof w.start === 'string' ? Date.parse(w.start) : NaN, e = typeof w.end === 'string' ? Date.parse(w.end) : NaN
    const minutes = inRange(num(w.minutes) ?? (e > s ? (e - s) / 60000 : undefined), 0, 1440)
    if (minutes === undefined) continue
    workouts.push({ type: typeof w.type === 'string' ? stripCtl(w.type).slice(0, 60) : '', ...(e > s ? { start: s, end: e } : {}), minutes })
  }
  if (workouts.length) health.workouts = workouts

  const calendar: HealthPacket['calendar'] = []
  if (Array.isArray(body.calendar)) {
    for (const e of body.calendar) {
      if (calendar.length >= 50) break
      if (!isObj(e) || typeof e.start !== 'string' || typeof e.end !== 'string') continue
      const s = Date.parse(e.start), en = Date.parse(e.end)
      if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue
      calendar.push({ title: typeof e.title === 'string' ? stripCtl(e.title).slice(0, 100) : '', start: e.start, end: e.end })
    }
  }
  return { ok: true, value: { kind: 'health', packet: { date, kind, health, calendar } } }
}
