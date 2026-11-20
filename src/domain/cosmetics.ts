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

/** Слот и ярус сезонной вещи ступени 3·n: 1–4 — I, 5–8 — II, 9–10 — III (шапка, плащ). */
const seasonItem = (k: Kind, n: number): CosmeticDef => {
  const slot = n <= 8 ? WEAR[(n - 1) % 4] : n === 9 ? 'head' : 'cloak';
  return def(`season:${k}:${n * 3}`, slot, `${SLOT_RU[slot]} ${GEN[k]}${TIER[n <= 4 ? 0 : n <= 8 ? 1 : 2]}`, k);
};

const RARE: CosmeticDef[] = [
  def('rare:cloak-star', 'cloak', 'Плащ звездочёта', null, null, true),
  def('rare:head-dawn', 'head', 'Венец рассвета', null, null, true),
  def('rare:neck-moon', 'neck', 'Лунная подвеска', null, null, true),
  def('rare:emblem-comet', 'emblem', 'Знак кометы', null, null, true),
  def('rare:cloak-mist', 'cloak', 'Плащ туманов', null, null, true),
  def('rare:head-ember', 'head', 'Шлем углей', null, null, true),
];
const SHOP: CosmeticDef[] = [
  def('shop:head-cap', 'head', 'Дорожная шапка', null, 100), def('shop:neck-scarf', 'neck', 'Тёплый шарф', null, 150),
  def('shop:emblem-leaf', 'emblem', 'Знак листа', null, 200), def('shop:cloak-travel', 'cloak', 'Плащ путника', null, 300),
  def('shop:head-hood', 'head', 'Капюшон тени', null, 400), def('shop:neck-amulet', 'neck', 'Амулет удачи', null, 500),
  def('shop:emblem-sun', 'emblem', 'Знак солнца', null, 650), def('shop:cloak-royal', 'cloak', 'Мантия мастера', null, 800),
];

export const COSMETICS: CosmeticDef[] = [
  ...KINDS.flatMap(k => [
    ...Array.from({ length: 10 }, (_, i) => seasonItem(k, i + 1)),
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
