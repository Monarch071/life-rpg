import { getSetting, setSetting } from './db'
import { call, type SyncConfig } from './sync'

export interface NotifyPrefs { on: boolean; morning: string | null; evening: string | null } // "HH:MM" или null

export const pushSupported = () =>
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window

/** iPhone даёт push только приложению, добавленному на экран «Домой». */
export const iosNotInstalled = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone
  && !matchMedia('(display-mode: standalone)').matches

export const toMin = (t: string | null): number | null => {
  const m = t ? /^(\d\d):(\d\d)$/.exec(t) : null
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null
}

const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))

export async function loadPrefs(): Promise<NotifyPrefs> {
  return {
    on: await getSetting('notifyOn', false),
    morning: await getSetting<string | null>('notifyMorning', '08:00'),
    evening: await getSetting<string | null>('notifyEvening', '21:00'),
  }
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) throw new Error('Уведомления работают только в установленном приложении')
  return reg
}

/** Вызывать прямо из нажатия кнопки: iOS спрашивает разрешение только в ответ на жест. */
export async function enablePush(cfg: SyncConfig, p: Omit<NotifyPrefs, 'on'>): Promise<void> {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Уведомления запрещены. Разреши их в настройках iPhone: Настройки → Уведомления → Life RPG')
  const reg = await registration()
  const { key } = await call(cfg, 'GET', '/push/key')
  if (typeof key !== 'string') throw new Error('Сервер не прислал ключ')
  const want = unb64u(key)
  let sub = await reg.pushManager.getSubscription()
  const have = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
  // shortcut: при смене ключа VAPID на сервере подписка пересоздаётся только при следующем включении
  if (sub && have && !(have.length === want.length && have.every((v, i) => v === want[i]))) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want })
  await call(cfg, 'POST', '/push/subscribe', {
    subscription: sub.toJSON(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    morning: toMin(p.morning),
    evening: toMin(p.evening),
  })
  await setSetting('notifyOn', true)
  await setSetting('notifyMorning', p.morning)
  await setSetting('notifyEvening', p.evening)
}

export async function disablePush(cfg: SyncConfig | null): Promise<void> {
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (sub) {
    if (cfg) await call(cfg, 'POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}) // сервер сам удалит мёртвую подписку
    await sub.unsubscribe()
  }
  await setSetting('notifyOn', false)
}

export async function testPush(cfg: SyncConfig): Promise<void> {
  const sub = await (await registration()).pushManager.getSubscription()
  if (!sub) throw new Error('Подписки нет — включи уведомления заново')
  const r = await call(cfg, 'POST', '/push/test', { endpoint: sub.endpoint })
  if (!r?.ok) throw new Error(`Push-сервис ответил ${r?.status ?? 'ошибкой'}`)
}
