import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('./providers', async (orig) => ({ ...(await orig<typeof import('./providers')>()), generateJson: vi.fn() }));
import { AiError, generateJson } from './providers';
import { aiBossOptions, aiChainSteps, aiLadderSteps } from './game';
import { bossOptionsByRules } from '../domain/boss';
import { LADDER_PRESETS } from '../domain/ladder';
import type { AiConfig } from './config';

const cfg: AiConfig = { provider: 'gemini', key: 'K', textModel: 'm', imageModel: null };
const gen = vi.mocked(generateJson);
beforeEach(() => gen.mockReset());

test('aiBossOptions: невалидный вариант заменяется правилами', async () => {
  const fb = bossOptionsByRules({ goals: [], legacy: [], yearGoal: null, theme: 'body' });
  gen.mockResolvedValue({ options: [fb[1], { title: 'x' }] });
  const r = await aiBossOptions(cfg, ['Цель'], fb);
  expect(r).toEqual([fb[1], fb[1], fb[2]]);
  expect(JSON.stringify(gen.mock.calls[0])).toContain('Цель');
});
test('aiChainSteps / aiLadderSteps: валидный ответ проходит, мусор — bad_response', async () => {
  gen.mockResolvedValue({ steps: ['Идеи', 'Проба', 'Результат'] });
  expect(await aiChainSteps(cfg, 'Запустить проект')).toEqual(['Идеи', 'Проба', 'Результат']);
  gen.mockResolvedValue({ steps: ['a'] });
  await expect(aiChainSteps(cfg, 'x')).rejects.toMatchObject({ kind: 'bad_response' });
  gen.mockResolvedValue({ steps: LADDER_PRESETS.read.steps });
  expect(await aiLadderSteps(cfg, 'Растяжка', 'do')).toEqual(LADDER_PRESETS.read.steps);
  gen.mockResolvedValue({ steps: LADDER_PRESETS.read.steps.slice(1) });
  const e = await aiLadderSteps(cfg, 'Растяжка', 'do').catch(x => x);
  expect(e).toBeInstanceOf(AiError); expect(e.kind).toBe('bad_response');
});
test('aiLadderSteps: «не делать» в ИИ не уходит', async () => {
  gen.mockResolvedValue({ steps: LADDER_PRESETS.read.steps });
  await expect(aiLadderSteps(cfg, 'СЕКРЕТ', 'dont')).rejects.toBeInstanceOf(AiError);
  expect(gen).not.toHaveBeenCalled();
});
