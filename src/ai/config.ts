import { db, getSetting, setSetting } from '../db'
import { DEFAULT_SYNC_URL, getSyncConfig, type SyncConfig } from '../sync'

export type AiProvider = 'gemini' | 'claude' | 'openai'
/** via — встроенный ИИ: запросы идут через наш сервер, ключ Gemini лежит там. Без синхронизации — анонимно по id устройства. */
export interface AiConfig { provider: AiProvider; key: string; textModel: string; imageModel: string | null; via?: SyncConfig & { device?: string } }

/** Случайный id устройства для суточного лимита встроенного ИИ; создаётся один раз. */
async function deviceId(): Promise<string> {
  let id = await getSetting<string>('deviceId', '')
  if (!id) { id = crypto.randomUUID(); await setSetting('deviceId', id) }
  return id
}

export const BUILTIN_MODEL = 'встроенный'

export const PROVIDER_NAMES: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
}

const KEYS = ['aiProvider', 'aiKey', 'aiTextModel', 'aiImageModel']

export async function getAiConfig(): Promise<AiConfig | null> {
  const provider = await getSetting<AiProvider | null>('aiProvider', null)
  const key = await getSetting('aiKey', '')
  const textModel = await getSetting('aiTextModel', '')
  if (!provider || !(provider in PROVIDER_NAMES) || !key || !textModel) {
    const via = (await getSyncConfig()) ?? { url: DEFAULT_SYNC_URL, token: '', device: await deviceId() }
    return { provider: 'gemini', key: '', textModel: BUILTIN_MODEL, imageModel: BUILTIN_MODEL, via }
  }
  return { provider, key, textModel, imageModel: (await getSetting<string | null>('aiImageModel', null)) || null }
}

export async function saveAiConfig(c: AiConfig): Promise<void> {
  await setSetting('aiProvider', c.provider)
  await setSetting('aiKey', c.key)
  await setSetting('aiTextModel', c.textModel)
  await setSetting('aiImageModel', c.imageModel)
}

export async function clearAiConfig(): Promise<void> {
  await db.settings.bulkDelete(KEYS)
}
