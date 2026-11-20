import { expect, test } from 'vitest';
import { BALANCE } from './balance';
import { addDays, weekStart } from './day';
import { replay } from './replay';
import type { SkillId } from './skillCatalog';
import type { AdvancedId, GameEvent, Profile, Quest, Rank, Stat } from './types';

// Фикстуры: профиль, стартовый уровень 20 из анализа анкеты, история заданий фокуса и успешное испытание.
const D0 = BALANCE.depthSince;
const at = (date: string, h = 12, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent => ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? D0), deviceId: 'd1', ...e }) as unknown as GameEvent;
const nq = (id: string, date: string, rank: Rank, skills: SkillId[], o: Partial<Quest> = {}): Quest =>
  ({ id, date, title: id, stat: 'str', minutes: 10, window: null, xp: 0, auto: null, templateId: `t-${id}`, rank, skills, kind: 'daily', ...o } as Quest);
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const issue = (d: string, quests: Quest[]) => ev({ type: 'quests_issued', date: d, quests, ts: at(d, 8) });
const done = (d: string, questId: string) => ev({ type: 'quest_completed', date: d, questId, ts: at(d, 20) });
const doneDays = (from: string, n: number, skill: SkillId, rank: Rank = 'E') =>
  span(from, n).flatMap(d => [issue(d, [nq(`${skill}${d}`, d, rank, [skill])]), done(d, `${skill}${d}`)]);
const STATS: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];
const lvl20 = (a: Stat, b: Stat): GameEvent[] => {
  const r = (hi: number, lo: number) => Object.fromEntries(STATS.map(s => [s, s === a || s === b ? hi : lo])) as Record<Stat, number>;
  return [ev({ type: 'onboarding_completed', id: 'onb', ts: at(addDays(D0, -120), 7), profile: {
    name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
    energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating: r(9, 5) } as Profile }),
  ev({ type: 'interview_completed', id: 'int', ts: at(addDays(D0, -120), 8), answers: {}, followups: [],
    analysis: { archetype: 'А', summary: 'с', strengths: [], weaknesses: [], focus: [], questGuidance: '', stats: r(30, 10), startLevel: 20 } })];
};
const trial = (d: string, classId: AdvancedId, h = 9) => ev({ type: 'advanced_trial_started', date: d, classId, ts: at(d, h) });
const steps = (d: string, n: number) => ev({ type: 'health_packet', date: d, kind: 'other', health: { steps: n }, calendar: [], ts: at(d, 13) });
const T0 = '2027-01-20';
/** Воин → Чемпион: испытание 20 янв — 2 фев, Чемпион с 3 февраля. */
const champion = (o: { stepsRecordOn?: string } = {}) => [...lvl20('str', 'end'), ...doneDays('2026-12-20', 46, 'strength', 'C'), trial(T0, 'champion'),
  ...(o.stepsRecordOn ? [steps(addDays(o.stepsRecordOn, -1), 8000), steps(o.stepsRecordOn, 9000)] : [])];
/** Торговец → Магнат; к 8 февраля 9:00 тратимого золота ровно gold (лишнее — покупкой награды). */
const magnate = (o: { gold: number }) => {
  const base = [...lvl20('cha', 'fin'), ...doneDays('2026-12-20', 46, 'earning', 'C'), trial(T0, 'magnate')];
  const extra = replay(base, at('2027-02-08', 8)).today.spendable - o.gold;
  return extra <= 0 ? base : [...base, ev({ type: 'reward_created', rewardId: 'r', title: 'лишнее', price: extra, ts: at('2027-02-08', 6) }),
    ev({ type: 'reward_purchased', rewardId: 'r', ts: at('2027-02-08', 7) })];
};
/** Паладин → Хранитель: испытание 5–18 янв; обрыв 19–28 янв (серия к 0), затем `streak` засчитанных дней по 7 февраля. */
const keeper = (o: { streak: number }) => [...lvl20('str', 'dis'), ...doneDays('2026-12-20', 30, 'routine', 'C'), trial('2027-01-05', 'keeper'),
  ...doneDays(addDays('2027-02-08', -o.streak), o.streak, 'routine')];

