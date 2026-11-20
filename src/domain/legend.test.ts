import { expect, test } from 'vitest';
import { canMark, heldFullSeason, legendOpen, legendPassed, legendTitle, stageWindow, type LegendTrial } from './legend';

const t0 = (o: Partial<LegendTrial> = {}): LegendTrial => ({ start: '2027-06-01', stages: ['a', 'b', 'c', 'd'], final: 'f', done: [false, false, false, false], finalDone: false, ...o });

test('полный сезон в продвинутом: покрытие с разрывом на смену пути, не Пролог, сезон уже закончен', () => {
  expect(heldFullSeason([{ since: '2027-03-01', until: '2027-05-31' }], '2027-06-01')).toBe(true);
  expect(heldFullSeason([{ since: '2027-03-01', until: '2027-03-04' }, { since: '2027-03-05', until: '2027-05-31' }], '2027-06-01')).toBe(true);
  expect(heldFullSeason([{ since: '2027-03-02', until: '2027-05-31' }], '2027-06-01')).toBe(false);
  expect(heldFullSeason([{ since: '2027-03-01', until: '2027-05-31' }], '2027-05-31')).toBe(false);
  expect(heldFullSeason([{ since: '2026-11-23', until: '2026-11-30' }], '2027-01-01')).toBe(false);
});

test('доступ: уровень 40, сезон, 30 дней после провала, ничего не идёт', () => {
  const base = { level: 40, date: '2027-06-01', held: true, lastFail: null, busy: false };
  expect(legendOpen(base)).toBe(true);
  expect(legendOpen({ ...base, level: 39 })).toBe(false);
  expect(legendOpen({ ...base, held: false })).toBe(false);
  expect(legendOpen({ ...base, busy: true })).toBe(false);
  expect(legendOpen({ ...base, lastFail: '2027-05-03' })).toBe(false);
  expect(legendOpen({ ...base, lastFail: '2027-05-02' })).toBe(true);
});

test('окна этапов и финала, отметка один раз; итог 3 из 4 и финал', () => {
  expect(stageWindow('2027-06-01', 0)).toEqual(['2027-06-01', '2027-06-07']);
  expect(stageWindow('2027-06-01', 3)).toEqual(['2027-06-22', '2027-06-28']);
  expect(stageWindow('2027-06-01', 4)).toEqual(['2027-06-29', '2027-06-30']);
  expect(canMark(t0(), 1, '2027-06-07')).toBe(false);
  expect(canMark(t0(), 1, '2027-06-08')).toBe(true);
  expect(canMark(t0({ done: [false, true, false, false] }), 1, '2027-06-09')).toBe(false);
  expect(canMark(t0(), 4, '2027-06-29')).toBe(true);
  expect(canMark(t0(), 5, '2027-06-29')).toBe(false);
  expect(canMark(t0(), 1.5, '2027-06-09')).toBe(false);
  expect(legendPassed(t0({ done: [true, true, true, false], finalDone: true }))).toBe(true);
  expect(legendPassed(t0({ done: [true, true, true, true], finalDone: false }))).toBe(false);
  expect(legendPassed(t0({ done: [true, true, false, false], finalDone: true }))).toBe(false);
  expect(legendTitle('Чемпион', 'str')).toBe('Несокрушимый Чемпион');
});
