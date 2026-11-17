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

export async function saveBlob(name: string, blob: Blob): Promise<void> {
  await db.blobs.put({ name, blob, uploaded: 0 })
  if (await upload(name, blob)) await db.blobs.update(name, { uploaded: 1 })
}

export async function getBlob(name: string): Promise<Blob | null> {
  const local = await db.blobs.get(name)
  if (local) return local.blob
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
  for (const b of await db.blobs.filter(b => b.uploaded === 0).toArray()) {
    if (await upload(b.name, b.blob)) await db.blobs.update(b.name, { uploaded: 1 })
  }
}

export function useBlobUrl(name: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let dead = false
    let u: string | null = null
    setSrc(null)
    if (name) void getBlob(name).then(b => { if (b && !dead) setSrc(u = URL.createObjectURL(b)) })
    return () => { dead = true; if (u) URL.revokeObjectURL(u) }
  }, [name])
  return src
}
