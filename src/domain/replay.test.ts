import { expect, test } from 'vitest';
import { DEFAULT_AVATAR, replay } from './replay';
import type { GameEvent, Profile, Quest, Stat } from './types';

const at = (date: string, h = 12) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const NOW = at('2026-11-17');
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent =>
  ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? '2026-11-17'), deviceId: 'd1', ...e }) as unknown as GameEvent;
const q = (id: string, date: string, xp: number, stat: Stat = 'str', difficulty: Quest['difficulty'] = 1, templateId = `t-${id}`): Quest =>
  ({ id, date, title: id, stat, difficulty, minutes: 10, window: null, xp, auto: null, templateId });
const issue = (date: string, quests: Quest[], h = 8) => ev({ type: 'quests_issued', date, quests, ts: at(date, h) });
const done = (date: string, questId: string, ts = at(date, 20)) => ev({ type: 'quest_completed', date, questId, ts });

test('пустой журнал', () => {
  const s = replay([], NOW);
  expect(s.profile).toBeNull();
  expect(s.avatar).toEqual(DEFAULT_AVATAR);
  expect(s.totalXp).toBe(0); expect(s.level).toBe(1); expect(s.stats.str).toBe(1);
  expect(s.multipliers.str).toBe(1); expect(s.today.date).toBe('2026-11-17');
  expect(s.today.shadowXp).toBe(40); expect(s.history).toEqual([]);
});

test('3 дня без открытия: финализируются один раз, серия 0, Тень побеждает', () => {
  const evs = [
    issue('2026-11-13', [q('a', '2026-11-13', 50), q('b', '2026-11-13', 20)]),
    done('2026-11-13', 'a'),
    issue('2026-11-14', [q('c', '2026-11-14', 30)]),
  ];
  const s1 = replay(evs, NOW); const s2 = replay([...evs].reverse(), NOW);
  expect(s1).toEqual(s2);
  expect(s1.streak).toBe(0);
  expect(s1.history.map(h => h.date)).toEqual(['2026-11-13', '2026-11-14']);
  expect(s1.history.at(-1)!.won).toBe(false);
  // день 13: 50 против Тени 40 + 10 → равенство не победа; день 14: 0 против 50 + 15
  expect(s1.history[0]).toEqual({ date: '2026-11-13', xp: 50, shadowXp: 50, completed: 1, issued: 2, won: false });
  expect(s1.history[1].shadowXp).toBe(50 + 15);
});

test('уровень и характеристики не падают после пропусков', () => {
  const big = [1, 2, 3, 4].map(i => q(`w${i}`, '2026-11-10', 100, 'str', 5));
  const evs = [issue('2026-11-10', big), ...big.map(x => done('2026-11-10', x.id))];
  const before = replay(evs, at('2026-11-11'));
  const missed = [...evs, issue('2026-11-11', [q('m1', '2026-11-11', 200, 'str', 5)]), issue('2026-11-12', [q('m2', '2026-11-12', 200, 'str', 5)])];
  const after = replay(missed, at('2026-11-16'));
  expect(after.level).toBeGreaterThanOrEqual(before.level);
  expect(after.totalXp).toBeGreaterThanOrEqual(before.totalXp);
  expect(after.stats).toEqual(before.stats);
  expect(after.history.slice(1).every(h => !h.won)).toBe(true);
});

test('повторный quests_issued на ту же дату игнорируется', () => {
  const s = replay([
    issue('2026-11-17', [q('a', '2026-11-17', 20)], 8),
    issue('2026-11-17', [q('b', '2026-11-17', 35), q('c', '2026-11-17', 35)], 9),
    done('2026-11-17', 'b'),
  ], NOW);
  expect(s.today.quests.map(x => x.id)).toEqual(['a']);
  expect(s.totalXp).toBe(0);
});

test('дубль события по id не удваивает XP', () => {
  const c = done('2026-11-17', 'a', at('2026-11-17', 10));
  const s = replay([issue('2026-11-17', [q('a', '2026-11-17', 20)]), c, { ...c }, done('2026-11-17', 'a', at('2026-11-17', 11))], NOW);
  expect(s.totalXp).toBe(20); expect(s.currency).toBe(2); expect(s.today.xp).toBe(20);
  expect(s.today.quests[0].done).toBe(true);
});

test('победа над Тенью даёт бонус и растит shadowWinStreak', () => {
  const s = replay([
    issue('2026-11-15', [q('a', '2026-11-15', 100)]), done('2026-11-15', 'a'),
    issue('2026-11-16', [q('b', '2026-11-16', 100)]), done('2026-11-16', 'b'),
  ], NOW);
  // день 15: Тень 40 → бонус 15; день 16: Тень round(100·1.02)=102 → поражение
  expect(s.history.map(h => [h.shadowXp, h.won])).toEqual([[40, true], [102, false]]);
  expect(s.shadowWinStreak).toBe(0);
  expect(s.totalXp).toBe(215);
  const s1 = replay([issue('2026-11-16', [q('b', '2026-11-16', 60)]), done('2026-11-16', 'b')], NOW);
  expect(s1.shadowWinStreak).toBe(1);
  expect(s1.totalXp).toBe(70); // бонус max(10, 9)
  expect(s1.currency).toBe(6 + 1);
  expect(s1.history[0].xp).toBe(60); // без бонуса
  expect(s1.today.shadowXp).toBe(61); // round(60·1.02)
});

