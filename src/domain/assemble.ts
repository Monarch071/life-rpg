import { BALANCE as B, RANKS } from './balance';
import { themeBonusApplies, type ThemeId } from './calendar';
import { addDays, fromMin, toMin } from './day';
import type { DayType } from './dayType';
import { questReward, rankCap, rankShift } from './progression';
import { paramFor, QUEST_TEMPLATES, type QuestTemplate } from './questBank';
import { seededRng } from './rng';
import { freeWindows, latestEnd, placeQuests, type Win } from './schedule';
import { primaryStat, SKILL_CATALOG, type SkillId } from './skillCatalog';
import { STATS } from './stats';
import type { HHMM, ISODate, Profile, Quest, QuestKind, Rank, Stat, StatInfo } from './types';
import { weakestStat } from './weekly';

export interface AssembleCtx {
  date: ISODate; dayType: DayType; wakeAt: HHMM; energy: number; level: number;
  skills: Record<SkillId, { level: number; lastDate: ISODate | null }>;
  stats: Record<Stat, number>; statInfo: Record<Stat, Pick<StatInfo, 'form' | 'status' | 'lastRestore'>>;
  theme: ThemeId | null; bossStats: Stat[]; recent: { date: ISODate; stats: Stat[]; templateIds: string[] }[];
  profile: Profile; multipliers: Record<Stat, number>; bestSteps7: number | null; busy: Win[];
}

const STAT_KEYS = Object.keys(STATS) as Stat[];
const A = B.assembly;
const ri = (r: Rank) => RANKS.indexOf(r);
const minRank = (a: Rank, b: Rank): Rank => (ri(a) <= ri(b) ? a : b);
const dayNum = (d: ISODate) => { const [y, m, x] = d.split('-').map(Number); return Date.UTC(y, m - 1, x) / 864e5; };
const daysSince = (from: ISODate, to: ISODate) => dayNum(to) - dayNum(from);
const low = (c: AssembleCtx) => c.energy < B.energy.low;

/** Слоты дня [S§6]: тип дня; Energy < 40 → −1 (минимум 1); Energy ≥ 70 → +1 вызов; «отдых» — 1 без вызова. */
export function slotsFor(t: DayType, energy: number): { base: number; challenge: 0 | 1 } {
  if (t.kind === 'rest') return { base: 1, challenge: 0 };
  const l = energy < B.energy.low;
  return { base: Math.max(1, t.slots - (l ? 1 : 0)), challenge: !l && energy >= B.energy.high ? 1 : 0 };
}

/** Смесь рангов: свой потолок round(0,6·всего), вызов — отдельно, остальные на ранг ниже. */
export function rankPlan(total: number, challenge: 0 | 1): { own: number; below: number; challenge: 0 | 1 } {
  const own = Math.min(total - challenge, Math.round(B.rank.ownShare * total));
  return { own, below: total - own - challenge, challenge };
}

/** P = 3·босс + 2·(1 − Форма) + 1,5·тема + min(1, дней_без_навыка / 7) − 2·повтор_вчера. */
export function priority(c: { stat: Stat; skill: SkillId; templateId: string }, ctx: AssembleCtx): number {
  const p = A.p, last = ctx.skills[c.skill]?.lastDate ?? null;
  const idle = last ? Math.max(0, daysSince(last, ctx.date)) : p.idleDays; // ни разу не качался → 7 дней
  const repeat = ctx.recent.some(r => r.date === addDays(ctx.date, -1) && r.templateIds.includes(c.templateId));
  return p.boss * +ctx.bossStats.includes(c.stat) + p.form * (1 - (ctx.statInfo[c.stat].form ?? 1))
    + p.theme * +themeBonusApplies(ctx.theme, c.stat, [c.skill]) + p.idle * Math.min(1, idle / p.idleDays) + p.repeat * +repeat;
}

interface Cand { t: QuestTemplate; stat: Stat; skill: SkillId; p: number; cap: Rank; limit: Rank }

/** Кандидаты по убыванию P; ничьи — сидированный rng(date). */
function candidates(ctx: AssembleCtx): Cand[] {
  const rng = seededRng(ctx.date);
  return QUEST_TEMPLATES.filter(t => !t.badHabit || ctx.profile.badHabits.includes(t.badHabit))
    .map(t => {
      const skill = t.skills[0], stat = primaryStat(t.skills);
      // при Energy < 40 физические — не выше D
      const limit = minRank(t.maxRank ?? 'S', low(ctx) && t.physical ? rankShift('C', -1) : 'S');
      const c: Cand = { t, stat, skill, p: priority({ stat, skill, templateId: t.id }, ctx), cap: rankCap(ctx.level, ctx.skills[skill]?.level ?? 1), limit };
      return { c, tie: rng() };
    })
    .sort((a, b) => b.c.p - a.c.p || b.tie - a.tie).map(x => x.c);
}

