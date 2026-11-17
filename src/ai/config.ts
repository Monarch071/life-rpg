import { db, getSetting, setSetting } from '../db'

export type AiProvider = 'gemini' | 'claude' | 'openai'
export interface AiConfig { provider: AiProvider; key: string; textModel: string; imageModel: string | null }

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
  if (!provider || !(provider in PROVIDER_NAMES) || !key || !textModel) return null
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
