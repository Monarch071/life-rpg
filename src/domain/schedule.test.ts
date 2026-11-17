import { describe, expect, test } from 'vitest';
import { freeWindows, placeQuests } from './schedule';
import type { Quest } from './types';

const q = (id: string, minutes: number): Omit<Quest, 'window'> => ({
  id, date: '2026-11-17', title: id, stat: 'int', difficulty: 2, minutes, xp: 20, auto: null, templateId: id,
});
const energy = { morning: 5, day: 3, evening: 1, night: 1 };

describe('freeWindows', () => {
  test('сон и работа через полночь', () => {
    expect(freeWindows('10:00', '02:00', [{ start: '14:00', end: '23:30' }]))
      .toEqual([{ start: '10:00', end: '14:00' }, { start: '23:30', end: '02:00' }]);
  });
  test('работа через полночь съедает остаток дня', () => {
    expect(freeWindows('10:00', '02:00', [{ start: '12:00', end: '03:00' }])).toEqual([{ start: '10:00', end: '12:00' }]);
  });
  test('окна короче 10 минут отбрасываются', () => {
    expect(freeWindows('08:00', '23:00', [{ start: '08:05', end: '22:00' }])).toEqual([{ start: '22:00', end: '23:00' }]);
  });
});

describe('placeQuests', () => {
  test('самое длинное — в окно с наибольшей энергией', () => {
    const r = placeQuests([q('a', 20), q('b', 60)], [{ start: '08:00', end: '10:00' }, { start: '18:00', end: '20:00' }], energy, '08:00');
    expect(r.find(x => x.id === 'b')!.window).toEqual({ start: '08:00', end: '09:00' });
    expect(r.find(x => x.id === 'a')!.window).toEqual({ start: '09:00', end: '09:20' });
  });
  test('не влезает или minutes 0 → null', () => {
    const r = placeQuests([q('a', 90), q('b', 0)], [{ start: '08:00', end: '09:00' }], energy, '08:00');
    expect(r.map(x => x.window)).toEqual([null, null]);
  });
});
