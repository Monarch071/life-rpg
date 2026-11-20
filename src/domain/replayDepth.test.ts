import { expect, test } from 'vitest';
import { BALANCE } from './balance';
import { addDays, weekStart } from './day';
import { LADDER_PRESETS } from './ladder';
import { replay } from './replay';
import type { SkillId } from './skillCatalog';
import type { GameEvent, Profile, Quest, Rank, Stat } from './types';

// Все даты — от BALANCE.depthSince (её поставят датой релиза): тесты не зависят от календаря.
const D0 = BALANCE.depthSince;
const PE = BALANCE.season.prologueEnd;
/** Первая дата ≥ depthSince вне Пролога (лига и путь сезона в Прологе не идут). */
const BASE = D0 > PE ? D0 : addDays(PE, 1);
/** Понедельник первой полной недели после BASE. */
const MON = weekStart(addDays(BASE, 7));
const nextFirst = (d: string) => `${addDays(`${d.slice(0, 7)}-28`, 4).slice(0, 7)}-01`;
const at = (date: string, h = 12, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent =>
  ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? D0), deviceId: 'd1', ...e }) as unknown as GameEvent;
const nq = (id: string, date: string, rank: Rank, skills: SkillId[], extra: Partial<Quest> = {}): Quest =>
  ({ id, date, title: id, stat: 'str', minutes: 10, window: null, xp: 0, auto: null, templateId: `t-${id}`, rank, skills, kind: 'daily', ...extra } as Quest);
const issue = (date: string, quests: Quest[], h = 8) => ev({ type: 'quests_issued', date, quests, ts: at(date, h) });
const done = (date: string, questId: string, ts = at(date, 20)) => ev({ type: 'quest_completed', date, questId, ts });
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const doneDays = (from: string, n: number, skill: SkillId, rank: Rank = 'E') =>
  span(from, n).flatMap(d => [issue(d, [nq(`${skill}${d}`, d, rank, [skill])]), done(d, `${skill}${d}`)]);
const STATS: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];
/** Профиль онбординга: у пары 9, у остальных 5. */
const rating = (a: Stat, b: Stat) => Object.fromEntries(STATS.map(s => [s, s === a || s === b ? 9 : 5])) as Record<Stat, number>;
const onb = (selfRating: Record<Stat, number>) => ev({ type: 'onboarding_completed', id: 'onb', ts: at(addDays(D0, -120), 7), profile: {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating } as Profile });
const ladder = (id: string, skill: SkillId, date: string, h = 7) =>
  ev({ type: 'ladder_created', ladderId: id, title: 'Лестница', kind: 'do', skill, steps: LADDER_PRESETS.read.steps, ts: at(date, h) });
const rit = (id: string, date: string, h = 8) => ev({ type: 'ritual_done', ladderId: id, date, ts: at(date, h) });

