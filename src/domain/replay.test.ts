import { expect, test } from 'vitest';
import { baseFromXp, startBase } from './progression';
import { DEFAULT_AVATAR, normQuest, replay } from './replay';
import { seededRng } from './rng';
import { scoreFrom20 } from './startProfile';
import type { SkillId } from './skillCatalog';
import type { GameEvent, Profile, Quest, Rank, Stat } from './types';

const at = (date: string, h = 12) => { const [y, m, d] = date.split('-').map(Number); return new Date(y, m - 1, d, h).getTime(); };
const NOW = at('2026-11-17');
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent =>
  ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? '2026-11-17'), deviceId: 'd1', ...e }) as unknown as GameEvent;
const q = (id: string, date: string, xp: number, stat: Stat = 'str', difficulty: Quest['difficulty'] = 1, templateId = `t-${id}`): Quest =>
  ({ id, date, title: id, stat, difficulty, minutes: 10, window: null, xp, auto: null, templateId });
/** Новое задание v2: ранг и навыки, stat выводится из навыков. */
const nq = (id: string, date: string, rank: Rank, skills: SkillId[], extra: Partial<Quest> = {}): Quest =>
  ({ id, date, title: id, stat: 'str', minutes: 10, window: null, xp: 0, auto: null, templateId: `t-${id}`, rank, skills, kind: 'daily', ...extra } as Quest);
const issue = (date: string, quests: Quest[], h = 8) => ev({ type: 'quests_issued', date, quests, ts: at(date, h) });
const done = (date: string, questId: string, ts = at(date, 20), extra: Record<string, unknown> = {}) => ev({ type: 'quest_completed', date, questId, ts, ...extra });

// онбординг: Сила и Интеллект 9, остальное 5 → Основа str/int выше, слабейшая — end (ничья по порядку STATS)
const onboardProfile = { name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating: { str: 9, end: 5, int: 9, dis: 5, cha: 5, fin: 5, spi: 5 } } as Profile;
const onboard = ev({ type: 'onboarding_completed', profile: onboardProfile, ts: at('2026-11-10', 7), id: 'onb' });

// ---- v2: леджер, поток XP, миграция ----
test('легаси-журнал 17–19 ноября: XP как есть, ранг/навык по картам, золото 20%', () => {
  const weeklyLegacyShadow = ev({ type: 'weekly_issued', weekStart: '2026-11-16', ts: at('2026-11-16', 7),
    quests: [{ id: '2026-11-16:w:shadow_wins', weekStart: '2026-11-16', kind: 'shadow_wins', stat: null, target: 3, title: 'Победи Тень 3 раза', xp: 150 }] });
  const s = replay([onboard, issue('2026-11-17', [q('a', '2026-11-17', 35, 'str', 3, 'pushups')]), done('2026-11-17', 'a'),
    ev({ type: 'skill_unlocked', skillId: 'str1' }), weeklyLegacyShadow], at('2026-11-19'));
  expect(s.totalXp).toBe(35); expect(s.gold).toBe(7 + 25 * s.achievements.length);
  expect(s.skills.strength.xp).toBe(35); expect(s.statInfo.str.xp).toBe(35);
  expect(s.history[0]).toMatchObject({ date: '2026-11-17', xp: 35, completed: 1, issued: 1 });
  expect(s.season).toMatchObject({ kind: 'prologue', xp: 0 });
  expect(s.ledger[0]).toMatchObject({ source: 'quest', questId: 'a', xp: 35, gold: 7, verified: false });
  expect('shadowXp' in s.today).toBe(false);
  expect(s.weekly.quests).toMatchObject([{ kind: 'shadow_wins', progress: 1, done: false }]);
});

test('новое задание C, честное слово, Пролог → 49 XP, 10 золота, в сезон 0', () => {
  const s = replay([onboard, issue('2026-11-20', [nq('b', '2026-11-20', 'C', ['strength'])]), done('2026-11-20', 'b')], at('2026-11-21'));
  expect(s.ledger.at(-1)).toMatchObject({ base: 70, k: 0.7, xp: 49, gold: 10 });
  expect(s.season.xp).toBe(0); expect(s.level).toBe(s.startLevel);
});

test('Зима: тема +20% Интеллекту → 59 XP и в сезон', () => {
  const s = replay([onboard, issue('2026-12-01', [nq('c', '2026-12-01', 'C', ['reading'])]), done('2026-12-01', 'c')], at('2026-12-01', 22));
  expect(s.ledger.at(-1)).toMatchObject({ bonus: 0.2, xp: 59 }); expect(s.season).toMatchObject({ kind: 'winter', xp: 59, step: 0 });
});

test('season_theme_set меняет тему с даты события до конца сезона', () => {
  const evs = [onboard, ev({ type: 'season_theme_set', theme: 'body', ts: at('2026-12-05', 9) }),
    issue('2026-12-04', [nq('i4', '2026-12-04', 'C', ['reading'])]), done('2026-12-04', 'i4'),
    issue('2026-12-06', [nq('i6', '2026-12-06', 'C', ['reading']), nq('s6', '2026-12-06', 'C', ['mobility'])]), done('2026-12-06', 'i6'), done('2026-12-06', 's6')];
  const s = replay(evs, at('2026-12-07'));
  const row = (id: string) => s.ledger.find(r => r.questId === id)!;
  expect(row('i4').xp).toBe(59); expect(row('i6').xp).toBe(49); expect(row('s6').xp).toBe(59);
  expect(s.season.theme).toBe('body');
  // мусорная тема игнорируется; следующий сезон стартует со своей темой
  expect(replay([ev({ type: 'season_theme_set', theme: 'magic', ts: at('2026-12-05') })], at('2026-12-07')).season.theme).toBe('mind_spirit');
  expect(replay(evs, at('2027-06-02')).season).toMatchObject({ kind: 'summer', theme: 'people' });
});

