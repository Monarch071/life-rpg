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

// ---- health_packet ----
const iso = (date: string, h: number, min = 0) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, h, min).toISOString(); };
const pkt = (date: string, health: unknown, ts = at(date, 9), calendar: unknown = []) =>
  ev({ type: 'health_packet', date, kind: 'morning', health, calendar, ts, deviceId: 'shortcuts' });
const qa = (id: string, date: string, op: '>=' | '<=', value: number, metric: 'steps' | 'sleepHours' | 'weightKg' = 'steps'): Quest =>
  ({ ...q(id, date, 30), auto: { metric, op, value } });

test('health_packet: шаги дают метрику и автозачёт', () => {
  const s = replay([issue('2026-11-17', [qa('a', '2026-11-17', '>=', 8000)]), pkt('2026-11-17', { steps: 9000 })], NOW);
  expect(s.today.metrics.steps).toBe(9000);
  expect(s.today.quests[0].done).toBe(true);
  expect(s.totalXp).toBe(30);
});

test('health_packet: steps/workoutMin — максимум, sleepHours — последний', () => {
  const s = replay([
    pkt('2026-11-17', { steps: 5000, sleepHours: 6.5, workoutMin: 40 }, at('2026-11-17', 9)),
    pkt('2026-11-17', { steps: 3000, sleepHours: 7, workoutMin: 20 }, at('2026-11-17', 10)),
  ], NOW);
  expect(s.today.metrics).toMatchObject({ steps: 5000, sleepHours: 7, workoutMin: 40 });
});

test('автозачёт: условие не выполнено → не done', () => {
  const s = replay([issue('2026-11-17', [qa('a', '2026-11-17', '>=', 8000)]), pkt('2026-11-17', { steps: 7000 })], NOW);
  expect(s.today.quests[0].done).toBe(false);
});

test('автозачёт работает и для ручного metric_logged', () => {
  const s = replay([
    issue('2026-11-17', [qa('a', '2026-11-17', '>=', 8000)]),
    ev({ type: 'metric_logged', date: '2026-11-17', metric: 'steps', value: 8500, mode: 'set' }),
  ], NOW);
  expect(s.today.quests[0].done).toBe(true);
});

test('автозачёт <=: вес', () => {
  const s = replay([issue('2026-11-17', [qa('a', '2026-11-17', '<=', 80, 'weightKg')]), pkt('2026-11-17', { weightKg: 79.5 })], NOW);
  expect(s.today.quests[0].done).toBe(true);
});

test('пакет за вчера засчитывает вчерашнее задание в истории', () => {
  const s = replay([issue('2026-11-16', [qa('a', '2026-11-16', '>=', 8000)]), pkt('2026-11-16', { steps: 9000 }, at('2026-11-17', 9))], NOW);
  expect(s.history.at(-1)!.xp).toBe(30);
});

test('мусорный пакет не роняет replay', () => {
  expect(() => replay([pkt('2026-11-17', null, at('2026-11-17', 9), null), pkt('2026-11-17', { steps: 'x', sleepHours: NaN })], NOW)).not.toThrow();
  expect(replay([pkt('2026-11-17', { steps: NaN })], NOW).today.metrics.steps).toBeUndefined();
});

test('календарь: локальное время, фильтр весь день и чужой даты; lastHealth', () => {
  const cal = [
    { title: 'Работа', start: iso('2026-11-17', 11), end: iso('2026-11-17', 20) },
    { title: 'Весь день', start: iso('2026-11-17', 0), end: iso('2026-11-18', 0) },
    { title: 'Завтра', start: iso('2026-11-18', 10), end: iso('2026-11-18', 11) },
  ];
  const s = replay([pkt('2026-11-17', { steps: 100 }, at('2026-11-17', 9), cal)], NOW);
  expect(s.today.calendar).toEqual([{ title: 'Работа', start: '11:00', end: '20:00' }]);
  expect(s.lastHealth).toMatchObject({ date: '2026-11-17', health: { steps: 100 } });
  expect(replay([], NOW).lastHealth).toBeNull();
});

