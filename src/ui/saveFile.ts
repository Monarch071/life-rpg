export function backupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `life-rpg-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/** Share succeeded / user cancelled (AbortError) / any other failure means "fall back to download". */
export async function tryShare(share: () => Promise<void>): Promise<'shared' | 'cancelled' | 'failed'> {
  try { await share(); return 'shared' }
  catch (e) { return (e as Error)?.name === 'AbortError' ? 'cancelled' : 'failed' }
}

/** iOS: share-sheet с файлом, иначе скачивание по ссылке. */
export async function saveBackup(blob: Blob): Promise<SaveResult> {
  const file = new File([blob], backupFileName(new Date()), { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    const r = await tryShare(() => navigator.share({ files: [file] }))
    if (r !== 'failed') return r
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'downloaded'
}