test('класс по онбордингу: Сила и Интеллект → Воин с первого дня; пересчёт 1-го', () => {
  const s = replay([onb(rating('str', 'int')), issue(MON, [nq('a', MON, 'E', ['strength'])])], at(MON, 22));
  expect(s.cls).toMatchObject({ id: 'warrior', name: 'Воин', pair: ['str', 'int'], since: MON, nextRecalc: nextFirst(MON) });
  expect(s.className).toBe('Воин');
});
const rustBase = [onb(rating('str', 'int')), issue(addDays(MON, -31), [nq('a', addDays(MON, -31), 'E', ['strength'])]), done(addDays(MON, -31), 'a')];
test('ржавчина: 30 дней простоя → +0,5 первому заданию, снята', () => {
  const evs = [...rustBase, issue(MON, [nq('b', MON, 'E', ['strength']), nq('c', MON, 'E', ['strength'])])];
  expect(replay(evs, at(MON, 9)).skills.strength).toMatchObject({ idleDays: 30, rusty: true });
  const s = replay([...evs, done(MON, 'b', at(MON, 18)), done(MON, 'c', at(MON, 19))], at(MON, 22));
  expect(s.ledger.find(r => r.questId === 'b')!.bonus).toBe(0.5);   // форма 0 → пассив 0; ржавчина +0,5
  expect(s.ledger.find(r => r.questId === 'c')!.bonus).toBe(0);
  expect(s.skills.strength).toMatchObject({ rusty: false, lastDate: MON });
});
test('ритуал раньше задания в тот же день снимает ржавчину без бонуса [§3.3]', () => {
  const evs = [...rustBase, ladder('l', 'strength', MON), issue(MON, [nq('b', MON, 'E', ['strength'])]), done(MON, 'b', at(MON, 18))];
  const s = replay([...evs, rit('l', MON, 8)], at(MON, 22));
  expect(s.ledger.find(r => r.questId === 'b')!.bonus).toBe(0);
  expect(s.skills.strength).toMatchObject({ rusty: false, lastDate: MON });
  // ритуал позже задания — бонус у задания
  expect(replay([...evs, rit('l', MON, 19)], at(MON, 22)).ledger.find(r => r.questId === 'b')!.bonus).toBe(0.5);
});
test('ритуал лестницы — практика: lastDate и простой от него', () => {
  const s = replay([onb(rating('str', 'int')), ladder('l', 'strength', addDays(MON, -2)), rit('l', addDays(MON, -2))], at(MON, 12));
  expect(s.ledger.filter(r => r.source === 'ritual').map(r => r.date)).toEqual([addDays(MON, -2)]);
  expect(s.skills.strength).toMatchObject({ lastDate: addDays(MON, -2), idleDays: 1, rusty: false });
});
test('дни восстановления не считаются в простой', () => {
  const s = replay([...rustBase,
    ev({ type: 'recovery_started', date: addDays(MON, -20), quests: 0, ts: at(addDays(MON, -20), 9) }),
    ev({ type: 'recovery_ended', date: addDays(MON, -17), ts: at(addDays(MON, -17), 9) })], at(MON, 9));
  expect(s.skills.strength).toMatchObject({ idleDays: 27, rusty: false });
});
test('до depthSince без пассива; с depthSince пассив Воина +0,1 на тренировке', () => {
  const one = (d: string) => replay([onb(rating('str', 'int')), issue(d, [nq('a', d, 'C', ['strength'])]), done(d, 'a')], at(d, 22)).ledger.find(r => r.questId === 'a')!;
  const x = one(addDays(D0, -1)), y = one(D0);
  expect(Math.round((y.bonus - x.bonus) * 1e9) / 1e9).toBe(0.1);
  expect(y.xp).toBe(Math.round(70 * 0.7 * (1 + y.bonus)));   // новая форма: 70 × 0,7 × (1 + бонусы)
});
test('перки в состоянии: Силовые 3 открыт', () => {
  const s = replay([onb(rating('str', 'int')), ...doneDays(D0, 3, 'strength', 'S')], at(addDays(D0, 3)));
  expect(s.skills.strength.level).toBeGreaterThanOrEqual(3);
  expect(s.skills.strength.perks[0]).toMatchObject({ id: 'strength:3', level: 3, kind: 'pct' });
});
test('перк вполсилы при форме 40–79%', () => {
  // план первых 30 дней: у nq xp 0 → норма Силы = normMin; 3 дня S-силовых → уровень 3, затем 14 дней чтения и через день лёгкие силовые
  const F = addDays(D0, -20), rest = span(addDays(F, 3), 14);
  const s = replay([onb(rating('str', 'int')), ...doneDays(F, 3, 'strength', 'S'), ...rest.flatMap((d, i) => {
    const qs = [nq(`r${d}`, d, 'E', ['reading']), ...(i % 2 ? [] : [nq(`st${d}`, d, 'E', ['strength'])])];
    return [issue(d, qs), ...qs.map(q => done(d, q.id))];
  })], at(addDays(F, 17), 12));
  expect(s.statInfo.str.form).toBeGreaterThanOrEqual(0.4); expect(s.statInfo.str.form).toBeLessThan(0.8);
  expect(s.skills.strength.perks[0]).toMatchObject({ power: 0.5, why: 'form' });
});
test('потолок бонусов: ржавчина + пассив + перк + серия + тема → 1', () => {
  // серия 26 дней чтением; Силовые 3 за 3 дня до задания; Кардио ржавое (31 день); тема «Тело» на день задания
  const Q = addDays(BASE, 40), C = addDays(Q, -40);
  const s = replay([onb(rating('str', 'int')), ...doneDays(C, 1, 'cardio'), ...doneDays(addDays(Q, -26), 23, 'reading'),
    ...span(addDays(Q, -3), 3).flatMap(d => [issue(d, [nq(`r${d}`, d, 'E', ['reading']), nq(`s${d}`, d, 'S', ['strength'])]), done(d, `r${d}`), done(d, `s${d}`)]),
    ev({ type: 'season_theme_set', theme: 'body', ts: at(Q, 7) }), issue(Q, [nq('q', Q, 'E', ['strength', 'cardio'])]), done(Q, 'q')], at(Q, 22));
  expect(s.skills.cardio.rusty).toBe(false);
  const r = s.ledger.find(x => x.questId === 'q')!;
  expect(s.streak).toBeGreaterThanOrEqual(25);
  expect(r.bonus).toBe(1);
});
test('Торговец: золото +10% в полную силу', () => {
  const s = replay([onb(rating('cha', 'fin')), issue(D0, [nq('a', D0, 'C', ['negotiation'])]), done(D0, 'a')], at(D0, 22));
  expect(s.cls.id).toBe('merchant');
  const r = s.ledger.find(x => x.questId === 'a')!;
  expect(r.gold).toBe(Math.round(0.2 * r.xp * 1.1));
});
test('класс меняется только 1-го числа (гистерезис), история смены', () => {
  // Воин по онбордингу; месяц только Дух и Харизма — до 1-го класс прежний
  const S = nextFirst(D0), M1 = nextFirst(S), days: string[] = [];
  for (let d = S; d < M1; d = addDays(d, 1)) days.push(d);
  const evs = [onb(rating('str', 'int')), ...days.flatMap(d => [
    issue(d, [nq(`s${d}`, d, 'S', ['mindfulness']), nq(`c${d}`, d, 'S', ['negotiation'])]), done(d, `s${d}`), done(d, `c${d}`)])];
  expect(replay(evs, at(addDays(M1, -1), 22)).cls).toMatchObject({ id: 'warrior', since: S, changedFrom: null });
  expect(replay(evs, at(M1, 12)).cls).toMatchObject({ id: 'bard', pair: ['spi', 'cha'], since: M1,
    changedFrom: { id: 'warrior', date: M1 }, nextRecalc: nextFirst(M1), passive: { power: 1 } });
});
test('мусорный журнал не бросает', () => {
  expect(() => replay([onb(rating('str', 'int')), ev({ type: 'quests_issued', date: MON, quests: [null, { id: 1 }], ts: at(MON) })], at(addDays(MON, 1)))).not.toThrow();
  expect(replay([], at(MON)).cls.id).toBeTruthy();
});
