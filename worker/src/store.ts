export interface Store {
  getTokenHash(): Promise<string | null>
  setTokenHashIfAbsent(hash: string): Promise<boolean>
  replaceTokenHash(hash: string): Promise<void>
  insertEvents(evs: { id: string; ts: number; type: string; body: string }[]): Promise<number>
  eventsSince(seq: number, limit: number): Promise<{ seq: number; body: string }[]>
  lastHealthAt(): Promise<number | null>
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
}
