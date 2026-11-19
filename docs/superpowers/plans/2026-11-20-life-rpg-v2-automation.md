# Life RPG v2 «Автоматика» (этап 3) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax. TDD: сначала падающий тест, потом код.

**Goal:** «шаги и сон засчитываются без тебя» [P§8]: `/sync` принимает сводки «Здоровья» и сигналы (прибытие, приложения, «Фокусирование», Wallet) без дублей; replay выводит данные дня, флаги правдоподобия, авто-засчёт, HP/Energy/Фокус/Усталость, штраф Усталости и множитель Фокуса; режим восстановления; сборка дня от настоящих Energy и Усталости; таймер фокуса/чтения; HUD на Главной; утренний пуш после синка сна; руководство по «Командам».

**Architecture:** журнал событий — единственный источник правды. Worker только разбирает и сохраняет (id из хэша пакета). Вся логика — в чистом `src/domain/vitals.ts` и в `replay`. Числа — в `BALANCE`. Новые поля событий только необязательные.

**Tech Stack:** React 18 + Vite + TypeScript strict, Dexie, vitest, Cloudflare Worker + D1 (без миграций схемы). Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-20-life-rpg-v2-automation-design.md` (дальше «спека §N»). Конвенции — план «Ядра» `2026-11-19-life-rpg-v2-core.md`. Числа в тестах — из [S§3], [S§6], [S§11].

---

## Global Constraints

- `replay` — чистая, порядок событий не влияет, ни одно событие (из журнала, сети, «Команд») не бросает исключение; неизвестные типы игнорируются.
- Ни одного числа баланса вне `BALANCE` (Worker держит свои константы разбора в `parse.ts`).
- Монотонность засчёта: «авто» никогда не опускается до «честного слова» и не снимается более поздними данными.
- Отсутствие данных ≠ ноль: нет источника — вес делится (спека §5), `<=`-задания без живого источника не засчитываются.
- Репозиторий публичный: в коде, тестах, фикстурах, руководстве — никаких мест, адресов, работодателя, города, доходов, целей владельца. Места — только `gym | work | home`; в тестах магазины вида «Магазин 1».
- Wallet-магазины, сессии приложений, места никогда не попадают в промпты ИИ и в ответ `/sync`.
- Интерфейс по-русски, стиль текущий (стеклянный HUD, токены `:root`, `lucide-react`, цели касания ≥ 44 px, `aria-*`, `prefers-reduced-motion`).
- После каждой задачи: `npx vitest run` и `npm run build` зелёные; `npm run worker:check`, если задача трогает `worker/`.
- Коммиты conventional, последняя строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

| # | Класс входа | Что может сломаться | Тесты (задача) |
|---|---|---|---|
| 1 | Тела `/sync` из «Команд» (строки «1 234,5», «₸1 250», вложенный/плоский `health`, 10 000 тренировок, `place: "Зал на Ленина"`, `at` через 30 дней, не-объект) | 500 вместо 400, раздутый журнал, утечка места/имени приложения | T5 «тренировок > 50 обрезаются», «неизвестный place → 400», «at старше 7 дней → 400», «amount ₸1 250,50 → 1250.5», «merchant обрезан до 60 и не в ответе» |
| 2 | Повторы и дубли (тот же пакет дважды, тренировки 13:00 и 18:00 в обоих пакетах, пересинк сна меньшим значением, два одинаковых сигнала) | двойные минуты, «снятый» засчёт | T5 «второй POST → duplicate: true, inserted 0»; T2 «одна тренировка в двух пакетах = 50 мин», «сон 8 → 6,5 ч: задание остаётся авто» |
| 3 | Неправдоподобное и отсутствующее (60 000 шагов, сон 15 ч, пересекающиеся тренировки, нет сигналов соцсетей, нет пульса) | ложный авто-засчёт, HP от мусора | T2 «60 000 шагов: флаг, не авто», «без сигналов app — no_social не авто»; T1 «HP без пульса и самочувствия = 67 через перераспределение» |
| 4 | Границы времени (сигнал 02:30 при вечерней смене, сессия через закрытие дня, таймер с `end` в будущем, open без close) | минуты не в тот день, бесконечная сессия | T2 «open 02:30 при отбое 03:00 → вчера», «open без close = 15 мин», «таймер end > ts+1 мин отброшен»; T1 `sessionMinutes` |
| 5 | Фарм и экономика режимов (восстановление 20 дней в месяце, вкл/выкл в один день, лимит общий с отдыхом, штраф Усталости + ослабление > 50%, множитель Фокуса вне потолков) | бесконечная заморозка серии, XP > формулы | T4 «10 отдыха + 6 восстановления → 4 заморожены», «старт+конец в одну дату → 0 дней»; T3 «Усталость 100 + ослабление → штраф 0,5», «Фокус 100 → C авто 84» |

---

### Task 1: `BALANCE` и чистые формулы параметров

**Files:** Modify `src/domain/balance.ts`. Create `src/domain/vitals.ts`, `src/domain/vitals.test.ts`.

**Interfaces — produces** (`vitals.ts`, все возвращают целые 0–100, `null` — нет ни одного источника):
- `sleepScore(hours: number): number`
- `hpScore(i: { sleepAvg: number | null; stepsAvg: number | null; stepsGoal: number; rhr: number | null; rhrMean: number | null; feel: number | null }): { hp: number | null; parts: Partial<Record<'sleep'|'steps'|'rhr'|'feel', number>> }`
- `energyScore(i: { sleepLast: number | null; morning: number | null /* 1–10 */; weekMorning: number | null; hp: number | null }): number | null`
- `focusScore(i: { focusMin: number | null; socialMin: number | null }): { focus: number | null; parts: Partial<Record<'focus'|'social', number>> }` — `null` у входа = источника нет
- `intFocusMult(focus: number | null): number`
- `fatigueNext(prev: number, day: { bigDay: boolean; rest: boolean; calm: boolean; lowEvening: boolean } | null, nightSleep: number | null): number`
- `sessionMinutes(sig: { at: number; state: 'open' | 'close' }[]): { start: number; min: number }[]` — пары по спеке §5.3
- `unionMinutes(iv: { start: number; end: number }[], capMin: number): number`
- `type WorkoutKind = 'strength'|'mobility'|'cardio'|'sports'|'other'`; `workoutKind(type: string): WorkoutKind`
- `balance.ts`: блоки `vitals`, `recovery`, `plausible`, `autoLeMaxMin`, `autoLeSourceDays`, `timer`, `freshnessStaleH` (спека §12).

- [ ] **Тест (падает):**
  ```ts
  test('HP: веса 40/30/20/10 [S§3]', () => {
    expect([7, 7.5, 9, 10, 6, 6.5, 2].map(sleepScore)).toEqual([100, 100, 100, 100, 80, 90, 0]);
    const full = hpScore({ sleepAvg: 6, stepsAvg: 3000, stepsGoal: 6000, rhr: 63, rhrMean: 60, feel: 6 });
    expect(full).toEqual({ hp: 67, parts: { sleep: 80, steps: 50, rhr: 70, feel: 60 } });
    expect(hpScore({ sleepAvg: 6, stepsAvg: 3000, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null }).hp).toBe(67); // 47/0,7
    expect(hpScore({ sleepAvg: 7.5, stepsAvg: null, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null }).hp).toBe(100);
    expect(hpScore({ sleepAvg: null, stepsAvg: null, stepsGoal: 6000, rhr: null, rhrMean: null, feel: null }).hp).toBeNull();
    expect(hpScore({ sleepAvg: null, stepsAvg: 12000, stepsGoal: 6000, rhr: 58, rhrMean: 60, feel: 9 }).parts).toEqual({ steps: 100, rhr: 100, feel: 100 });
  });
  test('Energy: 60/25/15, неделя вместо утра [S§3]', () => {
    expect(energyScore({ sleepLast: 6, morning: 7, weekMorning: 5, hp: 67 })).toBe(76);
    expect(energyScore({ sleepLast: 6, morning: null, weekMorning: 6, hp: 67 })).toBe(73);
    expect(energyScore({ sleepLast: 6, morning: null, weekMorning: null, hp: 67 })).toBe(77);
    expect(energyScore({ sleepLast: null, morning: null, weekMorning: null, hp: null })).toBeNull();
  });
  test('Фокус 70/30 и множитель Интеллекта [S§3]', () => {
    expect(focusScore({ focusMin: 90, socialMin: 30 }).focus).toBe(100);
    expect(focusScore({ focusMin: 45, socialMin: 75 }).focus).toBe(50);
    expect(focusScore({ focusMin: 0, socialMin: 120 }).focus).toBe(0);
    expect(focusScore({ focusMin: 45, socialMin: null }).focus).toBe(50);
    expect(focusScore({ focusMin: null, socialMin: null }).focus).toBeNull();
    expect([0, 50, 100, null].map(intFocusMult)).toEqual([0.8, 1, 1.2, 1]);
  });
  test('Усталость: +15/−20/−5, клэмп [S§3]', () => {
    let f = 0; const seen: number[] = [];
    for (let i = 0; i < 7; i++) { f = fatigueNext(f, null, 5); seen.push(f); }
    expect(seen).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(fatigueNext(10, null, 8)).toBe(0);
    expect(fatigueNext(50, { bigDay: true, rest: false, calm: false, lowEvening: true }, null)).toBe(60);
    expect(fatigueNext(50, { bigDay: false, rest: true, calm: true, lowEvening: false }, 7)).toBe(20);
    expect(fatigueNext(98, { bigDay: true, rest: false, calm: false, lowEvening: true }, 5)).toBe(100);
  });
  test('сессии и интервалы', () => {
    const m = 60_000;
    expect(sessionMinutes([{ at: 0, state: 'open' }, { at: 20 * m, state: 'close' }, { at: 120 * m, state: 'open' }, { at: 125 * m, state: 'open' }]))
      .toEqual([{ start: 0, min: 20 }, { start: 120 * m, min: 5 }, { start: 125 * m, min: 15 }]);
    expect(sessionMinutes([{ at: 0, state: 'close' }])).toEqual([]);
    expect(sessionMinutes([{ at: 0, state: 'open' }, { at: 500 * m, state: 'close' }])[0].min).toBe(180);
    expect(unionMinutes([{ start: 0, end: 60 * m }, { start: 30 * m, end: 90 * m }], 240)).toBe(90);
  });
  test('типы тренировок', () => {
    expect(['Традиционная силовая тренировка', 'Yoga', 'Бег', 'Футбол', 'Танцы'].map(workoutKind))
      .toEqual(['strength', 'mobility', 'cardio', 'sports', 'other']);
  });
  ```
- [ ] `npx vitest run src/domain/vitals.test.ts` — FAIL.
- [ ] Реализовать. Нетривиальное: перераспределение — `round(Σ wᵢsᵢ / Σ wᵢ)` по не-`null`; `fatigueNext` = `clamp(prev + Σдня + ночь + nightly)`; `workoutKind` — массив `[kind, RegExp]` в порядке спеки §4.2.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): vitals formulas — HP, Energy, Focus, Fatigue`.

