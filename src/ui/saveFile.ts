export function backupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `life-rpg-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`
}

/** iOS: share-sheet с файлом, иначе скачивание по ссылке. */
export async function saveBackup(blob: Blob): Promise<void> {
  const file = new File([blob], backupFileName(new Date()), { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e
    }
    return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
