import type { Store } from './store'

// Только для тестов: ведёт себя как D1 (seq с 1, INSERT OR IGNORE по id).
export class MemoryStore implements Store {
  hash: string | null = null
  rows: { seq: number; id: string; ts: number; type: string; body: string }[] = []
  private seq = 0

  async getTokenHash() { return this.hash }
  async setTokenHashIfAbsent(h: string) { if (this.hash !== null) return false; this.hash = h; return true }
  async replaceTokenHash(h: string) { this.hash = h }
  async insertEvents(evs: { id: string; ts: number; type: string; body: string }[]) {
    let n = 0
    for (const e of evs) {
      if (this.rows.some(r => r.id === e.id)) continue
      this.rows.push({ seq: ++this.seq, ...e })
      n++
    }
    return n
  }
  async eventsSince(seq: number, limit: number) {
    return this.rows.filter(r => r.seq > seq).slice(0, limit).map(r => ({ seq: r.seq, body: r.body }))
  }
  async lastHealthAt() {
    const ts = this.rows.filter(r => r.type === 'health_packet').map(r => r.ts)
    return ts.length ? Math.max(...ts) : null
  }
}
