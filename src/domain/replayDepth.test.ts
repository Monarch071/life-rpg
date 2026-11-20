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

// ---- Способности (раз в неделю) ----
const T = addDays(MON, 1);   // вторник
const use = (date: string, ability: string, extra = {}, h = 10) => ev({ type: 'ability_used', date, ability, ts: at(date, h), ...extra });
const xpOf = (s: ReturnType<typeof replay>, id: string) => s.ledger.find(r => r.questId === id)!;
test('Рывок ×2 на тренировку; второй за неделю — игнор; в понедельник — снова', () => {
  const base = [onb(rating('str', 'int')), issue(T, [nq('a', T, 'C', ['strength'])]), done(T, 'a')];
  const x = xpOf(replay(base, at(T, 22)), 'a');
  const s1 = replay([...base, use(T, 'rush', { questId: 'a' })], at(T, 22)), y = xpOf(s1, 'a');
  expect(y.mult).toBe(2); expect(Math.abs(y.xp - 2 * x.xp)).toBeLessThanOrEqual(1);
  expect(s1.today.ability.rush).toBe('a');
  expect(s1.cls.ability).toMatchObject({ id: 'rush', usedOn: T, available: false });
  const W = addDays(T, 1), M2 = addDays(MON, 7);
  const wk = replay([...base, use(T, 'rush', { questId: 'a' }), issue(W, [nq('b', W, 'C', ['strength'])]),
    use(W, 'rush', { questId: 'b' }), done(W, 'b'), issue(M2, [nq('c', M2, 'C', ['strength'])]),
    use(M2, 'rush', { questId: 'c' }), done(M2, 'c')], at(M2, 22));
  expect(xpOf(wk, 'a').mult).toBe(2); expect(xpOf(wk, 'b').mult).toBe(1); expect(xpOf(wk, 'c').mult).toBe(2);
});
test('недоверенные способности отбрасываются', () => {
  const base = [onb(rating('str', 'int')), issue(T, [nq('a', T, 'C', ['reading'])])];
  const s = replay([...base, use(T, 'shield') /* не способность Воина */, use(T, 'rush', { questId: 'a' }) /* не тренировка */,
    use(MON, 'rush', { questId: 'a' }, 30) /* игровая дата ts — T, а date — MON */, use(addDays(D0, -6), 'rush', { questId: 'a' }),
    use(T, 'zzz'), use(T, 'rush', { questId: 'nope' }), use(T, 'rush'), ev({ type: 'ability_used', date: 5 as unknown as string, ability: null, ts: at(T) })], at(T, 12));
  expect(s.today.ability).toEqual({ rush: null, shield: false, inspire: false, march: false, freeRerolls: 0 });
  expect(s.cls.ability).toMatchObject({ usedOn: null, available: true });
});
test('Щит Паладина: пропуск не режет серию', () => {
  const evs = [onb(rating('str', 'dis')), ...doneDays(addDays(MON, -4), 4, 'reading'), issue(MON, [nq('a', MON, 'E', ['reading']), nq('b', MON, 'E', ['reading'])])];
  expect(replay(evs, at(MON, 22)).cls.id).toBe('paladin');
  expect(replay([...evs, use(MON, 'shield')], at(T, 12)).streak).toBe(4);
  expect(replay(evs, at(T, 12)).streak).toBe(2);
});
test('Вдохновение Барда: +0,2 к бонусам всех заданий дня', () => {
  const base = [onb(rating('cha', 'spi')), issue(T, [nq('a', T, 'C', ['cardio']), nq('b', T, 'E', ['strength'])]), done(T, 'a'), done(T, 'b')];
  const x = replay(base, at(T, 22)), y = replay([...base, use(T, 'inspire')], at(T, 22));
  expect(y.cls.id).toBe('bard'); expect(y.today.ability.inspire).toBe(true);
  for (const id of ['a', 'b']) expect(Math.round((xpOf(y, id).bonus - xpOf(x, id).bonus) * 1e9) / 1e9).toBe(0.2);
});
test('Марш: цель 8 000 шагов засчитана при 6 400', () => {
  const base = [onb(rating('end', 'spi')), issue(T, [nq('w', T, 'C', ['cardio'], { auto: { metric: 'steps', op: '>=', value: 8000 } })]),
    ev({ type: 'health_packet', date: T, kind: 'evening', health: { steps: 6400 }, calendar: [], ts: at(T, 20) })];
  expect(replay(base, at(T, 22)).today.quests[0]).toMatchObject({ done: false });
  const s = replay([...base, use(T, 'march')], at(T, 22));
  expect(s.cls.id).toBe('ranger');
  expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto' });
  expect(xpOf(s, 'w')).toMatchObject({ base: 70, k: 1, verified: true });
});
const goldDays = (n: number) => doneDays(addDays(T, -n), n, 'reading', 'S');
const swap = (date: string, i: number, h: number) =>
  ev({ type: 'quest_rerolled', date, questId: `q${i}`, replacement: nq(`r${i}`, date, 'E', ['reading'], { templateId: `tr${i}` }), ts: at(date, h) });
