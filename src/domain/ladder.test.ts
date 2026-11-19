import { expect, test } from 'vitest';
import { genericLadder, ladderAfterWindow, LADDER_PRESETS, requiredIn, ritualXp, step5Relapse, validLadderSteps } from './ladder';
import { cleanText } from './text';

test('cleanText', () => {
  expect(cleanText('  а\u0007б  ', 40)).toBe('аб'); expect(cleanText('x'.repeat(50), 40)).toHaveLength(40);
  expect(cleanText('   ', 40)).toBeNull(); expect(cleanText(5, 40)).toBeNull();
});
test('переходы ступеней [S§7]: 80% / 50–79% один повтор / шаг назад', () => {
  expect(ladderAfterWindow({ step: 1, attempt: 1 }, 5 / 6)).toEqual({ step: 2, attempt: 1, bonus: 100, ask: false });
  expect(ladderAfterWindow({ step: 1, attempt: 1 }, 4 / 6)).toEqual({ step: 1, attempt: 2, bonus: 0, ask: false });
  expect(ladderAfterWindow({ step: 2, attempt: 1 }, 0.5)).toEqual({ step: 2, attempt: 2, bonus: 0, ask: false });
  expect(ladderAfterWindow({ step: 2, attempt: 2 }, 4 / 6)).toEqual({ step: 1, attempt: 1, bonus: 0, ask: true });
  expect(ladderAfterWindow({ step: 3, attempt: 1 }, 0.4)).toEqual({ step: 2, attempt: 1, bonus: 0, ask: true });
  expect(ladderAfterWindow({ step: 1, attempt: 1 }, 0.2)).toEqual({ step: 1, attempt: 1, bonus: 0, ask: true });
  expect(ladderAfterWindow({ step: 4, attempt: 1 }, 0.8)).toEqual({ step: 5, attempt: 1, bonus: 300, ask: false });
  expect(ladderAfterWindow({ step: 3, attempt: 2 }, 0 / 0)).toEqual({ step: 3, attempt: 2, bonus: 0, ask: false });   // нужно 0 — без изменений
  expect([1, 2, 3, 4, 5].map(ritualXp)).toEqual([15, 20, 25, 30, 10]);
});
test('нужно за окно и рецидив ступени 5', () => {
  const d = (n: number, of = 14) => Array.from({ length: of }, (_, i) => ({ suitable: i < n }));
  expect(requiredIn({ label: 'x', per7: 3 }, d(14))).toBe(6);
  expect(requiredIn({ label: 'x', per7: 7 }, d(10))).toBe(10);
  expect(step5Relapse([0.5, 0.55])).toBe(true); expect(step5Relapse([0.5, 0.7])).toBe(false); expect(step5Relapse([0.59])).toBe(false);
});
test('шаблоны и валидация', () => {
  expect(LADDER_PRESETS.read.steps.map(s => s.per7)).toEqual([3, 5, 5, 7, 7]);
  expect(LADDER_PRESETS.sport.steps.map(s => s.per7)).toEqual([2, 3, 3, 4, 4]);
  expect(LADDER_PRESETS.social).toMatchObject({ kind: 'dont', steps: [{ auto: { metric: 'socialMin', op: '<=', value: 120 } }, {}, {}, {}, {}] });
  expect(genericLadder('Растяжка', 'do').steps.map(s => s.per7)).toEqual([3, 5, 5, 7, 7]);
  const ok = LADDER_PRESETS.read.steps;
  expect(validLadderSteps(ok.slice(0, 4))).toBeNull();
  expect(validLadderSteps([{ ...ok[0], per7: 8 }, ...ok.slice(1)])).toBeNull();
  expect(validLadderSteps([{ ...ok[0], label: '' }, ...ok.slice(1)])).toBeNull();
  expect(validLadderSteps([{ ...ok[0], auto: { metric: 'foo', op: '>=', value: 1 } }, ...ok.slice(1)])![0].auto).toBeUndefined();
  for (const p of Object.values(LADDER_PRESETS)) expect(validLadderSteps(p.steps)).toEqual(p.steps);
});
