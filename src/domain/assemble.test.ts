import { describe, expect, test } from 'vitest';
import { assembleDay, priority, rankPlan, rerollCandidate, slotsFor, type AssembleCtx } from './assemble';
import { RANKS } from './balance';
import { toMin } from './day';
import { DEFAULT_DAY_TYPES } from './dayType';
import { rankCap } from './progression';
import { QUEST_TEMPLATES } from './questBank';
import { primaryStat, SKILL_CATALOG, type SkillId } from './skillCatalog';
import { STATS } from './stats';
import type { Profile, Stat, StatInfo } from './types';

const STAT_KEYS = Object.keys(STATS) as Stat[];
const fill = <T,>(v: T) => Object.fromEntries(STAT_KEYS.map(s => [s, v])) as Record<Stat, T>;
const profile: Profile = {
  name: 'Т', wake: '08:00', sleep: '00:00', workTemplates: [], goals: [], sportLevel: 1, stepsUsual: 5000, badHabits: [], goodHabits: [],
  energy: { morning: 4, day: 3, evening: 3, night: 1 }, selfRating: fill(5),
};
type Info = Pick<StatInfo, 'form' | 'status' | 'lastRestore'>;
const skills = (): AssembleCtx['skills'] => Object.fromEntries(SKILL_CATALOG.map(s => [s.id, { level: 3, lastDate: null }])) as AssembleCtx['skills'];
const allRecent = (d1 = '2026-11-19', d2 = '2026-11-18') => [d2, d1].map(date => ({ date, stats: [...STAT_KEYS], templateIds: [] as string[] }));
const ctx = (over: Partial<AssembleCtx> = {}): AssembleCtx => ({
  date: '2026-11-20', dayType: DEFAULT_DAY_TYPES[0], wakeAt: '08:00', energy: 50, level: 25, skills: skills(), stats: fill(30),
  statInfo: fill<Info>({ form: 1, status: 'in_form', lastRestore: null }), theme: null, bossStats: [], recent: allRecent(),
  profile, multipliers: fill(1), bestSteps7: null, busy: [], ...over,
});
const twoDaysWithout = (s: Stat) => allRecent().map(r => ({ ...r, stats: r.stats.filter(x => x !== s) }));
const withForm = (s: Stat, form: number, status: Info['status'] = 'sagging', lastRestore: string | null = null) =>
  ({ ...fill<Info>({ form: 1, status: 'in_form', lastRestore: null }), [s]: { form, status, lastRestore } });
const withLast = (id: SkillId, lastDate: string) => ({ ...skills(), [id]: { level: 3, lastDate } });
const withTemplate = (id: string, date = '2026-11-30') => [{ date, stats: [...STAT_KEYS], templateIds: [id] }];
const tpl = (id: string) => QUEST_TEMPLATES.find(t => t.id === id)!;
const rel = (h: string, wake: string) => (toMin(h) - toMin(wake) + 1440) % 1440;

test('слоты [S§6]', () => {
  expect(slotsFor(DEFAULT_DAY_TYPES[0], 50)).toEqual({ base: 4, challenge: 0 });
  expect(slotsFor(DEFAULT_DAY_TYPES[0], 30)).toEqual({ base: 3, challenge: 0 });
  expect(slotsFor(DEFAULT_DAY_TYPES[0], 80)).toEqual({ base: 4, challenge: 1 });
  expect(slotsFor(DEFAULT_DAY_TYPES[3], 90)).toEqual({ base: 1, challenge: 0 });
  expect(slotsFor({ ...DEFAULT_DAY_TYPES[0], slots: 1 }, 10)).toEqual({ base: 1, challenge: 0 });
});

test('смесь рангов 60/30/10', () => {
  expect(rankPlan(4, 0)).toEqual({ own: 2, below: 2, challenge: 0 });
  expect(rankPlan(5, 1)).toEqual({ own: 3, below: 1, challenge: 1 });
  const qs = assembleDay(ctx({ energy: 80 }));
  expect(qs.map(q => q.rank).sort()).toEqual(['B', 'C', 'C', 'C', 'D']);
  expect(qs.filter(q => q.kind === 'challenge')).toHaveLength(1);
  expect(qs.find(q => q.kind === 'challenge')!.rank).toBe('B');
});