test('слабейшая +25%: D Кардио → 35', () => {
  const s = replay([onboard, issue('2026-11-20', [nq('d', '2026-11-20', 'D', ['cardio'])]), done('2026-11-20', 'd')], at('2026-11-21'));
  expect(s.ledger.at(-1)).toMatchObject({ base: 40, bonus: 0.25, xp: 35, gold: 7 });
});

test('два тега 60/40 → навыки и характеристики', () => {
  const s = replay([onboard, issue('2026-11-20', [nq('b', '2026-11-20', 'B', ['strength', 'cardio'])]), done('2026-11-20', 'b')], at('2026-11-21'));
  expect(s.ledger.at(-1)).toMatchObject({ xp: 84, skills: [['strength', 50], ['cardio', 34]], stats: { str: 50, end: 34 } });
  expect(s.skills.strength.xp).toBe(50); expect(s.skills.cardio.xp).toBe(34);
  expect(s.statInfo.str.xp).toBe(50); expect(s.statInfo.end.xp).toBe(34);
  expect(s.today.quests).toEqual([]);
  expect(s.history[0]).toMatchObject({ date: '2026-11-20', xp: 84, counted: true, perfect: true, rest: false, streak: 1 });
});

test('Основа растёт от XP характеристики, стартовая — из анкеты', () => {
  const s = replay([onboard, issue('2026-11-17', [q('a', '2026-11-17', 400, 'str', 5, 'pushups')]), done('2026-11-17', 'a')], at('2026-11-18'));
  const start = startBase(s.start.scores.str);
  expect(s.start.source).toBe('rules');
  expect(start).toBe(63);
  expect(s.stats.str).toBe(baseFromXp(start, s.statInfo.str.xp).value);
  expect(s.stats.str).toBe(64);
  expect(s.statInfo.str).toMatchObject({ base: 64, into: 400 - 365, need: 50 + 5 * 64, form: null, status: 'new' });
  expect(s.statHistory).toEqual([{ date: '2026-11-17', stats: s.stats }]);
});

test('авто-проверка: метрика выполнена → ×1,0 даже после ручной галочки', () => {
  const auto = { metric: 'steps' as const, op: '>=' as const, value: 6000 };
  const s = replay([onboard, issue('2026-11-20', [nq('w', '2026-11-20', 'C', ['strength'], { auto })]), done('2026-11-20', 'w'),
    ev({ type: 'metric_logged', date: '2026-11-20', metric: 'steps', value: 7000, mode: 'set', ts: at('2026-11-20', 21) })], at('2026-11-20', 22));
  expect(s.ledger.at(-1)).toMatchObject({ k: 1, verified: true, xp: 70 });
  expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto', xpFinal: 70 });
  expect(s.today.xp).toBe(70);
  // метрика не дотянула — честное слово
  const low = replay([onboard, issue('2026-11-20', [nq('w', '2026-11-20', 'C', ['strength'], { auto })]), done('2026-11-20', 'w'),
    ev({ type: 'metric_logged', date: '2026-11-20', metric: 'steps', value: 5000, mode: 'set' })], at('2026-11-20', 22));
  expect(low.ledger.at(-1)).toMatchObject({ k: 0.7, verified: false });
});

test('фото: verify photo → ×0,9; битый photo-блоб → честное слово', () => {
  const run = (extra: Record<string, unknown>) => replay([onboard, issue('2026-11-20', [nq('p', '2026-11-20', 'C', ['strength'])]),
    done('2026-11-20', 'p', at('2026-11-20', 20), extra)], at('2026-11-20', 22)).ledger.at(-1)!;
  expect(run({ verify: 'photo', photo: 'quest-p-1' })).toMatchObject({ k: 0.9, xp: 63 });
  expect(run({ verify: 'photo', photo: '../etc' }).k).toBe(0.7);
  expect(run({ verify: 'photo' }).k).toBe(0.7);
  expect(run({ verify: 'auto', photo: 'x' }).k).toBe(0.7);
});

test('легаси-покупка остаётся валидной после пересчёта золота', () => {
  // старый фикс: заработано 300 XP, куплено за 30 при старых 10%
  const s = replay([issue('2026-11-10', [q('a', '2026-11-10', 300)]), done('2026-11-10', 'a'),
    ev({ type: 'reward_created', rewardId: 'r', title: 'Кино', price: 30, ts: at('2026-11-12', 9) }),
    ev({ type: 'reward_purchased', rewardId: 'r', ts: at('2026-11-12', 10) })], NOW);
  expect(s.purchases).toHaveLength(1);
  expect(s.gold).toBe(60 + 25 * s.achievements.length - 30);
});

