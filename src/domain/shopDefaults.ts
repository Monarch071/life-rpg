import { BALANCE } from './balance';
import type { DistributiveOmit, GameEvent } from './types';

type RewardCreated = Extract<DistributiveOmit<GameEvent, 'id' | 'ts' | 'deviceId'>, { type: 'reward_created' }>;

/** Посев стартового магазина: награды, чьего reward_created с id 'default:<slug>' ещё нет (удалённые не возвращаются). */
export function missingDefaultRewards(events: GameEvent[]): RewardCreated[] {
  const have = new Set(events.filter(e => e?.type === 'reward_created').map(e => (e as { rewardId: unknown }).rewardId));
  return BALANCE.rewards.filter(r => !have.has(`default:${r.slug}`))
    .map(r => ({ type: 'reward_created', rewardId: `default:${r.slug}`, title: r.title, price: r.price, ...(r.effect ? { effect: r.effect } : {}) }));
}