test('Energy < 40: 3 задания, есть Дух, нет вызова и физических C+', () => {
  const qs = assembleDay(ctx({ energy: 30, bossStats: ['str', 'end'] }));
  expect(qs).toHaveLength(3);
  expect(qs.some(q => q.stat === 'spi')).toBe(true);
  expect(qs.some(q => q.kind === 'challenge')).toBe(false);
  expect(qs.filter(q => tpl(q.templateId).physical && RANKS.indexOf(q.rank!) >= RANKS.indexOf('C'))).toEqual([]);
});

test('не больше 2 на характеристику; характеристика без заданий 2 дня попадает в день', () => {
  const qs = assembleDay(ctx({ recent: twoDaysWithout('fin') }));
  expect(qs.some(q => q.stat === 'fin')).toBe(true);
  for (const s of STAT_KEYS) expect(qs.filter(q => q.stat === s).length).toBeLessThanOrEqual(2);
  const boss = assembleDay(ctx({ bossStats: ['int'], energy: 80, dayType: DEFAULT_DAY_TYPES[2] }));
  expect(boss.filter(q => q.stat === 'int')).toHaveLength(2);
});

test('«Вернуть форму»: Заброшена → restore D; был 3 дня назад → нет', () => {
  const qs = assembleDay(ctx({ statInfo: withForm('str', 0.2, 'abandoned'), stats: { ...fill(30), spi: 10 } }));
  const r = qs.filter(q => q.kind === 'restore');
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({ stat: 'str', rank: 'D' });
  expect(r[0].xp).toBe(r[0].auto ? 80 : 56); // 40 × K × 2
  const later = assembleDay(ctx({ statInfo: withForm('str', 0.2, 'abandoned', '2026-11-17') }));
  expect(later.some(q => q.kind === 'restore')).toBe(false);
  // потолок E (уровень < 10) → E
  expect(assembleDay(ctx({ level: 5, statInfo: withForm('str', 0.2, 'abandoned') })).find(q => q.kind === 'restore')!.rank).toBe('E');
});

test('обязательные: если шаблон занят, берётся следующий в списке', () => {
  // все шаблоны Харизмы, кроме «переговоров», были вчера → «Вернуть форму» Харизмы берёт negotiate;
  // самый ржавый навык — «Переговоры» (шаблон занят) → берётся следующий, «Выступления»
  const yest = QUEST_TEMPLATES.filter(t => primaryStat(t.skills) === 'cha' && t.id !== 'negotiate').map(t => t.id);
  const qs = assembleDay(ctx({ statInfo: withForm('cha', 0.1, 'abandoned'), recent: [{ date: '2026-11-19', stats: [...STAT_KEYS], templateIds: yest }],
    skills: { ...skills(), negotiation: { level: 3, lastDate: '2026-09-01' }, speaking: { level: 3, lastDate: '2026-10-01' } } }));
  expect(qs.find(q => q.kind === 'restore')!.templateId).toBe('negotiate');
  expect(qs.some(q => q.skills![0] === 'speaking')).toBe(true);
});

test('навык на грани ржавчины попадает в день', () => {
  const qs = assembleDay(ctx({ skills: withLast('negotiation', '2026-10-20') }));
  expect(qs.some(q => q.skills![0] === 'negotiation')).toBe(true);
});

test('приоритет: P = 3·босс + 2·(1−форма) + 1,5·тема + min(1, дни/7) − 2·повтор', () => {
  expect(priority({ stat: 'int', skill: 'reading', templateId: 'read' }, ctx({ theme: 'mind_spirit', bossStats: ['int'],
    statInfo: withForm('int', 0.5), skills: withLast('reading', '2026-11-27'), date: '2026-12-01', recent: withTemplate('read') }))).toBeCloseTo(3 + 1 + 1.5 + 4 / 7 - 2);
  expect(priority({ stat: 'int', skill: 'reading', templateId: 'read' }, ctx())).toBeCloseTo(1); // форма 1, навык не качался → 7 дней
  expect(priority({ stat: 'int', skill: 'reading', templateId: 'read' }, ctx({ statInfo: withForm('int', null as unknown as number, 'new') }))).toBeCloseTo(1);
});

