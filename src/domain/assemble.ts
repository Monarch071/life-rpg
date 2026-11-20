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
import type { HHMM, ISODate, Profile, Quest, QuestKind, QuestStep, Rank, Stat, StatInfo } from './types';
import { weakestStat } from './weekly';

export interface AssembleCtx {
  date: ISODate; dayType: DayType; wakeAt: HHMM; energy: number; level: number;
  skills: Record<SkillId, { level: number; lastDate: ISODate | null; idleDays: number | null }>;   // idleDays — незамороженные дни простоя
  stats: Record<Stat, number>; statInfo: Record<Stat, Pick<StatInfo, 'form' | 'status' | 'lastRestore'>>;
  theme: ThemeId | null; bossStats: Stat[]; recent: { date: ISODate; stats: Stat[]; templateIds: string[] }[];
  profile: Profile; multipliers: Record<Stat, number>; bestSteps7: number | null; busy: Win[];
  fatigue: number; recovery: { quests: 0 | 1 | 2 } | null; afterRecovery: boolean;
  bossStep: QuestStep | null; chainStep: QuestStep | null;   // первый несделанный шаг босса/цепочки (переносится, пока не сделан)
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
  return QUEST_TEMPLATES.filter(t => !t.badHabit) // вредные привычки — в Тени и «не делать»-лестницах (спека §7)
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
  const cands = candidates(ctx);
  // режим восстановления [S§3]: quests лёгких заданий из навыков восстановления, ранг на 1 ниже потолка, без вызова
  if (ctx.recovery) {
    const rec = cands.filter(c => (B.recovery.skills as readonly SkillId[]).includes(c.skill)).slice(0, Math.min(B.recovery.maxQuests, ctx.recovery.quests));
    return place(rec.map(c => build(c, minRank(rankShift(c.cap, -1), c.limit), 'daily', 'Режим восстановления', ctx)), ctx);
  }
  const slots = slotsFor(ctx.dayType, ctx.energy), base = slots.base;
  const challenge = ctx.afterRecovery ? 0 : slots.challenge; // возвращение: без вызова
  const total = base + challenge;
  const chosen: { c: Cand; restore: boolean; why: string | null }[] = [];
  const steps: Omit<Quest, 'window'>[] = [];
  const perStat = (s: Stat) => chosen.filter(x => x.c.stat === s).length + steps.filter(q => q.stat === s).length;
  const can = (c: Cand) => chosen.length + steps.length < total && perStat(c.stat) < A.maxPerStat && !chosen.some(x => x.c.t.id === c.t.id);
  const take = (c: Cand | undefined, restore: boolean, why: string | null) => { if (c) chosen.push({ c, restore, why }); };

  // 1. обязательные: «Вернуть форму» (одно), навык на грани ржавчины (один), Дух при Energy < 40
  const due = STAT_KEYS.filter(s => ctx.statInfo[s].status === 'abandoned'
    && (!ctx.statInfo[s].lastRestore || daysSince(ctx.statInfo[s].lastRestore!, ctx.date) >= B.restore.cooldownDays))
    .sort((a, b) => (ctx.statInfo[a].form ?? 1) - (ctx.statInfo[b].form ?? 1));
  // обязательное — первое, для которого нашёлся шаблон
  for (const st of due) {
    const c = cands.find(c => c.stat === st && can(c));
    if (c) { take(c, true, `Вернуть форму: ${STATS[st].name}, ×${B.restore.mult} XP`); break; }
  }
  const rusty = (Object.keys(ctx.skills) as SkillId[])
    .map(id => ({ id, d: ctx.skills[id].idleDays ?? -1 }))
    .filter(x => x.d >= B.rust.warnDays).sort((a, b) => b.d - a.d);
  for (const r of rusty) {
    const c = cands.find(c => c.skill === r.id && can(c));
    if (c) { take(c, false, `Навык «${skillTitle(r.id)}» на грани ржавчины`); break; }
  }
  // одно задание на Дух: Energy < 40 или Усталость > 50
  const tired = ctx.fatigue > B.vitals.fatigue.spiritAbove;
  if ((low(ctx) || tired) && perStat('spi') === 0)
    take(cands.find(c => c.stat === 'spi' && can(c)), false, tired ? `Усталость ${ctx.fatigue} — день для Духа` : 'Сил мало — день для Духа');

