import { expect, test } from 'vitest';
import { stepRewards, stepXpFor } from './seasonPath';
import { cosmeticById, SHOP_COSMETICS } from './cosmetics';

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
