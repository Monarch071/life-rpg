import { expect, test } from 'vitest';
import { SKILLS, skillEffects } from './skills';

test('дерево: 17 узлов, id уникальны, requires существуют', () => {
  expect(SKILLS).toHaveLength(17);
  const ids = new Set(SKILLS.map(s => s.id));
  expect(ids.size).toBe(17);
  for (const s of SKILLS) expect(s.requires === null || ids.has(s.requires)).toBe(true);
});

test('skillEffects суммирует бонусы', () => {
  const e = skillEffects(['str1', 'str2', 'coins']);
  expect(e.xpBonus.str).toBe(0.25); expect(e.coinBonus).toBe(0.25);
  expect(e.streakFreeze).toBe(false); expect(e.calmShadow).toBe(false);
});
