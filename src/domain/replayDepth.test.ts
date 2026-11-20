import { expect, test } from 'vitest';
import { addDays } from './day';
import { replay } from './replay';
import type { SkillId } from './skillCatalog';
import type { GameEvent, Profile, Quest, Rank, Stat } from './types';

const at = (date: string, h = 12, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent =>
  ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? '2026-12-16'), deviceId: 'd1', ...e }) as unknown as GameEvent;
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
const onb = (selfRating: Record<Stat, number>) => ev({ type: 'onboarding_completed', id: 'onb', ts: at('2026-11-10', 7), profile: {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating } as Profile });

test('класс по онбордингу: Сила и Интеллект → Воин с первого дня; пересчёт 1-го', () => {
  const s = replay([onb(rating('str', 'int')), issue('2026-12-21', [nq('a', '2026-12-21', 'E', ['strength'])])], at('2026-12-21', 22));
  expect(s.cls).toMatchObject({ id: 'warrior', name: 'Воин', pair: ['str', 'int'], since: '2026-12-21', nextRecalc: '2027-01-01' });
  expect(s.className).toBe('Воин');
});
test('ржавчина: 30 дней простоя → +0,5 первому заданию, снята', () => {
  const evs = [onb(rating('str', 'int')), issue('2026-11-20', [nq('a', '2026-11-20', 'E', ['strength'])]), done('2026-11-20', 'a'),
    issue('2026-12-21', [nq('b', '2026-12-21', 'E', ['strength']), nq('c', '2026-12-21', 'E', ['strength'])])];
  expect(replay(evs, at('2026-12-21', 9)).skills.strength).toMatchObject({ idleDays: 30, rusty: true });
  const s = replay([...evs, done('2026-12-21', 'b', at('2026-12-21', 18)), done('2026-12-21', 'c', at('2026-12-21', 19))], at('2026-12-21', 22));
  expect(s.ledger.find(r => r.questId === 'b')!.bonus).toBe(0.5);   // форма 0 → пассив 0; ржавчина +0,5
  expect(s.ledger.find(r => r.questId === 'c')!.bonus).toBe(0);
  expect(s.skills.strength).toMatchObject({ rusty: false, lastDate: '2026-12-21' });
});
test('дни восстановления не считаются в простой', () => {
  const s = replay([onb(rating('str', 'int')), issue('2026-11-20', [nq('a', '2026-11-20', 'E', ['strength'])]), done('2026-11-20', 'a'),
    ev({ type: 'recovery_started', date: '2026-12-01', quests: 0, ts: at('2026-12-01', 9) }), ev({ type: 'recovery_ended', date: '2026-12-04', ts: at('2026-12-04', 9) })], at('2026-12-21', 9));
  expect(s.skills.strength).toMatchObject({ idleDays: 27, rusty: false });
});
test('до depthSince XP прежний: задание 1 декабря без пассива', () => {
  const s = replay([onb(rating('str', 'int')), issue('2026-12-01', [nq('a', '2026-12-01', 'C', ['strength'])]), done('2026-12-01', 'a')], at('2026-12-02'));
  expect(s.ledger.find(r => r.questId === 'a')).toMatchObject({ bonus: 0, xp: 49 });
});
test('пассив Воина на тренировке после depthSince: +0,1 при новой форме', () => {
  const s = replay([onb(rating('str', 'int')), issue('2026-12-16', [nq('a', '2026-12-16', 'C', ['strength'])]), done('2026-12-16', 'a')], at('2026-12-16', 22));
  expect(s.ledger.find(r => r.questId === 'a')).toMatchObject({ bonus: 0.1, xp: 54 });   // 70 × 0,7 × 1,1
});
test('перки в состоянии: Силовые 3 открыт', () => {
  const s = replay([onb(rating('str', 'int')), ...doneDays('2026-12-16', 3, 'strength', 'S')], at('2026-12-19'));
  expect(s.skills.strength.level).toBeGreaterThanOrEqual(3);
  expect(s.skills.strength.perks[0]).toMatchObject({ id: 'strength:3', level: 3, kind: 'pct' });
});
test('Торговец: золото +10% в полную силу; ритуал снимает простой', () => {
  const s = replay([onb(rating('cha', 'fin')), issue('2026-12-16', [nq('a', '2026-12-16', 'C', ['negotiation'])]), done('2026-12-16', 'a')], at('2026-12-16', 22));
  expect(s.cls.id).toBe('merchant');
  const r = s.ledger.find(x => x.questId === 'a')!;
  expect(r.gold).toBe(Math.round(0.2 * r.xp * 1.1));
});
test('класс меняется только 1-го числа (гистерезис), история смены', () => {
  // Воин по онбордингу; месяц только Дух и Харизма — до 1-го класс прежний
  const evs = [onb(rating('str', 'int')), ...span('2026-12-16', 16).flatMap(d => [
    issue(d, [nq(`s${d}`, d, 'S', ['mindfulness']), nq(`c${d}`, d, 'S', ['negotiation'])]), done(d, `s${d}`), done(d, `c${d}`)])];
  expect(replay(evs, at('2026-12-31', 22)).cls).toMatchObject({ id: 'warrior', since: '2026-12-16', changedFrom: null });
  expect(replay(evs, at('2027-01-01', 12)).cls).toMatchObject({ id: 'bard', pair: ['spi', 'cha'], since: '2027-01-01',
    changedFrom: { id: 'warrior', date: '2027-01-01' }, nextRecalc: '2027-02-01', passive: { power: 1 } });
});
test('мусорный журнал не бросает', () => {
  expect(() => replay([onb(rating('str', 'int')), ev({ type: 'quests_issued', date: '2026-12-20', quests: [null, { id: 1 }], ts: at('2026-12-20') })], at('2026-12-21'))).not.toThrow();
  expect(replay([], at('2026-12-21')).cls.id).toBeTruthy();
});