test('quests_issued с разных устройств: побеждает меньший ts независимо от порядка', () => {
  const late = ev({ type: 'quests_issued', date: '2026-11-17', quests: [q('late', '2026-11-17', 20)], ts: at('2026-11-17', 9), deviceId: 'd2' });
  const early = ev({ type: 'quests_issued', date: '2026-11-17', quests: [q('early', '2026-11-17', 20)], ts: at('2026-11-17', 8), deviceId: 'd1' });
  expect(replay([late, early], NOW).today.quests.map(x => x.id)).toEqual(['early']);
});

// ---- магазин и навыки ----
const unlock = (skillId: string, ts: number) => ev({ type: 'skill_unlocked', skillId, ts });
const bigDay = (xp: number, date = '2026-11-01', stat: Stat = 'str') =>
  [issue(date, [q(`big${xp}${date}`, date, xp, stat)]), done(date, `big${xp}${date}`)];

test('навык: при уровне 1 игнорируется', () => {
  const s = replay([unlock('str1', at('2026-11-17', 9))], NOW);
  expect(s.skills).toEqual({ unlocked: [], points: 0 });
});

test('навык: str1 принимается, str2 без str1 — нет; дубль списывает очки один раз', () => {
  const evs = [...bigDay(400), unlock('str2', at('2026-11-05', 9)), unlock('str1', at('2026-11-05', 10)), unlock('str1', at('2026-11-05', 11))];
  const s = replay(evs, NOW);
  expect(s.skills.unlocked).toEqual(['str1']);
  expect(s.skills.points).toBe(s.level - 1 - 1);
});

test('навык: +10% XP только с даты открытия', () => {
  const evs = [
    ...bigDay(100, '2026-11-01'),
    unlock('str1', at('2026-11-12', 9)),
    issue('2026-11-11', [q('a', '2026-11-11', 20)]), done('2026-11-11', 'a'),
    issue('2026-11-13', [q('b', '2026-11-13', 20)]), done('2026-11-13', 'b'),
  ];
  const s = replay(evs, NOW);
  expect(s.history.find(h => h.date === '2026-11-11')!.xp).toBe(20);
  expect(s.history.find(h => h.date === '2026-11-13')!.xp).toBe(22);
});

test('freeze: один пустой день в неделю не обнуляет серию, второй — обнуляет', () => {
  const evs = [
    ...bigDay(2000, '2026-11-01'), unlock('dis1', at('2026-11-02', 9)), unlock('freeze', at('2026-11-02', 10)),
    ...bigDay(10, '2026-11-09'),
    issue('2026-11-10', [q('m1', '2026-11-10', 10)]), issue('2026-11-11', [q('m2', '2026-11-11', 10)]),
  ];
  expect(replay(evs, at('2026-11-11')).streak).toBe(1);
  expect(replay(evs, at('2026-11-12')).streak).toBe(0);
});

test('calm: штраф Тени 25% вместо 50%', () => {
  const base = [...bigDay(2000, '2026-11-01'), issue('2026-11-10', [q('m', '2026-11-10', 40)])];
  const calm = [...base, unlock('spi1', at('2026-11-02', 9)), unlock('calm', at('2026-11-02', 10))];
  const sh = (evs: GameEvent[]) => replay(evs, NOW).history.find(h => h.date === '2026-11-10')!.shadowXp;
  expect(sh(base) - sh(calm)).toBe(10);
});

