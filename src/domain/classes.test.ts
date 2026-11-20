import { expect, test } from 'vitest';
import { CLASS_PAIRS, classOfPair, classWeights, passivePower, pickClass, questBonuses } from './classes';
import { fatiguePenalty, questReward } from './progression';
import type { Stat } from './types';

const ALL: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];
test('таблица покрывает все 21 пару ровно один раз [S§5]', () => {
  const seen = Object.values(CLASS_PAIRS).flat().map(([a, b]) => [a, b].sort().join('+'));
  expect(seen).toHaveLength(21); expect(new Set(seen).size).toBe(21);
  expect(classOfPair('int', 'str')).toBe('warrior'); expect(classOfPair('spi', 'fin')).toBe('merchant');
});
test('вес = Основа × (0,5 + 0,5 × Форма); null = в форме [S§5, S§2 пример]', () => {
  const w = classWeights({ str: 48, end: 40, int: 30, dis: 30, cha: 30, fin: 30, spi: 30 }, { str: 0.38, end: null, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 });
  expect(w.str).toBeCloseTo(33.12); expect(w.end).toBe(40);
});
test('Странник при разбросе ≤ 10% среднего; иначе две тяжёлые', () => {
  const w = (v: number[]) => Object.fromEntries(ALL.map((s, i) => [s, v[i]])) as Record<Stat, number>;
  expect(pickClass(w([50, 52, 54, 55, 51, 53, 50]), null)).toEqual({ id: 'wanderer', pair: null });   // разброс 5 ≤ 5,21
  expect(pickClass(w([60, 40, 58, 40, 40, 40, 40]), null)).toEqual({ id: 'warrior', pair: ['str', 'int'] });
});
test('гистерезис 5%: новая пара должна опережать на 5% [S§5]', () => {
  const base = { str: 50, end: 50, int: 10, dis: 10, cha: 10, fin: 10, spi: 10 };   // Воин: лучшая пара STR+END = 100
  expect(pickClass({ ...base, cha: 52, spi: 52 }, { id: 'warrior' }).id).toBe('warrior');   // Бард CHA+SPI 104 < 105
  expect(pickClass({ ...base, cha: 52.5, spi: 52.5 }, { id: 'warrior' }).id).toBe('bard');   // ровно 105
  expect(pickClass({ ...base, cha: 52, spi: 52 }, null).id).toBe('bard');                    // первый класс — без гистерезиса
});
test('сила пассива по средней форме пары; Странник — всех 7', () => {
  const f = { str: 0.9, end: 0.7, int: 0.2, dis: 1, cha: 1, fin: 1, spi: 1 };
  expect(passivePower({ id: 'warrior', pair: ['str', 'end'] }, f)).toBe(1);     // 0,8
  expect(passivePower({ id: 'warrior', pair: ['str', 'int'] }, f)).toBe(0.5);   // 0,55
  expect(passivePower({ id: 'wanderer', pair: null }, { ...f, str: 0, end: 0, int: 0 })).toBe(0.5);   // 4/7
});
test('пример [S§1] «Зал 45 минут» → 92 XP и 18 золота', () => {
  const b = questBonuses({ skills: ['strength'], stat: 'str', verify: 'auto', streak: 10, theme: false, weakest: false,
    cls: { id: 'warrior', power: 1 }, perk: { xp: 0.1, gold: 0 }, rust: false, inspire: false });
  expect(questReward({ rank: 'C', verify: 'auto', bonuses: b.bonuses, penalties: [fatiguePenalty(20)] })).toMatchObject({ bonus: 0.4, xp: 92, gold: 18 });
});
test('пассивы по классам и потолок +100%', () => {
  const q = (o: Partial<Parameters<typeof questBonuses>[0]>) => questBonuses({ skills: ['reading'], stat: 'int', verify: 'honest', streak: 0, theme: false, weakest: false, cls: null, perk: { xp: 0, gold: 0 }, rust: false, inspire: false, ...o });
  const sum = (x: { bonuses: number[] }) => x.bonuses.reduce((a, b) => a + b, 0);
  expect(sum(q({ cls: { id: 'sage', power: 0.5 } }))).toBeCloseTo(0.05);
  expect(sum(q({ cls: { id: 'bard', power: 1 }, skills: ['teamwork'], stat: 'cha' }))).toBeCloseTo(0.15);
  expect(sum(q({ cls: { id: 'ranger', power: 1 }, verify: 'auto' }))).toBeCloseTo(0.1);
  expect(sum(q({ cls: { id: 'paladin', power: 1 }, streak: 10 }))).toBeCloseTo(0.3);
  expect(q({ cls: { id: 'merchant', power: 1 }, perk: { xp: 0, gold: 0.1 } }).goldBonus).toBeCloseTo(0.2);
  const big = q({ streak: 25, theme: true, weakest: true, cls: { id: 'wanderer', power: 1 }, perk: { xp: 0.3, gold: 0 }, rust: true, inspire: true });
  expect(questReward({ rank: 'E', verify: 'auto', bonuses: big.bonuses, penalties: [] }).bonus).toBe(1);
});