### Task 2: Replay I — новые события, данные дня, правдоподобие, авто-засчёт

**Files:** Modify `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/domain/questBank.ts`, `src/domain/questBank.test.ts`, `src/domain/metricInfo.ts`.

**Interfaces — consumes:** T1 `sessionMinutes`, `unionMinutes`, `workoutKind`, `BALANCE.plausible`, `autoLe*`, `timer`.
**Produces:**
- `types.ts`: `HealthData` += `mindfulMin?`, `workouts?: { type: string; start?: number; end?: number; minutes: number }[]`; `GameEvent` += `signal_logged`, `timer_logged` (спека §3.2); `AutoMetric` (спека §4.4), `Quest['auto']['metric']: AutoMetric`; `DataFlag`, `DayData`.
- `replay.ts`: `export function dayDataOf(...)` не нужен — внутренний `Map<ISODate, DayData>`; `GameState.today.data: DayData`, `GameState.dataFlags`, `GameState.sync: { last; bySource }`.
- `questBank.ts`: изменения auto по таблице спеки §4.4; новый шаблон `gym`.

- [ ] **Тест (падает)** в `replay.test.ts` (хелперы `ev`, `nq`, `issue`, `done`, `at`):
  ```ts
  const hp = (date: string, health: object, h = 9, kind = 'other') => ev({ type: 'health_packet', date, kind, health, calendar: [], ts: at(date, h), deviceId: 'shortcuts' });
  const sig = (ts: number, signal: object) => ev({ type: 'signal_logged', at: ts, signal, ts, deviceId: 'shortcuts' });
  const D = '2026-12-02';
  test('одна тренировка в двух пакетах считается один раз; тип → strengthMin', () => {
    const w = { type: 'Силовая', start: at(D, 18), end: at(D, 18, 50), minutes: 50 };
    const s = replay([onboard, issue(D, [nq('g', D, 'C', ['strength'], { auto: { metric: 'strengthMin', op: '>=', value: 45 } })]),
      hp(D, { workouts: [w] }, 13), hp(D, { workouts: [w], steps: 9000 }, 18)], at(D, 20));
    expect(s.today.data).toMatchObject({ workoutMin: 50, strengthMin: 50, steps: 9000 });
    expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto' });
  });
  test('пересечение тренировок → флаг overlap, без авто', () => {
    const a = { type: 'Бег', start: at(D, 18), end: at(D, 19), minutes: 60 }, b = { type: 'Велосипед', start: at(D, 18, 30), end: at(D, 19, 30), minutes: 60 };
    const s = replay([onboard, issue(D, [nq('r', D, 'D', ['cardio'], { auto: { metric: 'cardioMin', op: '>=', value: 30 } })]), hp(D, { workouts: [a, b] })], at(D, 20));
    expect(s.today.data.flags).toContainEqual({ metric: 'workouts', reason: 'overlap' });
    expect(s.today.quests[0].done).toBe(false);
  });
  test('60 000 шагов и сон 15 ч — флаги, не авто [S§11]', () => {
    const s = replay([onboard, issue(D, [nq('s', D, 'E', ['cardio'], { auto: { metric: 'steps', op: '>=', value: 6000 } }),
      nq('z', D, 'E', ['sleep'], { auto: { metric: 'sleepHours', op: '>=', value: 7.5 } })]), hp(D, { steps: 60000, sleepHours: 15 })], at(D, 20));
    expect(s.today.quests.map(x => x.done)).toEqual([false, false]);
    expect(s.dataFlags.map(f => f.flag.reason).sort()).toEqual(['too_long_sleep', 'too_many_steps']);
  });
  test('засчёт монотонен: сон 8 → потом 6,5 — задание остаётся авто', () => {
    const s = replay([onboard, issue(D, [nq('z', D, 'E', ['sleep'], { auto: { metric: 'sleepHours', op: '>=', value: 7.5 } })]),
      hp(D, { sleepHours: 8 }, 9), hp(D, { sleepHours: 6.5 }, 10)], at(D, 20));
    expect(s.today.quests[0]).toMatchObject({ done: true, verify: 'auto' });
  });
  test('«Без соцсетей»: без живого источника не авто; с источником — только после закрытия дня', () => {
    const ns = nq('n', D, 'E', ['habits'], { auto: { metric: 'socialMin', op: '<=', value: 5 } });
    expect(replay([onboard, issue(D, [ns])], at('2026-12-03', 12)).history.at(-1)!.completed).toBe(0);
    const alive = sig(at('2026-12-01', 21), { kind: 'app', app: 'social', state: 'open' });
    expect(replay([onboard, alive, issue(D, [ns])], at(D, 20)).today.quests[0].done).toBe(false);   // день не закрыт
    expect(replay([onboard, alive, issue(D, [ns])], at('2026-12-03', 12)).history.at(-1)!.completed).toBe(1);
  });
  test('сигналы: игровая дата по закрытию дня; open без close = 15 мин; прибытие в зал', () => {
    const ds = ev({ type: 'day_started', date: D, work: null, wakeAt: '11:00', dayType: DEFAULT_DAY_TYPES[1], ts: at(D, 11) }); // вечерняя: закрытие 04:00
    const s = replay([onboard, ds, issue(D, [nq('gym', D, 'E', ['strength'], { auto: { metric: 'gymVisits', op: '>=', value: 1 } })]),
      sig(at('2026-12-03', 2, 30), { kind: 'app', app: 'social', state: 'open' }),
      sig(at(D, 12), { kind: 'arrive', place: 'gym' })], at('2026-12-03', 3));
    expect(s.today.date).toBe(D);
    expect(s.today.data).toMatchObject({ socialMin: 15, gymVisits: 1 });
    expect(s.today.quests[0].verify).toBe('auto');
  });
  test('таймер: принимается в пределах, будущий end отброшен, пересечения объединены', () => {
    const t = (start: number, end: number, ts = end) => ev({ type: 'timer_logged', timer: 'focus', start, end, ts });
    const s = replay([onboard, t(at(D, 10), at(D, 10, 45)), t(at(D, 10, 30), at(D, 11)), t(at(D, 12), at(D, 13), at(D, 11)),
      t(at(D, 14), at(D, 20))], at(D, 21));
    expect(s.today.data.focusMin).toBe(60); // 10:00–11:00; 12–13 с ts раньше end — нет; 6 ч > 240 — нет
  });
  test('Wallet: сумма в spendAuto, магазин не в today.data', () => {
    const s = replay([onboard, sig(at(D, 9), { kind: 'wallet', amount: 1250.5, merchant: 'Магазин 1' }), sig(at(D, 10), { kind: 'wallet', amount: -250.5, merchant: 'Магазин 1' })], at(D, 12));
    expect(s.today.data.spendAuto).toBe(1000); expect(JSON.stringify(s.today.data)).not.toContain('Магазин');
  });
  test('битые новые события не бросают', () => {
    expect(() => replay([onboard, ev({ type: 'signal_logged', at: 'x', signal: null }), ev({ type: 'timer_logged', timer: 'nap', start: 5, end: 1 }),
      ev({ type: 'health_packet', date: D, health: { workouts: 'много' } }), sig(at(D), { kind: 'arrive', place: 'бар' })], at(D))).not.toThrow();
  });
  ```
  `questBank.test.ts`: шаблон `workout` даёт `auto.metric === 'strengthMin'`; `gym` — `{ metric: 'gymVisits', op: '>=', value: 1 }`, навыки `['strength']`; `read` на E (15 стр) — `readMin >= 23`; `no_social` — `socialMin <= 5`.