test('выполнение задним числом не засчитывается', () => {
  const s = replay([issue('2026-11-16', [q('a', '2026-11-16', 50)]), done('2026-11-16', 'a', at('2026-11-17', 9))], NOW);
  expect(s.totalXp).toBe(0); expect(s.history[0].completed).toBe(0);
  // до cutoff (03:00 следующего дня) — ещё тот же игровой день
  const s2 = replay([issue('2026-11-16', [q('a', '2026-11-16', 50)]), done('2026-11-16', 'a', at('2026-11-17', 3))], NOW);
  expect(s2.history[0].completed).toBe(1);
  // неизвестное задание
  expect(replay([done('2026-11-17', 'zzz')], NOW).totalXp).toBe(0);
});

test('день без quests_issued рвёт серию и shadowWinStreak', () => {
  const s = replay([
    issue('2026-11-14', [q('a', '2026-11-14', 100)]), done('2026-11-14', 'a'),
    issue('2026-11-16', [q('b', '2026-11-16', 30)]), done('2026-11-16', 'b'),
    issue('2026-11-17', [q('c', '2026-11-17', 10), q('d', '2026-11-17', 10)]), done('2026-11-17', 'c'),
  ], NOW);
  expect(s.history.map(h => h.date)).toEqual(['2026-11-14', '2026-11-16']);
  // 16-е: shadowWinStreak сброшен днём 15-го → Тень = 100·1.0
  expect(s.history[1].shadowXp).toBe(100);
  expect(s.streak).toBe(2); // 16-е (1) + сегодня
  expect(s.today.xp).toBe(10);
});

test('totalXp, валюта, очки и характеристики', () => {
  const sr = { str: 3, end: 3, int: 3, dis: 3, cha: 3, fin: 3, spi: 3 } as Record<Stat, number>;
  const profile = { name: 'A', selfRating: sr, sportLevel: 0 } as unknown as Profile;
  const s = replay([
    ev({ type: 'onboarding_completed', profile, ts: at('2026-11-15', 7) }),
    issue('2026-11-17', [q('a', '2026-11-17', 55, 'int', 5), q('b', '2026-11-17', 55, 'int', 5), q('c', '2026-11-17', 35, 'int', 4)]),
    done('2026-11-17', 'a'), done('2026-11-17', 'b'), done('2026-11-17', 'c'),
  ], NOW);
  expect(s.profile).toBe(profile);
  expect(s.statPoints.int).toBe(14);
  expect(s.stats.int).toBe(7); expect(s.stats.str).toBe(6);
  expect(s.totalXp).toBe(145); expect(s.currency).toBe(5 + 5 + 3);
  expect(s.level).toBe(2); expect(s.xpInto).toBe(45); expect(s.xpNeed).toBe(283);
  expect(s.className).toBe('Искатель (Интеллект)'); expect(s.tier).toBe(1);
});

test('today: день, занятость, метрики, чекины, аватар', () => {
  const s = replay([
    ev({ type: 'day_started', date: '2026-11-17', work: { start: '09:00', end: '18:00' }, wakeAt: '07:00', ts: at('2026-11-17', 7) }),
    ev({ type: 'day_started', date: '2026-11-17', work: null, wakeAt: '08:00', ts: at('2026-11-17', 8) }),
    ev({ type: 'busy_until', date: '2026-11-17', until: '13:00', ts: at('2026-11-17', 9) }),
    ev({ type: 'busy_until', date: '2026-11-17', until: '15:00', ts: at('2026-11-17', 10) }),
    ev({ type: 'metric_logged', date: '2026-11-17', metric: 'water', value: 2, mode: 'add' }),
    ev({ type: 'metric_logged', date: '2026-11-17', metric: 'water', value: 3, mode: 'add', ts: at('2026-11-17', 13) }),
    ev({ type: 'metric_logged', date: '2026-11-17', metric: 'mood', value: 3, mode: 'set' }),
    ev({ type: 'metric_logged', date: '2026-11-17', metric: 'mood', value: 5, mode: 'set', ts: at('2026-11-17', 13) }),
    ev({ type: 'checkin', date: '2026-11-15', went: '', notWent: '', energy: 2 }),
    ev({ type: 'avatar_updated', params: { ...DEFAULT_AVATAR, hair: 'long' }, ts: at('2026-11-16') }),
    ev({ type: 'something_new', ts: at('2026-11-16') }),
  ], NOW);
  expect(s.today).toMatchObject({ started: true, work: { start: '09:00', end: '18:00' }, wakeAt: '07:00',
    busyUntil: '15:00', metrics: { water: 5, mood: 5 }, checkedIn: false, lastEnergy: 2 });
  expect(s.avatar.hair).toBe('long');
});