test('испытание Чемпиона: 14 дней → продвинутый со следующего дня до конца сезона', () => {
  const s = replay([...champion()], at('2027-02-04', 12));
  expect(s.cls.advanced).toMatchObject({ id: 'champion', since: '2027-02-03', until: '2027-02-28' });   // 14-й день — 2 февраля
  expect(s.cls.trial).toBeNull();
  expect(s.cls.id).toBe('warrior');   // 1 февраля, во время испытания, базовый не пересчитывался
});
test('чужой путь, до 15-го дня, повтор раньше 7 дней — игнор', () => {
  const s = replay([...lvl20('str', 'end'), ...doneDays('2027-01-10', 12, 'strength'), trial(T0, 'hermit'), trial(T0, 'champion', 10)], at(T0, 12));
  expect(s.cls.trial).toBeNull();   // первый день 10 янв → открыто с 24-го
  const ok = replay([...lvl20('str', 'end'), ...doneDays('2026-12-20', 32, 'strength'), trial(T0, 'hermit'), trial(T0, 'champion', 10)], at(T0, 12));
  expect(ok.cls.trial).toMatchObject({ classId: 'champion', start: T0, day: 0 });
  // отказ — как провал: повтор не раньше чем через 7 дней
  const ab = [...lvl20('str', 'end'), ...doneDays('2026-12-20', 40, 'strength'), trial(T0, 'champion'), ev({ type: 'advanced_trial_abandoned', date: '2027-01-22', ts: at('2027-01-22', 9) })];
  expect(replay([...ab, trial('2027-01-28', 'champion')], at('2027-01-28', 12)).cls.trial).toBeNull();
  expect(replay([...ab, trial('2027-01-29', 'champion')], at('2027-01-29', 12)).cls.trial).toMatchObject({ classId: 'champion' });
  expect(replay(ab, at('2027-01-28', 12)).cls.nextTrial).toBe('2027-01-29');
});
test('провал: мало засчитанных дней → нет продвинутого', () => {
  const s = replay([...lvl20('str', 'end'), ...doneDays('2026-12-20', 32, 'strength', 'C'), trial(T0, 'champion')], at('2027-02-04', 12));
  expect(s.cls.advanced).toBeNull(); expect(s.cls.trial).toBeNull(); expect(s.cls.nextTrial).toBe('2027-02-09');
});
test('«Рекорд» ×3 вне потолков; вторая способность — раз в неделю', () => {
  const d = '2027-02-08';
  const evs = [...champion(), issue(d, [nq('a', d, 'C', ['strength']), nq('b', d, 'C', ['strength'], { kind: 'restore' })]),
    ev({ type: 'ability_used', date: d, ability: 'record', questId: 'a', ts: at(d, 9) }),
    ev({ type: 'ability_used', date: d, ability: 'record', questId: 'b', ts: at(d, 10) }), done(d, 'a'), done(d, 'b')];
  const s = replay(evs, at(d, 22));
  expect(s.ledger.find(r => r.id === 'quest:a')!.mult).toBe(3);
  expect(s.ledger.find(r => r.id === 'quest:b')!.mult).toBe(2);   // второе применение за неделю отброшено
  expect(s.cls.advanced!.ability).toMatchObject({ id: 'record', usedOn: d, available: false });
});
test('«Инвестиция» без золота — игнор; с золотом — 450 через 7 дней при доле ≥ 70%', () => {
  const d = '2027-02-08';
  expect(replay([...magnate({ gold: 100 }), ev({ type: 'ability_used', date: d, ability: 'invest', ts: at(d, 9) })], at(d, 12)).cls.advanced!.ability.usedOn).toBeNull();
  const s = replay([...magnate({ gold: 400 }), ev({ type: 'ability_used', date: d, ability: 'invest', ts: at(d, 9) }), ...doneDays(d, 8, 'earning')], at('2027-02-16', 12));
  expect(s.ledger.find(r => r.id === `invest:${d}`)).toMatchObject({ gold: 450, xp: 0 });
});
test('«Стена» Хранителя: 3 дня пропуска не роняют серию', () => {
  const d = '2027-02-08';
  const miss = span(d, 3).map(x => issue(x, [nq(`q${x}`, x, 'E', ['routine'])]));
  expect(replay([...keeper({ streak: 10 }), ...miss], at('2027-02-11', 12)).streak).toBeLessThan(10);
  const s = replay([...keeper({ streak: 10 }), ev({ type: 'ability_used', date: d, ability: 'wall', ts: at(d, 9) }), ...miss], at('2027-02-11', 12));
  expect(s.streak).toBe(10);
});
test('Чемпион: рекорд +200', () => {
  expect(replay(champion({ stepsRecordOn: '2027-02-09' }), at('2027-02-10', 12)).ledger.find(r => r.id === 'record:steps_day:2027-02-09')!.xp).toBe(200);
});
test('мусорные события продвинутых классов не бросают и игнорируются', () => {
  const d = '2027-02-08';
  const junk = [ev({ type: 'advanced_trial_started', date: 'x', classId: 'champion' }), ev({ type: 'advanced_trial_started', date: T0, classId: '__proto__', ts: at(T0, 9) }),
    ev({ type: 'advanced_path_switched', date: d, classId: 7, ts: at(d, 9) }), ev({ type: 'ability_used', date: d, ability: 'vow', skill: 'nope', ts: at(d, 9) }),
    ev({ type: 'ability_used', date: d, ability: 'fast', facetId: {}, ts: at(d, 9) }), ev({ type: 'advanced_trial_abandoned', date: null as unknown as string })];
  expect(() => replay([...champion(), ...junk], at(d, 12))).not.toThrow();
  expect(replay([...champion(), ...junk], at(d, 12)).cls.advanced).toMatchObject({ id: 'champion' });
});
test('новый сезон: путь можно сменить в первые 7 дней без испытания', () => {
  const evs = [...champion(), ...doneDays('2027-02-04', 30, 'strength', 'C')];
  const sw = (d: string) => ev({ type: 'advanced_path_switched', date: d, classId: 'guard', ts: at(d, 9) });
  expect(replay([...evs, sw('2027-02-10')], at('2027-02-11', 12)).cls.advanced!.id).toBe('champion');   // не начало сезона
  const s = replay([...evs, sw('2027-03-03')], at('2027-03-04', 12));
  expect(s.cls.advanced).toMatchObject({ id: 'guard', until: '2027-05-31' });
});
test('«Обет» Крестоносца: 7 дней задания навыка → база ранга-потолка × 7; пропуск — ничего', () => {
  const d = '2027-02-08', base = [...lvl20('str', 'dis'), ...doneDays('2026-12-20', 46, 'routine', 'C'), trial(T0, 'crusader'),
    ev({ type: 'ability_used', date: d, ability: 'vow', skill: 'routine', ts: at(d, 9) })];
  const s = replay([...base, ...doneDays(d, 7, 'routine')], at('2027-02-15', 12));
  const row = s.ledger.find(r => r.id === `ability:vow:${d}`)!;
  expect(row.source).toBe('ability'); expect(Object.values(BALANCE.rank.base).map(b => b * 7)).toContain(row.xp);
  expect(replay([...base, ...doneDays(d, 6, 'routine')], at('2027-02-15', 12)).ledger.some(r => r.id === `ability:vow:${d}`)).toBe(false);
});
test('«Аудит» Казначея: задания Финансов дня ×2 строкой при закрытии', () => {
  const d = '2027-02-08';
  const s = replay([...lvl20('int', 'fin'), ...doneDays('2026-12-20', 46, 'budget', 'C'), trial(T0, 'treasurer'),
    issue(d, [nq('f', d, 'C', ['budget']), nq('r', d, 'C', ['reading'])]), ev({ type: 'ability_used', date: d, ability: 'audit', ts: at(d, 9) }), done(d, 'f'), done(d, 'r')], at('2027-02-09', 12));
  expect(s.cls.advanced!.id).toBe('treasurer');
  expect(s.ledger.find(r => r.id === `ability:audit:${d}`)!.xp).toBe(s.ledger.find(r => r.id === 'quest:f')!.xp);
});
test('nextTrial: ниже уровня 20 — null', () => {
  const onb = lvl20('str', 'end')[0] as unknown as { type: string; profile: Profile };
  const low = [ev({ ...onb, id: 'onb-low', profile: { ...onb.profile, selfRating: Object.fromEntries(STATS.map(x => [x, 1])) } }), ...doneDays('2026-12-20', 2, 'strength')];
  const s = replay(low, at('2027-01-28', 12));
  expect(s.level).toBeLessThan(BALANCE.advanced.level);
  expect(s.cls.nextTrial).toBeNull();
});
test('производительность: смешанный год — задания, шаги, финансы, импорты, соперник, испытание', () => {
  const evs: GameEvent[] = [...lvl20('str', 'end'), ev({ type: 'fin_category_set', categoryId: 'food', title: 'Еда', kind: 'expense', limit: 30000, ts: at('2026-11-01') }),
    ev({ type: 'fin_rule_set', ruleId: 'r', pattern: 'магазин 1', categoryId: 'food', ts: at('2026-11-01') }), trial(T0, 'champion')];
  const D = '2026-12-01';
  for (let i = 0; i < 365; i++) {
    const d = addDays(D, i), qs = [0, 1, 2, 3, 4].map(k => nq(`q${i}-${k}`, d, 'C', ['strength']));
    evs.push(issue(d, qs), ...qs.slice(0, 4).map(q => done(d, q.id)), steps(d, 6000 + i * 10),
      ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at(d, 13), ts: at(d, 13), signal: { kind: 'wallet', amount: 100 + i, merchant: 'Магазин 1' } }),
      ev({ type: 'fin_entry_added', entryId: `pm${i}`, date: d, kind: 'expense', amount: 50, categoryId: 'food', ts: at(d, 14) }));
    if (d === weekStart(d)) evs.push(ev({ type: 'weekly_issued', weekStart: d, ts: at(d, 8), quests: [{ id: `${d}:w:budget_week`, weekStart: d, kind: 'budget_week', stat: 'fin', target: 1, title: 'x', xp: 150 }] }));
  }
  for (let k = 0; k < 4; k++) evs.push(ev({ type: 'fin_imported', importId: `i${k}`, ts: at(addDays(D, 90 * k + 89)),
    rows: Array.from({ length: 1000 }, (_, j) => ({ key: `k${k}-${j}`, date: addDays(D, 90 * k + (j % 90)), amount: -(100 + j), text: 'магазин 1' })) }));
  const now = at(addDays(D, 365));
  const s = replay(evs, now);   // прогрев JIT
  expect(s.ledger.some(r => r.id.startsWith('record:') || r.id.startsWith('ghost:'))).toBe(true);
  const t = performance.now(); replay(evs, now);
  const ms = performance.now() - t;
  console.log(`mixed replay: ${Math.round(ms)} ms`);
  // ~350 мс на десктопе; порог с запасом под нагруженный CI
  expect(ms).toBeLessThan(1500);
});
