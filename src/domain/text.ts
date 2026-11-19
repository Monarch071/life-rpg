/** Недоверенная строка → без управляющих символов, trim, не длиннее max; пусто/не строка → null. */
export function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max).trim();
  return t || null;
}
