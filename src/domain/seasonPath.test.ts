import { expect, test } from 'vitest';
import { stepRewards, stepXpFor } from './seasonPath';
import { COSMETICS, cosmeticById, SHOP_COSMETICS } from './cosmetics';
import { BALANCE as B } from './balance';

test('цена ступени: 600; поздний вход пропорционально [S§8]', () => {
  const w = { start: '2026-12-01', end: '2027-02-28' };
  expect(stepXpFor(w, '2026-11-17')).toBe(600); expect(stepXpFor(w, '2026-12-01')).toBe(600);
  expect(stepXpFor(w, '2027-01-15')).toBe(300); expect(stepXpFor(w, '2027-02-28')).toBe(60); expect(stepXpFor(w, null)).toBe(600);
});
test('награды ступеней [P§6]', () => {
  expect(stepRewards('winter', 1)).toEqual({ gold: 50, items: [], title: null });
  expect(stepRewards('winter', 3).items).toEqual(['season:winter:3']);
  expect(stepRewards('winter', 10).items).toEqual(['bg:winter']);
  expect(stepRewards('winter', 20).items).toEqual(['frame:winter']);
  expect(stepRewards('winter', 30)).toEqual({ gold: 50, items: ['season:winter:30', 'look:winter'], title: 'Покоритель Зимы' });
  const all = Array.from({ length: 30 }, (_, i) => stepRewards('spring', i + 1));
  expect(all.reduce((a, r) => a + r.gold, 0)).toBe(1500); expect(all.flatMap(r => r.items)).toHaveLength(13);
  expect(all.flatMap(r => r.items).every(id => cosmeticById(id))).toBe(true);
  expect(SHOP_COSMETICS.map(id => cosmeticById(id)!.price!).every(p => p >= 100 && p <= 800)).toBe(true);
  expect(cosmeticById(SHOP_COSMETICS[0])!.price).toBe(100);   // первая — самая дешёвая (тест покупки в T6)
});
test('цена ступени: неверная дата — полная цена, без NaN', () => {
  const w = { start: '2026-12-01', end: '2027-02-28' };
  expect(stepXpFor(w, '2027-xx-15')).toBe(600); expect(stepXpFor({ start: '2026-12-01', end: 'bad' }, '2027-01-15')).toBe(600);
});
test('каталог сезонных вещей следует BALANCE.season, цены магазина — BALANCE.cosmeticPrices', () => {
  const ids = COSMETICS.filter(c => c.season === 'winter' && c.id.startsWith('season:')).map(c => c.id);
  expect(ids).toEqual(Array.from({ length: Math.floor(B.season.steps / B.season.itemEvery) }, (_, i) => `season:winter:${(i + 1) * B.season.itemEvery}`));
  expect(cosmeticById('season:winter:27')!.title).toBe('Шапка Зимы III'); expect(cosmeticById('season:winter:30')!.slot).toBe('cloak');
  expect(cosmeticById('season:winter:15')!.title).toBe('Шапка Зимы II');
  expect(SHOP_COSMETICS.map(id => cosmeticById(id)!.price)).toEqual([...B.cosmeticPrices]);
});
