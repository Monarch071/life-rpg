import { expect, test } from 'vitest';
import { BALANCE } from './balance';
import { addDays } from './day';
import { closesAtTs, DEFAULT_DAY_TYPES } from './dayType';
import { LADDER_PRESETS } from './ladder';
import { baseFromXp, rankCap, startBase } from './progression';
import { DEFAULT_AVATAR, normQuest, replay } from './replay';
import { missingDefaultRewards } from './shopDefaults';
import { seededRng } from './rng';
import { scoreFrom20 } from './startProfile';
import type { SkillId } from './skillCatalog';
import type { GameEvent, Profile, Quest, Rank, Stat } from './types';

const at = (date: string, h = 12, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
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
  expect(s.totalXp).toBe(35 + 50); expect(s.gold).toBe(7 + 10 + 25 * s.achievements.length); // + идеальный день 17-го
  expect(s.skills.strength.xp).toBe(35); expect(s.statInfo.str.xp).toBe(35);
  expect(s.history[0]).toMatchObject({ date: '2026-11-17', xp: 35, completed: 1, issued: 1 });
  expect(s.season).toMatchObject({ kind: 'prologue', xp: 0 });
  expect(s.ledger[0]).toMatchObject({ source: 'quest', questId: 'a', xp: 35, gold: 7, verified: false });
  expect('shadowXp' in s.today).toBe(false);
  expect(s.weekly.quests).toMatchObject([{ kind: 'shadow_wins', progress: 1, done: false }]);
});

test('новое задание C, честное слово, Пролог → 49 XP, 10 золота, в сезон 0', () => {
  const s = replay([onboard, issue('2026-11-20', [nq('b', '2026-11-20', 'C', ['strength'])]), done('2026-11-20', 'b')], at('2026-11-21'));
  expect(s.ledger.find(r => r.source === 'quest')).toMatchObject({ base: 70, k: 0.7, xp: 49, gold: 10 });
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
  // разницы бонусов, а не числа XP: с depthSince добавляются пассивы класса и перки
  const noTheme = replay(evs.filter(e => e.type !== 'season_theme_set'), at('2026-12-07')).ledger.find(r => r.questId === 's6')!;
  const d = (a: number, b: number) => Math.round((a - b) * 1e9) / 1e9;
  expect(d(row('i4').bonus, row('i6').bonus)).toBe(BALANCE.bonus.theme);   // Разум и дух → Тело: чтение без темы
  expect(d(row('s6').bonus, noTheme.bonus)).toBe(BALANCE.bonus.theme);     // Мобильность — по теме Тело
  expect(s.season.theme).toBe('body');
  // мусорная тема игнорируется; следующий сезон стартует со своей темой
  expect(replay([ev({ type: 'season_theme_set', theme: 'magic', ts: at('2026-12-05') })], at('2026-12-07')).season.theme).toBe('mind_spirit');
  expect(replay(evs, at('2027-06-02')).season).toMatchObject({ kind: 'summer', theme: 'people' });
});

test('слабейшая +25%: D Кардио → 35', () => {
  const s = replay([onboard, issue('2026-11-20', [nq('d', '2026-11-20', 'D', ['cardio'])]), done('2026-11-20', 'd')], at('2026-11-21'));
  expect(s.ledger.find(r => r.source === 'quest')).toMatchObject({ base: 40, bonus: 0.25, xp: 35, gold: 7 });
});

test('два тега 60/40 → навыки и характеристики', () => {
  const s = replay([onboard, issue('2026-11-20', [nq('b', '2026-11-20', 'B', ['strength', 'cardio'])]), done('2026-11-20', 'b')], at('2026-11-21'));
  expect(s.ledger.find(r => r.source === 'quest')).toMatchObject({ xp: 84, skills: [['strength', 50], ['cardio', 34]], stats: { str: 50, end: 34 } });
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
  expect(s.statInfo.str).toMatchObject({ base: 64, into: 400 - 365, need: 50 + 5 * 64, form: 1, status: 'in_form' }); // закрыт 1 день: 400 XP при норме из плана 280
  expect(s.statHistory).toEqual([{ date: '2026-11-17', stats: s.stats }]);
});