- [ ] Run — FAIL.
- [ ] Реализовать. Нетривиальное: данные дня считаются **после** нормализации (игровая дата сигналов через `gd(at)` — нужен `closeOf`, поэтому сигналы собираются в первом проходе, а раскладываются по датам после построения типов дней); для `>=` держать `max` незафлаженных значений по каждому пакету; `<=` проверять только для `d < today` и при сигнале группы за `autoLeSourceDays`; `today.data` без `merchant`.
- [ ] `npx vitest run`, `npm run build`. Коммит `feat(domain): automation data — signals, timers, plausibility flags, auto-verification`.

### Task 3: Replay II — HP/Energy/Фокус/Усталость по дням и их влияние на XP

**Files:** Modify `src/domain/types.ts` (`DayResult`, `today.vitals`, `genInputs.fatigue`), `src/domain/replay.ts`, `src/domain/replay.test.ts`.

**Interfaces — consumes:** T1, T2 `DayData`. **Produces:** `today.vitals` (спека §14), `today.energy = vitals.energy ?? BALANCE.energy.fallback`, `history[].hp|energy|focus|fatigue`, штраф `fatiguePenalty(F(d))` в penalties, `mult *= intFocusMult(focus(d))` для `q.stat === 'int'`.

- [ ] **Тест (падает):**
  ```ts
  test('HP дня из окна 3 дня; Energy утра [S§3]', () => {
    const prof = { ...onboardProfile, stepsUsual: 6000 };
    const evs = [ev({ ...onboard, profile: prof }),
      ...['2026-11-30', '2026-12-01', D].map(d => hp(d, { sleepHours: 6, steps: 3000 })),
      ev({ type: 'day_started', date: D, work: null, wakeAt: '08:00', energy: 7, ts: at(D, 8) })];
    const s = replay(evs, at(D, 12));
    expect(s.today.vitals.hp).toBe(67);            // (0,4·80 + 0,3·50) / 0,7
    expect(s.today.vitals.energy).toBe(Math.round(0.6 * 80 + 0.25 * 70 + 0.15 * 67)); // 76
    expect(s.today.energy).toBe(76);
  });
  test('Усталость: шесть коротких ночей → 60, седьмая → 70', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-12-01', i));
    const s = replay([onboard, ...days.flatMap(d => [issue(d, [nq(`x${d}`, d, 'E', ['reading'])]), hp(d, { sleepHours: 5 })])], at(days[6], 12));
    expect(s.history.map(h => h.fatigue)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(s.today.vitals.fatigue).toBe(70);
  });
  test('штраф Усталости 0,3% за пункт и общий потолок 0,5', () => {
    // подготовка: F(d) = 40 → C честное слово 70·0,7·0,88 = 43
    // и отдельный сценарий: F = 100 + ослабление 0,2 → penalty 0,5 в строке леджера
  });
  test('Фокус умножает XP Интеллекта того же дня [S§3]', () => {
    const s = replay([onboard, issue(D, [nq('i', D, 'C', ['reading'], { auto: { metric: 'readMin', op: '>=', value: 10 } })]),
      ev({ type: 'timer_logged', timer: 'reading', start: at(D, 9), end: at(D, 9, 30), ts: at(D, 9, 30) }),
      ev({ type: 'timer_logged', timer: 'focus', start: at(D, 10), end: at(D, 11, 30), ts: at(D, 11, 30) }),
      sig(at(D, 12), { kind: 'app', app: 'social', state: 'open' }), sig(at(D, 12, 10), { kind: 'app', app: 'social', state: 'close' })], at(D, 20));
    expect(s.today.vitals.focus).toBe(100);
    expect(s.ledger.find(r => r.questId === 'i')).toMatchObject({ mult: 1.2 });   // база 70 × 1,0 × бонусы × 1,2
  });
  test('нет данных — параметры null, Energy = fallback, множитель 1', () => {
    const s = replay([onboard], at(D, 12));
    expect(s.today.vitals).toMatchObject({ hp: null, focus: null, fatigue: 0 });
    expect(s.today.energy).toBe(BALANCE.energy.fallback);
  });
  ```
  (Тест штрафа дописывается конкретными событиями по образцу «Ослабление» из `replay.test.ts` «Ядра»: проверить `penalty` строки = 0.12 и `xp` = 43; во втором — `penalty` = 0.5.)
