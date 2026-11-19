import { useEffect, useState } from 'react'
import { db } from './db'
import { getSyncConfig } from './sync'

const url = (cfg: { url: string }, name: string) => `${cfg.url.replace(/\/+$/, '')}/blob/${name}`

async function upload(name: string, blob: Blob): Promise<boolean> {
  try {
    const cfg = await getSyncConfig()
    if (!cfg) return false
    const res = await fetch(url(cfg, name), {
      method: 'PUT',
      headers: { authorization: `Bearer ${cfg.token}`, 'content-type': blob.type },
      body: blob,
      signal: AbortSignal.timeout(15_000),
    })
    return res.ok
  } catch {
    return false
  }
}

// фото-доказательства заданий приватны: только на этом устройстве, синк их не выгружает
const PRIVATE = 'proof-'
const shared = (name: string) => !name.startsWith(PRIVATE)

export async function saveBlob(name: string, blob: Blob): Promise<void> {
  await db.blobs.put({ name, blob, uploaded: 0 })
  if (shared(name) && await upload(name, blob)) await db.blobs.update(name, { uploaded: 1 })
}

export async function getBlob(name: string): Promise<Blob | null> {
  const local = await db.blobs.get(name)
  if (local) return local.blob
  if (!shared(name)) return null
  try {
    const cfg = await getSyncConfig()
    if (!cfg) return null
    const res = await fetch(url(cfg, name), { headers: { authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    const blob = new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') ?? '' })
    await db.blobs.put({ name, blob, uploaded: 1 })
    return blob
  } catch {
    return null
  }
}

export async function uploadPendingBlobs(): Promise<void> {
  for (const b of await db.blobs.filter(b => b.uploaded === 0 && shared(b.name)).toArray()) {
    if (await upload(b.name, b.blob)) await db.blobs.update(b.name, { uploaded: 1 })
  }
}

export function useBlobUrl(name: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    let u: string | null = null
    setSrc(null)
    if (name) void getBlob(name).then(b => { if (b && !dead) setSrc(u = URL.createObjectURL(b)) }).catch(() => {})
    return () => { dead = true; if (u) URL.revokeObjectURL(u) }
  }, [name])
  return src
}
