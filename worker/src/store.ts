import type { Kind, PushRow } from './push'

export interface Store {
  getTokenHash(): Promise<string | null>
  setTokenHashIfAbsent(hash: string): Promise<boolean>
  replaceTokenHash(hash: string): Promise<void>
  insertEvents(evs: { id: string; ts: number; type: string; body: string }[]): Promise<number>
  eventsSince(seq: number, limit: number): Promise<{ seq: number; body: string }[]>
  lastHealthAt(): Promise<number | null>
  putBlob(name: string, mime: string, dataB64: string): Promise<void>
  getBlob(name: string): Promise<{ mime: string; data: string } | null>
  upsertPushSub(r: Omit<PushRow, 'last_morning' | 'last_evening'>): Promise<void>
  deletePushSub(endpoint: string): Promise<void>
  getPushSub(endpoint: string): Promise<PushRow | null>
  listPushSubs(): Promise<PushRow[]>
  markPushSent(endpoint: string, kind: Kind, date: string): Promise<void>
  getMeta(key: string): Promise<string | null>
  setMeta(key: string, value: string): Promise<void>
  /** +1 к счётчику в meta, возвращает новое значение. */
  bump(key: string): Promise<number>
}

export interface D1Stmt {
  bind(...v: unknown[]): D1Stmt
  run(): Promise<{ meta: { changes: number } }>
  all<T = unknown>(): Promise<{ results: T[] }>
  first<T = unknown>(): Promise<T | null>
}
export interface D1Like {
  prepare(sql: string): D1Stmt
  batch(stmts: D1Stmt[]): Promise<{ meta: { changes: number } }[]>
}

export class D1Store implements Store {
  constructor(private db: D1Like) {}

  async getTokenHash() {
    const r = await this.db.prepare("SELECT value FROM meta WHERE key='token_hash'").first<{ value: string }>()
    return r ? r.value : null
  }
  async setTokenHashIfAbsent(hash: string) {
    const r = await this.db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('token_hash', ?)").bind(hash).run()
    return r.meta.changes > 0
  }
  async replaceTokenHash(hash: string) {
    await this.db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('token_hash', ?)").bind(hash).run()
  }
  async insertEvents(evs: { id: string; ts: number; type: string; body: string }[]) {
    if (!evs.length) return 0
    const stmts = evs.map(e =>
      this.db.prepare('INSERT OR IGNORE INTO events (id, ts, type, body) VALUES (?, ?, ?, ?)').bind(e.id, e.ts, e.type, e.body))
    const res = await this.db.batch(stmts)
    return res.reduce((n, r) => n + r.meta.changes, 0)
  }
  async eventsSince(seq: number, limit: number) {
    const r = await this.db.prepare('SELECT seq, body FROM events WHERE seq > ? ORDER BY seq LIMIT ?')
      .bind(seq, limit).all<{ seq: number; body: string }>()
    return r.results
  }
  async lastHealthAt() {
    const r = await this.db.prepare("SELECT MAX(ts) AS t FROM events WHERE type='health_packet'").first<{ t: number | null }>()
    return r?.t ?? null
  }
  async putBlob(name: string, mime: string, dataB64: string) {
    await this.db.prepare('INSERT OR REPLACE INTO blobs (name, mime, data, ts) VALUES (?, ?, ?, ?)').bind(name, mime, dataB64, Date.now()).run()
  }
  async getBlob(name: string) {
    return this.db.prepare('SELECT mime, data FROM blobs WHERE name = ?').bind(name).first<{ mime: string; data: string }>()
  }
  async upsertPushSub(r: Omit<PushRow, 'last_morning' | 'last_evening'>) {
    await this.db.prepare(`INSERT INTO push_subs (endpoint, p256dh, auth, tz, morning, evening) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, tz=excluded.tz, morning=excluded.morning, evening=excluded.evening`)
      .bind(r.endpoint, r.p256dh, r.auth, r.tz, r.morning, r.evening).run()
  }
  async deletePushSub(endpoint: string) {
    await this.db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run()
  }
  async getPushSub(endpoint: string) {
    return this.db.prepare('SELECT * FROM push_subs WHERE endpoint = ?').bind(endpoint).first<PushRow>()
  }
  async listPushSubs() {
    return (await this.db.prepare('SELECT * FROM push_subs').all<PushRow>()).results
  }
  async markPushSent(endpoint: string, kind: Kind, date: string) {
    const col = kind === 'morning' ? 'last_morning' : 'last_evening'
    await this.db.prepare(`UPDATE push_subs SET ${col} = ? WHERE endpoint = ?`).bind(date, endpoint).run()
  }
  async getMeta(key: string) {
    return (await this.db.prepare('SELECT value FROM meta WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null
  }
  async setMeta(key: string, value: string) {
    await this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').bind(key, value).run()
  }
  async bump(key: string) {
    const r = await this.db.prepare("INSERT INTO meta (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = CAST(value AS INTEGER) + 1 RETURNING value")
      .bind(key).first<{ value: string }>()
    return Number(r?.value ?? 1)
  }
}