  // шаг босса, затем цепочки — сразу после обязательных, в счёт слотов и лимита на характеристику; не в отдых
  const mandatory = chosen.length;
  for (const [st, kind, why] of [[ctx.bossStep, 'boss', 'Шаг босса'], [ctx.chainStep, 'chain', 'Шаг сюжета']] as const) {
    if (!st || ctx.dayType.kind === 'rest' || chosen.length + steps.length >= total || perStat(primaryStat([st.skill])) >= A.maxPerStat) continue;
    const rank = rankCap(ctx.level, ctx.skills[st.skill]?.level ?? 1), stat = primaryStat([st.skill]);
    const bonuses = [themeBonusApplies(ctx.theme, stat, [st.skill]) ? B.bonus.theme : 0, weakestStat(ctx.stats) === stat ? B.bonus.weakest : 0];
    steps.push({ id: `${ctx.date}:${kind}:${st.link.step}`, date: ctx.date, title: st.title, stat, minutes: 0, auto: null, templateId: kind, rank,
      skills: [st.skill], kind, why, link: st.link, xp: questReward({ rank, verify: 'honest', bonuses, penalties: [], mult: 1 }).xp });
  }

  // 2. характеристики без заданий за statEveryDays − 1 прошлых дня — раньше остальных (каждая — хотя бы раз в 3 дня)
  const seen = new Set(ctx.recent.filter(r => r.date >= addDays(ctx.date, 1 - A.statEveryDays) && r.date < ctx.date).flatMap(r => r.stats));
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
    else rankOf.set(x, { rank: rankShift(minRank(own-- > 0 ? x.c.cap : rankShift(x.c.cap, -1), x.c.limit), ctx.afterRecovery ? -1 : 0), kind: 'daily' });
  }
  const built = chosen.map(x => {
    if (x.restore) return build(x.c, minRank(ri(x.c.cap) >= ri('D') ? 'D' : 'E', x.c.limit), 'restore', x.why!, ctx);
    const r = rankOf.get(x)!;
    return build(x.c, r.rank, r.kind, r.kind === 'challenge' ? 'Вызов: ранг выше твоего потолка' : x.why ?? ruleWhy(x.c, ctx), ctx);
  });
  return place([...built.slice(0, mandatory), ...steps, ...built.slice(mandatory)], ctx);
}

/** Замена для переброса: тот же ранг, другой шаблон (не из сегодняшних), лучше — другой навык. restore/custom/boss/chain — null. */
export function rerollCandidate(ctx: AssembleCtx, q: Quest, today: Quest[]): Quest | null {
  if (!q.rank || (q.kind !== 'daily' && q.kind !== 'challenge')) return null;
  const used = new Set(today.map(x => x.templateId));
  // тот же ранг, но не выше потолка нового навыка (+1, только если заменяется вызов)
  const pool = candidates(ctx).filter(c => !used.has(c.t.id) && ri(c.limit) >= ri(q.rank!) && ri(c.cap) + (q.kind === 'challenge' ? 1 : 0) >= ri(q.rank!));
  const c = pool.find(c => c.skill !== q.skills?.[0]) ?? pool[0];
  if (!c) return null;
  const x = build(c, q.rank, q.kind, ruleWhy(c, ctx), ctx, `${q.id}>${c.t.id}`);
  return placeQuests([x], q.window ? [q.window] : [], ctx.profile.energy, ctx.wakeAt)[0];
}
