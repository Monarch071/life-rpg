export interface HealthPacket {
  date: string; kind: 'morning' | 'evening' | 'other'
  health: { steps?: number; sleepHours?: number; workoutMin?: number; activeKcal?: number; restingHR?: number; weightKg?: number }
  calendar: { title: string; start: string; end: string }[]
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string') return undefined
  const s = v.replace(/\s/g, '').replace(',', '.')
  if (s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function inRange(n: number | undefined, min: number, max: number): number | undefined {
  return n !== undefined && n >= min && n <= max ? n : undefined
}

export function parseSyncPayload(body: unknown): { ok: true; packet: HealthPacket } | { ok: false; error: string } {
  if (!isObj(body)) return { ok: false, error: 'Ожидался JSON-объект' }
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
  const set = <K extends keyof HealthPacket['health']>(k: K, v: number | undefined) => { if (v !== undefined) health[k] = v }
  set('steps', steps === undefined ? undefined : Math.round(steps))
  set('sleepHours', inRange(sleepHours, 0, 24))
  set('workoutMin', inRange(workoutMin, 0, 1440))
  set('activeKcal', inRange(get('activeKcal'), 0, 20000))
  set('restingHR', inRange(get('restingHR'), 20, 250))
  set('weightKg', inRange(get('weightKg'), 20, 400))

  const calendar: HealthPacket['calendar'] = []
  if (Array.isArray(body.calendar)) {
    for (const e of body.calendar) {
      if (calendar.length >= 50) break
      if (!isObj(e) || typeof e.start !== 'string' || typeof e.end !== 'string') continue
      const s = Date.parse(e.start), en = Date.parse(e.end)
      if (!Number.isFinite(s) || !Number.isFinite(en) || en <= s) continue
      calendar.push({ title: typeof e.title === 'string' ? e.title.slice(0, 100) : '', start: e.start, end: e.end })
    }
  }
  return { ok: true, packet: { date, kind, health, calendar } }
}