test('награды: покупка, перерасход игнорируется, удаление, невалидные', () => {
  const earn = bigDay(1050, '2026-11-10');
  const created = ev({ type: 'reward_created', rewardId: 'r1', title: 'Кино', price: 100, ts: at('2026-11-15', 9) });
  const buy = (h: number) => ev({ type: 'reward_purchased', rewardId: 'r1', ts: at('2026-11-15', h) });
  const base = replay([...earn, created], NOW).currency;
  const s = replay([...earn, created, buy(10), buy(11)], NOW);
  expect(s.currency).toBe(base - 100);
  expect(s.purchases).toHaveLength(1);
  // ещё покупка при нехватке
  const poor = replay([...earn, created, ...[10, 11, 12, 13, 14, 15, 16].map(buy)], NOW);
  expect(poor.currency).toBe(base - 100); expect(poor.purchases).toHaveLength(1);
  // удалена до покупки — не покупается; удалена после — покупка остаётся
  const del = (h: number) => ev({ type: 'reward_deleted', rewardId: 'r1', ts: at('2026-11-15', h) });
  expect(replay([...earn, created, del(10), buy(11)], NOW).purchases).toEqual([]);
  const after = replay([...earn, created, buy(10), del(11)], NOW);
  expect(after.rewards).toEqual([]);
  expect(after.purchases).toMatchObject([{ rewardId: 'r1', title: 'Кино', price: 100 }]);
  const bad = replay([
    ev({ type: 'reward_created', rewardId: 'x', title: 'a', price: -5 }),
    ev({ type: 'reward_created', rewardId: 'y', title: '', price: 5 }),
    ev({ type: 'reward_created', rewardId: 'z', title: '   ', price: 5 }),
  ], NOW);
  expect(bad.rewards).toEqual([]);
  const trimmed = replay([ev({ type: 'reward_created', rewardId: 't', title: '  Кино ', price: 5 })], NOW);
  expect(trimmed.rewards).toEqual([{ id: 't', title: 'Кино', price: 5 }]);
});

test('очки навыков считаются от базового уровня: бонус победы над Тенью их не увеличивает', () => {
  const evs = [...bigDay(95, '2026-11-01'), unlock('str1', at('2026-11-12', 9))];
  const s = replay(evs, NOW);
  expect(s.level).toBe(2); // 95 + бонус победы 14 = 109
  expect(s.skills).toEqual({ unlocked: [], points: 0 });
});

test('coins: +25% монет с даты открытия (округление вниз)', () => {
  const base = [...bigDay(2000, '2026-11-01'), unlock('fin1', at('2026-11-02', 9)),
    issue('2026-11-05', [q('c', '2026-11-05', 100)]), done('2026-11-05', 'c')];
  const withCoins = [...base, unlock('coins', at('2026-11-02', 10))];
  expect(replay(withCoins, NOW).currency - replay(base, NOW).currency).toBe(2); // 10 → 12
});

test('str1 + str2 дают +25% XP', () => {
  const evs = [...bigDay(2000, '2026-11-01'), unlock('str1', at('2026-11-02', 9)), unlock('str2', at('2026-11-02', 10)),
    issue('2026-11-05', [q('a', '2026-11-05', 20)]), done('2026-11-05', 'a')];
  expect(replay(evs, NOW).history.find(h => h.date === '2026-11-05')!.xp).toBe(25);
});

test('freeze: возобновляется в новой неделе и не тратится при серии 0', () => {
  const pre = [...bigDay(2000, '2026-11-01'), unlock('dis1', at('2026-11-02', 9)), unlock('freeze', at('2026-11-02', 10))];
  // новая неделя: заморозка снова доступна
  const weeks = [...pre, ...bigDay(10, '2026-11-09'), issue('2026-11-10', [q('m1', '2026-11-10', 10)]),
    issue('2026-11-11', [q('m2', '2026-11-11', 10)]), ...bigDay(10, '2026-11-16'), issue('2026-11-17', [q('m3', '2026-11-17', 10)])];
  expect(replay(weeks, at('2026-11-18')).streak).toBe(1);
  // пустой день при серии 0 заморозку не тратит
  const idle = [...pre, issue('2026-11-09', [q('i1', '2026-11-09', 10)]), ...bigDay(10, '2026-11-10'),
    issue('2026-11-11', [q('i2', '2026-11-11', 10)])];
  expect(replay(idle, at('2026-11-12')).streak).toBe(1);
});

// ---- недельные и боссы ----
const W = '2026-11-16';
const wq = (kind: string, target: number, stat: string | null = null, xp = 150) =>
  ({ id: `${W}:w:${kind}`, weekStart: W, kind, stat, target, title: kind, xp });