- [ ] Run — FAIL.
- [ ] Реализовать. Нетривиальное: HP/Фокус/данные дня считаются в цикле дат **до** строк леджера дня; Усталость — рекуррентно в том же цикле (`fatigueNext(F(d−1), день(d−1), сон(d))`), «обычный XP» — средний по `closed` (не отдых) за 14 дней при ≥7; `bigDay` смотрит XP закрытого дня d−1 без штрафа. `mult` в строке леджера = `restore × intFocusMult`.
- [ ] `npx vitest run`, `npm run build`. Коммит `feat(domain): daily HP, Energy, Focus, Fatigue with XP penalty and Intellect multiplier`.

### Task 4: Режим восстановления и сборка дня

**Files:** Modify `src/domain/types.ts` (`recovery_started`, `recovery_ended`, `GameState.recovery`, `today.suggest`, `genInputs.recovery/afterRecovery`), `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/domain/assemble.ts`, `src/domain/assemble.test.ts`, `src/screens/issue.ts` (+test).

**Interfaces — consumes:** T3 `vitals`, `restInMonth`. **Produces:**
- `GameState.recovery: { active: boolean; since: ISODate | null; quests: 0|1|2; frozenToday: boolean; afterLeft: number }`
- `today.suggest: 'recovery_enter' | 'recovery_exit' | 'day_change_work' | null`
- `AssembleCtx` += `fatigue: number; recovery: { quests: 0|1|2 } | null; afterRecovery: boolean`
- `issue.ts`: `assembleCtx(state, dayType, wakeAt, energy)` заполняет новые поля из `state.genInputs`.

