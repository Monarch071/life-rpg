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

/** iOS: share-sheet с файлом («Сохранить изображение», сторис), иначе скачивание по ссылке. Никакой загрузки на сервер. */
export async function saveFile(blob: Blob, name: string): Promise<SaveResult> {
  const file = new File([blob], name, { type: blob.type })
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

export const saveBackup = (blob: Blob): Promise<SaveResult> =>
  saveFile(new Blob([blob], { type: 'application/json' }), backupFileName(new Date()))
