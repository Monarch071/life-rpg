import { describe, expect, test } from 'vitest';
import { THEMES, seasonOf, themeBonusApplies } from './calendar';

describe('calendar', () => {
  test('сезоны [P§6]', () => {
    expect(seasonOf('2026-11-30')).toMatchObject({ kind: 'prologue', defaultTheme: null });
    expect(seasonOf('2026-12-01')).toMatchObject({ id: 'winter-2026', kind: 'winter', start: '2026-12-01', end: '2027-02-28', defaultTheme: 'mind_spirit' });
    expect(seasonOf('2027-03-01').kind).toBe('spring'); expect(seasonOf('2027-08-31').kind).toBe('summer');
    expect(seasonOf('2027-11-30').kind).toBe('autumn'); expect(seasonOf('2028-02-29').id).toBe('winter-2027');
    expect(THEMES.mind_spirit.stats).toEqual(['int', 'spi']);
    expect(themeBonusApplies('people', 'dis', ['leadership'])).toBe(true);
    expect(themeBonusApplies(null, 'int', ['reading'])).toBe(false);
  });
});