function ruleWhy(c: Cand, ctx: AssembleCtx): string {
  const name = STATS[c.stat].name, info = ctx.statInfo[c.stat];
  if (ctx.bossStats.includes(c.stat)) return `Цель босса: ${name}`;
  if (info.status === 'sagging' || info.status === 'abandoned') return `Форма: ${name} проседает`;
  if (themeBonusApplies(ctx.theme, c.stat, c.t.skills)) return 'Тема сезона';
  const last = ctx.skills[c.skill]?.lastDate;
  if (!last || daysSince(last, ctx.date) >= A.p.idleDays) return `Давно не качал навык «${skillTitle(c.skill)}»`;
  return `Прокачка: ${name}`;
}
const skillTitle = (id: SkillId) => SKILL_CATALOG.find(s => s.id === id)!.title;

function build(c: Cand, rank: Rank, kind: QuestKind, why: string, ctx: AssembleCtx, id = `${ctx.date}:${c.t.id}`): Omit<Quest, 'window'> {
  const t = c.t.id === 'steps'
    ? { ...c.t, base: Math.max(ctx.profile.stepsUsual || 0, Math.round((ctx.bestSteps7 ?? 0) * B.calibration.startK), 1) } : c.t;
  const n = Math.max(1, paramFor(t, rank, ctx.multipliers[c.stat] ?? 1));
  const bonuses = [themeBonusApplies(ctx.theme, c.stat, t.skills) ? B.bonus.theme : 0, weakestStat(ctx.stats) === c.stat ? B.bonus.weakest : 0];
  const xp = questReward({ rank, verify: t.auto ? 'auto' : 'honest', bonuses, penalties: [], mult: kind === 'restore' ? B.restore.mult : 1 }).xp;
  return { id, date: ctx.date, title: t.title(n), stat: c.stat, minutes: t.allDay ? 0 : t.minutes(n), xp, auto: t.auto?.(n) ?? null,
    templateId: t.id, rank, skills: [...t.skills] as Quest['skills'], kind, why };
}

/** Окна дня: свободные ≥20 мин; вечерняя смена — только до её начала. */
function dayWindows(ctx: AssembleCtx, extraBusy: Win[]): Win[] {
  const t = ctx.dayType, min = B.day.minWindowMin;
  const ws = freeWindows(ctx.wakeAt, t.bed ?? ctx.profile.sleep, [...(t.busy ? [t.busy] : []), ...ctx.busy, ...extraBusy], min);
  return t.kind === 'evening' && t.busy ? latestEnd(ws, t.busy.start, ctx.wakeAt, min) : ws;
}

/** Расстановка: тренировки кончаются не позже чем за 2 ч до отбоя, остальное — в оставшиеся окна. */
function place(qs: Omit<Quest, 'window'>[], ctx: AssembleCtx): Quest[] {
  const phys = (q: Omit<Quest, 'window'>) => !!QUEST_TEMPLATES.find(t => t.id === q.templateId)?.physical;
  const bed = ctx.dayType.bed ?? ctx.profile.sleep;
  const p1 = placeQuests(qs.filter(phys), latestEnd(dayWindows(ctx, []), fromMin(toMin(bed) - B.day.workoutBeforeBedMin), ctx.wakeAt, B.day.minWindowMin),
    ctx.profile.energy, ctx.wakeAt);
  const p2 = placeQuests(qs.filter(q => !phys(q)), dayWindows(ctx, p1.flatMap(q => (q.window ? [q.window] : []))), ctx.profile.energy, ctx.wakeAt);
  const byId = new Map([...p1, ...p2].map(q => [q.id, q]));
  return qs.map(q => byId.get(q.id)!);
}