test('interview из сети: поля анализа проходят validAnalysis', () => {
  const analysis = { archetype: 'А', summary: 'с', strengths: [], weaknesses: [], focus: [], questGuidance: '',
    stats: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 }, startLevel: 999, scores: { str: 500 }, skillLevels: { strength: 99, cardio: 3, magic: 2 } };
  const s = replay([ev({ type: 'interview_completed', answers: {}, followups: [], analysis })], NOW);
  expect(s.startLevel).toBe(Math.round(scoreFrom20(5) / 2));
  expect(s.start.scores.str).toBe(scoreFrom20(5));
  expect(s.skills.strength.start).toBe(1); expect(s.skills.cardio.start).toBe(3);
  expect(s.level).toBe(s.startLevel);
  const ai = replay([ev({ type: 'interview_completed', answers: {}, followups: [], analysis: { ...analysis, startLevel: 20 } })], NOW);
  expect(ai.startLevel).toBe(20); expect(ai.start.source).toBe('ai');
});

test('normQuest: легаси и новые, мусор отбрасывается', () => {
  const D = '2026-11-17';
  expect(normQuest(q('a', D, 35, 'str', 3, 'pushups'), D)).toMatchObject({ rank: 'D', skills: ['strength'], kind: 'daily', legacy: true, xp: 35, done: false, verify: null, xpFinal: null, dropped: false });
  expect(normQuest({ ...q('a', D, -5, 'int', 9 as never, 'constructor') }, D)).toMatchObject({ rank: 'E', skills: ['reading'], stat: 'int', xp: 0 });
  expect(normQuest(q('a', D, 1e9), D)!.xp).toBe(10000);
  expect(normQuest({ ...q('a', D, 10), xp: 'x' }, D)!.xp).toBe(0);
  expect(normQuest({ ...q('a', D, 10), stat: 'magic', templateId: 'zzz' }, D)).toBeNull();
  expect(normQuest(nq('n', D, 'C', ['leadership']), D)).toMatchObject({ stat: 'cha', legacy: false, rank: 'C' });
  expect(normQuest(nq('n', D, 'Z' as Rank, ['strength']), D)).toBeNull();
  expect(normQuest(nq('n', D, 'C', ['strength', 'strength']), D)).toBeNull();
  expect(normQuest(nq('n', D, 'C', ['strength', 'cardio', 'sleep']), D)).toBeNull();
  expect(normQuest(nq('n', D, 'C', ['magic' as SkillId]), D)).toBeNull();
  expect(normQuest(nq('n', D, 'C', []), D)).toBeNull();
  expect(normQuest({ ...nq('n', D, 'C', ['strength']), date: '2020-01-01' }, D)!.date).toBe(D);
  for (const bad of [null, 5, 'x', [], { id: 'x' }, { id: 1, title: 't', stat: 'str', xp: 1 }]) expect(normQuest(bad, D)).toBeNull();
});

test('500 случайных битых событий не бросают', () => {
  const rnd = seededRng('fuzz'); const vals = [null, undefined, 1, -1, NaN, 'x', [], {}, [1], { a: 1 }, '2026-11-17', 'E', 'Z'];
  const types = ['quests_issued','quest_completed','day_started','day_changed','quest_rerolled','custom_quest_added','season_theme_set','reward_created','reward_purchased','interview_completed','weekly_issued','skill_unlocked','metric_logged','health_packet','boss_created'];
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const evs = Array.from({ length: 500 }, (_, i) => ev({ type: pick(types), date: pick(vals), quests: [{ id: pick(vals), rank: pick(vals), skills: pick(vals), xp: pick(vals), stat: pick(vals) }], questId: pick(vals), quest: pick(vals), dayType: pick(vals), theme: pick(vals), verify: pick(vals), ts: at('2026-11-17') + i } as any));
  expect(() => replay(evs, at('2026-11-20'))).not.toThrow();
  // мусор в самих полях конверта
  const junk = [null, 5, 'x', { type: 'quests_issued' }, { id: 'j', ts: NaN, type: 'quests_issued', date: '0001-01-01', quests: [q('z', '0001-01-01', 10)] },
    { id: 'k', ts: at('2026-11-17'), type: 'quests_issued', date: '1900-01-01', quests: [q('zz', '1900-01-01', 10)] },
    { id: 'm', ts: at('2026-11-17'), type: 'metric_logged', date: '2026-11-17', metric: '__proto__', value: 5, mode: 'set' }];
  expect(() => replay(junk as any, at('2026-11-20'))).not.toThrow();
});

const mixed = [onboard, issue('2026-11-14', [q('a', '2026-11-14', 50), nq('b', '2026-11-14', 'C', ['reading', 'focus'])]), done('2026-11-14', 'b'),
  issue('2026-11-15', [q('c', '2026-11-15', 30)]), done('2026-11-15', 'c'),
  ev({ type: 'reward_created', rewardId: 'r', title: 'Чай', price: 20, ts: at('2026-11-15', 21) }), ev({ type: 'reward_purchased', rewardId: 'r', ts: at('2026-11-16', 9) }),
  ev({ type: 'boss_created', bossId: 'b', title: 'Б', stat: 'int', stages: ['1', '2'], ts: at('2026-11-14', 1) }), ev({ type: 'boss_stage_done', bossId: 'b', stage: 0, ts: at('2026-11-16', 10) }),
  issue('2026-11-17', [nq('t', '2026-11-17', 'E', ['cardio'])]), done('2026-11-17', 't')];