- [ ] **Тест (падает):**
  ```ts
  test('восстановление замораживает серию и делит лимит 14 с днями отдыха [S§3]', () => {
    // 10 дней типа rest в декабре, затем recovery_started на 6 дней → заморожены 4, 5-й и 6-й — обычные (серия считается)
    expect(frozenDays).toBe(4);
    expect(s.today.restDaysLeft).toBe(0);
  });
  test('старт и конец в одну дату — 0 дней режима; конец без старта игнорируется', () => { /* recovery.active false, restDaysLeft 14 */ });
  test('подсказки: Усталость 70 → recovery_enter; HP 61 вчера и сегодня в режиме → recovery_exit', () => {});
  test('после возвращения 2 дня afterLeft 2 → 1 → 0', () => {});
  test('прибытие на работу в выходной → day_change_work', () => {});
  ```
  `assemble.test.ts`:
  ```ts
  test('Усталость > 50 → обязательное задание на Дух; 50 — нет [S§6]', () => {
    expect(assembleDay({ ...ctx, energy: 60, fatigue: 51 }).some(q => primaryStat(q.skills!) === 'spi')).toBe(true);
    expect(assembleDay({ ...ctxNoSpiPriority, energy: 60, fatigue: 50 }).some(q => q.why?.includes('Усталость'))).toBe(false);
  });
  test('режим восстановления: N лёгких заданий из навыков восстановления, ранг на 1 ниже, без вызова', () => {
    for (const n of [0, 1, 2] as const) {
      const qs = assembleDay({ ...ctx, energy: 80, recovery: { quests: n } });
      expect(qs).toHaveLength(n);
      expect(qs.every(q => BALANCE.recovery.skills.includes(q.skills![0]) && q.kind !== 'challenge')).toBe(true);
    }
  });
  test('2 дня после возвращения — все ранги на 1 ниже, без вызова', () => {
    const a = assembleDay({ ...ctx, energy: 80 }), b = assembleDay({ ...ctx, energy: 80, afterRecovery: true });
    expect(b.some(q => q.kind === 'challenge')).toBe(false);
    expect(b.length).toBe(a.length - 1);
  });
  test('Energy < 40 → −1 слот, без вызова; ≥ 70 → вызов (регрессия Ядра)', () => {
    expect(slotsFor(DEFAULT_DAY_TYPES[0], 39)).toEqual({ base: 3, challenge: 0 });
    expect(slotsFor(DEFAULT_DAY_TYPES[0], 70)).toEqual({ base: 4, challenge: 1 });
  });
  ```