const weekly = (quests: unknown[], ts = at(W, 7), id?: string) => ev({ type: 'weekly_issued', weekStart: W, quests, ts, ...(id ? { id } : {}) });

test('weekly: active_days и stat_quests, XP +150 ровно один раз', () => {
  const evs = [weekly([wq('active_days', 2), wq('stat_quests', 2, 'str')]),
    issue(W, [q('a', W, 10)]), done(W, 'a'), issue('2026-11-17', [q('b', '2026-11-17', 10), q('c', '2026-11-17', 10)]), done('2026-11-17', 'b')];
  const s = replay(evs, NOW);
  expect(s.weekly.quests.map(x => [x.kind, x.progress, x.done])).toEqual([['active_days', 2, true], ['stat_quests', 2, true]]);
  expect(s.totalXp).toBe(20 + 300);
  const more = replay([...evs, done('2026-11-17', 'c')], NOW);
  expect(more.totalXp).toBe(30 + 300);
});

test('weekly: два устройства — побеждает меньший ts; нет выдачи — пусто', () => {
  const s = replay([weekly([wq('shadow_wins', 3)], at(W, 9), 'z1'), weekly([wq('active_days', 3)], at(W, 8), 'z2')], NOW);
  expect(s.weekly.quests.map(x => x.kind)).toEqual(['active_days']);
  expect(replay([], NOW).weekly).toEqual({ weekStart: W, quests: [] });
});

test('weekly: steps_total суммирует шаги недели, прошлая неделя засчитывается', () => {
  const m = (date: string, value: number) => ev({ type: 'metric_logged', date, metric: 'steps', value, mode: 'set' });
  const s = replay([weekly([wq('steps_total', 5000)]), m(W, 3000), m('2026-11-17', 2500), m('2026-11-15', 9999)], NOW);
  expect(s.weekly.quests[0]).toMatchObject({ progress: 5500, done: true });
  expect(s.totalXp).toBe(150);
  const later = replay([weekly([wq('steps_total', 5000)]), m(W, 6000)], at('2026-11-25'));
  expect(later.totalXp).toBe(150); expect(later.weekly.quests).toEqual([]);
});

test('weekly: монеты за выполненное и genWeekly из прошлой недели', () => {
  const P = '2026-11-09';
  const s = replay([issue(P, [q('p1', P, 10)]), done(P, 'p1'), issue('2026-11-10', [q('p2', '2026-11-10', 10)]), done('2026-11-10', 'p2')], NOW);
  expect(s.genWeekly).toMatchObject({ weekStart: W, prevActiveDays: 2 });
  expect(s.genWeekly.prevStatQuests).toBeGreaterThanOrEqual(0);
});

const boss = (stages: unknown, id = 'b1', title = 'Босс') => ev({ type: 'boss_created', bossId: id, title, stat: 'int', stages });
const stage = (n: number, id = 'b1') => ev({ type: 'boss_stage_done', bossId: id, stage: n });

test('босс: невалидный игнорируется, этапы по порядку, XP 100×n+200', () => {
  expect(replay([boss(['один'])], NOW).bosses).toEqual([]);
  expect(replay([boss(['а', 'б']), stage(1)], NOW).totalXp).toBe(0);
  const s = replay([boss(['а', 'б', 'в']), stage(0), stage(0), stage(1), stage(2), stage(2)], NOW);
  expect(s.totalXp).toBe(100 * 3 + 200);
  expect(s.bosses[0]).toMatchObject({ done: 3, defeated: true });
  expect(s.statPoints.int).toBe(15);
  expect(s.currency).toBe(50);
});

test('босс: брошенный скрыт, XP остаётся', () => {
  const s = replay([boss(['а', 'б']), stage(0), ev({ type: 'boss_abandoned', bossId: 'b1' }), stage(1)], NOW);
  expect(s.bosses).toEqual([]); expect(s.totalXp).toBe(100);
});
