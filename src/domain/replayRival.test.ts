import { expect, test } from 'vitest';
import { BALANCE } from './balance';
import { seasonOf } from './calendar';
import { addDays } from './day';
import { reportInput, seasonInput, seasonReviewByRules } from './masterReport';
import { replay } from './replay';
import type { SkillId } from './skillCatalog';
import type { GameEvent, Profile, Quest, Rank, Stat } from './types';

const D0 = BALANCE.depthSince;
const at = (date: string, h = 12, m = 0) => { const [y, mo, d] = date.split('-').map(Number); return new Date(y, mo - 1, d, h, m).getTime(); };
let seq = 0;
type Draft = Record<string, unknown> & { type: string; ts?: number; id?: string; date?: string };
const ev = (e: Draft): GameEvent =>
  ({ id: e.id ?? `e${++seq}`, ts: e.ts ?? at(e.date ?? D0), deviceId: 'd1', ...e }) as unknown as GameEvent;
const nq = (id: string, date: string, rank: Rank, skills: SkillId[]): Quest =>
  ({ id, date, title: id, stat: 'str', minutes: 10, window: null, xp: 0, auto: null, templateId: `t-${id}`, rank, skills, kind: 'daily' } as Quest);
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const doneDays = (from: string, n: number, skill: SkillId, rank: Rank = 'E') =>
  span(from, n).flatMap(d => [ev({ type: 'quests_issued', date: d, quests: [nq(`${skill}${d}`, d, rank, [skill])], ts: at(d, 8) }),
    ev({ type: 'quest_completed', date: d, questId: `${skill}${d}`, ts: at(d, 20) })]);