- [ ] Run — FAIL. Реализовать. Нетривиальное: дни режима раскладываются в цикле дат в тот же `restInMonth`, что и `rest`/`day_off` (порядок внутри месяца — по дате); замороженный день = `restDays`; сверх лимита — день обычный, но `recovery.active` остаётся; ранги режима — `rankShift(cap, −1)`.
- [ ] `npx vitest run`, `npm run build`. Коммит `feat(domain): recovery mode and fatigue/energy-driven day assembly`.

### Task 5: Worker — разбор сигналов, идемпотентность, утренний пуш по сну

**Files:** Modify `worker/src/parse.ts`, `worker/src/parse.test.ts`, `worker/src/index.ts`, `worker/src/index.test.ts`, `worker/src/push.ts`, `worker/src/push.test.ts`.

**Interfaces — produces:**
- `parse.ts`: `type SyncPacket = { kind: 'health'; packet: HealthPacket } | { kind: 'signal'; at: number; signal: Signal }`; `parseSyncPayload(body: unknown, now: number): { ok: true; value: SyncPacket } | { ok: false; error: string }`; `HealthPacket.health` += `mindfulMin`, `workouts`; `num()` понимает символы валют (`₸ ₽ $ €`), неразрывные пробелы.
- `index.ts`: `syncId(value: SyncPacket): Promise<string>` → `'sync-' + sha256(canonical).slice(0, 32)`; `POST /sync` пишет `health_packet` или `signal_logged`, ответ `{ ok, duplicate, received }`; при `kind: 'morning'` со `sleepHours` — `await sendWakePush(store, vapid, now, sleepHours)`.
- `push.ts`: `message(kind: 'wake', date, extra?: { sleepHours: number })`; `sendWakePush(store: Store, v: Vapid, now: number, sleepHours: number, fetcher?): Promise<number>` — подпискам с `morning !== null`, у кого `last_morning !== localDate` и локальное время ≥ 04:00; отмечает `markPushSent(…, 'morning', date)`.

