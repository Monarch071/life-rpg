import { BALANCE } from './balance';
import { AUTO_METRIC_INFO } from './metricInfo';
import type { SkillId } from './skillCatalog';
import { cleanText } from './text';
import type { AutoMetric, LadderKind, LadderStep } from './types';

const L = BALANCE.ladder;
type P7 = LadderStep['per7'];
type Preset = { title: string; kind: LadderKind; skill: SkillId; steps: LadderStep[] };

const at = <T>(a: T[], i: number): T => a[Math.min(i, a.length - 1)];

// Ступень 5 = как 4 (спека §3.2): списки задаются по 4 ступеням, 5-я дублирует последнюю.
function preset(title: string, kind: LadderKind, skill: SkillId, labels: string[], per7: P7[], auto?: [AutoMetric, '>=' | '<=', number[]]): Preset {
  return { title, kind, skill, steps: Array.from({ length: L.steps }, (_, i): LadderStep => ({
    label: at(labels, i), per7: at(per7, i), ...(auto ? { auto: { metric: auto[0], op: auto[1], value: at(auto[2], i) } } : {}) })) };
}

export const LADDER_PRESETS: Record<'read' | 'sport' | 'walk' | 'meditate' | 'water' | 'social' | 'sweets' | 'late', Preset> = {
  read: preset('Чтение', 'do', 'reading', ['10 стр', '10 стр', '20 стр', '20 стр'], [3, 5, 5, 7], ['readMin', '>=', [15, 15, 30, 30]]),
  sport: preset('Тренировки', 'do', 'sports', ['20 мин', '30 мин', '45 мин', '45 мин'], [2, 3, 3, 4], ['workoutMin', '>=', [20, 30, 45, 45]]),
  walk: preset('Прогулка', 'do', 'cardio', ['5 000 шагов', '5 000 шагов', '8 000 шагов', '8 000 шагов'], [3, 5, 5, 7], ['steps', '>=', [5000, 5000, 8000, 8000]]),
  meditate: preset('Медитация', 'do', 'mindfulness', ['5 мин', '5 мин', '10 мин', '10 мин'], [3, 5, 5, 7], ['mindfulMin', '>=', [5, 5, 10, 10]]),
  water: preset('Вода', 'do', 'nutrition', ['1,5 л', '1,5 л', '2 л', '2 л'], [3, 5, 5, 7]),
  social: preset('Соцсети', 'dont', 'habits', ['до 2 ч', 'до 2 ч', 'до 1 ч', 'до 1 ч'], [3, 5, 5, 7], ['socialMin', '<=', [120, 120, 60, 60]]),
  sweets: preset('Сладкое', 'dont', 'habits', ['без сладкого после 18:00', 'без сладкого после 18:00', 'без сладкого весь день', 'без сладкого весь день'], [3, 5, 5, 6]),
  late: preset('Поздний отбой', 'dont', 'habits', ['лечь по шаблону дня'], [3, 5, 5, 7]),
};

export function genericLadder(title: string, kind: LadderKind): Preset {
  const labels = ['Проба', 'Закрепление', 'Рост (больше)', 'Мастерство', 'Автоматизм'];
  const per7: P7[] = [3, 5, 5, 7, 7];
  return { title, kind, skill: kind === 'do' ? 'routine' : 'habits', steps: labels.map((label, i): LadderStep => ({ label, per7: per7[i] })) };
}

/** Ответ ИИ/события — недоверенный: ровно 5 ступеней, per7 целое 1–7, label 1–60, неверный auto отбрасывается. */
export function validLadderSteps(x: unknown): LadderStep[] | null {
  if (!Array.isArray(x) || x.length !== L.steps) return null;
  const out: LadderStep[] = [];
  for (const r of x as any[]) {
    const label = cleanText(r?.label, 60);
    if (!label || !Number.isInteger(r?.per7) || r.per7 < 1 || r.per7 > 7) return null;
    const a = r.auto;
    const ok = a && typeof a === 'object' && typeof a.metric === 'string' && Object.hasOwn(AUTO_METRIC_INFO, a.metric)
      && (a.op === '>=' || a.op === '<=') && Number.isFinite(a.value);
    out.push({ label, per7: r.per7, ...(ok ? { auto: { metric: a.metric, op: a.op, value: a.value } } : {}) });
  }
  return out;
}

export const requiredIn = (step: LadderStep, days: { suitable: boolean }[]): number =>
  step.per7 < 7 ? 2 * step.per7 : days.filter(d => d.suitable).length;

export function ladderAfterWindow(cur: { step: number; attempt: 1 | 2 }, rate: number): { step: number; attempt: 1 | 2; bonus: number; ask: boolean } {
  if (rate >= L.pass) return { step: Math.min(L.steps, cur.step + 1), attempt: 1, bonus: L.bonus[cur.step - 1] ?? 0, ask: false };
  if (rate >= L.repeat && cur.attempt === 1) return { step: cur.step, attempt: 2, bonus: 0, ask: false };
  return { step: Math.max(1, cur.step - 1), attempt: 1, bonus: 0, ask: true };
}

/** Рецидив ступени 5: две последние недели ниже relapseShare. */
export const step5Relapse = (weekRates: number[]): boolean =>
  weekRates.length >= L.relapseWeeks && weekRates.slice(-L.relapseWeeks).every(r => r < L.relapseShare);

export const ritualXp = (step: number): number => L.xp[Math.min(L.steps, Math.max(1, step)) - 1];