test('авто-проверка: метрика выполнена → ×1,0 даже после ручной галочки', () => {
  const auto = { metric: 'steps' as const, op: '>=' as const, value: 6000 };
  const s = replay([onboard, issue('2026-11-20', [nq('w', '2026-11-20', 'C', ['strength'], { auto })]), done('2026-11-20', 'w'),
    ev({ type: 'health_packet', date: '2026-11-20', kind: 'other', health: { steps: 7000 }, calendar: [], ts: at('2026-11-20', 21), deviceId: 'shortcuts' })], at('2026-11-20', 22));
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
  expect(s.gold).toBe(60 + 10 + 25 * s.achievements.length - 30); // 10 — золото идеального дня
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
  expect(s.skills.strength).toEqual({ level: 1, into: 0, need: 100, xp: 0, start: 1, lastDate: null, idleDays: null, rusty: false, perks: [] });
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
    { date: '2026-11-13', xp: 50, completed: 1, issued: 2, counted: false, perfect: false, rest: false, streak: 0, hp: null, energy: null, focus: null, fatigue: 0 }, // 1/2 < 60%
    { date: '2026-11-14', xp: 0, completed: 0, issued: 1, counted: false, perfect: false, rest: false, streak: 0, hp: null, energy: null, focus: null, fatigue: 0 },
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

test('день без quests_issued — пропуск: серия ×0,5', () => {
  const s = replay([
    issue('2026-11-14', [q('a', '2026-11-14', 100)]), done('2026-11-14', 'a'),
    issue('2026-11-16', [q('b', '2026-11-16', 30)]), done('2026-11-16', 'b'),
    issue('2026-11-17', [q('c', '2026-11-17', 10), q('d', '2026-11-17', 10)]), done('2026-11-17', 'c'),
  ], NOW);
  expect(s.history.map(h => [h.date, h.streak])).toEqual([['2026-11-14', 1], ['2026-11-16', 1]]); // 15-е: floor(1·0,5) = 0
  expect(s.streak).toBe(1); // сегодня 1/2 < 60% — не прибавляется
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
  expect(s.genInputs.recent).toEqual([{ date: '2026-11-15', stats: ['str'], templateIds: ['T2'] }, { date: '2026-11-16', stats: ['str'], templateIds: ['T3', 'T4'] }]);
  // 3 значения, но ни в одном 7‑дневном окне их нет трёх → null
  expect(replay([steps('2026-11-01', 9000), steps('2026-11-05', 9000), steps('2026-11-14', 9000)], NOW).genInputs.bestSteps7).toBeNull();
  const few = replay([steps('2026-11-01', 9000), steps('2026-11-02', 11000)], NOW);
  expect(few.genInputs).toEqual({ bestSteps7: null, lastSleepHours: null, recentTemplateIds: [], recent: [], fatigue: 0, recovery: null, afterRecovery: false, bossStats: [], bossStep: null, chainStep: null });
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

test('выполнение — до закрытия своего дня: 02:30 следующих суток — ещё в вечерней смене, уже не в дневной', () => {
  for (const [dayType, n] of [[DEFAULT_DAY_TYPES[0], 0], [DEFAULT_DAY_TYPES[1], 1]] as const) {
    const evs = [startDay('2026-11-16', { dayType }), issue('2026-11-16', [q('a', '2026-11-16', 50)]), done('2026-11-16', 'a', at('2026-11-17', 2, 30))];
    expect(replay(evs, NOW).history[0].completed).toBe(n);
  }
  // на два дня позже — не засчитывается
  const late = [issue('2026-11-15', [q('b', '2026-11-15', 50)]), done('2026-11-15', 'b', at('2026-11-17', 2, 30))];
  expect(replay(late, NOW).totalXp).toBe(0);
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

test('ручной metric_logged не даёт авто-засчёт (честное слово) [спека §4.1]', () => {
  const s = replay([
    issue('2026-11-17', [qa('a', '2026-11-17', '>=', 8000)]),
    ev({ type: 'metric_logged', date: '2026-11-17', metric: 'steps', value: 8500, mode: 'set' }),
  ], NOW);
  expect(s.today.metrics.steps).toBe(8500);
  expect(s.today.quests[0].done).toBe(false);
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
  expect(trimmed.rewards).toEqual([{ id: 't', title: 'Кино', price: 5, effect: null }]);
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
  expect(s.totalXp).toBe(20 + 300 + 50); // + идеальный день 16-го
  expect(s.ledger.filter(r => r.source === 'weekly').map(r => r.stats)).toEqual([{}, { str: 150 }]);
  const more = replay([...evs, done('2026-11-17', 'c')], NOW);
  expect(more.totalXp).toBe(30 + 300 + 50);
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

test('недельное с 23.11: сундук — вещь из редких; старые недели без сундука', () => {
  const W2 = '2026-11-23', w2 = { id: `${W2}:w:active_days`, weekStart: W2, kind: 'active_days', stat: null, target: 1, title: 'x', xp: 210 };
  const evs = [ev({ type: 'weekly_issued', weekStart: W2, quests: [w2], ts: at(W2, 7) }), issue(W2, [q('a', W2, 10)]), done(W2, 'a')];
  const s = replay(evs, at('2026-11-24'));
  expect(s.cosmetics.owned.filter(o => o.source === 'chest')).toHaveLength(1);
  expect(s.ledger.find(r => r.source === 'weekly')).toMatchObject({ xp: 210, gold: 42 });
  const old = replay([weekly([wq('active_days', 1)]), issue(W, [q('a', W, 10)]), done(W, 'a')], NOW);
  expect(old.cosmetics.owned.filter(o => o.source === 'chest')).toHaveLength(0);
});

test('weekly_issued: дубли id оплачиваются раз, не-понедельник и мусор игнорируются, XP зажат', () => {
  const dup = replay([weekly([wq('active_days', 1, null, 5000), wq('active_days', 1, null, 5000)]), issue(W, [q('a', W, 10)]), done(W, 'a')], NOW);
  expect(dup.weekly.quests.length).toBe(1);
  expect(dup.totalXp).toBe(1210 + 50);
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
  replay(evs, NOW) // прогрев JIT
  const t = performance.now(); replay(evs, NOW);
  // порог с запасом под нагруженный CI: ловим квадратичный рост (секунды), а не миллисекунды
  expect(performance.now() - t).toBeLessThan(1000);
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

test('ai_report: final предпочтительнее, мусор игнорируется', () => {
  const r = (extra: object, ts: number) => ev({ type: 'ai_report', weekStart: '2026-11-09', text: 't' + ts, ts, ...extra });
  expect(replay([r({ final: true }, 1), r({}, 2)], NOW).reports).toEqual([{ weekStart: '2026-11-09', text: 't1', final: true }]);
  expect(replay([r({}, 1), r({ final: true }, 2)], NOW).reports[0]).toEqual({ weekStart: '2026-11-09', text: 't2', final: true });
  expect(replay([r({ final: 'yes' }, 1)], NOW).reports[0]).toEqual({ weekStart: '2026-11-09', text: 't1' });
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

// ---- T6: закрытие дня по типу, серия, штрафы, Форма, «День изменился» ----
const DT = DEFAULT_DAY_TYPES;
const startDay = (date: string, extra: Record<string, unknown> = {}, h = 8) =>
  ev({ type: 'day_started', date, work: null, wakeAt: '08:00', dayType: DT[0], ts: at(date, h), ...extra });
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const doneDays = (from: string, n: number, skill: SkillId, rank: Rank = 'E') =>
  span(from, n).flatMap(d => [issue(d, [nq(`${skill}${d}`, d, rank, [skill])]), done(d, `${skill}${d}`)]);

test('Дневная смена (отбой 00:00): 00:30 ещё вчера, 01:00 уже сегодня', () => {
  const evs = [onboard, ev({ type: 'day_started', date: '2026-12-01', work: null, wakeAt: '08:00', dayType: DEFAULT_DAY_TYPES[0], ts: at('2026-12-01', 8) })];
  expect(replay(evs, at('2026-12-02', 0, 30)).today).toMatchObject({ date: '2026-12-01', closesAt: at('2026-12-02', 1, 0) });
  expect(replay(evs, at('2026-12-02', 1, 0)).today.date).toBe('2026-12-02');
});

test('Вечерняя смена (отбой 03:00): 03:59 ещё вчера; день без старта закрывается в 04:00', () => {
  const evs = [onboard, startDay('2026-12-01', { dayType: DT[1] })];
  expect(replay(evs, at('2026-12-02', 3, 59)).today).toMatchObject({ date: '2026-12-01', closesAt: at('2026-12-02', 4, 0), dayType: DT[1], started: true });
  expect(replay(evs, at('2026-12-02', 4, 0)).today.date).toBe('2026-12-02');
  expect(replay(evs, at('2026-12-03', 3, 59)).today).toMatchObject({ date: '2026-12-02', closesAt: at('2026-12-03', 4, 0), dayType: null, started: false });
  expect(replay(evs, at('2026-12-03', 4, 0)).today.date).toBe('2026-12-03');
});

test('день без старта и старый day_started без dayType → синтез типа и закрытие 04:00', () => {
  expect(replay([], at('2026-12-02', 3, 59)).today).toMatchObject({ date: '2026-12-01', closesAt: closesAtTs('2026-12-01', 240) });
  const old = ev({ type: 'day_started', date: '2026-12-01', work: { start: '09:00', end: '18:00' }, wakeAt: '07:00', ts: at('2026-12-01', 7) });
  const s = replay([old], at('2026-12-02', 3, 59)); // без профиля отбоя нет → 04:00
  expect(s.today).toMatchObject({ date: '2026-12-01', closesAt: at('2026-12-02', 4, 0) });
  expect(s.today.dayType).toMatchObject({ kind: 'day', wake: '07:00', busy: { start: '09:00', end: '18:00' }, bed: null, slots: 4 });
  // с профилем: отбой 23:00 → закрытие 00:00
  expect(replay([onboard, old], at('2026-12-01', 23, 59)).today).toMatchObject({ date: '2026-12-01', closesAt: at('2026-12-02', 0, 0) });
  expect(replay([onboard, old], at('2026-12-02', 0, 0)).today.date).toBe('2026-12-02');
});

test('серия: 5 засчитанных дней, затем 2/5 → 2, затем пустой день → 1', () => {
  const d6 = '2026-11-15', qs = [1, 2, 3, 4, 5].map(i => nq(`b${i}`, d6, 'E', ['reading']));
  const s = replay([...doneDays('2026-11-10', 5, 'reading'), issue(d6, qs), done(d6, 'b1'), done(d6, 'b2')], at('2026-11-17'));
  expect(s.history.map(h => h.streak)).toEqual([1, 2, 3, 4, 5, 2]);
  expect(s.history.at(-1)).toMatchObject({ counted: false, perfect: false });
  expect(s.streak).toBe(1); // 16-е пустое; сегодня ещё ничего
});

test('бонус серии: серия 10 на начало дня, C честное → 59', () => {
  const d = '2026-11-20';
  const s = replay([onboard, ...doneDays('2026-11-10', 10, 'reading'), issue(d, [nq('c', d, 'C', ['strength'])]), done(d, 'c')], at(d, 22));
  expect(s.ledger.find(r => r.questId === 'c')).toMatchObject({ bonus: 0.2, penalty: 0, xp: 59 }); // 70·0.7·1.2 = 58.8
  expect(s.streak).toBe(11);
});

test('идеальный день: строка perfect_day +50 XP, 10 золота', () => {
  const d = '2026-11-20';
  const evs = [onboard, issue(d, [nq('a', d, 'E', ['reading']), nq('b', d, 'E', ['focus'])]), done(d, 'a'), done(d, 'b')];
  const s = replay(evs, at('2026-11-21'));
  expect(s.ledger.filter(r => r.source === 'perfect_day')).toMatchObject([{ date: d, xp: 50, gold: 10, stats: {}, skills: [] }]);
  expect(s.history[0]).toMatchObject({ counted: true, perfect: true });
  expect(replay(evs, at(d, 22)).ledger.some(r => r.source === 'perfect_day')).toBe(false); // день ещё не закрыт
});

test('Ослабление: 3 дня без выполненного → D Режим 22', () => {
  const idle = span('2026-11-10', 3).map(d => issue(d, [nq(`i${d}`, d, 'E', ['reading'])]));
  const d = '2026-11-13', r = [issue(d, [nq('r', d, 'D', ['routine'])]), done(d, 'r')];
  expect(replay([onboard, ...idle, ...r], at(d, 22)).ledger.find(x => x.questId === 'r')).toMatchObject({ penalty: 0.2, xp: 22 }); // 40·0.7·0.8 = 22.4
  // только два прошлых дня игры — ещё нет
  expect(replay([onboard, ...idle.slice(1), ...r], at(d, 22)).ledger.find(x => x.questId === 'r')).toMatchObject({ penalty: 0, xp: 28 });
});

test('Перекос: 7 дней только Силой (≥200 XP, Сила сильнейшая) → −20% к Силе', () => {
  const d = '2026-11-17';
  const s = replay([onboard, ...doneDays('2026-11-10', 7, 'strength', 'C'),
    issue(d, [nq('s', d, 'C', ['strength']), nq('i', d, 'C', ['reading'])]), done(d, 's'), done(d, 'i')], at(d, 22));
  const row = (id: string) => s.ledger.find(r => r.questId === id)!;
  expect(row('s')).toMatchObject({ bonus: 0.14, penalty: 0.2, xp: 45 }); // 70·0.7·1.14·0.8 = 44.7
  expect(row('i')).toMatchObject({ bonus: 0.14, penalty: 0 });
});

test('день отдыха: серия не меняется и день не в окне формы; 15-й за месяц — обычный', () => {
  const two = doneDays('2026-11-29', 2, 'strength', 'C');
  const rest = span('2026-12-01', 15).flatMap(d => [startDay(d, { dayType: DT[3] }), issue(d, [nq(`r${d}`, d, 'E', ['rest'])])]);
  const s = replay([onboard, ...two, ...rest], at('2026-12-16'));
  const h = (d: string) => s.history.find(x => x.date === d)!;
  expect(h('2026-11-30').streak).toBe(2);
  expect(h('2026-12-14')).toMatchObject({ rest: true, streak: 2 });
  expect(h('2026-12-15')).toMatchObject({ rest: false, streak: 1 });
  expect(s.today.restDaysLeft).toBe(0);
  expect(s.statInfo.str.form).toBe(1); // окно: 29–30 ноября и 15 декабря, без 14 дней отдыха
  expect(replay([onboard, ...two, ...rest.slice(0, 4)], at('2026-12-02')).today.restDaysLeft).toBe(12);
});

test('Форма из плана в первые 30 дней: 14 дней по 49 выдано, сделано 2 → ~20%, «Заброшена»', () => {
  const evs = span('2026-11-10', 14).flatMap((d, i) => [issue(d, [nq(`f${d}`, d, 'C', ['strength'], { xp: 49 })]), ...(i < 2 ? [done(d, `f${d}`)] : [])]);
  const s = replay([onboard, ...evs], at('2026-11-24'));
  /* норма = 0.7·49 = 34.3; 98 / (14·34.3) = 0.204 */
  expect(s.statInfo.str.norm).toBeCloseTo(34.3, 6);
  expect(s.statInfo.str.status).toBe('abandoned'); expect(s.statInfo.str.form!).toBeGreaterThan(0.19); expect(s.statInfo.str.form!).toBeLessThan(0.22); // бонус серии может дать 49→50
  expect(s.statInfo.str.xp14).toBe(99);
  expect(s.statInfo.int).toMatchObject({ norm: 15, form: 0, status: 'abandoned' });
  expect(replay([onboard], at('2026-11-24')).statInfo.str).toMatchObject({ form: null, status: 'new' });
});

test('Форма после 30 дней: норма — среднее фактического за прошлые (до 60) закрытых дней', () => {
  const s = replay([onboard, ...doneDays('2026-10-01', 40, 'reading', 'C')], at('2026-11-10'));
  expect(s.statInfo.int.norm).toBeCloseTo(Math.max(15, 0.7 * s.statInfo.int.xp / 40), 6); // все 40 закрытых дней в 60-дневном окне
  expect(s.statInfo.int.status).toBe('in_form');
});

test('«Вернуть форму» ×2: E честное → 28', () => {
  const d = '2026-11-20';
  const s = replay([onboard, issue(d, [nq('v', d, 'E', ['strength'], { kind: 'restore' })]), done(d, 'v')], at(d, 22));
  expect(s.ledger.at(-1)).toMatchObject({ mult: 2, xp: 28 });
  expect(s.statInfo.str.lastRestore).toBe(d);
});

test('«День изменился»: дневная (4) → вечерняя (3), 1 сделано → 1 dropped; +20 один раз; закрытие по новому отбою', () => {
  const d = '2026-12-01';
  const qs = ['a', 'b', 'c', 'e'].map(id => nq(id, d, 'E', ['reading']));
  const chg = (h: number) => ev({ type: 'day_changed', date: d, dayType: DT[1], at: `${h}:00`, ts: at(d, h) });
  const evs = [onboard, startDay(d), issue(d, qs), done(d, 'a'), chg(13), chg(14)];
  const s = replay(evs, at(d, 15));
  expect(s.today.quests.map(q => q.dropped)).toEqual([false, false, false, true]);
  expect(s.today).toMatchObject({ changed: true, dayType: DT[1], closesAt: at('2026-12-02', 4, 0) });
  /* два day_changed за дату → одна строка source 'day_changed' xp 20 gold 4 */
  expect(s.ledger.filter(r => r.source === 'day_changed')).toMatchObject([{ date: d, xp: 20, gold: 4, ts: at(d, 13), stats: {}, skills: [] }]);
  expect(replay(evs, at('2026-12-02', 3, 30)).today.date).toBe(d);
  // 3 из 3 оставшихся — засчитан и идеален
  expect(replay([...evs, done(d, 'b'), done(d, 'c')], at('2026-12-03')).history[0]).toMatchObject({ issued: 4, completed: 3, counted: true, perfect: true });
  // мусорный тип или время — событие игнорируется; без старта дня — тоже
  expect(replay([onboard, startDay(d), ev({ type: 'day_changed', date: d, dayType: { id: 'x' }, at: '13:00' })], at(d, 15)).today.changed).toBe(false);
  expect(replay([onboard, startDay(d), ev({ type: 'day_changed', date: d, dayType: DT[1], at: 13 })], at(d, 15)).today.changed).toBe(false);
  expect(replay([onboard, chg(13)], at(d, 15)).ledger.some(r => r.source === 'day_changed')).toBe(false);
});

test('неверные dayType/energy игнорируются', () => {
  const d = '2026-12-01';
  const bad = startDay(d, { dayType: { ...DT[0], slots: 99 }, energy: 11 });
  const s = replay([onboard, bad], at(d, 12));
  expect(s.today.started).toBe(true);
  expect(s.today.dayType).toMatchObject({ kind: 'off', bed: '23:00' }); // синтез: без смены — выходной, отбой из профиля
  expect(s.today.energy).toBe(50);
  const ci = ev({ type: 'checkin', date: '2026-11-30', went: '', notWent: '', energy: 7, ts: at('2026-11-30', 21) });
  expect(replay([onboard, bad, ci], at(d, 12)).today.energy).toBe(70);
  expect(replay([onboard, startDay(d, { energy: 8 }), ci], at(d, 12)).today.energy).toBe(76); // утро 80 и HP 70 (самочувствие 7) [спека §5.2]
  expect(replay([onboard, startDay(d, { energy: 2.5 })], at(d, 12)).today.energy).toBe(50);
  expect(replay([onboard], at(d, 12)).today).toMatchObject({ dayType: null, energy: BALANCE.energy.fallback, changed: false });
});

test('day_types_set: последнее побеждает, невалидные элементы отброшены, пустой список → умолчания', () => {
  const mine = { ...DT[0], id: 'mine', label: 'Моя', slots: 3 };
  const set = (types: unknown, h: number) => ev({ type: 'day_types_set', types, ts: at('2026-11-15', h) });
  expect(replay([], NOW).dayTypes).toEqual(DT);
  expect(replay([set([mine, { id: 'bad' }], 9), set([DT[1]], 8)], NOW).dayTypes).toEqual([mine]);
  expect(replay([set([DT[1]], 8), set([{ id: 'bad' }], 9)], NOW).dayTypes).toEqual(DT);
  expect(replay([set('x', 9)], NOW).dayTypes).toEqual(DT);
});

test('битые формы из сети: аватар, время, работа, сумма метрики', () => {
  const d = '2026-11-17';
  for (const params of [null, 5, 'x', { hair: 5 }, { ...DEFAULT_AVATAR, eyes: null }])
    expect(replay([ev({ type: 'avatar_updated', params })], NOW).avatar).toEqual(DEFAULT_AVATAR);
  for (const wakeAt of [7, '7:00', null]) expect(replay([ev({ type: 'day_started', date: d, work: null, wakeAt, ts: at(d, 7) })], NOW).today.started).toBe(false);
  for (const work of [{ start: 'x', end: '18:00' }, 'x', { start: '09:00' }, undefined])
    expect(replay([ev({ type: 'day_started', date: d, work, wakeAt: '07:00', ts: at(d, 7) })], NOW).today).toMatchObject({ started: true, work: null });
  expect(replay([ev({ type: 'busy_until', date: d, until: 5 }), ev({ type: 'busy_until', date: d, until: '1500' })], NOW).today.busyUntil).toBeNull();
  const big = (value: number) => [1, 2, 3].map(i => ev({ type: 'metric_logged', date: d, metric: 'water', value, mode: 'add', ts: at(d, 9) + i }));
  expect(replay(big(1e308), NOW).today.metrics.water).toBe(1e9);
  expect(replay(big(-1e308), NOW).today.metrics.water).toBe(-1e9);
});

test('выдача с древней датой игнорируется; с 2020 года плотный цикл по дням быстрый', () => {
  expect(replay([issue('1900-01-01', [nq('z', '1900-01-01', 'E', ['reading'])])], NOW).history).toEqual([]);
  const t = performance.now();
  expect(replay([issue('2020-01-01', [nq('z', '2020-01-01', 'E', ['reading'])])], NOW).history).toHaveLength(1);
  expect(performance.now() - t).toBeLessThan(1500);
});

// ---- T6 fix round 1: границы времени, плохие часы, строгий HH:MM ----
test('day_changed после закрытия дня (устаревшее устройство) игнорируется; игровая дата не идёт назад', () => {
  const d = '2026-12-01', d2 = '2026-12-02';
  const late = ev({ type: 'day_changed', date: d, dayType: DT[1], at: '02:00', ts: at(d2, 2) }); // дневная закрылась в 01:00
  const s = replay([onboard, startDay(d), late], at(d2, 2, 30));
  expect(s.today.date).toBe(d2);
  expect(s.ledger.some(r => r.source === 'day_changed')).toBe(false);
  // устаревший перевод вчерашнего дня в «отдых» не замораживает пропуск
  const evs = [onboard, ...doneDays('2026-11-29', 2, 'reading'), startDay(d), issue(d, [nq('x', d, 'E', ['reading'])]),
    ev({ type: 'day_changed', date: d, dayType: DT[3], at: '12:00', ts: at('2026-12-02', 9) })];
  const h = replay(evs, at('2026-12-02', 12)).history.find(x => x.date === d)!;
  expect(h).toMatchObject({ rest: false, streak: 1 });
  // смена до старта — тоже игнорируется
  expect(replay([onboard, ev({ type: 'day_changed', date: d, dayType: DT[1], at: '07:00', ts: at(d, 7) }), startDay(d)], at(d, 12)).today.changed).toBe(false);
  // в пределах дня — принимается
  expect(replay([onboard, startDay(d), ev({ type: 'day_changed', date: d, dayType: DT[1], at: '00:30', ts: at(d2, 0, 30) })], at(d2, 0, 40)).today).toMatchObject({ date: d, changed: true });
});

test('day_started задним числом для закрытого дня игнорируется', () => {
  const back = startDay('2026-11-15', { dayType: DT[3] }, 12);
  const moved = { ...back, ts: at('2026-11-17', 9) } as GameEvent; // 15-е давно закрыто
  expect(replay([moved], NOW).history).toEqual([]);
  expect(replay([onboard, issue('2026-11-15', [nq('x', '2026-11-15', 'E', ['reading'])]), moved], NOW).history[0].rest).toBe(false);
});

test('выдача с датой далеко от времени события игнорируется: первый день не сдвигается, цикл короткий', () => {
  const stray = [ev({ type: 'quests_issued', date: '2024-01-01', quests: [nq('old', '2024-01-01', 'E', ['reading'])], ts: at('2026-11-10', 8) }),
    ev({ type: 'quests_issued', date: '2099-01-01', quests: [nq('fut', '2099-01-01', 'E', ['reading'])], ts: at('2026-11-10', 9) })];
  const evs = span('2026-11-10', 14).flatMap((d, i) => [issue(d, [nq(`f${d}`, d, 'C', ['strength'], { xp: 49 })]), ...(i < 2 ? [done(d, `f${d}`)] : [])]);
  const t = performance.now();
  const s = replay([onboard, ...stray, ...evs], at('2026-11-24'));
  expect(performance.now() - t).toBeLessThan(1500);
  expect(s.statInfo.str.norm).toBeCloseTo(34.3, 6); // норма из плана — первый день 10 ноября
  expect(s.history[0].date).toBe('2026-11-10');
  // вчерашняя дата после полуночи — допустима
  expect(replay([ev({ type: 'quests_issued', date: '2026-11-16', quests: [nq('y', '2026-11-16', 'E', ['reading'])], ts: at('2026-11-17', 0, 30) })], NOW).history).toHaveLength(1);
});

test('строгий HH:MM: 99:99 отбрасывается', () => {
  const d = '2026-11-17';
  expect(replay([ev({ type: 'day_started', date: d, work: null, wakeAt: '99:99', ts: at(d, 7) })], NOW).today.started).toBe(false);
  expect(replay([ev({ type: 'day_started', date: d, work: { start: '25:00', end: '18:00' }, wakeAt: '07:00', ts: at(d, 7) })], NOW).today.work).toBeNull();
  expect(replay([ev({ type: 'busy_until', date: d, until: '24:00' })], NOW).today.busyUntil).toBeNull();
});

// ---- T7: переброс, свои задания, магазин с эффектами ----
const D10 = '2026-11-10';
const reroll = (questId: string, replacement: Quest, ts: number) => ev({ type: 'quest_rerolled', date: replacement.date, questId, replacement, ts });
const custom = (quest: Quest, ts: number) => ev({ type: 'custom_quest_added', date: quest.date, quest: { ...quest, kind: 'custom' }, ts });
/** 09.11: легаси 300 XP сделано + несделанное (не идеальный день) → 60 золота прошлых дней. */
const gold60 = [issue('2026-11-09', [q('l1', '2026-11-09', 300), q('l2', '2026-11-09', 10)]), done('2026-11-09', 'l1')];

test('переброс: 1-й бесплатно, 2-й и 3-й за 50 при золоте прошлых дней (110 с достижениями), 4-й отклонён', () => {
  const evs = [...gold60, issue(D10, ['x1', 'x2', 'x3', 'x4'].map(id => nq(id, D10, 'E', ['strength']))),
    reroll('x1', nq('r1', D10, 'E', ['cardio']), at(D10, 10)), reroll('x2', nq('r2', D10, 'E', ['cardio']), at(D10, 10, 1)),
    reroll('x3', nq('r3', D10, 'E', ['cardio']), at(D10, 10, 2)), reroll('x4', nq('r4', D10, 'E', ['cardio']), at(D10, 10, 3))];
  const s = replay(evs, at(D10, 12));
  expect(s.today.quests.map(q => q.id)).toEqual(['r1', 'r2', 'r3', 'x4']);
  expect(s.gold).toBe(60 - 100 + 25 * s.achievements.length); expect(s.today.nextRerollCost).toBe(50);
  expect(s.today.rerollsUsed).toBe(3);
  expect(replay([...evs].reverse(), at(D10, 12))).toEqual(s);
});

test('переброс: сегодняшний заработок не считается; сделанное, restore и custom не перебрасываются; другой ранг замены — отказ', () => {
  const evs = [issue(D10, [q('L', D10, 300), ...['x1', 'x2', 'x3'].map(id => nq(id, D10, 'E', ['strength'])), nq('rs', D10, 'E', ['strength'], { kind: 'restore' })]),
    done(D10, 'L', at(D10, 9)), custom(nq('c1', D10, 'E', ['reading']), at(D10, 9, 30)),
    reroll('L', nq('rL', D10, 'D', ['cardio']), at(D10, 10)), reroll('rs', nq('rR', D10, 'E', ['cardio']), at(D10, 10, 1)),
    reroll('c1', nq('rC', D10, 'E', ['cardio']), at(D10, 10, 2)), reroll('x3', nq('rX', D10, 'D', ['cardio']), at(D10, 10, 3)),
    reroll('x3', { ...nq('rT', D10, 'E', ['cardio']), templateId: 't-x3' }, at(D10, 10, 4)),
    reroll('x1', nq('r1', D10, 'E', ['cardio']), at(D10, 10, 5)), reroll('x2', nq('r2', D10, 'E', ['cardio']), at(D10, 10, 6))];
  const s = replay(evs, at(D10, 12));
  expect(s.today.quests.map(q => q.id)).toEqual(['L', 'r1', 'x2', 'x3', 'rs', 'c1']);
  expect(s.today).toMatchObject({ rerollsUsed: 1, nextRerollCost: 50, customCount: 1 });
  // переброс вчерашнего задания — отказ
  const y = replay([issue('2026-11-09', [nq('y', '2026-11-09', 'E', ['strength'])]), reroll('y', nq('ry', '2026-11-09', 'E', ['cardio']), at(D10, 10))], at(D10, 12));
  expect(y.history[0].issued).toBe(1); expect(y.ledger).toEqual([]);
});

test('второй переброс той же questId (второе устройство) игнорируется', () => {
  const evs = [...gold60, issue(D10, [nq('x1', D10, 'E', ['strength'])]),
    reroll('x1', nq('r1', D10, 'E', ['cardio']), at(D10, 10)), reroll('x1', nq('r2', D10, 'E', ['mobility']), at(D10, 10, 1)), done(D10, 'r2', at(D10, 11))];
  const s = replay(evs, at(D10, 12));
  expect(s.today.quests.map(q => q.id)).toEqual(['r1']); expect(s.today.rerollsUsed).toBe(1);
  expect(s.gold).toBe(60 + 25 * s.achievements.length);
  // цепочка: замену можно перебросить дальше (платно)
  const ch = replay([...gold60, issue(D10, [nq('x1', D10, 'E', ['strength'])]), reroll('x1', nq('r1', D10, 'E', ['cardio']), at(D10, 10)),
    reroll('r1', nq('r9', D10, 'E', ['mobility']), at(D10, 10, 1)), done(D10, 'r9', at(D10, 11))], at(D10, 12));
  expect(ch.today.quests.map(q => q.id)).toEqual(['r9']); expect(ch.today.quests[0].done).toBe(true);
});

// ИИ-анкета: уровень 40, Сила 6 → потолок B для Силы
const strongAi = ev({ type: 'interview_completed', answers: {}, followups: [], ts: at('2026-11-01'), analysis: { archetype: 'А', summary: 'с', strengths: [], weaknesses: [], focus: [], questGuidance: '',
  stats: { str: 20, end: 10, int: 10, dis: 10, cha: 10, fin: 10, spi: 10 }, startLevel: 40, skillLevels: { strength: 6 } } });
const D20 = '2026-11-20';

test('переброс: замена не выше потолка своего навыка (+1 только для вызова)', () => {
  const ids = (evs: GameEvent[]) => replay([strongAi, ...evs], at(D20, 12)).today.quests.map(q => q.id);
  // Сила 6 → B, Кардио 1 → D (уровень 40)
  expect(ids([issue(D20, [nq('x', D20, 'B', ['strength'])]), reroll('x', nq('r', D20, 'B', ['cardio']), at(D20, 10))])).toEqual(['x']);
  expect(ids([issue(D20, [nq('x', D20, 'B', ['strength'])]), reroll('x', nq('r', D20, 'B', ['mobility', 'strength']), at(D20, 10))])).toEqual(['x']);
  expect(ids([issue(D20, [nq('x', D20, 'B', ['strength'])]), reroll('x', nq('r', D20, 'B', ['strength']), at(D20, 10))])).toEqual(['r']);
  // вызов: A по Силе (B+1) — можно; A по Кардио (D+1 = C) — нет; daily → challenge не даёт +1
  const ch = (rk: Rank, sk: SkillId[], kind: Quest['kind'] = 'challenge') =>
    ids([issue(D20, [nq('x', D20, rk, ['strength'], { kind })]), reroll('x', nq('r', D20, rk, sk, { kind: 'challenge' }), at(D20, 10))]);
  expect(ch('A', ['strength'])).toEqual(['r']);
  expect(ch('A', ['cardio'])).toEqual(['x']);
  expect(ch('A', ['strength'], 'daily')).toEqual(['x']);
});

test('своё задание: 3-е за день игнор; XP своих ≤ треть остальных', () => {
  const s = replay([strongAi, issue(D20, [nq('n', D20, 'B', ['strength'])]), done(D20, 'n'),
    custom(nq('c1', D20, 'B', ['strength']), at(D20, 9)), custom(nq('c2', D20, 'E', ['strength']), at(D20, 9, 1)), custom(nq('c3', D20, 'E', ['strength']), at(D20, 9, 2)),
    done(D20, 'c1', at(D20, 21))], at(D20, 22));
  expect(s.today.quests.map(q => q.id)).toEqual(['n', 'c1', 'c2']); expect(s.today.customCount).toBe(2);
  expect(s.ledger.find(r => r.questId === 'n')!.xp).toBe(84);
  expect(s.ledger.find(r => r.questId === 'c1')).toMatchObject({ xp: 28, gold: 6 });
  expect(s.today.xp).toBe(112);
  // свои не в знаменателе 60%: обычное не сделано, своё сделано — день не засчитан
  const t = replay([strongAi, issue(D20, [nq('n', D20, 'B', ['strength'])]), custom(nq('c1', D20, 'B', ['strength']), at(D20, 9)), done(D20, 'c1')], at('2026-11-21'));
  expect(t.history[0]).toMatchObject({ counted: false }); expect(t.ledger.find(r => r.questId === 'c1')!.xp).toBe(0);
});

test('своё задание выше потолка режется до потолка', () => {
  const s = replay([onboard, issue(D20, [nq('n', D20, 'E', ['strength'])]), custom(nq('c1', D20, 'S', ['strength']), at(D20, 9))], at(D20, 12));
  const cap = rankCap(s.startLevel, s.skills.strength.start);
  expect(cap).not.toBe('S'); expect(s.today.quests[1]).toMatchObject({ id: 'c1', rank: cap, kind: 'custom' });
  // ИИ-потолок B: своё A → B
  expect(replay([strongAi, issue(D20, []), custom(nq('c1', D20, 'A', ['strength']), at(D20, 9))], at(D20, 12)).today.quests[0].rank).toBe('B');
});

const freezeR = ev({ type: 'reward_created', rewardId: 'default:freeze', title: 'Заморозка серии', price: 300, effect: 'streak_freeze', ts: at('2026-11-01') });
const dayoffR = ev({ type: 'reward_created', rewardId: 'default:dayoff', title: 'День без заданий', price: 600, effect: 'day_off', ts: at('2026-11-01') });
const buy = (rewardId: string, ts: number) => ev({ type: 'reward_purchased', rewardId, ts });
/** 09.11 — легаси 10 000 XP (2000 золота), 10.11 — сделано, 11.11 и 12.11 — пропуски. */
const streakDays = [issue('2026-11-09', [q('a', '2026-11-09', 10000)]), done('2026-11-09', 'a'), issue(D10, [q('b', D10, 35)]), done(D10, 'b'),
  issue('2026-11-11', [q('c', '2026-11-11', 35)]), issue('2026-11-12', [q('d', '2026-11-12', 35)])];

test('заморозка: пропуск после покупки не режет серию; 3-я покупка в месяц отклонена', () => {
  const N = at('2026-11-13');
  expect(replay([...streakDays, freezeR], N).history.map(h => h.streak)).toEqual([1, 2, 1, 0]);
  const s = replay([...streakDays, freezeR, buy('default:freeze', at(D10, 13))], N);
  expect(s.history.map(h => h.streak)).toEqual([1, 2, 2, 1]);
  expect(s.rewards[0]).toMatchObject({ id: 'default:freeze', effect: 'streak_freeze' });
  const three = replay([...streakDays, freezeR, ...[13, 14, 15].map(h => buy('default:freeze', at(D10, h)))], N);
  expect(three.purchases).toHaveLength(2); expect(three.history.map(h => h.streak)).toEqual([1, 2, 2, 2]);
  expect(three.gold).toBe(s.gold - 300);
  // купить на золото сегодняшнего дня нельзя
  expect(replay([...streakDays, freezeR, buy('default:freeze', at('2026-11-09', 21))], N).purchases).toEqual([]);
});

test('«день без заданий»: день покупки нейтрален для серии', () => {
  const evs = [issue('2026-11-09', [q('a', '2026-11-09', 10000)]), done('2026-11-09', 'a'), issue(D10, [q('b', D10, 35)]),
    issue('2026-11-11', [q('c', '2026-11-11', 35)]), done('2026-11-11', 'c'), dayoffR];
  expect(replay(evs, at('2026-11-12')).history.map(h => h.streak)).toEqual([1, 0, 1]);
  const s = replay([...evs, buy('default:dayoff', at(D10, 13))], at('2026-11-12'));
  expect(s.history.map(h => h.streak)).toEqual([1, 1, 2]); expect(s.history[1].rest).toBe(true);
  expect(s.purchases).toHaveLength(1);
});

test('стартовый магазин: 8 наград; двойной посев → 8; удалённая не возвращается', () => {
  const seed = missingDefaultRewards([]);
  expect(seed.map(e => [e.rewardId, e.price])).toEqual([['default:episode', 50], ['default:games', 150], ['default:match', 200],
    ['default:cheatmeal', 200], ['default:freeze', 300], ['default:book', 400], ['default:dayoff', 600], ['default:treat', 1000]]);
  const evs = [...seed, ...seed].map((e, i) => ev({ ...e, ts: i + 1 }));
  expect(replay(evs, NOW).rewards).toHaveLength(8);
  const del = [...evs, ev({ type: 'reward_deleted', rewardId: 'default:games' })];
  expect(missingDefaultRewards(del)).toEqual([]);
  expect(replay(del, NOW).rewards).toHaveLength(7);
  // effect вне двух значений отбрасывается, награда остаётся
  expect(replay([ev({ type: 'reward_created', rewardId: 'z', title: 'Z', price: 5, effect: 'magic' })], NOW).rewards).toEqual([{ id: 'z', title: 'Z', price: 5, effect: null }]);
});

// ---- T7 fix round 1 ----
test('эффект — только у стартовых наград, цена из BALANCE; своя награда с effect — обычная', () => {
  const evs = [issue('2026-11-09', [q('a', '2026-11-09', 10000)]), done('2026-11-09', 'a'), issue(D10, [q('b', D10, 35)]),
    issue('2026-11-11', [q('c', '2026-11-11', 35)]), done('2026-11-11', 'c')];
  const cheat = ev({ type: 'reward_created', rewardId: 'mine', title: 'Хак', price: 1, effect: 'day_off', ts: at('2026-11-01') });
  const s = replay([...evs, cheat, buy('mine', at(D10, 13))], at('2026-11-12'));
  expect(s.rewards[0].effect).toBeNull(); expect(s.purchases).toHaveLength(1);
  expect(s.history.map(h => h.streak)).toEqual([1, 0, 1]);
  const cheap = ev({ type: 'reward_created', rewardId: 'default:dayoff', title: 'Д', price: 1, ts: at('2026-11-01') });
  const t = replay([...evs, cheap, buy('default:dayoff', at(D10, 13))], at('2026-11-12'));
  expect(t.rewards[0]).toMatchObject({ price: 600, effect: 'day_off' }); expect(t.purchases[0].price).toBe(600);
  expect(t.history.map(h => h.streak)).toEqual([1, 1, 2]);
});

test('день без заданий: повтор на ту же дату и на день отдыха — отказ без списания; входит в лимит 14 в месяц', () => {
  const evs = [issue('2026-11-09', [q('a', '2026-11-09', 10000)]), done('2026-11-09', 'a'), issue(D10, [q('b', D10, 35)]), dayoffR];
  const one = replay([...evs, buy('default:dayoff', at(D10, 13))], at(D10, 22));
  const two = replay([...evs, buy('default:dayoff', at(D10, 13)), buy('default:dayoff', at(D10, 14))], at(D10, 22));
  expect(two.purchases).toHaveLength(1); expect(two.gold).toBe(one.gold);
  expect(one.today).toMatchObject({ dayOff: true, restDaysLeft: 13 });
  // 14 дней отдыха в декабре → день без заданий 15-го отклонён
  const rest = span('2026-12-01', 14).flatMap(d => [startDay(d, { dayType: DT[3] }), issue(d, [nq(`r${d}`, d, 'E', ['rest'])])]);
  const base = [issue('2026-11-30', [q('g', '2026-11-30', 10000)]), done('2026-11-30', 'g'), ...rest, dayoffR];
  expect(replay([...base, buy('default:dayoff', at('2026-12-15', 13))], at('2026-12-15', 22)).purchases).toEqual([]);
  // на день отдыха — отказ
  expect(replay([...base, buy('default:dayoff', at('2026-12-03', 13))], at('2026-12-15', 22)).purchases).toEqual([]);
});

test('свои задания не дают недельный прогресс и счётчик заданий достижений', () => {
  const wk = ev({ type: 'weekly_issued', weekStart: '2026-11-16', ts: at('2026-11-16', 7),
    quests: [{ id: 'w1', weekStart: '2026-11-16', kind: 'active_days', stat: null, target: 1, title: 'w', xp: 150 }] });
  const s = replay([onboard, wk, issue(D20, [nq('n', D20, 'E', ['strength'])]), custom(nq('c1', D20, 'E', ['strength']), at(D20, 9)), done(D20, 'c1')], at(D20, 22));
  expect(s.weekly.quests[0]).toMatchObject({ progress: 0, done: false });
  expect(s.achievements.map(a => a.id)).not.toContain('first_quest');
});

test('today.spendable совпадает с проверкой трат; freezesLeft', () => {
  const s = replay([...gold60, issue(D10, [nq('x1', D10, 'C', ['strength'])]), done(D10, 'x1', at(D10, 9)), freezeR], at(D10, 12));
  // 60 золота строк + first_quest и first_skill от 09.11
  expect(s.today).toMatchObject({ spendable: 60 + 2 * BALANCE.achievementGold, freezesLeft: 2, dayOff: false });
  expect(s.gold).toBeGreaterThan(60);
  const f = replay([...streakDays, freezeR, buy('default:freeze', at(D10, 13))], at(D10, 22));
  expect(f.today).toMatchObject({ spendable: 2010 + BALANCE.achievementGold * f.achievements.filter(a => a.date < D10).length - 300, freezesLeft: 1 });
});

test('заморозка не тратится при нулевой серии; купленная до закрытия защищает этот день', () => {
  const evs = [issue('2026-11-08', [q('a', '2026-11-08', 10000)]), done('2026-11-08', 'a'), issue('2026-11-09', [q('m', '2026-11-09', 35)]),
    issue(D10, [q('b', D10, 35)]), issue('2026-11-11', [q('c', '2026-11-11', 35)]), done('2026-11-11', 'c'), issue('2026-11-12', [q('d', '2026-11-12', 35)]),
    freezeR, buy('default:freeze', at(D10, 13))];
  expect(replay(evs, at('2026-11-13')).history.map(h => h.streak)).toEqual([1, 0, 0, 1, 1]);
  // купленная в день пропуска защищает его
  expect(replay([...evs.slice(0, 3), freezeR, buy('default:freeze', at('2026-11-09', 21))], at(D10)).history.map(h => h.streak)).toEqual([1, 1]);
});

test('лимит отдыха монотонен: день без заданий 1.12 не отменяется 14 днями отдыха позже', () => {
  const gold = [issue('2026-11-30', [q('g', '2026-11-30', 10000)]), done('2026-11-30', 'g'), dayoffR,
    issue('2026-12-01', [q('m', '2026-12-01', 35)]), buy('default:dayoff', at('2026-12-01', 13))];
  const before = replay(gold, at('2026-12-01', 22));
  const rest = span('2026-12-02', 14).flatMap(d => [startDay(d, { dayType: DT[3] }), issue(d, [nq(`r${d}`, d, 'E', ['rest'])])]);
  const s = replay([...gold, ...rest], at('2026-12-16'));
  expect(s.purchases).toHaveLength(1); expect(s.purchases).toEqual(before.purchases);
  const h = (d: string) => s.history.find(x => x.date === d)!;
  expect(h('2026-12-01')).toMatchObject({ rest: true, streak: 1 });
  expect(h('2026-12-14').rest).toBe(true);
  expect(h('2026-12-15').rest).toBe(false); // 15-й отдых в месяце (с днём без заданий) — обычный день
  expect(s.today.restDaysLeft).toBe(0);
});

test('today.dayStart: уровень и навыки на начало дня — потолок переброса не растёт от сегодняшнего XP', () => {
  const ids = ['b1', 'b2', 'b3', 'b4'];
  const s = replay([onboard, issue('2026-11-17', ids.map(id => q(id, '2026-11-17', 10_000, 'str', 1, 'pushups'))),
    ...ids.map((id, i) => done('2026-11-17', id, at('2026-11-17', 10, i)))], at('2026-11-17', 12));
  expect(s.level).toBeGreaterThan(s.today.dayStart.level);
  expect(s.today.dayStart.level).toBe(s.startLevel);
  expect(s.skills.strength.level).toBeGreaterThan(s.today.dayStart.skills.strength);
  expect(s.today.dayStart.skills.strength).toBe(s.skills.strength.start);
  // без выдач — текущие значения
  const e = replay([onboard], at('2026-11-17', 12));
  expect(e.today.dayStart).toEqual({ level: e.level, skills: Object.fromEntries(Object.entries(e.skills).map(([k, v]) => [k, v.level])) });
});

test('переброс: замена с шаблоном, уже стоящим в этом дне, — отказ (недоверенный журнал)', () => {
  const dup = (id: string) => ({ ...nq(id, D10, 'E', ['cardio']), templateId: 't-dup' });
  const s = replay([...gold60, issue(D10, ['x1', 'x2', 'x3'].map(id => nq(id, D10, 'E', ['strength']))),
    reroll('x1', dup('r1'), at(D10, 10)), reroll('x2', dup('r2'), at(D10, 10, 1)),
    reroll('x3', { ...nq('r3', D10, 'E', ['cardio']), templateId: 't-x1' }, at(D10, 10, 2))], at(D10, 12));
  // x2 → тот же t-dup, что у r1, — отказ; шаблон заменённого x1 в дне уже не стоит — можно
  expect(s.today.quests.map(q => q.id)).toEqual(['r1', 'x2', 'r3']);
  expect(s.today.rerollsUsed).toBe(2);
});

// ---- финальная проверка ветки ----
test('золото достижений прошлых дней тратится; first_purchase — нет', () => {
  const d9 = '2026-11-09';
  const base = [issue(d9, [q('a', d9, 1350)]), done(d9, 'a'), freezeR];
  const s = replay(base, at(D10, 12));
  expect(s.ledger.reduce((a, r) => a + r.gold, 0)).toBeLessThan(300);
  expect(s.gold).toBeGreaterThanOrEqual(300); expect(s.today.spendable).toBe(s.gold);
  expect(replay([...base, buy('default:freeze', at(D10, 13))], at(D10, 22)).purchases).toHaveLength(1);
  const n = replay([...base, buy('default:freeze', at(D10, 13))], at('2026-11-11', 12));
  expect(n.achievements.map(a => a.id)).toContain('first_purchase');
  expect(n.today.spendable).toBe(n.gold - BALANCE.achievementGold);
});

test('отклонённая обычная покупка не уменьшает spendable', () => {
  const big = ev({ type: 'reward_created', rewardId: 'big', title: 'Дорого', price: 100000, ts: at('2026-11-01') });
  const a = replay([...gold60, freezeR], at(D10, 12));
  const b = replay([...gold60, freezeR, big, buy('big', at('2026-11-09', 21))], at(D10, 12));
  expect(b.purchases).toEqual([]); expect(b.today.spendable).toBe(a.today.spendable);
});

test('поздний старт в 01:30 «Дневная смена»: начат новый день, серия не режется из-за старта', () => {
  const y = '2026-11-17', d = '2026-11-18', n = '2026-11-19';
  const base = [onboard, startDay(y), issue(y, [nq('p', y, 'E', ['strength'])]), done(y, 'p')];
  const late = (date: string) => [ev({ type: 'day_started', date, work: null, wakeAt: '01:30', dayType: DT[0], ts: at(n, 1, 30) }),
    ev({ type: 'quests_issued', date, quests: [nq(`z${date}`, date, 'E', ['strength'])], ts: at(n, 1, 30) })];
  const now = at(n, 1, 31);
  expect(replay(base, now).today).toMatchObject({ date: d, started: false });
  // старт задним числом на вчера (после закрытия своего типа, 01:00) — отклоняется
  expect(replay([...base, ...late(d)], now).today).toMatchObject({ date: d, started: false });
  const s = replay([...base, ...late(n)], now);
  expect(s.today).toMatchObject({ date: n, started: true }); expect(s.today.quests).toHaveLength(1);
  expect(s.history.map(h => h.date)).toEqual([y]);
  expect(s.streak).toBe(replay(base, at(n, 5)).streak);
  // до старта — ещё вчера (несданный день закрывается в момент старта следующего)
  expect(replay([...base, ...late(n)], at(n, 1, 20)).today.date).toBe(d);
});

test('выполнение принимается только до закрытия своего дня', () => {
  const d = '2026-11-17', n = '2026-11-18';
  const base = [onboard, startDay(d), issue(d, [nq('x', d, 'E', ['strength'])])];
  expect(replay([...base, done(d, 'x', at(n, 0, 50))], at(n, 12)).history[0].completed).toBe(1);
  expect(replay([...base, done(d, 'x', at(n, 1, 30))], at(n, 12)).history[0].completed).toBe(0);
});

test('смена типа на тип, чьё закрытие уже прошло, — отказ', () => {
  const d = '2026-11-17', n = '2026-11-18';
  const evs = [onboard, startDay(d, { dayType: DT[2] }), ev({ type: 'day_changed', date: d, dayType: DT[0], at: '01:30', ts: at(n, 1, 30) })];
  expect(replay(evs, at(n, 1, 40)).today).toMatchObject({ date: d, changed: false });
});

// ---- Автоматика: данные дня, сигналы, таймеры, правдоподобие, авто-засчёт ----
const hp = (date: string, health: object, h = 9, kind = 'other') => ev({ type: 'health_packet', date, kind, health, calendar: [], ts: at(date, h), deviceId: 'shortcuts' });
const sig = (ts: number, signal: object) => ev({ type: 'signal_logged', at: ts, signal, ts, deviceId: 'shortcuts' });
const D = '2026-12-02';
test('одна тренировка в двух пакетах считается один раз; тип → strengthMin', () => {
  const w = { type: 'Силовая', start: at(D, 18), end: at(D, 18, 50), minutes: 50 };
  const s = replay([onboard, issue(D, [nq('g', D, 'C', ['strength'], { auto: { metric: 'strengthMin', op: '>=', value: 45 } })]),
    hp(D, { workouts: [w] }, 13), hp(D, { workouts: [w], steps: 9000 }, 18)], at(D, 20));
  expect(s.today.data).toMatchObject({ workoutMin: 50, strengthMin: 50, steps: 9000 });
  expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto' });
});
test('пересечение тренировок → флаг overlap, без авто', () => {
  const a = { type: 'Бег', start: at(D, 18), end: at(D, 19), minutes: 60 }, b = { type: 'Велосипед', start: at(D, 18, 30), end: at(D, 19, 30), minutes: 60 };
  const s = replay([onboard, issue(D, [nq('r', D, 'D', ['cardio'], { auto: { metric: 'cardioMin', op: '>=', value: 30 } })]), hp(D, { workouts: [a, b] })], at(D, 20));
  expect(s.today.data.flags).toContainEqual({ metric: 'workouts', reason: 'overlap' });
  expect(s.today.quests[0].done).toBe(false);
});
test('60 000 шагов и сон 15 ч — флаги, не авто [S§11]', () => {
  const s = replay([onboard, issue(D, [nq('s', D, 'E', ['cardio'], { auto: { metric: 'steps', op: '>=', value: 6000 } }),
    nq('z', D, 'E', ['sleep'], { auto: { metric: 'sleepHours', op: '>=', value: 7.5 } })]), hp(D, { steps: 60000, sleepHours: 15 })], at(D, 20));
  expect(s.today.quests.map(x => x.done)).toEqual([false, false]);
  expect(s.dataFlags.map(f => f.flag.reason).sort()).toEqual(['too_long_sleep', 'too_many_steps']);
});
test('засчёт монотонен: сон 8 → потом 6,5 — задание остаётся авто', () => {
  const s = replay([onboard, issue(D, [nq('z', D, 'E', ['sleep'], { auto: { metric: 'sleepHours', op: '>=', value: 7.5 } })]),
    hp(D, { sleepHours: 8 }, 9), hp(D, { sleepHours: 6.5 }, 10)], at(D, 20));
  expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto' });
});
test('«Без соцсетей»: без живого источника не авто; с источником — только после закрытия дня', () => {
  const ns = nq('n', D, 'E', ['habits'], { auto: { metric: 'socialMin', op: '<=', value: 5 } });
  expect(replay([onboard, issue(D, [ns])], at('2026-12-03', 12)).history.at(-1)!.completed).toBe(0);
  const alive = sig(at('2026-12-01', 21), { kind: 'app', app: 'social', state: 'open' });
  expect(replay([onboard, alive, issue(D, [ns])], at(D, 20)).today.quests[0].done).toBe(false);   // день не закрыт
  expect(replay([onboard, alive, issue(D, [ns])], at('2026-12-03', 12)).history.at(-1)!.completed).toBe(1);
});
test('сигналы: игровая дата по закрытию дня; open без close = 15 мин; прибытие в зал', () => {
  const ds = ev({ type: 'day_started', date: D, work: null, wakeAt: '11:00', dayType: DEFAULT_DAY_TYPES[1], ts: at(D, 11) }); // вечерняя: закрытие 04:00
  const s = replay([onboard, ds, issue(D, [nq('gym', D, 'E', ['strength'], { auto: { metric: 'gymVisits', op: '>=', value: 1 } })]),
    sig(at('2026-12-03', 2, 30), { kind: 'app', app: 'social', state: 'open' }),
    sig(at(D, 12), { kind: 'arrive', place: 'gym' })], at('2026-12-03', 3));
  expect(s.today.date).toBe(D);
  expect(s.today.data).toMatchObject({ socialMin: 15, gymVisits: 1 });
  expect(s.today.quests[0].verify).toBe('auto');
});
test('таймер: принимается в пределах, будущий end отброшен, пересечения объединены', () => {
  const t = (start: number, end: number, ts = end) => ev({ type: 'timer_logged', timer: 'focus', start, end, ts });
  const s = replay([onboard, t(at(D, 10), at(D, 10, 45)), t(at(D, 10, 30), at(D, 11)), t(at(D, 12), at(D, 13), at(D, 11)),
    t(at(D, 14), at(D, 20))], at(D, 21));
  expect(s.today.data.focusMin).toBe(60); // 10:00–11:00; 12–13 с ts раньше end — нет; 6 ч > 240 — нет
});
test('Wallet: сумма в spendAuto, магазин не в today.data', () => {
  const s = replay([onboard, sig(at(D, 9), { kind: 'wallet', amount: 1250.5, merchant: 'Магазин 1' }), sig(at(D, 10), { kind: 'wallet', amount: -250.5, merchant: 'Магазин 1' })], at(D, 12));
  expect(s.today.data.spendAuto).toBe(1000); expect(JSON.stringify(s.today.data)).not.toContain('Магазин');
});
test('Wallet: одиночный возврат не бросает и даёт отрицательную сумму', () => {
  const s = replay([onboard, sig(at(D, 9), { kind: 'wallet', amount: -300, merchant: 'Возврат' })], at(D, 12));
  expect(s.today.data.spendAuto).toBe(-300);
});
test('битые новые события не бросают', () => {
  expect(() => replay([onboard, ev({ type: 'signal_logged', at: 'x', signal: null }), ev({ type: 'timer_logged', timer: 'nap', start: 5, end: 1 }),
    ev({ type: 'health_packet', date: D, health: { workouts: 'много' } }), sig(at(D), { kind: 'arrive', place: 'бар' })], at(D))).not.toThrow();
});
test('повтор сигнала не удваивает; источники синка', () => {
  const g = { kind: 'arrive', place: 'gym' };
  const s = replay([onboard, sig(at(D, 12), g), ev({ type: 'signal_logged', at: at(D, 12), signal: g, ts: at(D, 12, 1), deviceId: 'shortcuts' }), hp(D, { steps: 100 }, 10)], at(D, 20));
  expect(s.today.data.gymVisits).toBe(1);
  expect(s.sync).toEqual({ last: at(D, 12, 1), bySource: { arrive: at(D, 12), health: at(D, 10) } });
});
test('фокус монотонен: запоздавший off не уменьшает минуты и не снимает авто [спека §4.4]', () => {
  const f = (a: number, state: string, ts = a) => ev({ type: 'signal_logged', at: a, signal: { kind: 'focus', state }, ts, deviceId: 'shortcuts' });
  const base = [onboard, issue(D, [nq('f', D, 'C', ['focus'], { auto: { metric: 'focusMin', op: '>=', value: 90 } })]), f(at(D, 10), 'on'), f(at(D, 12), 'off')];
  const late = f(at(D, 10, 30), 'off', at(D, 12, 5));
  for (const now of [at(D, 20), at('2026-12-04', 12)]) {
    const a = replay(base, now), b = replay([...base, late], now);
    expect(a.ledger.find(r => r.questId === 'f')).toMatchObject({ k: 1 });
    expect(b.ledger.find(r => r.questId === 'f')).toEqual(a.ledger.find(r => r.questId === 'f'));
  }
  expect(replay([...base, late], at(D, 20)).today.data.focusMin).toBe(120);
  // после закрытия дня поздний таймер этой даты не добавляет минут
  const tm = ev({ type: 'timer_logged', timer: 'reading', start: at(D, 9), end: at(D, 9, 30), ts: at('2026-12-03', 10) });
  expect(replay([onboard, issue(D, [nq('r', D, 'E', ['reading'], { auto: { metric: 'readMin', op: '>=', value: 10 } })]), tm], at('2026-12-03', 12)).history.at(-1)!.completed).toBe(0);
});
test('шаги выше stepsMax не идут в недельные шаги и bestSteps7 (Команды и вручную)', () => {
  const W2 = '2026-11-30';
  const wk = ev({ type: 'weekly_issued', weekStart: W2, ts: at(W2, 7), quests: [{ id: 'w1', weekStart: W2, kind: 'steps_total', stat: null, target: 70000, title: 'Шаги', xp: 150 }] });
  const s = replay([wk, hp(W2, { steps: 60000 }), ev({ type: 'metric_logged', date: '2026-12-01', metric: 'steps', value: 60000, mode: 'set' }), hp(D, { steps: 8000 })], at(D, 20));
  expect(s.weekly.quests[0].progress).toBe(8000);
  const m = (date: string, value: number) => ev({ type: 'metric_logged', date, metric: 'steps', value, mode: 'set' });
  expect(replay([m('2026-11-25', 9000), m('2026-11-26', 60000), hp('2026-11-27', { steps: 60000 }), m('2026-11-28', 11000), m('2026-11-29', 10000)], at(D, 12)).genInputs.bestSteps7).toBe(10000);
});

// ---- Автоматика: HP, Energy, Фокус, Усталость и их влияние на XP ----
test('HP дня из окна 3 дня; Energy утра [S§3]', () => {
  const prof = { ...onboardProfile, stepsUsual: 6000 };
  const evs = [ev({ ...onboard, profile: prof }),
    ...['2026-11-30', '2026-12-01', D].map(d => hp(d, { sleepHours: 6, steps: 3000 })),
    ev({ type: 'day_started', date: D, work: null, wakeAt: '08:00', energy: 7, ts: at(D, 8) })];
  const s = replay(evs, at(D, 12));
  expect(s.today.vitals.hp).toBe(67);            // (0,4·80 + 0,3·50) / 0,7
  expect(s.today.vitals.energy).toBe(Math.round(0.6 * 80 + 0.25 * 70 + 0.15 * 67)); // 76
  expect(s.today.energy).toBe(76);
  expect(s.today.vitals.parts.hp).toEqual({ sleep: 80, steps: 50 });
  expect(s.today.vitals.energyInputs).toEqual({ sleep: 6, hp: 67, weekMorning: null });
});
test('Усталость: шесть коротких ночей → 60, седьмая → 70', () => {
  const days = Array.from({ length: 7 }, (_, i) => addDays('2026-12-01', i));
  const s = replay([onboard, ...days.flatMap(d => [issue(d, [nq(`x${d}`, d, 'E', ['reading'])]), hp(d, { sleepHours: 5 })])], at(days[6], 12));
  expect(s.history.map(h => h.fatigue)).toEqual([10, 20, 30, 40, 50, 60]);
  expect(s.today.vitals.fatigue).toBe(70);
  expect(s.genInputs.fatigue).toBe(70);
});
test('штраф Усталости 0,3% за пункт и общий потолок 0,5', () => {
  const [d1, d2, d3] = span('2026-12-01', 3);
  const low = (d: string) => ev({ type: 'checkin', date: d, went: '', notWent: '', energy: 2, ts: at(d, 21) });
  // F: 0 + 15 − 5 = 10 → 10 + 5 (вечер 2) + 15 − 5 = 25 → 40
  const s = replay([onboard, issue(d1, [nq('a1', d1, 'E', ['strength'])]), issue(d2, [nq('a2', d2, 'E', ['strength'])]),
    issue(d3, [nq('c', d3, 'C', ['strength'])]), done(d3, 'c'), ...[d1, d2, d3].map(d => hp(d, { sleepHours: 5 })), low(d1), low(d2)], at(d3, 22));
  expect(s.today.vitals.fatigue).toBe(40);
  expect(s.ledger.find(r => r.questId === 'c')).toMatchObject({ penalty: 0.12, xp: 43 }); // 70·0,7·0,88
  // F = 100 (10 коротких ночей) + ослабление 0,2 → потолок 0,5
  const ds = span('2026-12-01', 11), last = ds[10];
  const t = replay([onboard, ...ds.slice(0, 10).map(d => issue(d, [nq(`i${d}`, d, 'E', ['strength'])])), issue(last, [nq('z', last, 'C', ['strength'])]),
    done(last, 'z'), ...ds.map(d => hp(d, { sleepHours: 4 }))], at(last, 22));
  expect(t.today.vitals.fatigue).toBe(100);
  expect(t.ledger.find(r => r.questId === 'z')).toMatchObject({ penalty: 0.5, xp: 25 });
});
test('Фокус умножает XP Интеллекта того же дня [S§3]', () => {
  const s = replay([onboard, issue(D, [nq('i', D, 'C', ['reading'], { auto: { metric: 'readMin', op: '>=', value: 10 } })]),
    ev({ type: 'timer_logged', timer: 'reading', start: at(D, 9), end: at(D, 9, 30), ts: at(D, 9, 30) }),
    ev({ type: 'timer_logged', timer: 'focus', start: at(D, 10), end: at(D, 11, 30), ts: at(D, 11, 30) }),
    sig(at(D, 12), { kind: 'app', app: 'social', state: 'open' }), sig(at(D, 12, 10), { kind: 'app', app: 'social', state: 'close' })], at(D, 20));
  expect(s.today.vitals.focus).toBe(100);
  expect(s.today.vitals.parts.focus).toEqual({ focus: 100, social: 100 });
  expect(s.ledger.find(r => r.questId === 'i')).toMatchObject({ mult: 1.2 });   // база 70 × 1,0 × бонусы × 1,2
});
test('нет данных — параметры null, Energy = fallback, множитель 1', () => {
  const s = replay([onboard], at(D, 12));
  expect(s.today.vitals).toMatchObject({ hp: null, focus: null, fatigue: 0 });
  expect(s.today.energy).toBe(BALANCE.energy.fallback);
});
test('закрытый день окончателен: поздние сон и соцсети не меняют штраф и множитель', () => {
  const n = addDays(D, 1);
  const base = [onboard, issue(D, [nq('i', D, 'C', ['reading'])]), done(D, 'i'), hp(D, { sleepHours: 8 }),
    ev({ type: 'timer_logged', timer: 'focus', start: at(D, 10), end: at(D, 11, 30), ts: at(D, 11, 30) })];
  const late = [ev({ type: 'health_packet', date: D, kind: 'other', health: { sleepHours: 4 }, calendar: [], ts: at(n, 10), deviceId: 'shortcuts' }),
    ev({ type: 'signal_logged', at: at(D, 13), signal: { kind: 'app', app: 'social', state: 'open' }, ts: at(n, 10), deviceId: 'shortcuts' }),
    ev({ type: 'signal_logged', at: at(D, 15), signal: { kind: 'app', app: 'social', state: 'close' }, ts: at(n, 10, 1), deviceId: 'shortcuts' })];
  const a = replay(base, at(n, 12)), b = replay([...base, ...late], at(n, 12));
  const row = (s: ReturnType<typeof replay>) => s.ledger.find(r => r.questId === 'i');
  expect(row(a)).toMatchObject({ mult: 1.2 });
  expect(row(b)).toEqual(row(a));
  expect(b.history.at(-1)).toEqual(a.history.at(-1));
});

// ---- Автоматика: режим восстановления, подсказки; проверка входа чек-ина и пакетов ----
const recStart = (date: string, quests: number = 1, h = 9) => ev({ type: 'recovery_started', date, quests, ts: at(date, h) });
const recEnd = (date: string, h = 9) => ev({ type: 'recovery_ended', date, ts: at(date, h) });
test('восстановление замораживает серию и делит лимит 14 с днями отдыха [S§3]', () => {
  const two = doneDays('2026-11-29', 2, 'strength', 'C');
  const rest = span('2026-12-01', 10).flatMap(d => [startDay(d, { dayType: DT[3] }), issue(d, [nq(`r${d}`, d, 'E', ['rest'])])]);
  const rec = span('2026-12-11', 6).flatMap(d => [issue(d, [nq(`m${d}`, d, 'E', ['reading'])]), done(d, `m${d}`)]);
  const evs = [onboard, ...two, ...rest, recStart('2026-12-11'), ...rec, recEnd('2026-12-17')];
  const s = replay(evs, at('2026-12-17', 12));
  const h = (d: string) => s.history.find(x => x.date === d)!;
  const frozenDays = s.history.filter(x => x.date >= '2026-12-11' && x.rest).length;
  expect(frozenDays).toBe(4);
  expect(h('2026-12-14')).toMatchObject({ rest: true, streak: 2 });
  expect(h('2026-12-16')).toMatchObject({ rest: false, streak: 4 }); // 5-й и 6-й — обычные, серия считается
  expect(s.today.restDaysLeft).toBe(0);
  expect(s.recovery).toMatchObject({ active: false, since: null, frozenToday: false, afterLeft: 2 });
  // монотонно: решения о прошлых днях не меняются от поздних событий
  const early = replay(evs.filter(e => e.ts < at('2026-12-13', 12)), at('2026-12-13', 12));
  expect(early.recovery).toMatchObject({ active: true, since: '2026-12-11', quests: 1, frozenToday: true, afterLeft: 0 });
  expect(early.genInputs).toMatchObject({ recovery: { quests: 1 }, afterRecovery: false });
  expect(early.history.filter(x => x.date >= '2026-12-11')).toEqual(s.history.filter(x => x.date >= '2026-12-11' && x.date < '2026-12-13'));
});
test('сверх лимита режим остаётся включённым, день обычный; день без заданий на замороженный день — отказ без списания', () => {
  const rest = span('2026-12-01', 14).flatMap(d => [startDay(d, { dayType: DT[3] }), issue(d, [nq(`r${d}`, d, 'E', ['rest'])])]);
  const s = replay([onboard, ...rest, recStart('2026-12-15', 2)], at('2026-12-15', 12));
  expect(s.recovery).toMatchObject({ active: true, quests: 2, frozenToday: false });
  expect(s.genInputs.recovery).toEqual({ quests: 2 });
  const gold = [issue('2026-11-30', [q('g', '2026-11-30', 10000)]), done('2026-11-30', 'g'), dayoffR, buy('default:dayoff', at('2026-12-01', 8))];
  const t = replay([...gold, recStart('2026-12-01')], at('2026-12-01', 12)), paid = replay(gold, at('2026-12-01', 12));
  expect(paid.today).toMatchObject({ dayOff: true, restDaysLeft: 13 });
  expect(t.today).toMatchObject({ dayOff: false, restDaysLeft: 13 });
  expect(t.purchases).toEqual([]); expect(t.today.spendable).toBe(paid.today.spendable + 600);
  expect(t.recovery.frozenToday).toBe(true);
});
test('замороженный день восстановления — отдых для Усталости (−15)', () => {
  const [a, b, c] = span('2026-12-01', 3);
  const evs = [onboard, ...[a, b, c].flatMap(d => [issue(d, [nq(`x${d}`, d, 'E', ['reading'])]), hp(d, { sleepHours: 4 })])];
  expect(replay(evs, at(c, 12)).today.vitals.fatigue).toBe(30);
  expect(replay([...evs, recStart(b)], at(c, 12)).today.vitals.fatigue).toBe(15);
});
test('старт и конец в одну дату — 0 дней режима; конец без старта игнорируется', () => {
  const d = '2026-12-05';
  const s = replay([onboard, recEnd('2026-12-04'), recStart(d, 2, 9), recEnd(d, 10)], at(d, 12));
  expect(s.recovery).toMatchObject({ active: false, since: null, frozenToday: false, afterLeft: 0 });
  expect(s.today.restDaysLeft).toBe(14);
  expect(s.genInputs).toMatchObject({ recovery: null, afterRecovery: false });
  // повторный старт меняет только quests; дата не сегодня и quests вне 0–2 — игнор
  const a = replay([onboard, recStart(d, 2, 9), recStart(d, 0, 10), recStart('2026-12-06', 1, 11), recStart(d, 3, 11)], at(d, 12));
  expect(a.recovery).toMatchObject({ active: true, since: d, quests: 0, frozenToday: true });
  expect(a.today.restDaysLeft).toBe(13);
  expect(replay([onboard, recStart('2026-12-06', 1, 11)], at(d, 12)).recovery.active).toBe(false);
  expect(() => replay([onboard, ev({ type: 'recovery_started', date: 5 as unknown as string, quests: 'x', ts: at(d, 10) }), ev({ type: 'recovery_ended', date: null as unknown as string, ts: at(d, 11) })], at(d, 12))).not.toThrow();
});
test('подсказки: Усталость 70 → recovery_enter; HP 61 вчера и сегодня в режиме → recovery_exit', () => {
  const days = span('2026-12-01', 7);
  const tired = replay([onboard, ...days.flatMap(d => [issue(d, [nq(`x${d}`, d, 'E', ['reading'])]), hp(d, { sleepHours: 5 })])], at(days[6], 12));
  expect(tired.today.vitals.fatigue).toBe(70);
  expect(tired.today.suggest).toBe('recovery_enter');
  expect(replay([onboard, ...days.slice(0, 6).flatMap(d => [issue(d, [nq(`x${d}`, d, 'E', ['reading'])]), hp(d, { sleepHours: 5 })])], at(days[5], 12)).today.suggest).toBeNull();
  const [a, b, c, d] = span('2026-12-10', 4);
  const good = [a, b, c, d].map(x => hp(x, { sleepHours: 8 }));
  const s = replay([onboard, ...good, recStart(c)], at(d, 12));
  expect(s.today.vitals.hp).toBeGreaterThan(60);
  expect(s.today.suggest).toBe('recovery_exit');
  expect(replay([onboard, ...good], at(d, 12)).today.suggest).toBeNull(); // не в режиме
  // вчера HP ≤ 60 — ещё рано
  const bad = [a, b, c].map(x => hp(x, { sleepHours: 4 }));
  const t = replay([onboard, ...bad, hp(d, { sleepHours: 8 }), recStart(c)], at(d, 12));
  expect(t.today.vitals.hp).toBeGreaterThan(60);
  expect(t.today.suggest).toBeNull();
  // день возвращения при Усталости ≥ 70 — без предложения войти; в режиме — без «сменить тип дня»
  const nine = span('2026-12-01', 9);
  const back = replay([onboard, ...nine.flatMap(x => [issue(x, [nq(`x${x}`, x, 'E', ['reading'])]), hp(x, { sleepHours: 5 })]), recStart(nine[7], 1, 13), recEnd(nine[8], 14)], at(nine[8], 15));
  expect(back.recovery.afterLeft).toBe(2);
  expect(back.today.vitals.fatigue).toBeGreaterThanOrEqual(70);
  expect(back.today.suggest).toBeNull();
  const wd = '2026-12-20';
  expect(replay([onboard, startDay(wd, { dayType: DT[2] }), recStart(wd), sig(at(wd, 10), { kind: 'arrive', place: 'work' })], at(wd, 12)).today.suggest).toBeNull();
});
test('после возвращения 2 дня afterLeft 2 → 1 → 0', () => {
  const evs = [onboard, recStart('2026-12-01'), recEnd('2026-12-03')];
  expect(span('2026-12-03', 3).map(d => replay(evs, at(d, 12)).recovery.afterLeft)).toEqual([2, 1, 0]);
  expect(span('2026-12-03', 3).map(d => replay(evs, at(d, 12)).genInputs.afterRecovery)).toEqual([true, true, false]);
});
test('прибытие на работу в выходной → day_change_work', () => {
  const d = '2026-12-05', work = sig(at(d, 10), { kind: 'arrive', place: 'work' });
  expect(replay([onboard, startDay(d, { dayType: DT[2] }), work], at(d, 12)).today.suggest).toBe('day_change_work');
  expect(replay([onboard, startDay(d, { dayType: DT[0] }), work], at(d, 12)).today.suggest).toBeNull();
  expect(replay([onboard, startDay(d, { dayType: DT[2] })], at(d, 12)).today.suggest).toBeNull();
});
test('чек-ин: энергия только целое 1–10; отрицательные данные здоровья — как отсутствие', () => {
  const d = '2026-12-05', ci = (energy: number) => ev({ type: 'checkin', date: d, went: '', notWent: '', energy, ts: at(d, 10) });
  expect(replay([onboard, ci(6)], at(d, 12)).today.vitals.parts.hp).toEqual({ feel: 60 });
  for (const x of [6.5, 0, 11, -3]) expect(replay([onboard, ci(x)], at(d, 12)).today.vitals.hp).toBeNull();
  const s = replay([onboard, hp(d, { sleepHours: -3, steps: -100, restingHR: -60, mindfulMin: -5 })], at(d, 12));
  expect(s.today.vitals.hp).toBeNull();
  expect(s.today.data).toEqual({ flags: [] });
});
test('штраф Усталости округлён: F 95 → 0,285', () => {
  const ds = span('2026-12-01', 11);
  const s = replay([onboard, ...doneDays('2026-12-01', 11, 'reading'), ...ds.slice(0, 10).map(d => hp(d, { sleepHours: 4 })), hp(ds[10], { sleepHours: 6.5 })], at(ds[10], 22));
  expect(s.today.vitals.fatigue).toBe(95);
  expect(s.ledger.find(r => r.questId === `reading${ds[10]}`)!.penalty).toBe(0.285);
});

// ---- финальное ревью Автоматики ----
test('до automationSince Усталость 0, без штрафа и множителя Фокуса: леджер и траты старых дней как без данных', () => {
  const ds = span('2026-11-10', 9); // 10–18 ноября, до старта Автоматики
  const base = [onboard, freezeR, ...doneDays(ds[0], 9, 'reading', 'C'), buy('default:freeze', at(ds[8], 21))];
  const vitals = [...ds.map(d => hp(d, { sleepHours: 4 })),
    ...ds.map(d => ev({ type: 'timer_logged', timer: 'focus', start: at(d, 10), end: at(d, 11, 30), ts: at(d, 11, 30) }))];
  const a = replay(base, at('2026-11-19', 22)), b = replay([...base, ...vitals], at('2026-11-19', 22));
  expect(b.ledger).toEqual(a.ledger); expect(b.purchases).toEqual(a.purchases); expect(b.gold).toBe(a.gold);
  expect(b.history.every(h => h.fatigue === 0)).toBe(true);
});
test('workoutMin пакета не засчитывается, если есть массив workouts (overlap)', () => {
  const a = { type: 'Бег', start: at(D, 18), end: at(D, 19), minutes: 60 }, b = { type: 'Велосипед', start: at(D, 18, 30), end: at(D, 19, 30), minutes: 60 };
  const s = replay([onboard, issue(D, [nq('w', D, 'D', ['cardio'], { auto: { metric: 'workoutMin', op: '>=', value: 30 } })]),
    hp(D, { workouts: [a, b], workoutMin: 120 })], at(D, 20));
  expect(s.today.quests[0].done).toBe(false);
  expect(replay([onboard, issue(D, [nq('w', D, 'D', ['cardio'], { auto: { metric: 'workoutMin', op: '>=', value: 30 } })]),
    hp(D, { workoutMin: 40 })], at(D, 20)).today.quests[0].done).toBe(true);
});
test('фокус: потерянный off — off закрывает только последний on', () => {
  const s = replay([onboard, sig(at(D, 10), { kind: 'focus', state: 'on' }), sig(at(D, 15), { kind: 'focus', state: 'on' }),
    sig(at(D, 16), { kind: 'focus', state: 'off' })], at(D, 20));
  expect(s.today.data.focusMin).toBe(60);
});
test('достижения шагов не открываются глюком 60 000', () => {
  const s = replay([onboard, issue(D, [nq('x', D, 'E', ['reading'])]), hp(D, { steps: 60000 })], at('2026-12-03', 12));
  expect(s.achievements.map(a => a.id)).not.toContain('steps_10k');
});

// ---- Этап 4: лестницы, ритуалы, серия ----
const ladder = (id = 'l1', extra: Record<string, unknown> = {}, date = '2026-12-01') => ev({ type: 'ladder_created', ladderId: id, title: 'Чтение',
  kind: 'do', skill: 'reading', steps: LADDER_PRESETS.read.steps, ts: at(date, 9), ...extra });
const rit = (date: string, id = 'l1', ts = at(date, 21)) => ev({ type: 'ritual_done', ladderId: id, date, ts });
const rits = (dates: string[]) => dates.map(d => rit(d));

test('окно 14 дней: 5 из 6 → ступень 2, ритуалы по 15 и бонус 100 [S§7]', () => {
  const s = replay([onboard, ladder(), ...rits(['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-08', '2026-12-10'])], at('2026-12-15'));
  expect(s.ladders[0]).toMatchObject({ step: 2, attempt: 1, status: 'active', windowStart: '2026-12-15' });
  expect(s.ledger.filter(r => r.source === 'ritual').map(r => r.xp)).toEqual([15, 15, 15, 15, 15]);
  expect(s.ledger.find(r => r.source === 'ladder')).toMatchObject({ xp: 100, date: '2026-12-14' });
  expect(s.skills.reading.xp).toBe(175);
});
test('4 из 6 → повтор; повтор провален → шаг назад и вопрос', () => {
  const w1 = rits(['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-08']);
  expect(replay([onboard, ladder(), ...w1], at('2026-12-15')).ladders[0]).toMatchObject({ step: 1, attempt: 2 });
  const w2 = rits(['2026-12-15', '2026-12-17', '2026-12-19', '2026-12-21']);
  expect(replay([onboard, ladder(), ...w1, ...w2], at('2026-12-29')).ladders[0]).toMatchObject({ step: 1, attempt: 1, ask: true });
});
test('отметка только за сегодня и один раз', () => {
  const s = replay([onboard, ladder(), rit('2026-12-01', 'l1', at('2026-12-02', 10)), rit('2026-12-02'), rit('2026-12-02', 'l1', at('2026-12-02', 22))], at('2026-12-03'));
  expect(s.ledger.filter(r => r.source === 'ritual')).toHaveLength(1);
});
test('восстановление ставит окно на паузу', () => {
  const rec = [ev({ type: 'recovery_started', date: '2026-12-03', quests: 0, ts: at('2026-12-03', 9) }),
    ev({ type: 'recovery_ended', date: '2026-12-06', ts: at('2026-12-06', 9) })];
  const base = [onboard, ladder(), ...rec, ...rits(['2026-12-01', '2026-12-02', '2026-12-07', '2026-12-08', '2026-12-10'])];
  expect(replay(base, at('2026-12-15')).ladders[0].step).toBe(1);
  expect(replay(base, at('2026-12-18')).ladders[0].step).toBe(2);
});
test('не больше 3 активных, очередь со следующего дня после освобождения', () => {
  const ls = ['l1', 'l2', 'l3', 'l4'].map(id => ladder(id));
  expect(replay([onboard, ...ls], at('2026-12-02')).ladders.map(l => l.status)).toEqual(['active', 'active', 'active', 'queued']);
  const s = replay([onboard, ...ls, ev({ type: 'ladder_removed', ladderId: 'l2', ts: at('2026-12-05', 10) })], at('2026-12-07'));
  expect(s.ladders.map(l => [l.id, l.status])).toEqual([['l1', 'active'], ['l3', 'active'], ['l4', 'active']]);
  expect(s.ladders[2].windowStart).toBe('2026-12-06');
});
test('авто-ритуал по данным: шаги ≥ 5 000', () => {
  const s = replay([onboard, ladder('w', { title: 'Прогулка', skill: 'cardio', steps: LADDER_PRESETS.walk.steps }),
    ev({ type: 'health_packet', date: '2026-12-02', kind: 'other', health: { steps: 6000 }, calendar: [], ts: at('2026-12-02', 18), deviceId: 'shortcuts' })], at('2026-12-03'));
  expect(s.ledger.find(r => r.source === 'ritual')).toMatchObject({ xp: 15, verified: true, date: '2026-12-02' });
});
test('серия: все ритуалы ИЛИ 60% заданий [S§6]', () => {
  const qs = (d: string) => issue(d, [nq(`${d}a`, d, 'E', ['strength']), nq(`${d}b`, d, 'E', ['cardio'])]);
  const s = replay([onboard, ladder(), qs('2026-12-01'), rit('2026-12-01'), qs('2026-12-02')], at('2026-12-03'));
  expect(s.history.map(h => h.counted)).toEqual([true, false]);
});
test('рецидив ступени 5 → ступень 4, трофей и 750 XP бонусов', () => {
  const one = Array.from({ length: 5 }, () => ({ label: 'раз', per7: 1 }));
  const starts = ['2026-12-01', '2026-12-15', '2026-12-29', '2027-01-12'];
  const evs = [onboard, ladder('l1', { steps: one }), ...starts.flatMap(d => rits([d, addDays(d, 1)]))];
  const at5 = replay(evs, at('2027-01-26'));
  expect(at5.ladders[0]).toMatchObject({ step: 5, status: 'auto' });
  expect(at5.trophies).toMatchObject([{ kind: 'avatar' }]);
  expect(at5.ledger.filter(r => r.source === 'ladder').reduce((a, r) => a + r.xp, 0)).toBe(750);
  expect(at5.achievements.some(a => a.id === 'ladder_master')).toBe(true);
  expect(replay(evs, at('2027-02-09')).ladders[0]).toMatchObject({ step: 4, status: 'active' });
});
test('лестницы: мусор не бросает, поздний пакет не меняет закрытый день, правка ступеней — со следующего окна', () => {
  const junk = [ev({ type: 'ladder_created', ladderId: 'x', title: '', kind: 'do', skill: 'reading', steps: LADDER_PRESETS.read.steps, ts: at('2026-12-01', 9) }),
    ev({ type: 'ladder_created', ladderId: 'y', title: 'Y', kind: 'maybe', skill: 'reading', steps: LADDER_PRESETS.read.steps, ts: at('2026-12-01', 9) }),
    ev({ type: 'ladder_created', ladderId: 'z', title: 'Z', kind: 'do', skill: 'flying', steps: LADDER_PRESETS.read.steps, ts: at('2026-12-01', 9) }),
    ev({ type: 'ladder_created', ladderId: 'old', title: 'O', kind: 'do', skill: 'reading', steps: LADDER_PRESETS.read.steps, ts: 5 }),
    ev({ type: 'ritual_done', ladderId: 'nope', date: '2026-12-01', ts: at('2026-12-01', 10) }),
    ev({ type: 'ladder_updated', ladderId: 'l1', steps: 'x' }), ev({ type: 'ladder_removed', ladderId: 42 })];
  expect(() => replay([onboard, ladder(), ...junk], at('2026-12-03'))).not.toThrow();
  expect(replay([onboard, ladder(), ...junk], at('2026-12-03')).ladders.map(l => l.id)).toEqual(['l1']);
  const walk = ladder('w', { title: 'Прогулка', skill: 'cardio', steps: LADDER_PRESETS.walk.steps });
  const late = ev({ type: 'health_packet', date: '2026-12-02', kind: 'other', health: { steps: 6000 }, calendar: [], ts: at('2026-12-04', 18), deviceId: 'shortcuts' });
  expect(replay([onboard, walk, late], at('2026-12-05')).ledger.filter(r => r.source === 'ritual')).toHaveLength(0);
  const harder = LADDER_PRESETS.read.steps.map(s => ({ ...s, per7: 7 as const, label: 'каждый день' }));
  const upd = ev({ type: 'ladder_updated', ladderId: 'l1', steps: harder, title: 'Книги', ts: at('2026-12-03', 9) });
  const s = replay([onboard, ladder(), upd, ...rits(['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-08', '2026-12-10'])], at('2026-12-15'));
  expect(s.ladders[0]).toMatchObject({ title: 'Книги', step: 2, label: 'каждый день' });
});

test('лестница отдаёт autoLe и ступени (последняя правка)', () => {
  const soc = ladder('s', { title: 'Соцсети', kind: 'dont', skill: 'habits', steps: LADDER_PRESETS.social.steps });
  const sw = ladder('w', { title: 'Сладкое', kind: 'dont', skill: 'habits', steps: LADDER_PRESETS.sweets.steps });
  const harder = LADDER_PRESETS.read.steps.map(s => ({ ...s, label: 'моё' }));
  const s = replay([onboard, soc, sw, ladder(), ev({ type: 'ladder_updated', ladderId: 'l1', steps: harder, ts: at('2026-12-02', 9) })], at('2026-12-03'));
  const by = (id: string) => s.ladders.find(l => l.id === id)!;
  expect(by('s').autoLe).toBe(true);
  expect(by('w').autoLe).toBe(false);
  expect(by('l1').autoLe).toBe(false);
  expect(by('l1').steps.map(x => x.label)).toEqual(Array(5).fill('моё'));
  expect(by('w').steps).toEqual(LADDER_PRESETS.sweets.steps);
});
test('день только с ритуалами — активность: без «Ослабления» у первых заданий', () => {
  const s = replay([onboard, ladder(), ...rits(['2026-12-01', '2026-12-02', '2026-12-03']),
    issue('2026-12-04', [nq('a', '2026-12-04', 'E', ['strength'])]), done('2026-12-04', 'a')], at('2026-12-05'));
  expect(s.ledger.find(r => r.source === 'quest')!.penalty).toBe(0);
});
test('очередь: снятая в день продвижения лестница не занимает слот', () => {
  const ls = ['l1', 'l2', 'l3', 'l4', 'l5'].map(id => ladder(id));
  const rm = (id: string, d: string) => ev({ type: 'ladder_removed', ladderId: id, ts: at(d, 10) });
  const s = replay([onboard, ...ls, rm('l1', '2026-12-05'), rm('l4', '2026-12-06')], at('2026-12-07'));
  expect(s.ladders.map(l => [l.id, l.status, l.windowStart])).toEqual([['l2', 'active', '2026-12-01'], ['l3', 'active', '2026-12-01'], ['l5', 'active', '2026-12-06']]);
});
test('per7 = 7 «по рабочим»: ритуал в выходной не засчитывается в окно', () => {
  const daily = LADDER_PRESETS.read.steps.map(s => ({ ...s, per7: 7 as const }));
  const s = replay([onboard, ladder('l1', { steps: daily, suitable: 'workdays' }), startDay('2026-12-01', { dayType: DT[2] }), rit('2026-12-01')], at('2026-12-02'));
  expect(s.ladders[0]).toMatchObject({ windowDays: 1, done: 0, required: 13 });
});

// ---- Этап 4: Враг-тень ----
const facet = (id = 'f1', start = 50, kind = 'custom', date = '2026-12-01') => ev({ type: 'facet_added', facetId: id, name: 'Сладкое', kind, start, ts: at(date, 9) });
const relapse = (date: string, id = 'f1', ts = at(date, 21)) => ev({ type: 'shadow_relapse', facetId: id, date, ts });

test('сила по дням и честная отметка +5 XP в «Контроль привычек»', () => {
  const s = replay([onboard, facet(), relapse('2026-12-07'), relapse('2026-12-07', 'f1', at('2026-12-07', 22))], at('2026-12-15'));
  expect(s.shadow.facets[0]).toMatchObject({ strength: 27, cleanRun: 7, banished: false });
  expect(s.shadow.strength).toBe(27);
  expect(s.ledger.filter(r => r.source === 'shadow')).toMatchObject([{ xp: 5, date: '2026-12-07', skills: [['habits', 5]] }]);
});
test('срыв за вчера и после закрытия — игнор; 4-я грань и start 90 — игнор', () => {
  const s = replay([onboard, facet(), relapse('2026-12-02', 'f1', at('2026-12-03', 10)), facet('f2', 90), facet('f3'), facet('f4'), facet('f5')], at('2026-12-04'));
  expect(s.ledger.some(r => r.source === 'shadow')).toBe(false);
  expect(s.shadow.facets.map(f => f.id)).toEqual(['f1', 'f3', 'f4']);
});
test('Усталость +5 за срыв вчера [S§3]', () => {
  const sleep5 = (d: string) => ev({ type: 'health_packet', date: d, kind: 'morning', health: { sleepHours: 5 }, calendar: [], ts: at(d, 8), deviceId: 'shortcuts' });
  const base = [onboard, facet(), issue('2026-12-01', [nq('a', '2026-12-01', 'E', ['strength'])]), sleep5('2026-12-07'), sleep5('2026-12-08')];
  expect(replay(base, at('2026-12-08')).today.vitals.fatigue).toBe(20);
  expect(replay([...base, relapse('2026-12-07')], at('2026-12-08')).today.vitals.fatigue).toBe(25);
});
test('битва 27 декабря: сила 0 → 400 XP и редкий трофей; изгнание на 30-й день', () => {
  const evs = [onboard, facet('f1', 30)];
  const s = replay(evs, at('2026-12-28'));
  expect(s.shadow.lastBattle).toMatchObject({ date: '2026-12-27', strength: 0, result: 'crush', xp: 400 });
  expect(s.ledger.find(r => r.id.startsWith('battle:'))).toMatchObject({ xp: 400, source: 'shadow', date: '2026-12-27' });
  expect(s.trophies).toMatchObject([{ kind: 'rare', date: '2026-12-27' }]);
  expect(replay(evs, at('2026-12-30')).shadow.facets[0].banished).toBe(false);   // закрыто 29 дней
  const t = replay(evs, at('2026-12-31'));
  expect(t.shadow.facets[0].banished).toBe(true); expect(t.shadow.strength).toBeNull();
  expect(t.achievements.some(a => a.id === 'banish')).toBe(true);
});
test('битва в день отдыха проходит; без граней битвы нет', () => {
  const rest = startDay('2026-12-27', { dayType: DT[3] });
  // старт 60 c 20 декабря: 8 чистых дней → 60 − 16 − 5 = 39
  expect(replay([onboard, facet('f1', 60, 'custom', '2026-12-20'), rest], at('2026-12-28')).shadow.lastBattle).toMatchObject({ strength: 39, result: 'win', xp: 250 });
  expect(replay([onboard], at('2026-12-28')).shadow.lastBattle).toBeNull();
});
test('срыв по данным: соцсети 150 мин при живом источнике — +8 без XP', () => {
  const sig = (h: number, m: number, state: string) => ev({ type: 'signal_logged', at: at('2026-12-02', h, m), signal: { kind: 'app', app: 'social', state }, ts: at('2026-12-02', h, m), deviceId: 'shortcuts' });
  const s = replay([onboard, facet('f1', 50, 'social'), sig(10, 0, 'open'), sig(12, 30, 'close')], at('2026-12-03'));
  expect(s.shadow.facets[0].strength).toBe(50 - 2 + 8);
  expect(s.ledger.some(r => r.source === 'shadow')).toBe(false);
});
test('Тень: серьёзная грань не добавляется, ничья даёт план, снятие, мусор не бросает, поздняя отметка не меняет битву', () => {
  const alco = ev({ type: 'facet_added', facetId: 'a', name: 'Пиво', kind: 'alcohol', start: 65, ts: at('2026-12-01', 9) });
  const bet = ev({ type: 'facet_added', facetId: 'b', name: 'Ставки', kind: 'custom', start: 30, ts: at('2026-12-01', 9) });
  expect(replay([onboard, alco, bet], at('2026-12-03')).shadow).toMatchObject({ facets: [], strength: null, nextBattle: '2026-12-27' });
  const draw = replay([onboard, facet('f1', 80, 'custom', '2026-12-20')], at('2026-12-28')).shadow;
  expect(draw.lastBattle).toMatchObject({ result: 'draw', xp: 50 }); expect(draw.lastBattle!.plan).toContain('Сладкое');
  expect(draw.nextBattle).toBe('2027-01-31');
  const rm = ev({ type: 'facet_removed', facetId: 'f1', ts: at('2026-12-03', 8) });
  expect(replay([onboard, facet(), rm, facet('f2', 50, 'custom', '2026-12-03')], at('2026-12-04')).shadow.facets.map(f => f.id)).toEqual(['f2']);
  const junk = [ev({ type: 'facet_added', facetId: 7, name: 'x', kind: 'custom', start: 50 }), ev({ type: 'facet_added', facetId: 'j', name: '', kind: 'custom', start: 50 }),
    ev({ type: 'facet_added', facetId: 'k', name: 'K', kind: 'evil', start: 50 }), ev({ type: 'facet_added', facetId: 'm', name: 'M', kind: 'custom', start: 50.5 }),
    ev({ type: 'shadow_relapse', facetId: 'nope', date: '2026-12-02' }), ev({ type: 'shadow_relapse', facetId: 'f1', date: 'x' }), ev({ type: 'facet_removed', facetId: null })];
  expect(() => replay([onboard, facet(), ...junk], at('2026-12-03'))).not.toThrow();
  expect(replay([onboard, facet(), ...junk], at('2026-12-03')).shadow.facets.map(f => f.id)).toEqual(['f1']);
  const evs = [onboard, facet('f1', 30)];
  expect(replay([...evs, relapse('2026-12-27', 'f1', at('2026-12-28', 10))], at('2027-01-05')).shadow.lastBattle).toEqual(replay(evs, at('2027-01-05')).shadow.lastBattle);
});

test('Тень, правки: XP битвы не «большой день»; отметка до снятия сохраняет XP; изгнание в день битвы не отменяет битву; «Пиво» 80 — не грань', () => {
  const work = doneDays('2026-12-13', 15, 'strength');
  expect(replay([onboard, facet('f1', 30), ...work], at('2026-12-28')).today.vitals.fatigue).toBe(replay([onboard, ...work], at('2026-12-28')).today.vitals.fatigue);
  const rm = ev({ type: 'facet_removed', facetId: 'f1', ts: at('2026-12-03', 22) });
  const kept = replay([onboard, facet(), relapse('2026-12-03', 'f1', at('2026-12-03', 10)), rm], at('2026-12-04'));
  expect(kept.ledger.filter(r => r.source === 'shadow')).toMatchObject([{ xp: 5, date: '2026-12-03' }]);
  expect(kept.shadow.facets).toEqual([]);
  // старт 30 с 28 ноября: 30-й чистый день — 27 декабря, день битвы
  const b = replay([onboard, facet('f1', 30, 'custom', '2026-11-28')], at('2026-12-28'));
  expect(b.shadow.facets[0].banished).toBe(true);
  expect(b.shadow.lastBattle).toMatchObject({ date: '2026-12-27', strength: 0, result: 'crush', xp: 400 });
  const beer = ev({ type: 'facet_added', facetId: 'p', name: 'Пиво', kind: 'custom', start: 80, ts: at('2026-12-01', 9) });
  expect(replay([onboard, beer], at('2026-12-02')).shadow.facets).toEqual([]);
});

// ---- Игровой слой: сезонный босс, части, цепочка ----
const draft = { title: 'Прочитать 3 книги', skill: 'reading', parts: [0, 1, 2].map(i => ({ title: `Часть ${i + 1}`, steps: ['Шаг А', 'Шаг Б'] })) };
const setBoss = (ts = at('2026-12-02', 10), seasonId = 'winter-2026') => ev({ type: 'season_boss_set', seasonId, boss: draft, ts });
const bq = (id: string, d: string, part: number, step: number) => nq(id, d, 'C', ['reading'], { kind: 'boss', link: { kind: 'boss', season: 'winter-2026', part, step } as Quest['link'] });
const hit = (id: string, d: string) => nq(id, d, 'E', ['reading']);
test('урон части: шаги 80, удары 4; победа части +300', () => {
  const d3 = '2026-12-03', d4 = '2026-12-04';
  const evs = [onboard, setBoss(),
    issue(d3, [bq('s0', d3, 0, 0), hit('h1', d3), hit('h2', d3)]), done(d3, 's0'), done(d3, 'h1'), done(d3, 'h2')];
  const s = replay(evs, at(d4, 7));
  expect(s.seasonBoss!.parts[0]).toMatchObject({ hp: 52, hits: 2, status: 'active', steps: [{ done: true }, { done: false }] });
  expect(s.genInputs.bossStep).toMatchObject({ title: 'Шаг Б', link: { part: 0, step: 1 } });
  const t = replay([...evs, issue(d4, [bq('s1', d4, 0, 1), hit('h3', d4), hit('h4', d4), hit('h5', d4), hit('h6', d4)]),
    ...['s1', 'h3', 'h4', 'h5', 'h6'].map(id => done(d4, id))], at('2026-12-05'));
  expect(t.seasonBoss!.parts[0]).toMatchObject({ hp: 0, hits: 5, status: 'defeated' });
  expect(t.ledger.filter(r => r.source === 'boss')).toMatchObject([{ xp: 300, date: d4, stats: { int: 300 } }]);
  expect(t.genInputs.bossStep).toBeNull();   // часть 2 начнётся 1 января
});
test('свои задания не бьют; чужой link — обычное задание; переброс шага отклонён', () => {
  const d = '2026-12-03';
  const s = replay([onboard, setBoss(),
    ev({ type: 'custom_quest_added', date: d, quest: { ...hit('c1', d), kind: 'custom' }, ts: at(d, 9) }), done(d, 'c1'),
    issue(d, [bq('x', d, 0, 1), bq('s0', d, 0, 0)]), done(d, 'x'),
    ev({ type: 'quest_rerolled', date: d, questId: 's0', replacement: hit('r', d), ts: at(d, 10) })], at(d, 23));
  expect(s.seasonBoss!.parts[0]).toMatchObject({ hits: 0, hp: 100 });
  expect(s.ledger.some(r => r.questId === 'x')).toBe(true);
  expect(s.today.quests.map(q => q.id)).toEqual(['x', 's0', 'c1']);   // s0 не заменён
});
test('сезонная победа +1 500 и легендарный трофей один раз', () => {
  const win = (part: number, d1: string) => { const d2 = addDays(d1, 1); return [
    issue(d1, [bq(`a${part}`, d1, part, 0), ...[1, 2, 3, 4, 5].map(i => hit(`h${part}${i}`, d1))]), done(d1, `a${part}`), ...[1, 2, 3, 4, 5].map(i => done(d1, `h${part}${i}`)),
    issue(d2, [bq(`b${part}`, d2, part, 1)]), done(d2, `b${part}`)]; };
  const evs = [onboard, setBoss(), ...win(0, '2026-12-03'), ...win(1, '2027-01-05'), ...win(2, '2027-02-02')];
  const s = replay([...evs, setBoss(at('2027-02-10', 10))], at('2027-02-11'));
  expect(s.seasonBoss!.defeated).toBe(true);
  expect(s.ledger.filter(r => r.source === 'boss').map(r => r.xp)).toEqual([300, 300, 300, 1500]);
  expect(s.trophies).toMatchObject([{ kind: 'legendary', date: '2027-02-03' }]);
  expect(s.achievements.some(a => a.id === 'season_boss')).toBe(true);
});
test('цепочка: одна активная, шаги по порядку, +200 по завершении', () => {
  const cq = (id: string, d: string, step: number) => nq(id, d, 'D', ['tech'], { kind: 'chain', link: { kind: 'chain', chainId: 'c1', step } });
  const start = (id: string) => ev({ type: 'chain_started', chainId: id, title: 'Хобби-проект', skill: 'tech', steps: ['Идеи', 'Проба', 'Результат'], ts: at('2026-12-02', 9) });
  const evs = [onboard, start('c1'), start('c2'),
    ...['2026-12-03', '2026-12-04', '2026-12-05'].flatMap((d, i) => [issue(d, [cq(`c${i}`, d, i)]), done(d, `c${i}`)])];
  const s = replay(evs, at('2026-12-06'));
  expect(s.chain).toBeNull(); expect(s.chainsDone).toBe(1);
  expect(s.ledger.find(r => r.source === 'chain')).toMatchObject({ xp: 200, date: '2026-12-05', stats: { int: 200 } });
});
test('легаси-босс остаётся в bossStats и вариантах', () => {
  const s = replay([onboard, ev({ type: 'boss_created', bossId: 'b1', title: 'Старая цель', stat: 'fin', stages: ['a', 'b'] })], at('2026-12-02'));
  expect(s.genInputs.bossStats).toEqual(['fin']);
  expect(s.bossOptions[0].title).toBe('Старая цель');
});
test('шаг босса: мусорный link → daily; шаг в правиле 60% как любое задание; сдача и новый выбор не платят дважды', () => {
  const d = '2026-12-03';
  expect(normQuest({ ...bq('j', d, 0, 0), link: { kind: 'chain', chainId: 'c', step: 0 } }, d)).toMatchObject({ kind: 'daily' });
  expect(normQuest({ ...bq('j', d, 0, 0), link: { kind: 'boss', season: 'w', part: 3, step: 0 } }, d)!.link).toBeUndefined();
  const s = replay([onboard, setBoss(), issue(d, [bq('s0', d, 0, 0), hit('h1', d)]), done(d, 'h1')], at('2026-12-04'));
  expect(s.history[0]).toMatchObject({ counted: false });   // 1 из 2: несделанный шаг в знаменателе
  // [шаг, d1, d2, d3]: шаг + d1 = 2/4 = 50% → не засчитан, как любые 2 из 4; без шага все 3 — не идеальный день
  const four = (ids: string[]) => replay([onboard, setBoss(), issue(d, [bq('s0', d, 0, 0), ...['d1', 'd2', 'd3'].map(id => hit(id, d))]),
    ...ids.map(id => done(d, id))], at('2026-12-04')).history[0];
  expect(four(['s0', 'd1'])).toMatchObject({ counted: false });
  expect(four(['d1', 'd2'])).toMatchObject({ counted: false });
  expect(four(['d1', 'd2', 'd3'])).toMatchObject({ counted: true, perfect: false });
  expect(normQuest({ ...bq('j', d, 0, 0), link: { kind: 'boss', season: 'w', part: 0, step: 5 } }, d)).toMatchObject({ kind: 'daily' });
  expect(normQuest(nq('k', d, 'D', ['tech'], { kind: 'chain', link: { kind: 'chain', chainId: 'c', step: 5 } }), d)!.link).toMatchObject({ step: 5 });
  const win = [issue(d, [bq('a', d, 0, 0), ...[1, 2, 3, 4, 5].map(i => hit(`h${i}`, d))]), done(d, 'a'), ...[1, 2, 3, 4, 5].map(i => done(d, `h${i}`)),
    issue('2026-12-04', [bq('b', '2026-12-04', 0, 1)]), done('2026-12-04', 'b')];
  const t = replay([onboard, setBoss(), ...win, ev({ type: 'season_boss_abandoned', seasonId: 'winter-2026', ts: at('2026-12-05', 9) }), setBoss(at('2026-12-05', 10)),
    ...win.map(e => ({ ...e, id: `${e.id}x`, ts: e.ts + 3 * 864e5, ...('date' in e ? { date: addDays((e as any).date, 3) } : {}),
      ...((e as any).quests ? { quests: (e as any).quests.map((x: Quest) => ({ ...x, id: `${x.id}x`, date: addDays(x.date, 3) })) } : {}),
      ...((e as any).questId ? { questId: `${(e as any).questId}x` } : {}) }) as GameEvent)], at('2026-12-09'));
  expect(t.seasonBoss!.parts[0].status).toBe('defeated');
  expect(t.ledger.filter(r => r.source === 'boss').map(r => r.xp)).toEqual([300]);
});

test('калибровка шаблонов с 23.11: по воскресеньям ×1,1 / ×0,85, две недели < 40% — шаблон отдыхает', () => {
  const days = Array.from({ length: 14 }, (_, i) => addDays('2026-11-23', i));
  const evs = [onboard, ...days.flatMap((d, i) => [
    issue(d, [nq(`p${i}`, d, 'E', ['strength'], { templateId: 'pushups' }), nq(`r${i}`, d, 'E', ['reading'], { templateId: 'read' })]),
    done(d, `p${i}`)])];
  const s = replay(evs, at('2026-12-07'));
  expect(s.calibration.mult.pushups).toBeCloseTo(1.21, 6);
  expect(s.calibration.mult.read).toBeCloseTo(0.7225, 6);
  expect(s.calibration.rest).toEqual(['read']);
  expect(s.calibration.promoted).toEqual([]);
  const before = replay(evs, at('2026-11-29'));   // воскресенье ещё не закрыто
  expect(before.calibration.mult).toEqual({});
});