- [ ] **Тест (падает):**
  ```ts
  const NOW = Date.parse('2026-12-02T12:00:00Z');
  test('сводка: тренировки, осознанность, обрезка списка', () => {
    const r = parseSyncPayload({ date: '2026-12-02', kind: 'other', mindfulMinutes: '10', workouts: Array.from({ length: 60 }, (_, i) => ({ type: 'Бег'.repeat(30), minutes: i })) }, NOW);
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health.workouts!.length).toBe(50);
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health.workouts![0].type.length).toBe(60);
    expect(r.ok && r.value.kind === 'health' && r.value.packet.health.mindfulMin).toBe(10);
  });
  test('сигналы: место и группа из списка, at в окне, Wallet', () => {
    expect(parseSyncPayload({ kind: 'arrive', place: 'gym', at: '2026-12-02T17:05:00+05:00' }, NOW)).toMatchObject({ ok: true, value: { kind: 'signal', signal: { kind: 'arrive', place: 'gym' } } });
    expect(parseSyncPayload({ kind: 'arrive', place: 'Зал на Ленина' }, NOW).ok).toBe(false);
    expect(parseSyncPayload({ kind: 'app', app: 'Instagram', state: 'open' }, NOW).ok).toBe(false);
    expect(parseSyncPayload({ kind: 'focus', state: 'on', at: '2026-11-20T10:00:00Z' }, NOW)).toEqual({ ok: false, error: 'Время at вне допустимого окна' });
    expect(parseSyncPayload({ kind: 'focus', state: 'on' }, NOW)).toMatchObject({ ok: true, value: { at: NOW } });
    const w = parseSyncPayload({ kind: 'wallet', amount: '₸1 250,50', merchant: 'Магазин\u0007 1'.padEnd(100, 'x') }, NOW);
    expect(w.ok && w.value.kind === 'signal' && w.value.signal).toMatchObject({ amount: 1250.5 });
    expect(w.ok && w.value.kind === 'signal' && (w.value.signal as any).merchant).toHaveLength(60);
    expect(parseSyncPayload({ kind: 'wallet', amount: 2e7 }, NOW).ok).toBe(false);
  });
  ```
  `index.test.ts`: тот же POST `/sync` дважды → `inserted`-эквивалент: первый `duplicate: false`, второй `duplicate: true`, в `GET /events` одно событие; ответ на Wallet не содержит `merchant`; сигнал пишется с `type: 'signal_logged'`, `deviceId: 'shortcuts'`.
  `push.test.ts`: подписка с `morning: 480`, `tz: 'Europe/Moscow'`; `/sync` `kind: 'morning'`, `sleepMinutes: 456` в 06:30 МСК → один вызов fetcher, `last_morning` = дата; повторный `/sync` → 0 вызовов; `runCron` в 08:00 → 0 (уже отправлен); `message('wake', d, { sleepHours: 7.6 }).body` содержит «7,6 ч».
- [ ] Run — FAIL. Реализовать. Нетривиальное: канонический JSON — `JSON.stringify` значения с ключами в порядке объявления типа (собирать объект руками, не из тела запроса); ошибка пуша не ломает ответ `/sync` (try/catch, `console.error`).
- [ ] `npx vitest run`, `npm run build`, `npm run worker:check`. Коммит `feat(worker): sync signals, idempotent packets, wake push after sleep sync`.

### Task 6: UI — HUD параметров, свежесть, таймер, режим восстановления; белый список ИИ

**Files:** Modify `src/ui/HeroStage.tsx`, `src/screens/Home.tsx`, `src/screens/MyDay.tsx`, `src/screens/SyncPanel.tsx`, `src/ui/QuestCard.tsx`, `src/styles.css`, `src/ai/tasks.ts` (+test). Create `src/screens/Timer.tsx`, `src/screens/Recovery.tsx`, `src/ui/vitalsView.ts`, `src/ui/vitalsView.test.ts`.

**Interfaces — consumes:** `today.vitals`, `today.data`, `today.suggest`, `recovery`, `sync`, `energyScore`.
**Produces:**
- `vitalsView.ts`: `vitalChips(v: GameState['today']['vitals']): { id: 'hp'|'energy'|'focus'|'fatigue'; label: string; value: string; pct: number; tone: 'good'|'mid'|'bad'|'none' }[]`; `freshness(last: number | null, now: number): { text: string; stale: boolean }`; `autoHint(q: DayQuest, data: DayData): string | null`.
- `ai/tasks.ts`: `AI_METRICS = ['steps','sleepHours','readPages','water','mood','screenMin','workoutMin'] as const` — единственный источник полей для `questContext` и `aiWeeklyReport`.
- **Home:** HUD из `vitalChips` (нажатие → разбор `parts`), строка свежести, один баннер по `today.suggest` (кнопки «Включить режим» / «Вернуться» / «Сменить тип дня» → существующий лист `DayChanged`), плашка «Отдых в таверне» при `recovery.active`, вход в таймер.
- **Timer:** режим фокус/чтение, старт хранит `Date.now()` в `localStorage` (try/catch), «Стоп» пишет `timer_logged`; кнопка «Таймер» на карточках `focus`/`read`.
- **Recovery:** выбор 0/1/2, «дней в месяце: N», `recovery_started`; «Вернуться» → `recovery_ended`.
- **MyDay:** Energy сборки = `energyScore({ ...today.vitals.energyInputs, morning: оценка })` (если `null` — `BALANCE.energy.fallback`).
- **SyncPanel:** «Последние данные по источникам» из `sync.bySource`.

