import { BALANCE as B } from './balance';
import type { SeasonKind } from './types';

export type CosmeticSlot = 'head' | 'neck' | 'cloak' | 'emblem' | 'background' | 'frame' | 'look';
export interface CosmeticDef { id: string; slot: CosmeticSlot; title: string; season: SeasonKind | null; price: number | null; rare: boolean }

type Kind = Exclude<SeasonKind, 'prologue'>;
const KINDS: Kind[] = ['winter', 'spring', 'summer', 'autumn'];
const GEN: Record<Kind, string> = { winter: 'Зимы', spring: 'Весны', summer: 'Лета', autumn: 'Осени' };
const SLOT_RU = { head: 'Шапка', neck: 'Шарф', cloak: 'Плащ', emblem: 'Знак' } as const;
const WEAR = ['head', 'neck', 'cloak', 'emblem'] as const;
const TIER = ['', ' II', ' III'];

const def = (id: string, slot: CosmeticSlot, title: string, season: SeasonKind | null = null, price: number | null = null, rare = false): CosmeticDef =>
  ({ id, slot, title, season, price, rare });

const ITEMS = Math.floor(B.season.steps / B.season.itemEvery);
const FULL_TIERS = Math.floor(ITEMS / WEAR.length);
const LAST_TIER = ['head', 'cloak'] as const;   // неполный ярус — шапка и плащ
/** n-я сезонная вещь (ступень itemEvery·n): полные ярусы по слотам WEAR, остаток — LAST_TIER. */
const seasonItem = (k: Kind, n: number): CosmeticDef => {
  const tier = Math.floor((n - 1) / WEAR.length), i = (n - 1) % WEAR.length;
  const slot = tier < FULL_TIERS ? WEAR[i] : LAST_TIER[i % LAST_TIER.length];
  return def(`season:${k}:${n * B.season.itemEvery}`, slot, `${SLOT_RU[slot]} ${GEN[k]}${TIER[Math.min(tier, TIER.length - 1)]}`, k);
};

const RARE: CosmeticDef[] = [
  def('rare:cloak-star', 'cloak', 'Плащ звездочёта', null, null, true),
  def('rare:head-dawn', 'head', 'Венец рассвета', null, null, true),
  def('rare:neck-moon', 'neck', 'Лунная подвеска', null, null, true),
  def('rare:emblem-comet', 'emblem', 'Знак кометы', null, null, true),
  def('rare:cloak-mist', 'cloak', 'Плащ туманов', null, null, true),
  def('rare:head-ember', 'head', 'Шлем углей', null, null, true),
];
const SHOP_ITEMS: [string, CosmeticSlot, string][] = [
  ['shop:head-cap', 'head', 'Дорожная шапка'], ['shop:neck-scarf', 'neck', 'Тёплый шарф'],
  ['shop:emblem-leaf', 'emblem', 'Знак листа'], ['shop:cloak-travel', 'cloak', 'Плащ путника'],
  ['shop:head-hood', 'head', 'Капюшон тени'], ['shop:neck-amulet', 'neck', 'Амулет удачи'],
  ['shop:emblem-sun', 'emblem', 'Знак солнца'], ['shop:cloak-royal', 'cloak', 'Мантия мастера'],
];
const SHOP: CosmeticDef[] = SHOP_ITEMS.map(([id, slot, title], i) => def(id, slot, title, null, B.cosmeticPrices[i] ?? null));

export const COSMETICS: CosmeticDef[] = [
  ...KINDS.flatMap(k => [
    ...Array.from({ length: ITEMS }, (_, i) => seasonItem(k, i + 1)),
    def(`bg:${k}`, 'background', `Фон ${GEN[k]}`, k), def(`frame:${k}`, 'frame', `Рамка ${GEN[k]}`, k),
    def(`look:${k}`, 'look', k === 'winter' ? 'Образ ронина' : `Образ ${GEN[k]}`, k),
  ]),
  ...RARE, ...SHOP,
];
export const RARE_POOL: string[] = RARE.map(c => c.id);
export const SHOP_COSMETICS: string[] = SHOP.map(c => c.id);

export const trophyItemId = (trophyId: string): string => `trophy:${trophyId}`;

const BY_ID = new Map(COSMETICS.map(c => [c.id, c]));
/** Трофеи этапа 4 — знаки `trophy:<id>` без записи в каталоге. */
export const cosmeticById = (id: string): CosmeticDef | null =>
  BY_ID.get(id) ?? (typeof id === 'string' && id.startsWith('trophy:') && id.length > 7 ? def(id, 'emblem', 'Знак трофея') : null);