test('перемешанный журнал даёт тот же state', () => {
  expect(replay(mixed, NOW)).toEqual(replay([...mixed].reverse(), NOW));
  const r = seededRng('shuffle'); const sh = [...mixed].sort(() => r() - 0.5);
  expect(replay(sh, NOW)).toEqual(replay(mixed, NOW));
});

test('skill_unlocked игнорируется; навыки 24 со стартом 1', () => {
  const s = replay([ev({ type: 'skill_unlocked', skillId: 'str1' })], NOW);
  expect(Object.keys(s.skills)).toHaveLength(24);
  expect(s.skills.strength).toEqual({ level: 1, into: 0, need: 100, xp: 0, start: 1, lastDate: null });
});

test('first_skill: навык достиг 2 уровня', () => {
  const s = replay([issue('2026-11-16', [q('a', '2026-11-16', 99, 'str', 1, 'pushups')]), done('2026-11-16', 'a'),
    issue('2026-11-17', [q('b', '2026-11-17', 1, 'str', 1, 'pushups')]), done('2026-11-17', 'b')], NOW);
  expect(s.skills.strength).toMatchObject({ level: 2, lastDate: '2026-11-17' });
  expect(s.achievements.find(a => a.id === 'first_skill')).toEqual({ id: 'first_skill', date: '2026-11-17' });
});

// ---- базовые правила (перенесены со старых тестов) ----
test('пустой журнал', () => {
  const s = replay([], NOW);
  expect(s.profile).toBeNull();
  expect(s.avatar).toEqual(DEFAULT_AVATAR);
  expect(s.totalXp).toBe(0); expect(s.level).toBe(1); expect(s.startLevel).toBe(1); expect(s.stats.str).toBe(5);
  expect(s.start.source).toBe('none'); expect(s.gold).toBe(0); expect(s.ledger).toEqual([]);
  expect(s.multipliers.str).toBe(1); expect(s.today.date).toBe('2026-11-17');
  expect(s.history).toEqual([]); expect(s.season).toMatchObject({ id: 'prologue', theme: null, xp: 0, step: 0 });
});

