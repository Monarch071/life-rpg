import { addDays, weekStart } from './day'
import { SKILL_CATALOG } from './skillCatalog'
import { skillFromXp } from './progression'
import { PERKS } from './perks'
import { STATS } from './stats'
import { BALANCE } from './balance'
import { weakestStat } from './weekly'
import type { GameState, ISODate, WeekScore } from './types'

/** Белый список: только эти метрики уходят в промпты ИИ. Траты (в т.ч. ручные), магазины, приложения и места — никогда. */
export const AI_METRICS = ['steps', 'sleepHours', 'readPages', 'water', 'mood', 'screenMin', 'workoutMin'] as const

/** Воскресенье — текущая неделя, иначе прошлая. */
export const reportWeek = (today: ISODate): ISODate => { const w = weekStart(today); return today === addDays(w, 6) ? w : addDays(w, -7) }

export interface ReportInput { weekStart: ISODate; days: { date: ISODate; xp: number; done: number; issued: number; counted: boolean }[];
  metrics: Partial<Record<(typeof AI_METRICS)[number], number>>; vitals: { hp: number | null; energy: number | null; focus: number | null; fatigue: number | null };
  score: WeekScore; final: boolean; league: string; cls: { name: string; passivePower: number; abilityUsed: boolean }; seasonStep: number;
  newPerks: string[]; nearRust: string[]; rusty: string[]; ladders: { active: number; ritualsDone: number }; shadow: number | null; weakest: string;
  baseGain: { stat: string; delta: number } | null }

const skillTitle = (id: string) => SKILL_CATALOG.find(s => s.id === id)?.title ?? id

/** Вход отчёта по белому списку (спека §8): без граней, названий лестниц, целей, трат, магазинов, приложений и мест. */
export function reportInput(state: GameState, ws: ISODate): ReportInput {
  const we = addDays(ws, 6)
  const days = state.history.filter(h => h.date >= ws && h.date <= we).map(h => ({ date: h.date, xp: h.xp, done: h.completed, issued: h.issued, counted: h.counted }))
  const last = state.history.filter(h => h.date >= ws && h.date <= we).at(-1)
  const metrics: ReportInput['metrics'] = {}
  for (const k of AI_METRICS) {
    const v = state.metricHistory.filter(h => h.date >= ws && h.date <= we).map(h => h.metrics[k]).filter((x): x is number => x !== undefined)
    if (v.length) metrics[k] = Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10
  }
  const res = state.week.results.find(r => r.weekStart === ws)
  const score: WeekScore = res ?? (state.week.start === ws ? state.week.preview : { share: 0, xp: 0, avg4: 0, days: 0, rank: null })
  const ids = Object.keys(state.skills) as (keyof GameState['skills'])[]
  const newPerks = ids.flatMap(id => {
    const s = state.skills[id]
    const gained = state.ledger.filter(l => l.date >= ws).reduce((a, l) => a + (l.skills.find(([k]) => k === id)?.[1] ?? 0), 0)
    const before = skillFromXp(s.start, s.xp - gained).level
    return PERKS.filter(p => p.skill === id && p.level > before && p.level <= s.level).map(p => p.title)
  })
  const rusty = ids.filter(id => state.skills[id].rusty).map(skillTitle)
  const nearRust = ids.filter(id => { const d = state.skills[id].idleDays; return !state.skills[id].rusty && d !== null && d >= BALANCE.rust.warnDays }).map(skillTitle)
  const before = state.statHistory.filter(h => h.date < ws).at(-1), after = state.statHistory.filter(h => h.date <= we).at(-1)
  let baseGain: ReportInput['baseGain'] = null
  if (before && after) for (const s of Object.keys(STATS) as (keyof typeof STATS)[]) {
    const delta = Math.round((after.stats[s] - before.stats[s]) * 10) / 10
    if (delta > 0 && (!baseGain || delta > baseGain.delta)) baseGain = { stat: STATS[s].name, delta }
  }
  return { weekStart: ws, days, metrics, vitals: { hp: last?.hp ?? null, energy: last?.energy ?? null, focus: last?.focus ?? null, fatigue: last?.fatigue ?? null },
    score, final: !!res, league: state.league.name, cls: { name: state.cls.name, passivePower: state.cls.passive.power, abilityUsed: state.cls.ability.usedOn !== null },
    seasonStep: state.season.step, newPerks, nearRust, rusty,
    ladders: { active: state.ladders.filter(l => l.status === 'active').length, ritualsDone: state.ledger.filter(l => l.source === 'ritual' && l.date >= ws && l.date <= we).length },
    shadow: state.shadow.strength, weakest: STATS[weakestStat(state.stats)].name, baseGain }
}

/** Текст правил: 4 раздела, ≤ 1500 символов. */
export function reportByRules(i: ReportInput): string {
  const d = [...i.days].sort((a, b) => b.xp - a.xp), best = d[0], worst = d.at(-1)
  const rank = i.score.rank ? `ранг ${i.score.rank}${i.final ? '' : ' (пока предварительно)'}` : 'ранг пока не присвоен'
  const got = [`Неделя: ${rank}, ${i.score.xp} XP при среднем за 4 недели ${i.score.avg4}, активных дней ${i.score.days}. Лига: ${i.league}.`,
    best ? `Лучший день — ${best.date.slice(5)} (${best.xp} XP)${worst && worst !== best ? `, слабый — ${worst.date.slice(5)} (${worst.xp} XP)` : ''}.` : 'Закрытых дней за неделю нет.',
    ...(i.newPerks.length ? [`Новые перки: ${i.newPerks.join(', ')}.`] : [])]
  const pat = [i.baseGain ? `Больше всего вырос «${i.baseGain.stat}» (+${i.baseGain.delta}).` : 'Заметного роста Основы за неделю нет.',
    `Ритуалов выполнено: ${i.ladders.ritualsDone}, активных лестниц: ${i.ladders.active}.`]
  const weak = [`Слабейшая характеристика — ${i.weakest}.`, ...(i.nearRust.length ? [`Навыки на грани ржавчины: ${i.nearRust.join(', ')}.`] : []),
    ...(i.rusty.length ? [`Ржавые навыки: ${i.rusty.join(', ')}.`] : []),
    ...(i.cls.abilityUsed ? [] : [`Способность класса «${i.cls.name}» не использована — на этой неделе возьми её.`])]
  const plan = [`2 задания на «${i.weakest}»` + (i.rusty[0] ?? i.nearRust[0] ? `, вернуть навык «${i.rusty[0] ?? i.nearRust[0]}».` : '.')]
  return [`Что получилось\n${got.join(' ')}`, `Закономерности\n${pat.join(' ')}`, `Слабые места\n${weak.join(' ')}`, `План на неделю\n${plan.join(' ')}`].join('\n\n').slice(0, 1500)
}

export function weekReportOf(state: GameState): { weekStart: ISODate; text: string; ai: boolean; final: boolean } {
  const weekStart = reportWeek(state.today.date)
  const r = state.reports.find(x => x.weekStart === weekStart)
  return r ? { weekStart, text: r.text, ai: true, final: !!r.final } : { weekStart, text: reportByRules(reportInput(state, weekStart)), ai: false, final: false }
}
