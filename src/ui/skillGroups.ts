import { BookOpen, Briefcase, Coins, Dumbbell, Sparkles, type LucideIcon } from 'lucide-react'
import { SKILL_CATALOG, type SkillDef, type SkillId } from '../domain/skillCatalog'
import type { Rank, Stat } from '../domain/types'

/** Категории навыков из дизайн-брифа поверх 7 характеристик игры. */
export const CATEGORIES: { id: string; title: string; Icon: LucideIcon; color: string; stats: (Stat | 'team')[] }[] = [
  { id: 'edu', title: 'Образование', Icon: BookOpen, color: 'var(--int)', stats: ['int'] },
  { id: 'fin', title: 'Финансы', Icon: Coins, color: 'var(--fin)', stats: ['fin'] },
  { id: 'body', title: 'Физическое развитие', Icon: Dumbbell, color: 'var(--str)', stats: ['str', 'end'] },
  { id: 'self', title: 'Личное развитие', Icon: Sparkles, color: 'var(--fire2)', stats: ['dis', 'cha', 'spi'] },
  { id: 'team', title: 'Работа в команде', Icon: Briefcase, color: 'var(--teal)', stats: ['team'] },
]

export const skillsOf = (cat: (typeof CATEGORIES)[number]): SkillDef[] => SKILL_CATALOG.filter(s => cat.stats.includes(s.stat))

/** Категория задания — по первому навыку. */
export function categoryOf(skill: SkillId | undefined): (typeof CATEGORIES)[number] {
  const st = SKILL_CATALOG.find(s => s.id === skill)?.stat
  return CATEGORIES.find(c => st && c.stats.includes(st)) ?? CATEGORIES[3]
}

export const DIFFICULTY: Record<Rank, string> = { E: 'Лёгкое', D: 'Простое', C: 'Среднее', B: 'Сложное', A: 'Тяжёлое', S: 'Эпическое' }
