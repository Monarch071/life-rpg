import { expect, test } from 'vitest';
import { BALANCE } from './balance';
import { missingDefaultRewards } from './shopDefaults';
import type { GameEvent } from './types';

test('посев только недостающих наград с детерминированным id', () => {
  const all = missingDefaultRewards([]);
  expect(all).toHaveLength(BALANCE.rewards.length);
  expect(all.find(e => e.rewardId === 'default:freeze')).toMatchObject({ type: 'reward_created', price: 300, effect: 'streak_freeze' });
  expect(all.find(e => e.rewardId === 'default:book')).not.toHaveProperty('effect');
  expect(all[0].title).toBe('Серия аниме или сериала');
  const one = { id: 'x', ts: 1, deviceId: 'd', ...all[0] } as GameEvent;
  expect(missingDefaultRewards([one]).map(e => e.rewardId)).not.toContain(all[0].rewardId);
  expect(missingDefaultRewards([one])).toHaveLength(all.length - 1);
  expect(() => missingDefaultRewards([null, 5, {}] as never)).not.toThrow();
});