test('3 дня без открытия: финализируются один раз, серия 0', () => {
  const evs = [
    issue('2026-11-13', [q('a', '2026-11-13', 50), q('b', '2026-11-13', 20)]),
    done('2026-11-13', 'a'),
    issue('2026-11-14', [q('c', '2026-11-14', 30)]),
  ];
  const s1 = replay(evs, NOW); const s2 = replay([...evs].reverse(), NOW);
  expect(s1).toEqual(s2);
  expect(s1.streak).toBe(0);
  expect(s1.history).toEqual([
    { date: '2026-11-13', xp: 50, completed: 1, issued: 2, counted: true, perfect: false, rest: false, streak: 1 },
    { date: '2026-11-14', xp: 0, completed: 0, issued: 1, counted: false, perfect: false, rest: false, streak: 0 },
  ]);
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
  expect(s.totalXp).toBe(20); expect(s.gold).toBe(4 + 25); expect(s.today.xp).toBe(20);
  expect(s.today.quests[0].done).toBe(true); expect(s.ledger).toHaveLength(1);
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

test('день без quests_issued рвёт серию', () => {
  const s = replay([
    issue('2026-11-14', [q('a', '2026-11-14', 100)]), done('2026-11-14', 'a'),
    issue('2026-11-16', [q('b', '2026-11-16', 30)]), done('2026-11-16', 'b'),
    issue('2026-11-17', [q('c', '2026-11-17', 10), q('d', '2026-11-17', 10)]), done('2026-11-17', 'c'),
  ], NOW);
  expect(s.history.map(h => [h.date, h.streak])).toEqual([['2026-11-14', 1], ['2026-11-16', 1]]);
  expect(s.streak).toBe(2); // 16-е (1) + сегодня
  expect(s.today.xp).toBe(10);
});

test('totalXp, золото, XP характеристик, уровень от стартового', () => {
  const sr = { str: 3, end: 3, int: 3, dis: 3, cha: 3, fin: 3, spi: 3 } as Record<Stat, number>;
  const profile = { name: 'A', selfRating: sr, sportLevel: 0 } as unknown as Profile;
  const s = replay([
    ev({ type: 'onboarding_completed', profile, ts: at('2026-11-15', 7) }),
    issue('2026-11-17', [q('a', '2026-11-17', 55, 'int', 5), q('b', '2026-11-17', 55, 'int', 5), q('c', '2026-11-17', 35, 'int', 4)]),
    done('2026-11-17', 'a'), done('2026-11-17', 'b'), done('2026-11-17', 'c'),
  ], NOW);
  expect(s.profile).toBe(profile);
  expect(s.statInfo.int.xp).toBe(145); expect(s.skills.reading.xp).toBe(145);
  expect(s.totalXp).toBe(145); expect(s.gold).toBe(11 + 11 + 7 + 25 * s.achievements.length);
  expect(s.startLevel).toBe(13); expect(s.level).toBe(13); expect(s.xpInto).toBe(145); expect(s.xpNeed).toBe(4687);
  expect(s.ledger.map(r => r.date)).toEqual(['2026-11-17', '2026-11-17', '2026-11-17']);
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

test('повторная анкета с меньшей самооценкой не снижает Основу', () => {
  const mk = (n: number) => ({ name: 'A', sportLevel: 0,
    selfRating: { str: n, end: n, int: n, dis: n, cha: n, fin: n, spi: n } }) as unknown as Profile;
  const low = mk(2);
  const s = replay([
    ev({ type: 'onboarding_completed', profile: mk(5), ts: at('2026-11-15') }),
    ev({ type: 'onboarding_completed', profile: { ...low, selfRating: { ...low.selfRating, int: 8 } }, ts: at('2026-11-16') }),
  ], NOW);
  expect(s.profile!.selfRating.str).toBe(2); // профиль — последний
  expect(s.stats.str).toBe(startBase(scoreFrom20(10))); expect(s.stats.int).toBe(startBase(scoreFrom20(16)));
  // битая самооценка из сети — событие игнорируется
  expect(replay([ev({ type: 'onboarding_completed', profile: { ...low, selfRating: { str: 'x' } } })], NOW).profile).toBeNull();
});

test('смена часа конца суток не стирает заработанное', () => {
  const evs = [issue('2026-11-16', [q('a', '2026-11-16', 50)]), done('2026-11-16', 'a', new Date(2026, 10, 17, 2, 30).getTime())];
  for (const cutoff of [4, 2, 6, 0]) expect(replay(evs, NOW, cutoff).history[0].completed).toBe(1);
  // на два дня позже — не засчитывается
  const late = [issue('2026-11-15', [q('b', '2026-11-15', 50)]), done('2026-11-15', 'b', new Date(2026, 10, 17, 2, 30).getTime())];
  for (const cutoff of [4, 2, 6]) expect(replay(late, NOW, cutoff).totalXp).toBe(0);
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

// ---- магазин ----
const bigDay = (xp: number, date = '2026-11-01', stat: Stat = 'str') =>
  [issue(date, [q(`big${xp}${date}`, date, xp, stat)]), done(date, `big${xp}${date}`)];

test('награды: покупка, перерасход игнорируется, удаление, невалидные', () => {
  const earn = bigDay(1050, '2026-11-10');
  const created = ev({ type: 'reward_created', rewardId: 'r1', title: 'Кино', price: 150, ts: at('2026-11-15', 9) });
  const buy = (h: number) => ev({ type: 'reward_purchased', rewardId: 'r1', ts: at('2026-11-15', h) });
  const base = replay([...earn, created], NOW).gold;
  const s = replay([...earn, created, buy(10), buy(11)], NOW);
  expect(s.gold).toBe(base - 150 + 25);
  expect(s.purchases).toHaveLength(1);
  // ещё покупка при нехватке
  const poor = replay([...earn, created, ...[10, 11, 12, 13, 14, 15, 16].map(buy)], NOW);
  expect(poor.gold).toBe(base - 150 + 25); expect(poor.purchases).toHaveLength(1);
  // удалена до покупки — не покупается; удалена после — покупка остаётся
  const del = (h: number) => ev({ type: 'reward_deleted', rewardId: 'r1', ts: at('2026-11-15', h) });
  expect(replay([...earn, created, del(10), buy(11)], NOW).purchases).toEqual([]);
  const after = replay([...earn, created, buy(10), del(11)], NOW);
  expect(after.rewards).toEqual([]);
  expect(after.purchases).toMatchObject([{ rewardId: 'r1', title: 'Кино', price: 150 }]);
  const bad = replay([
    ev({ type: 'reward_created', rewardId: 'x', title: 'a', price: -5 }),
    ev({ type: 'reward_created', rewardId: 'y', title: '', price: 5 }),
    ev({ type: 'reward_created', rewardId: 'z', title: '   ', price: 5 }),
  ], NOW);
  expect(bad.rewards).toEqual([]);
  const trimmed = replay([ev({ type: 'reward_created', rewardId: 't', title: '  Кино ', price: 5 })], NOW);
  expect(trimmed.rewards).toEqual([{ id: 't', title: 'Кино', price: 5 }]);
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
  expect(s.ledger.filter(r => r.source === 'weekly').map(r => r.stats)).toEqual([{}, { str: 150 }]);
  const more = replay([...evs, done('2026-11-17', 'c')], NOW);
  expect(more.totalXp).toBe(30 + 300);
});

test('weekly: легаси shadow_wins считает засчитанные дни', () => {
  const s = replay([weekly([wq('shadow_wins', 2)]), issue(W, [q('a', W, 10)]), done(W, 'a'),
    issue('2026-11-17', [q('b', '2026-11-17', 10)]), done('2026-11-17', 'b')], NOW);
  expect(s.weekly.quests[0]).toMatchObject({ progress: 2, done: true });
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
  expect(later.ledger[0]).toMatchObject({ source: 'weekly', date: '2026-11-22', xp: 150, gold: 30 });
});

test('weekly: genWeekly из прошлой недели и тема сезона', () => {
  const P = '2026-11-09';
  const s = replay([issue(P, [q('p1', P, 10)]), done(P, 'p1'), issue('2026-11-10', [q('p2', '2026-11-10', 10)]), done('2026-11-10', 'p2')], NOW);
  expect(s.genWeekly).toMatchObject({ weekStart: W, prevActiveDays: 2, themeStat: null });
  expect(s.genWeekly.prevStatQuests).toBeGreaterThanOrEqual(0);
  expect(replay([], at('2026-12-02')).genWeekly.themeStat).toBe('int');
});

const boss = (stages: unknown, id = 'b1', title = 'Босс') => ev({ type: 'boss_created', bossId: id, title, stat: 'int', stages });
const stage = (n: number, id = 'b1') => ev({ type: 'boss_stage_done', bossId: id, stage: n });

test('босс: невалидный игнорируется, этапы по порядку, XP 100×n+200', () => {
  expect(replay([boss(['один'])], NOW).bosses).toEqual([]);
  expect(replay([boss(['а', 'б']), stage(1)], NOW).totalXp).toBe(0);
  const s = replay([boss(['а', 'б', 'в']), stage(0), stage(0), stage(1), stage(2), stage(2)], NOW);
  expect(s.totalXp).toBe(100 * 3 + 200);
  expect(s.bosses[0]).toMatchObject({ done: 3, defeated: true });
  expect(s.statInfo.int.xp).toBe(500);
  expect(s.gold).toBe(100 + 25);
  expect(s.ledger.map(r => [r.source, r.xp])).toEqual([['boss', 100], ['boss', 100], ['boss', 300]]);
});

test('босс: брошенный скрыт, XP остаётся', () => {
  const s = replay([boss(['а', 'б']), stage(0), ev({ type: 'boss_abandoned', bossId: 'b1' }), stage(1)], NOW);
  expect(s.bosses).toEqual([]); expect(s.totalXp).toBe(100);
});

test('weekly_issued: дубли id оплачиваются раз, не-понедельник и мусор игнорируются, XP зажат', () => {
  const dup = replay([weekly([wq('active_days', 1, null, 5000), wq('active_days', 1, null, 5000)]), issue(W, [q('a', W, 10)]), done(W, 'a')], NOW);
  expect(dup.weekly.quests.length).toBe(1);
  expect(dup.totalXp).toBe(1010);
  const bad = replay([ev({ type: 'weekly_issued', weekStart: '2026-11-17', quests: [wq('active_days', 1)], ts: at(W, 7) })], NOW);
  expect(bad.weekly.quests).toEqual([]);
  expect(replay([weekly([wq('bogus', 1), wq('active_days', 1e12)])], NOW).weekly.quests).toEqual([]);
});

test('босс со stat "constructor" игнорируется', () => {
  expect(replay([ev({ type: 'boss_created', bossId: 'x', title: 'T', stat: 'constructor', stages: ['а', 'б'] })], NOW).bosses).toEqual([]);
});

// --- достижения, история ---
const metric = (date: string, m: string, value: number) => ev({ type: 'metric_logged', date, metric: m, value, mode: 'set' });

test('достижения: первое задание, +25 золота, без дублей; без достижений — Новичок', () => {
  expect(replay([], NOW).title).toBe('Новичок');
  const evs = [issue('2026-11-17', [q('a', '2026-11-17', 10), q('b', '2026-11-17', 10)]), done('2026-11-17', 'a')];
  const s = replay(evs, NOW);
  expect(s.achievements).toEqual([{ id: 'first_quest', date: '2026-11-17' }]);
  expect(s.gold).toBe(2 + 25);
  const s2 = replay([...evs, done('2026-11-17', 'b')], NOW);
  expect(s2.achievements.filter(a => a.id === 'first_quest').length).toBe(1);
});

test('streak_7 получен в дату 7-го дня, титул «Упорный»', () => {
  const days = Array.from({ length: 7 }, (_, i) => `2026-11-${String(11 + i).padStart(2, '0')}`);
  const evs = days.flatMap(d => [issue(d, [q(`q${d}`, d, 10)]), done(d, `q${d}`)]);
  const s = replay(evs, NOW);
  expect(s.achievements.find(a => a.id === 'streak_7')).toEqual({ id: 'streak_7', date: '2026-11-17' });
  expect(s.title).toBe('Упорный');
});

test('уровни стартового профиля дают достижения уровней', () => {
  const s = replay([onboard], NOW);
  expect(s.startLevel).toBe(30);
  expect(s.achievements.map(a => a.id)).toEqual(['level_5', 'level_10', 'level_15', 'level_30']);
});

test('достижения на золото можно потратить, баланс не уходит в минус', () => {
  const evs = [issue('2026-11-17', [q('a', '2026-11-17', 10)]), done('2026-11-17', 'a'),
    ev({ type: 'reward_created', rewardId: 'r', title: 'Чай', price: 27 }),
    ev({ type: 'reward_purchased', rewardId: 'r', ts: at('2026-11-17', 21) })];
  const s = replay(evs, NOW);
  expect(s.purchases.length).toBe(1);
  expect(s.achievements.map(a => a.id)).toContain('first_purchase');
  expect(s.gold).toBe(2 + 25 + 25 - 27);
});

test('statHistory: по числу финализированных дней, не убывает', () => {
  const days = ['2026-11-10', '2026-11-11', '2026-11-12'];
  const evs = days.flatMap(d => [issue(d, [q(`q${d}`, d, 30, 'str', 3)]), done(d, `q${d}`)]);
  const s = replay(evs, NOW);
  expect(s.statHistory.length).toBe(s.history.length);
  expect(s.statHistory.map(h => h.stats.str)).toEqual([5, 5, 6]);
});

test('metricHistory и bestSteps7', () => {
  const five = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'].map(d => metric(d, 'steps', 8000));
  const s = replay([...five, metric('2026-11-17', 'steps', 5000)], NOW);
  expect(s.metricHistory.at(-1)).toEqual({ date: '2026-11-17', metrics: { steps: 5000 } });
  expect(s.genInputs.bestSteps7).toBe(8000);
  expect('shadowMetrics' in s.today).toBe(false);
});

test('производительность: 120 дней по 5 заданий', () => {
  const evs: GameEvent[] = [];
  for (let i = 120; i >= 1; i--) {
    const d = new Date(2026, 10, 17 - i), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const qs = [1, 2, 3, 4, 5].map(k => q(`${date}-${k}`, date, 20));
    evs.push(issue(date, qs), ...qs.slice(0, 3).map(x => done(date, x.id)), metric(date, 'steps', 7000 + i));
  }
  const t = performance.now(); replay(evs, NOW);
  expect(performance.now() - t).toBeLessThan(200);
});

test('магазин: после первой покупки можно потратить ровно показанный баланс; покупка не пропадает позже', () => {
  const earn = bigDay(1050, '2026-11-10');
  const mkR = (id: string, price: number, h: number) => ev({ type: 'reward_created', rewardId: id, title: id, price, ts: at('2026-11-15', h) });
  const buy = (id: string, h: number) => ev({ type: 'reward_purchased', rewardId: id, ts: at('2026-11-15', h) });
  const first = replay([...earn, mkR('a', 10, 9), buy('a', 10)], NOW);
  const c = first.gold;
  expect(c).toBeGreaterThan(0);
  const s = replay([...earn, mkR('a', 10, 9), buy('a', 10), mkR('b', c, 11), buy('b', 12)], NOW);
  expect(s.purchases).toHaveLength(2); expect(s.gold).toBe(0);
  expect(replay([...earn, mkR('a', 10, 9), buy('a', 10), mkR('b', c + 1, 11), buy('b', 12)], NOW).purchases).toHaveLength(1);
  expect(replay([...earn, mkR('a', 10, 9), buy('a', 10)], at('2026-11-30')).purchases).toHaveLength(1);
});

test('weekly: title не строка — квест отбрасывается', () => {
  const bad = { ...wq('active_days', 2), title: { x: 1 } };
  expect(replay([weekly([bad])], NOW).weekly.quests).toEqual([]);
  expect(replay([weekly([{ ...wq('active_days', 2), title: '' }])], NOW).weekly.quests).toEqual([]);
  expect(replay([weekly([wq('active_days', 2)])], NOW).weekly.quests.every(x => typeof x.title === 'string')).toBe(true);
});

test('quests_issued: не массив и мусорные записи не ломают replay', () => {
  expect(() => replay([ev({ type: 'quests_issued', date: '2026-11-17', quests: null })], NOW)).not.toThrow();
  const s = replay([ev({ type: 'quests_issued', date: '2026-11-17', quests: [null, 5, { id: 'x' }, q('ok', '2026-11-17', 10)] })], NOW);
  expect(s.today.quests.map(x => x.id)).toEqual(['ok']);
});

test('onboarding_completed без анкеты из сети игнорируется, replay не падает', () => {
  const evs = [{ id: 'x', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile: null } as any]
  expect(() => replay(evs, Date.parse('2026-11-17T12:00:00'))).not.toThrow()
  expect(replay(evs, Date.parse('2026-11-17T12:00:00')).profile).toBeNull()
})

// --- ИИ: тюнинг и отчёты ---
const tune = (date: string, factors: Record<string, unknown>, extra: { ts?: number } = {}) => ev({ type: 'ai_tuning', date, factors, note: 'Завтра легче', ...extra });
const tuneBase = () => [issue('2026-11-15', [q('a', '2026-11-15', 50)]), done('2026-11-15', 'a')];

test('ai_tuning: фактор ограничен 1.1 и применяется после adjustMultipliers', () => {
  const base = replay(tuneBase(), NOW).multipliers.str;
  const m = replay([...tuneBase(), tune('2026-11-15', { str: 1.5 })], NOW).multipliers.str;
  expect(m).toBeCloseTo(base * 1.1, 6);
});

test('ai_tuning: нечисловой фактор и чужая характеристика игнорируются', () => {
  const base = replay(tuneBase(), NOW).multipliers;
  const s = replay([...tuneBase(), tune('2026-11-15', { str: 'x', magic: 1.1, int: NaN })], NOW);
  expect(s.multipliers).toEqual(base);
});

test('ai_tuning: множитель в пределах 0.5–3.0', () => {
  const evs: GameEvent[] = [];
  for (let i = 1; i <= 14; i++) { const d = `2026-11-${String(i).padStart(2, '0')}`; evs.push(issue(d, [q(`x${i}`, d, 10)]), done(d, `x${i}`), tune(d, { str: 1.1 })); }
  expect(replay(evs, NOW).multipliers.str).toBeLessThanOrEqual(3);
  const low: GameEvent[] = [];
  for (let i = 1; i <= 14; i++) { const d = `2026-11-${String(i).padStart(2, '0')}`; low.push(issue(d, [q(`y${i}`, d, 10)]), tune(d, { str: 0.1 })); }
  expect(replay(low, NOW).multipliers.str).toBeGreaterThanOrEqual(0.5);
});

test('ai_tuning: второй на ту же дату игнорируется', () => {
  const one = replay([...tuneBase(), tune('2026-11-15', { str: 1.1 })], NOW).multipliers.str;
  const two = replay([...tuneBase(), tune('2026-11-15', { str: 1.1 }), tune('2026-11-15', { str: 0.9 }, { ts: at('2026-11-15', 23) })], NOW).multipliers.str;
  expect(two).toBe(one);
});

test('ai_tuning: мусорные события не бросают', () => {
  expect(() => replay([...tuneBase(), ev({ type: 'ai_tuning', date: '2026-11-15', factors: null, note: 5 }), ev({ type: 'ai_tuning' })], NOW)).not.toThrow();
});

test('today.aiNote — из тюнинга за вчера', () => {
  const s = replay([...tuneBase(), tune('2026-11-16', { str: 1 })], NOW);
  expect(s.today.aiNote).toBe('Завтра легче');
  expect(replay([], NOW).today.aiNote).toBeNull();
});

test('ai_report: не‑понедельник игнорируется, текст обрезается, последний побеждает', () => {
  const r = (weekStart: string, text: unknown, ts?: number) => ev({ type: 'ai_report', weekStart, text, ...(ts ? { ts } : {}) });
  expect(replay([r('2026-11-11', 'x')], NOW).reports).toEqual([]);
  expect(replay([r('2026-11-09', 'x'.repeat(5000))], NOW).reports[0].text).toHaveLength(4000);
  const s = replay([r('2026-11-02', 'old'), r('2026-11-09', 'a', 1), r('2026-11-09', 'b', 2)], NOW);
  expect(s.reports).toEqual([{ weekStart: '2026-11-09', text: 'b' }, { weekStart: '2026-11-02', text: 'old' }]);
});

test('avatar_image: последний по ts для тира, невалидное игнорируется', () => {
  const s = replay([
    ev({ type: 'avatar_image', tier: 1, blob: 'avatar-t1-aa', ts: at('2026-11-10') }),
    ev({ type: 'avatar_image', tier: 3, blob: 'avatar-t3-aa', ts: at('2026-11-11') }),
    ev({ type: 'avatar_image', tier: 3, blob: 'avatar-t3-bb', ts: at('2026-11-12') }),
    ev({ type: 'avatar_image', tier: 3, blob: '../x', ts: at('2026-11-13') }),
    ev({ type: 'avatar_image', tier: 5, blob: 'avatar-t5-aa', ts: at('2026-11-13') }),
    ev({ type: 'avatar_image', tier: 2.5, blob: 'avatar-t2-aa', ts: at('2026-11-13') }),
  ], NOW);
  expect(s.avatarImages).toEqual({ 1: 'avatar-t1-aa', 3: 'avatar-t3-bb' });
});

const STATS7 = { str: 5, end: 6, int: 7, dis: 8, cha: 9, fin: 10, spi: 11 };
const interview = (e: Record<string, unknown>) => ev({ type: 'interview_completed', followups: [], ...e });
const profile = (r: number): Profile => ({ name: 'T', wake: '07:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 0, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating: { str: r, end: r, int: r, dis: r, cha: r, fin: r, spi: r } });

test('анкета поднимает Основу, но не опускает; character заполняется', () => {
  const analysis = { archetype: 'Мечтатель', summary: 'Итог', strengths: ['а'], weaknesses: ['б'], stats: { ...STATS7, str: 12 }, focus: ['сон'], questGuidance: 'мягко' };
  const s = replay([ev({ type: 'onboarding_completed', profile: profile(4) }), interview({ answers: { goal: 'x', n: 3 }, analysis })], NOW);
  const b = (v: number) => startBase(scoreFrom20(v));
  expect(s.stats.str).toBe(b(12)); expect(s.stats.end).toBe(b(8)); expect(s.stats.spi).toBe(b(11)); // max(8, …): не опускает
  expect(s.character).toMatchObject({ archetype: 'Мечтатель', summary: 'Итог', focus: ['сон'], questGuidance: 'мягко', date: '2026-11-17', ai: true });
  expect(s.interviewAnswers).toEqual({ goal: 'x', n: 3 });
});

test('невалидный analysis → ruleStats; повреждённые answers не валят replay', () => {
  const bad = { archetype: 'Х', summary: 'с', strengths: [], weaknesses: [], stats: { ...STATS7, str: 99 }, focus: [], questGuidance: '' };
  const s = replay([interview({ answers: { pushups: 50, pullups: 15, plank: 240, evil: {}, nan: NaN }, analysis: bad })], NOW);
  expect(s.stats.str).toBe(70);
  expect(s.character!.archetype).toBe(s.className); expect(s.character!.strengths).toEqual([]); expect(s.character!.ai).toBe(false);
  expect(s.interviewAnswers).toEqual({ pushups: 50, pullups: 15, plank: 240 });
  expect(() => replay([interview({ answers: 'мусор', analysis: 5 }), interview({ answers: null, analysis: null })], NOW)).not.toThrow();
});

test('без анкеты character и interviewAnswers — null', () => {
  const s = replay([], NOW); expect(s.character).toBeNull(); expect(s.interviewAnswers).toBeNull();
});
