import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSyncPayload } from './parse'

const md = readFileSync(new URL('../../docs/shortcuts.md', import.meta.url), 'utf8')
const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1])

describe('docs/shortcuts.md', () => {
  it('содержит примеры JSON', () => expect(blocks.length).toBeGreaterThan(10))
  it.each(blocks.map(b => [b]))('пример проходит разбор: %s', b => {
    const body = JSON.parse(b) as { at?: string; date?: string }
    if (body.at) expect(body.at).toMatch(/T\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/) // at только с часовым поясом
    const now = Date.parse(body.at ?? `${body.date}T12:00:00Z`) + 60_000
    const r = parseSyncPayload(body, now)
    expect(r.ok).toBe(true)
    if (r.ok && body.at) expect(r.value).toMatchObject({ kind: 'signal', at: Date.parse(body.at) })
  })
})
