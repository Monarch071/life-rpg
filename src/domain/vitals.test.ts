import { describe, expect, test } from 'vitest';
import { energyScore, fatigueNext, focusScore, hpScore, intFocusMult, sessionMinutes, sleepScore, unionMinutes, workoutKind } from './vitals';

describe('vitals', () => {
  test('HP: веса 40/30/20/10 [S§3]', () => {
    expect([7, 7.5, 9, 10, 6, 6.5, 2].map(sleepScore)).toEqual([100, 100, 100, 100, 80, 90, 0]);
    const full = hpScore({ sleepAvg: 6, stepsAvg: 3000, stepsGoal: 6000, rhr: 63, rhrMean: 60, feel: 6 });
    expect(full).toEqual({ hp: 67, parts: { sleep: 80, steps: 50, rhr: 70, feel: 60 } });
    expect(hpScore({ sleepAvg: 6, stepsAvg: 3000, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null }).hp).toBe(67);
    expect(hpScore({ sleepAvg: 7.5, stepsAvg: null, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null }).hp).toBe(100);
    expect(hpScore({ sleepAvg: null, stepsAvg: null, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null }).hp).toBeNull();
    expect(hpScore({ sleepAvg: null, stepsAvg: 12000, stepsGoal: 6000, rhr: 58, rhrMean: 60, feel: 9 }).parts).toEqual({ steps: 100, rhr: 100, feel: 100 });
  });
  test('Energy: 60/25/15, неделя вместо утра [S§3]', () => {
    expect(energyScore({ sleepLast: 6, morning: 7, weekMorning: 5, hp: 67 })).toBe(76);
    expect(energyScore({ sleepLast: 6, morning: null, weekMorning: 6, hp: 67 })).toBe(73);
    expect(energyScore({ sleepLast: 6, morning: null, weekMorning: null, hp: 67 })).toBe(77);
    expect(energyScore({ sleepLast: null, morning: null, weekMorning: null, hp: null })).toBeNull();
  });
  test('Фокус 70/30 и множитель Интеллекта [S§3]', () => {
    expect(focusScore({ focusMin: 90, socialMin: 30 }).focus).toBe(100);
    expect(focusScore({ focusMin: 45, socialMin: 75 }).focus).toBe(50);
    expect(focusScore({ focusMin: 0, socialMin: 120 }).focus).toBe(0);
    expect(focusScore({ focusMin: 45, socialMin: null }).focus).toBe(50);
    expect(focusScore({ focusMin: null, socialMin: null }).focus).toBeNull();
    expect([0, 50, 100, null].map(intFocusMult)).toEqual([0.8, 1, 1.2, 1]);
  });
  test('Усталость: +15/−20/−5, клэмп [S§3]', () => {
    let f = 0; const seen: number[] = [];
    for (let i = 0; i < 7; i++) { f = fatigueNext(f, null, 5); seen.push(f); }
    expect(seen).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(fatigueNext(10, null, 8)).toBe(0);
    expect(fatigueNext(50, { bigDay: true, rest: false, calm: false, lowEvening: true }, null)).toBe(60);
    expect(fatigueNext(50, { bigDay: false, rest: true, calm: true, lowEvening: false }, 7)).toBe(20);
    expect(fatigueNext(98, { bigDay: true, rest: false, calm: false, lowEvening: true }, 5)).toBe(100);
  });
  test('сессии и интервалы', () => {
    const m = 60_000;
    expect(sessionMinutes([{ at: 0, state: 'open' }, { at: 20 * m, state: 'close' }, { at: 120 * m, state: 'open' }, { at: 125 * m, state: 'open' }]))
      .toEqual([{ start: 0, min: 20 }, { start: 120 * m, min: 5 }, { start: 125 * m, min: 15 }]);
    expect(sessionMinutes([{ at: 0, state: 'close' }])).toEqual([]);
    expect(sessionMinutes([{ at: 0, state: 'open' }, { at: 500 * m, state: 'close' }])[0].min).toBe(180);
    expect(unionMinutes([{ start: 0, end: 60 * m }, { start: 30 * m, end: 90 * m }], 240)).toBe(90);
  });
  test('типы тренировок', () => {
    expect(['Традиционная силовая тренировка', 'Yoga', 'Бег', 'Футбол', 'Танцы'].map(workoutKind))
      .toEqual(['strength', 'mobility', 'cardio', 'sports', 'other']);
  });
  test('мусор на входе не бросает', () => {
    expect(sleepScore(NaN)).toBe(0);
    expect(hpScore({ sleepAvg: NaN, stepsAvg: -5, stepsGoal: 0, rhr: NaN, rhrMean: 1, feel: NaN }).hp).toBe(0);
    expect(fatigueNext(NaN, null, NaN)).toBe(0);
    expect(workoutKind(undefined as unknown as string)).toBe('other');
    expect(unionMinutes([{ start: NaN, end: 5 }], 10)).toBe(0);
    // NaN — источника нет, вес делится между остальными
    expect(hpScore({ sleepAvg: NaN, stepsAvg: 3000, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null })).toEqual({ hp: 50, parts: { steps: 50 } });
    expect(energyScore({ sleepLast: NaN, morning: NaN, weekMorning: null, hp: NaN })).toBeNull();
    expect(focusScore({ focusMin: 45, socialMin: NaN })).toEqual({ focus: 50, parts: { focus: 50 } });
    // open и close в одну миллисекунду: open раньше при любом порядке входа
    expect(sessionMinutes([{ at: 5, state: 'close' }, { at: 0, state: 'open' }, { at: 0, state: 'close' }])).toEqual([{ start: 0, min: 0 }]);
  });
});

test('Усталость +5 за срыв [S§3]', () => {
  expect(fatigueNext(50, { bigDay: false, rest: false, calm: false, lowEvening: false, relapses: 2 }, null)).toBe(55);
  expect(fatigueNext(50, { bigDay: false, rest: false, calm: false, lowEvening: false }, null)).toBe(45);
});
