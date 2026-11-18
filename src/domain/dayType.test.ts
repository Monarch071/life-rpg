import { describe, expect, test } from 'vitest';
import { DEFAULT_DAY_TYPES, closeMinutes, closesAtTs, gameDateAt, legacyDayType, validDayType } from './dayType';

const at = (d: string, h: number, m: number) => { const [y, mo, da] = d.split('-').map(Number); return new Date(y, mo - 1, da, h, m).getTime(); };

describe('dayType', () => {
  test('закрытие дня = отбой + 1 ч, в пределах 00:00–04:00 [S§6]', () => {
    const t = (bed: string | null) => closeMinutes({ ...DEFAULT_DAY_TYPES[0], bed });
    expect(['00:00', '01:00', '03:00', '05:00', '23:30', '22:00', '12:00', null].map(t)).toEqual([60, 120, 240, 240, 30, 0, 0, 240]);
    expect(closeMinutes(null)).toBe(240);
  });
  test('игровая дата по закрытию вчерашнего дня', () => {
    const closeOf = (d: string) => (d === '2026-12-01' ? 60 : 240);
    expect(gameDateAt(at('2026-12-02', 0, 59), closeOf)).toBe('2026-12-01');
    expect(gameDateAt(at('2026-12-02', 1, 0), closeOf)).toBe('2026-12-02');
    expect(gameDateAt(at('2026-12-03', 3, 59), closeOf)).toBe('2026-12-02');
    expect(closesAtTs('2026-12-01', 60)).toBe(at('2026-12-02', 1, 0));
  });
  test('типы дней по умолчанию [P§2] и валидация', () => {
    expect(DEFAULT_DAY_TYPES.map(d => [d.kind, d.slots])).toEqual([['day', 4], ['evening', 3], ['off', 5], ['rest', 1]]);
    expect(validDayType({ id: 'x', kind: 'day', label: 'А', wake: '25:00', busy: null, bed: null, slots: 4 })).toBeNull();
    expect(validDayType({ ...DEFAULT_DAY_TYPES[0], slots: 99 })).toBeNull();
    expect(validDayType('x')).toBeNull();
  });
  test('legacyDayType', () => {
    expect(legacyDayType(null, '09:00', '23:00')).toMatchObject({ kind: 'off', wake: '09:00', bed: '23:00', busy: null });
    expect(legacyDayType({ start: '16:00', end: '02:00' }, '11:00', '03:00')).toMatchObject({ kind: 'evening', busy: { start: '16:00', end: '02:00' } });
    expect(legacyDayType({ start: '10:00', end: '19:00' }, '08:00', '00:00').kind).toBe('day');
  });
});
