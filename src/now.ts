import { fromMin } from './domain/day'

// Dev-only time travel: ?now=<ISO datetime> shifts the clock (time keeps running from there). Production ignores it.
const q = import.meta.env.DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('now') : null
const t = q ? Date.parse(q) : NaN
const offset = Number.isFinite(t) ? t - Date.now() : 0

export const now = (): number => Date.now() + offset
export const hhmmNow = (): string => { const d = new Date(now()); return fromMin(d.getHours() * 60 + d.getMinutes()) }