- [ ] **Тест (падает):** `vitalChips({ hp: null, energy: 76, focus: 50, fatigue: 72, … })` → `hp.value === '—'`, `tone 'none'`; `energy.tone 'good'` (≥70); `fatigue.tone 'bad'` (≥70, шкала обратная); `freshness(now − 2·3600e3, now)` → `{ text: 'Данные: 2 ч назад', stale: false }`; `freshness(now − 37·3600e3, now).stale === true`; `freshness(null, now).text === 'Данных из «Команд» ещё не было'`; `autoHint` для шагов 9 000 при `data.steps 6120` → `'Засчитается само: шагов ≥ 9 000 (сейчас 6 120)'`, для `socialMin <=` → содержит `'при закрытии дня'`. `tasks.test.ts`: состояние с `metrics: { spend: 5000, steps: 8000 }` → `aiWeeklyReport` user-промпт содержит `steps`, не содержит `spend` и `5000`; `questContext` не содержит `socialMin` и имени магазина из `signal_logged`.
- [ ] Run — FAIL. Реализовать. Проверка руками (dev-сервер `?now=2026-12-02T09:00`, журнал с пакетами из тестов T2–T4): 375 px без горизонтальной прокрутки, цели ≥ 44 px, таймер переживает сворачивание вкладки, баннер — не больше одного.
- [ ] `npx vitest run`, `npm run build`. Коммит `feat(ui): vitals HUD, data freshness, focus/reading timer, recovery mode; AI metric whitelist`.

### Task 7: Руководство «Команды» для неспециалиста

**Files:** Modify `docs/shortcuts.md` (переписать), `src/screens/SyncPanel.tsx` (ссылка «Как настроить» на раздел руководства, если ещё нет).

**Produces:** по-русски, по шагам, как текущий `docs/shortcuts.md` (одно действие — один пункт):
- A. Общая команда «Life RPG — отправить»: вход «Словарь» → «Получить содержимое URL» (POST, `Authorization: Bearer …`, тело — входной словарь) → «Показать результат» (для проверки). Все автоматизации вызывают её через «Выполнить команду» — токен меняется в одном месте.
- B. «Утро» (Будильник → Остановлен): сон за ночь (`sleepMinutes`), пульс покоя (`restingHR`, последний образец), вес, шаги с полуночи, календарь (необязательно) → `kind: morning`.
- C. «Днём» 13:00 и 18:00 и «Перед сном»: шаги, тренировки за сегодня (повторить с каждым: `type`, `start`, `end`, `minutes`), осознанность (`mindfulMinutes`, сумма), активные калории.
- D. «Прибытие»: три автоматизации (зал/работа/дом), место выбирается на карте самим пользователем; в теле только `place` и `at` (дата в ISO 8601).
- E. «Приложения»: «Приложение» → выбрать соцсети → «Открыто» → `app: social, state: open`; вторая — «Закрыто»; то же для игр.
- F. «Фокусирование»: «Включено»/«Выключено».
- G. «Wallet» (только Apple Pay): «Транзакция» → `amount` (переменная «Сумма»), `merchant` (переменная «Продавец»).
- Для каждой — точный JSON (из спеки §3.1), «Запускать сразу», «Уведомлять» выключить, и проверка: ответ `"ok": true`; повтор того же — `"duplicate": true` (это нормально).
- H. «Если не работает»: 401, 400 «Время at…», 413, тишина больше 36 ч (баннер в приложении), «iOS пропускает автоматизации в режиме энергосбережения».
- I. Что где хранится: «твой сервер Cloudflare и этот телефон; в ИИ не уходит: магазины, суммы Wallet, приложения, места».
- Названия действий iOS могут отличаться — искать по смыслу (как в текущем руководстве). Примеры мест — «спортзал», без адресов.

- [ ] Проверка (без автотестов): каждый JSON-пример из руководства прогнать через `parseSyncPayload` в одноразовом `vitest`-тесте `worker/src/guide.test.ts`, который читает блоки ```json из `docs/shortcuts.md` и ожидает `ok: true` (тест остаётся — руководство не разойдётся с разбором).
- [ ] `npx vitest run`, `npm run worker:check`. Коммит `docs: step-by-step Shortcuts automations for stage 3`.

---

## После плана

- Отложено — спека §1 и §15 (срыв привычки → этап 4; перки Усталости, аватар в таверне, ИИ-проверка фото → этап 5; лимиты трат и импорт выписки → этап 6).
- На реальном телефоне владельца: прогнать все семь автоматизаций, убедиться, что задание «Пройти N шагов» и «Выспаться» закрылись сами без касания (критерий готовности [P§8]). Журнал владельца в репозиторий не коммитится.