test('вечерняя смена: все окна до 16:00; тренировка кончается ≥2 ч до отбоя', () => {
  const ev = assembleDay(ctx({ dayType: DEFAULT_DAY_TYPES[1], wakeAt: '11:00' }));
  expect(ev.some(q => q.window)).toBe(true);
  for (const q of ev) if (q.window) { expect(toMin(q.window.start)).toBeGreaterThanOrEqual(660); expect(toMin(q.window.end)).toBeLessThanOrEqual(960); }
  // выходной с отбоем 01:00, свободно только 21:30–01:00: физические — до 23:00
  const off = assembleDay(ctx({ dayType: DEFAULT_DAY_TYPES[2], wakeAt: '11:00', busy: [{ start: '11:00', end: '21:30' }], bossStats: ['str'] }));
  const phys = off.filter(q => tpl(q.templateId).physical && q.window);
  expect(phys.length).toBeGreaterThan(0);
  for (const q of phys) expect(rel(q.window!.end, '11:00')).toBeLessThanOrEqual(rel('23:00', '11:00'));
});

test('предпросмотр XP: C честное без бонусов → 49', () => {
  // выбор зависит от банка шаблонов — ищем подходящее задание за несколько дат
  const days = Array.from({ length: 10 }, (_, i) => assembleDay(ctx({ date: `2026-11-${20 + i}`, stats: { ...fill(30), spi: 10 } })));
  const qs = days[0];
  const c = days.flat().find(q => q.rank === 'C' && !q.auto && q.stat !== 'spi');
  expect(c!.xp).toBe(49);
  for (const q of qs) expect(q.why && q.why.length > 0).toBe(true);
  for (const q of qs) expect(q.skills).toEqual(tpl(q.templateId).skills);
});

test('детерминизм: тот же ctx → тот же результат', () => {
  expect(assembleDay(ctx({ energy: 80 }))).toEqual(assembleDay(ctx({ energy: 80 })));
  expect(assembleDay(ctx())).toEqual(assembleDay(ctx()));
});

describe('переброс', () => {
  test('переброс: тот же ранг, другой шаблон, не из сегодняшних', () => {
    const c = ctx({ energy: 80 });
    const today = assembleDay(c);
    for (const q of today) {
      const r = rerollCandidate(c, q, today)!;
      expect(r.rank).toBe(q.rank);
      expect(today.map(x => x.templateId)).not.toContain(r.templateId);
      expect(r.id).not.toBe(q.id);
      expect(r.kind).toBe(q.kind);
    }
  });
  test('переброс не поднимает ранг выше потолка нового навыка (+1 только для вызова)', () => {
    const sk = { ...skills() };
    for (const id of Object.keys(sk) as SkillId[]) sk[id] = { level: id === 'reading' || id === 'strength' ? 3 : 1, lastDate: null };
    let checked = 0;
    for (let i = 0; i < 10; i++) { // выбор зависит от банка шаблонов — несколько дат
      const c = ctx({ date: `2026-11-${20 + i}`, energy: 80, skills: sk });
      const today = assembleDay(c);
      for (const q of today) {
        const r = rerollCandidate(c, q, today);
        if (!r) continue;
        const cap = RANKS.indexOf(rankCap(c.level, sk[r.skills![0]].level)) + (q.kind === 'challenge' ? 1 : 0);
        expect(RANKS.indexOf(r.rank!)).toBeLessThanOrEqual(cap);
        if (q.kind === 'daily' && RANKS.indexOf(q.rank!) >= RANKS.indexOf('C')) { checked++; expect(['reading', 'strength']).toContain(r.skills![0]); }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  test('restore не перебрасывается', () => {
    const c = ctx({ statInfo: withForm('str', 0.2, 'abandoned') });
    const today = assembleDay(c);
    expect(rerollCandidate(c, today.find(q => q.kind === 'restore')!, today)).toBeNull();
  });
});
