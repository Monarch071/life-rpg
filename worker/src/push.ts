import type { Store } from './store'
import { isPushEndpoint, sendPush, unb64u, type Vapid } from './webpush'

export interface PushRow {
  endpoint: string; p256dh: string; auth: string; tz: string
  morning: number | null; evening: number | null
  last_morning: string | null; last_evening: string | null
}
export type Kind = 'morning' | 'evening'

const WINDOW = 60 // минут после назначенного времени, когда ещё можно прислать

export function validTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false }
}
const validMin = (m: unknown): m is number | null => m === null || (Number.isInteger(m) && (m as number) >= 0 && (m as number) < 1440)
const keyLen = (s: unknown, n: number) => {
  if (typeof s !== 'string' || s.length > 200) return false
  try { return unb64u(s).length === n } catch { return false }
}

/** Разбор тела /push/subscribe; null — некорректно. */
export function parseSubscribe(b: any): Omit<PushRow, 'last_morning' | 'last_evening'> | null {
  const s = b?.subscription
  if (!isPushEndpoint(s?.endpoint) || !keyLen(s?.keys?.p256dh, 65) || !keyLen(s?.keys?.auth, 16)) return null
  if (!validTz(b.tz) || !validMin(b.morning) || !validMin(b.evening)) return null
  return { endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, tz: b.tz, morning: b.morning, evening: b.evening }
}

export function localNow(tz: string, now: number): { date: string; min: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute }
}

const prevDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)

export function due(r: PushRow, now: number): { kind: Kind; date: string }[] {
  const { date, min } = localNow(r.tz, now)
  const out: { kind: Kind; date: string }[] = []
  for (const kind of ['morning', 'evening'] as const) {
    const t = r[kind]
    if (t === null || (min - t + 1440) % 1440 >= WINDOW) continue
    const slot = min >= t ? date : prevDay(date) // окно 23:30 продолжается после полуночи
    if (r[`last_${kind}`] !== slot) out.push({ kind, date: slot })
  }
  return out
}

const TEXTS: Record<Kind | 'test', { title: string; body: string[] }> = {
  morning: { title: 'Утро, герой', body: [
    'Новый день — новые задания. Открой «Мой день» и выбери первое.',
    'Начни день с одного задания — остальное пойдёт легче.',
    'Отметь подъём и возьми задания дня.',
  ] },
  evening: { title: 'Итоги дня', body: [
    'Отметь сделанное, пока день не закрылся.',
    'День почти закончен. Пара минут на отметки — и опыт твой.',
    'Проверь задания дня: что сделано, то засчитается.',
  ] },
  test: { title: 'Life RPG', body: ['Уведомления работают.'] },
}

export function message(kind: Kind | 'test' | 'wake', date = '', extra?: { sleepHours: number }) {
  if (kind === 'wake') {
    const h = (extra?.sleepHours ?? 0).toFixed(1).replace('.', ',')
    return { title: 'Доброе утро, герой', body: `Сон ${h} ч засчитан. Открой «Мой день» — задания ждут`, tag: 'morning', url: '/life-rpg/' }
  }
  const t = TEXTS[kind]
  const day = Number(date.slice(-2)) || 0
  return { title: t.title, body: t.body[day % t.body.length], tag: kind, url: '/life-rpg/' }
}

const dead = (status: number) => status === 404 || status === 410

/** Отправка одного сообщения; мёртвую подписку удаляет. */
export async function pushTo(store: Store, r: PushRow, payload: object, v: Vapid, fetcher?: typeof fetch): Promise<number> {
  const status = await sendPush(r, payload, v, fetcher)
  if (dead(status)) await store.deletePushSub(r.endpoint)
  return status
}

export async function runCron(store: Store, v: Vapid, now: number, fetcher?: typeof fetch): Promise<number> {
  let sent = 0
  for (const r of await store.listPushSubs()) {
    for (const { kind, date } of due(r, now)) {
      try {
        const status = await pushTo(store, r, message(kind, date), v, fetcher)
        if (dead(status)) break
        // при временной ошибке (5xx, 429) не отмечаем — повторим через 15 минут в пределах окна
        if (status < 300) { await store.markPushSent(r.endpoint, kind, date); sent++ }
        else console.error('push', kind, status)
      } catch (e) { console.error('push', kind, e) } // сеть или неверный VAPID_PRIVATE — повторим на следующем тике
    }
  }
  return sent
}

const WAKE_FROM = 240 // не раньше 04:00 по местному времени

/** Утренний пуш сразу после синхронизации сна; cron позже в этот день уже не шлёт. */
export async function sendWakePush(store: Store, v: Vapid, now: number, packetDate: string, sleepHours: number, fetcher?: typeof fetch): Promise<number> {
  let sent = 0
  for (const r of await store.listPushSubs()) {
    const { date, min } = localNow(r.tz, now)
    if (r.morning === null || date !== packetDate || r.last_morning === date || min < WAKE_FROM) continue
    try {
      const status = await pushTo(store, r, message('wake', date, { sleepHours }), v, fetcher)
      if (status < 300) { await store.markPushSent(r.endpoint, 'morning', date); sent++ }
      else if (!dead(status)) console.error('push wake', status)
    } catch (e) { console.error('push wake', e) }
  }
  return sent
}