/** Сборка дня по правилам [S§6], спека §6.4. Детерминирована при тех же входах. */
export function assembleDay(ctx: AssembleCtx): Quest[] {
  const { base, challenge } = slotsFor(ctx.dayType, ctx.energy);
  const total = base + challenge;
  const cands = candidates(ctx);
  const chosen: { c: Cand; restore: boolean; why: string | null }[] = [];
  const perStat = (s: Stat) => chosen.filter(x => x.c.stat === s).length;
  const can = (c: Cand) => chosen.length < total && perStat(c.stat) < A.maxPerStat && !chosen.some(x => x.c.t.id === c.t.id);
  const take = (c: Cand | undefined, restore: boolean, why: string | null) => { if (c) chosen.push({ c, restore, why }); };

  // 1. обязательные: «Вернуть форму» (одно), навык на грани ржавчины (один), Дух при Energy < 40
  const due = STAT_KEYS.filter(s => ctx.statInfo[s].status === 'abandoned'
    && (!ctx.statInfo[s].lastRestore || daysSince(ctx.statInfo[s].lastRestore!, ctx.date) >= B.restore.cooldownDays))
    .sort((a, b) => (ctx.statInfo[a].form ?? 1) - (ctx.statInfo[b].form ?? 1));
  if (due.length) take(cands.find(c => c.stat === due[0] && can(c)), true, `Вернуть форму: ${STATS[due[0]].name}, ×${B.restore.mult} XP`);
  const rusty = (Object.keys(ctx.skills) as SkillId[])
    .map(id => ({ id, d: ctx.skills[id].lastDate ? daysSince(ctx.skills[id].lastDate!, ctx.date) : -1 }))
    .filter(x => x.d >= B.skill.nearRustDays).sort((a, b) => b.d - a.d)[0];
  if (rusty) take(cands.find(c => c.skill === rusty.id && can(c)), false, `Навык «${skillTitle(rusty.id)}» на грани ржавчины`);
  if (low(ctx) && perStat('spi') === 0) take(cands.find(c => c.stat === 'spi' && can(c)), false, 'Сил мало — день для Духа');

  // 2. характеристики без заданий вчера и позавчера — раньше остальных
  const seen = new Set(ctx.recent.filter(r => r.date >= addDays(ctx.date, -2) && r.date < ctx.date).flatMap(r => r.stats));
  for (const c of cands) if (!seen.has(c.stat) && perStat(c.stat) === 0 && can(c)) take(c, false, `${STATS[c.stat].name}: два дня без заданий`);
  // 3. остальные по P
  for (const c of cands) if (can(c)) take(c, false, null);

  // ранги: вызов — наибольшему P, которому шаблон позволяет ранг выше потолка; затем свой потолок; остальные — ниже
  const order = chosen.filter(x => !x.restore).sort((a, b) => cands.indexOf(a.c) - cands.indexOf(b.c));
  const ch = challenge ? order.find(x => ri(minRank(rankShift(x.c.cap, 1), x.c.limit)) > ri(x.c.cap)) : undefined;
  const plan = rankPlan(order.length, ch ? 1 : 0);
  let own = plan.own;
  const rankOf = new Map<typeof chosen[number], { rank: Rank; kind: QuestKind }>();
  for (const x of order) {
    if (x === ch) rankOf.set(x, { rank: rankShift(x.c.cap, 1), kind: 'challenge' });
    else rankOf.set(x, { rank: minRank(own-- > 0 ? x.c.cap : rankShift(x.c.cap, -1), x.c.limit), kind: 'daily' });
  }
  const qs = chosen.map(x => {
    if (x.restore) return build(x.c, minRank(ri(x.c.cap) >= ri('D') ? 'D' : 'E', x.c.limit), 'restore', x.why!, ctx);
    const r = rankOf.get(x)!;
    return build(x.c, r.rank, r.kind, r.kind === 'challenge' ? 'Вызов: ранг выше твоего потолка' : x.why ?? ruleWhy(x.c, ctx), ctx);
  });
  return place(qs, ctx);
}

/** Замена для переброса: тот же ранг, другой шаблон (не из сегодняшних), лучше — другой навык. restore/custom — null. */
export function rerollCandidate(ctx: AssembleCtx, q: Quest, today: Quest[]): Quest | null {
  if (!q.rank || (q.kind !== 'daily' && q.kind !== 'challenge')) return null;
  const used = new Set(today.map(x => x.templateId));
  const pool = candidates(ctx).filter(c => !used.has(c.t.id) && ri(c.limit) >= ri(q.rank!));
  const c = pool.find(c => c.skill !== q.skills?.[0]) ?? pool[0];
  if (!c) return null;
  const x = build(c, q.rank, q.kind, ruleWhy(c, ctx), ctx, `${q.id}>${c.t.id}`);
  return placeQuests([x], q.window ? [q.window] : [], ctx.profile.energy, ctx.wakeAt)[0];
}