const STATS: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];
const rating = (a: Stat, b: Stat) => Object.fromEntries(STATS.map(s => [s, s === a || s === b ? 9 : 5])) as Record<Stat, number>;
const onb = (selfRating: Record<Stat, number>) => ev({ type: 'onboarding_completed', id: 'onb', ts: at(addDays(D0, -120), 7), profile: {
  name: 'Т', wake: '08:00', sleep: '23:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 3, day: 3, evening: 3, night: 3 }, selfRating } as Profile });

test('первая награда призрака — неделя 4–10 января; строка одна', () => {
  const evs = [onb(rating('int', 'spi')), ...doneDays('2026-12-01', 41, 'reading', 'C')];   // 1 дек — 10 янв
  const s = replay(evs, at('2027-01-11', 12));
  expect(s.ledger.filter(r => r.source === 'ghost').map(r => r.id)).toEqual(['ghost:2027-01-04']);   // январь > декабря за счёт серии
  expect(s.ghost).toMatchObject({ available: true, weeksWon: 1 });
  expect(replay(evs, at('2026-12-20')).ghost.available).toBe(false);
});
test('рекорд шагов: первый без награды, побит — +100 один раз в день; флаг — не рекорд', () => {
  const steps = (date: string, n: number, h = 13) => ev({ type: 'health_packet', date, kind: 'other', health: { steps: n }, calendar: [], ts: at(date, h) });
  const d = '2027-01-05';
  const s = replay([onb(rating('end', 'str')), ...doneDays('2027-01-03', 4, 'cardio'), steps('2027-01-03', 9000), steps('2027-01-04', 9500),
    steps(d, 9600), steps(d, 9700, 18), steps('2027-01-06', 60000)], at('2027-01-07', 12));
  expect(s.ledger.filter(r => r.source === 'record').map(r => r.id)).toEqual(['record:steps_day:2027-01-04', `record:steps_day:${d}`]);
  expect(s.records.find(r => r.id === 'steps_day')).toMatchObject({ value: 9700, date: d, prev: 9500 });
});
test('рекорд: поздние данные закрытого дня не дают награду задним числом', () => {
  const d = '2027-01-05';
  const steps = (date: string, n: number, ts: number) => ev({ type: 'health_packet', date, kind: 'other', health: { steps: n }, calendar: [], ts });
  const s = replay([onb(rating('end', 'str')), ...doneDays('2027-01-03', 4, 'cardio'), steps('2027-01-03', 9000, at('2027-01-03', 13)),
    steps(d, 9999, at('2027-01-06', 13))], at('2027-01-07', 12));
  expect(s.ledger.filter(r => r.source === 'record')).toEqual([]);
});
test('рекорд серии — один раз за серию, после обрыва — снова', () => {
  // серия 1–10 дек (рекорд 10, до релиза наград не было бы — дата > rivalSince), пропуск, затем 25 дней
  const evs = [onb(rating('int', 'spi')), ...doneDays('2026-12-01', 10, 'reading'),
    ...span('2026-12-11', 3).map(d => ev({ type: 'quests_issued', date: d, quests: [nq(`miss${d}`, d, 'E', ['reading'])], ts: at(d, 8) })),
    ...doneDays('2026-12-14', 30, 'reading')];
  const s = replay(evs, at('2027-01-14', 12));
  expect(s.ledger.filter(r => r.id.startsWith('record:streak:'))).toHaveLength(1);
});
test('индекс роста: декабрь против базы 150, январь против декабря', () => {
  const s = replay([onb(rating('int', 'spi')), ...doneDays('2026-12-01', 62, 'reading', 'C')], at('2027-02-01', 12));
  expect(s.growth.months.map(m => [m.month, m.index !== null])).toEqual([['2027-01', true], ['2026-12', true]]);
  expect(s.growth.months[1].index).toBe(Math.round(100 * s.growth.months[1].xpPerDay / 150));
});
test('дни открытия — без событий Shortcuts; разбор сезона отдельно от отчётов недели', () => {
  const s = replay([ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at('2027-01-05'), ts: at('2027-01-05'), signal: { kind: 'focus', state: 'on' } }),
    ev({ type: 'checkin', date: '2027-01-06', went: '', notWent: '', energy: 5, ts: at('2027-01-06', 21) }),
    ev({ type: 'ai_report', weekStart: '2026-12-01', text: 'сезон', final: true, scope: 'season', ts: at('2027-03-01') })], at('2027-03-02'));   // weekStart — начало разобранного сезона
  expect(s.activity.opened).toEqual(['2027-01-06', '2027-03-01']);
  expect(s.reports).toEqual([]); expect(s.seasonReviews).toEqual([{ seasonId: seasonOf('2026-12-01').id, text: 'сезон' }]);
});
test('приватность: вход разбора сезона и недели без финансов', () => {
  const s = replay([onb(rating('fin', 'int')), ...doneDays('2026-12-01', 10, 'budget'),
    ev({ type: 'fin_entry_added', entryId: 'e', date: '2026-12-03', kind: 'expense', amount: 4321, categoryId: 'food', note: 'СекретнаяЗаметка' }),
    ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at('2026-12-04'), ts: at('2026-12-04'), signal: { kind: 'wallet', amount: 777, merchant: 'СекретМагазин' } })], at('2026-12-12'));
  for (const j of [JSON.stringify(seasonInput(s, s.season.id)), JSON.stringify(reportInput(s, '2026-12-07'))])
    for (const x of ['4321', '777', 'СекретнаяЗаметка', 'СекретМагазин', 'food', 'finance', 'budget:']) expect(j).not.toContain(x);
  expect(seasonReviewByRules(seasonInput(s, s.season.id))).toContain('Что взять в следующий сезон');
});
test('до rivalSince — без строк ghost/record', () => {
  const s = replay([onb(rating('int', 'spi')), ...doneDays(addDays(BALANCE.rivalSince, -40), 39, 'reading')], at(addDays(BALANCE.rivalSince, -1)));
  expect(s.ledger.filter(r => r.source === 'ghost' || r.source === 'record')).toEqual([]);
});
test('история аватара — каждая принятая картинка по ts', () => {
  const s = replay([ev({ type: 'avatar_image', tier: 1, blob: 'a-1', ts: at('2027-01-03') }), ev({ type: 'avatar_image', tier: 2, blob: 'BAD!', ts: at('2027-01-04') }),
    ev({ type: 'avatar_image', tier: 2, blob: 'b-2', ts: at('2027-01-05') })], at('2027-01-06'));
  expect(s.avatarHistory).toEqual([{ date: '2027-01-03', tier: 1, blob: 'a-1' }, { date: '2027-01-05', tier: 2, blob: 'b-2' }]);
});
// Ревью T4–5
const noRival = (s: ReturnType<typeof replay>, d: string) => s.ledger.filter(r => r.date === d && r.source !== 'ghost' && r.source !== 'record').reduce((a, r) => a + r.xp, 0);
test('week_xp и призрак недели — без строк ghost/record (нет обратной связи)', () => {
  const s = replay([onb(rating('int', 'spi')), ...doneDays('2026-12-01', 41, 'reading', 'C')], at('2027-01-11', 12));
  expect(s.ledger.some(r => r.source === 'ghost')).toBe(true);
  let best = 0;
  for (let ws = '2026-11-30'; addDays(ws, 6) < '2027-01-11'; ws = addDays(ws, 7)) best = Math.max(best, span(ws, 7).reduce((a, d) => a + noRival(s, d), 0));
  expect(s.records.find(r => r.id === 'week_xp')!.value).toBe(best);
});
test('индекс роста: месяц Пролога — не prev, база', () => {
  const s = replay([onb(rating('int', 'spi')), ...doneDays('2026-11-10', 52, 'reading', 'C')], at('2027-01-01', 12));
  const dec = s.growth.months.find(m => m.month === '2026-12')!;
  expect(dec.index).toBe(Math.round(100 * dec.xpPerDay / BALANCE.rival.growthBaseDayXp));
});
test('рост сезона в разборе — те же рабочие дни, что индекс роста (дни без выдачи тоже)', () => {
  const s = replay([onb(rating('int', 'spi')), ...doneDays('2026-12-01', 10, 'reading', 'C'), ...doneDays('2026-12-21', 11, 'reading', 'C')], at('2027-01-01', 12));
  const dec = s.growth.months.find(m => m.month === '2026-12')!;
  expect(dec.days).toBe(31);
  expect(seasonInput(s, seasonOf('2026-12-01').id).growth.xpPerDay).toBe(Math.round(dec.xpPerDay));
});
test('разбор сезона ИИ — только для закончившегося сезона', () => {
  const s = replay([ev({ type: 'ai_report', weekStart: '2026-12-01', text: 'рано', final: true, scope: 'season', ts: at('2027-01-10') })], at('2027-03-02'));
  expect(s.seasonReviews).toEqual([]);
});