test('genInputs', () => {
  const steps = (date: string, value: number) => ev({ type: 'metric_logged', date, metric: 'steps', value, mode: 'set' });
  const s = replay([
    steps('2026-11-01', 9000), steps('2026-11-02', 11000), steps('2026-11-03', 16000), steps('2026-11-14', 30000),
    steps('2026-10-01', 50000), // вне 28 дней
    steps('2026-11-17', 50000), // сегодня не учитывается
    ev({ type: 'metric_logged', date: '2026-11-12', metric: 'sleepHours', value: 6, mode: 'set' }),
    ev({ type: 'metric_logged', date: '2026-11-15', metric: 'sleepHours', value: 7.5, mode: 'set' }),
    issue('2026-11-14', [q('a', '2026-11-14', 10, 'str', 1, 'T1')]),
    issue('2026-11-15', [q('b', '2026-11-15', 10, 'str', 1, 'T2')]),
    issue('2026-11-16', [q('c', '2026-11-16', 10, 'str', 1, 'T3'), q('d', '2026-11-16', 10, 'str', 1, 'T4')]),
  ], NOW);
  expect(s.genInputs.bestSteps7).toBe(12000); // окна с одним значением (30000, 16000) не считаются
  expect(s.genInputs.lastSleepHours).toBe(7.5);
  expect([...s.genInputs.recentTemplateIds].sort()).toEqual(['T2', 'T3', 'T4']);
  // 3 значения, но ни в одном 7‑дневном окне их нет трёх → null
  expect(replay([steps('2026-11-01', 9000), steps('2026-11-05', 9000), steps('2026-11-14', 9000)], NOW).genInputs.bestSteps7).toBeNull();
  const few = replay([steps('2026-11-01', 9000), steps('2026-11-02', 11000)], NOW);
  expect(few.genInputs).toEqual({ bestSteps7: null, lastSleepHours: null, recentTemplateIds: [] });
});

test('7 идеальных дней по характеристике дают множитель ≈1.1', () => {
  const evs = Array.from({ length: 7 }, (_, i) => {
    const d = `2026-11-${String(10 + i).padStart(2, '0')}`;
    return [issue(d, [q(`p${i}`, d, 20, 'end')]), done(d, `p${i}`)];
  }).flat();
  const s = replay(evs, NOW);
  expect(s.multipliers.end).toBeCloseTo(1.1, 3);
  expect(s.multipliers.str).toBe(1);
});

test('повторная анкета с меньшей самооценкой не снижает характеристики', () => {
  const mk = (n: number) => ({ name: 'A', sportLevel: 0,
    selfRating: { str: n, end: n, int: n, dis: n, cha: n, fin: n, spi: n } }) as unknown as Profile;
  const low = mk(2);
  const s = replay([
    ev({ type: 'onboarding_completed', profile: mk(5), ts: at('2026-11-15') }),
    ev({ type: 'onboarding_completed', profile: { ...low, selfRating: { ...low.selfRating, int: 8 } }, ts: at('2026-11-16') }),
  ], NOW);
  expect(s.profile!.selfRating.str).toBe(2); // профиль — последний
  expect(s.stats.str).toBe(10); expect(s.stats.int).toBe(16);
});

test('смена часа конца суток не стирает заработанное', () => {
  const evs = [issue('2026-11-16', [q('a', '2026-11-16', 50)]), done('2026-11-16', 'a', new Date(2026, 10, 17, 2, 30).getTime())];
  for (const cutoff of [4, 2, 6, 0]) expect(replay(evs, NOW, cutoff).history[0].completed).toBe(1);
  // на два дня позже — не засчитывается
  const late = [issue('2026-11-15', [q('b', '2026-11-15', 50)]), done('2026-11-15', 'b', new Date(2026, 10, 17, 2, 30).getTime())];
  for (const cutoff of [4, 2, 6]) expect(replay(late, NOW, cutoff).totalXp).toBe(0);
});

test('показанная Тень сегодня = записанной при финализации', () => {
  const evs = [
    issue('2026-11-15', [q('h', '2026-11-15', 60)]), done('2026-11-15', 'h'),
    issue('2026-11-16', [q('a', '2026-11-16', 30), q('b', '2026-11-16', 20), q('c', '2026-11-16', 40)]),
    done('2026-11-16', 'a'),
  ];
  const live = replay(evs, at('2026-11-16', 21)).today.shadowXp;
  expect(live).toBe(replay(evs, NOW).history.at(-1)!.shadowXp);
  expect(live).toBe(61 + 30); // p75([60])·1.02 + ½·(20+40) невыполненных
});