test('Сделка: 1 + 3 бесплатных переброса, 5-й платный 50', () => {
  const base = [onb(rating('cha', 'fin')), ...goldDays(3), issue(T, Array.from({ length: 5 }, (_, i) => nq(`q${i}`, T, 'E', ['budget']))), use(T, 'deal', {}, 9)];
  const s0 = replay(base, at(T, 22));
  expect(s0.cls.id).toBe('merchant'); expect(s0.today.ability.freeRerolls).toBe(3); expect(s0.today.spendable).toBeGreaterThanOrEqual(50);
  const s4 = replay([...base, ...[0, 1, 2, 3].map(i => swap(T, i, 10 + i))], at(T, 22));
  expect(s4.today).toMatchObject({ rerollsUsed: 4, spendable: s0.today.spendable, nextRerollCost: 50 });
  const s5 = replay([...base, ...[0, 1, 2, 3, 4].map(i => swap(T, i, 10 + i))], at(T, 22));
  expect(s5.today).toMatchObject({ rerollsUsed: 5, spendable: s0.today.spendable - 50 });
  // без «Сделки» второй переброс уже платный
  expect(replay([...base.slice(0, -1), swap(T, 0, 10)], at(T, 22)).today.nextRerollCost).toBe(50);
});
test('Прозрение: бесплатная замена вне счёта перебросов; выше потолка — игнор', () => {
  const base = [onb(rating('int', 'spi')), issue(T, [nq('a', T, 'E', ['reading']), nq('b', T, 'E', ['reflection']), nq('c', T, 'C', ['reflection'])])];
  const ins = (q: string, r: Quest, h = 10) => use(T, 'insight', { questId: q, replacement: r }, h);
  const s = replay([...base, ins('a', nq('a2', T, 'E', ['languages'], { templateId: 'tw' })), ins('b', nq('b2', T, 'E', ['languages'], { templateId: 'tz' }), 11)], at(T, 12));
  expect(s.cls.id).toBe('sage');
  expect(s.today.quests.map(q => q.id)).toEqual(['a2', 'b', 'c']);   // второе за неделю — игнор
  expect(s.today).toMatchObject({ rerollsUsed: 0, nextRerollCost: 0 });
  expect(s.cls.ability.available).toBe(false);
  const hi = replay([...base, ins('c', nq('c3', T, 'C', ['languages'], { templateId: 'tc' }))], at(T, 12));   // C при потолке E
  expect(hi.today.quests.map(q => q.id)).toEqual(['a', 'b', 'c']); expect(hi.cls.ability.available).toBe(true);
});
test('Универсал: XP задания уходит в новую характеристику; stat «xyz» — игнор', () => {
  const all5 = Object.fromEntries(STATS.map(s => [s, 5])) as Record<Stat, number>;
  const base = [onb(all5), issue(T, [nq('a', T, 'C', ['strength'])]), done(T, 'a', at(T, 20))];
  const s = replay([...base, use(T, 'universal', { questId: 'a', stat: 'fin' })], at(T, 22));
  expect(s.cls.id).toBe('wanderer');
  expect(s.today.quests[0]).toMatchObject({ skills: ['budget'], stat: 'fin' });
  expect(s.statInfo.fin.xp).toBeGreaterThan(0); expect(s.statInfo.str.xp).toBe(0);
  const bad = replay([...base, use(T, 'universal', { questId: 'a', stat: 'xyz' }), use(T, 'universal', { questId: 'a', stat: 'str' })], at(T, 22));
  expect(bad.today.quests[0].skills).toEqual(['strength']); expect(bad.statInfo.fin.xp).toBe(0); expect(bad.cls.ability.available).toBe(true);
});
test('План: невыполненные недельные заменяются присланными валидными', () => {
  const wq = (id: string, kind: string, target: number, stat: string | null = null) => ({ id, weekStart: MON, kind, stat, target, title: id, xp: 150 });
  const base = [onb(rating('int', 'fin')), issue(MON, [nq('a', MON, 'E', ['reading'])]), done(MON, 'a'),
    ev({ type: 'weekly_issued', weekStart: MON, quests: [wq('w1', 'active_days', 1), wq('w2', 'stat_quests', 99, 'str')], ts: at(MON, 7) })];
  const s = replay([...base, use(T, 'plan', { quests: [wq('n1', 'stat_quests', 1, 'int'), { id: 'x' }, wq('n2', 'stat_quests', 2, 'fin')] })], at(T, 12));
  expect(s.cls.id).toBe('strategist');
  // заменено только невыполненное, присланных — не больше заменённых
  expect(s.weekly.quests.map(w => [w.id, w.done])).toEqual([['w1', true], ['n1', true]]);
  expect(replay([...base, use(T, 'plan', { quests: [{ id: 'x' }] })], at(T, 12)).weekly.quests.map(w => w.id)).toEqual(['w1', 'w2']);
});
test('Рывок + Вернуть форму → ×4, не больше', () => {
  const s = replay([onb(rating('str', 'int')), issue(T, [nq('a', T, 'E', ['strength'], { kind: 'restore' })]), use(T, 'rush', { questId: 'a' }), done(T, 'a')], at(T, 22));
  expect(xpOf(s, 'a').mult).toBe(4);
});
