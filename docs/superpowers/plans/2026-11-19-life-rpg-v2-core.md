# Life RPG v2 «Ядро» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax. TDD: сначала падающий тест, потом код.

**Goal:** к 1 декабря 2026 перевести игру на механику v2: уровни 1–100 со стартом по анкете, Основа + Форма у 7 характеристик, 24 навыка 1–10, ранги заданий E–S с проверкой и бонусами/штрафами, типы дней и закрытие дня по отбою, сборка дня по правилам, «День изменился», переброс, свои задания, новая серия, сезоны с темой, золото и стартовый магазин. Ежедневная «Тень» удаляется.

**Architecture:** журнал событий остаётся единственным источником правды; `replay(events, now)` выводит из него леджер начислений и всё состояние. Все числа баланса — в `src/domain/balance.ts`. Новая логика — чистые модули в `src/domain/` с юнит-тестами; UI — последними задачами. Новые поля событий только необязательные; старые события проходят через легаси-правила.

**Tech Stack:** React 18 + Vite + TypeScript strict, Dexie, vitest, Cloudflare Worker (без изменений схемы). Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-19-life-rpg-v2-core-design.md` (дальше — «спека», разделы §N). Числа в тестах — из документов владельца [S] «детальная проработка систем» и [P] «личная версия».

---

## Global Constraints

- `replay` — чистая функция: результат не зависит от порядка событий; **никакое** событие из журнала или сети не бросает исключение (битое — игнорируется); неизвестные типы игнорируются.
- Ни одного числа баланса вне `BALANCE` (базы рангов, пороги, доли, лимиты, цены). Тесты ссылаются на числа документов, код — на `BALANCE`.
- Новые поля событий — только необязательные; существующие типы событий не удаляются из union.
- Репозиторий публичный: никаких личных данных владельца (работа, места, город, доходы, цели) в коде, тестах, фикстурах, коммитах. Подписи типов дней нейтральные («Дневная смена»…), валюта в стартовом магазине не указывается.
- Интерфейс — по-русски, стиль текущий (стеклянный HUD, ночная палитра, токены `:root`, `lucide-react`, цели касания ≥44 px, `aria-*` как сейчас, `prefers-reduced-motion`).
- После каждой задачи: `npx vitest run` и `npm run build` зелёные; `npm run worker:check`, если задача трогает `worker/`.
- Коммиты — conventional (`feat(domain): …`), каждый заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ответы ИИ — недоверенные данные: валидировать, ранги/XP/навыки считает код.

## Review Focus

Пять классов рискованного входа; у каждого — тесты, которые ревьюер проверяет в первую очередь.

| # | Класс входа | Что может сломаться | Тесты (задача) |
|---|---|---|---|
| 1 | Легаси и битые события (старые `quests_issued` с `difficulty`, `skill_unlocked`, `shadow_wins`, мусорные поля, чужие типы значений) | падение replay на запуске = приложение не открывается | «легаси-журнал 17–19 ноября», «500 случайных битых событий не бросают» (T5), «неверный dayType/energy/verify игнорируется» (T6) |
| 2 | Границы времени (закрытие дня 00:00–04:00 по отбою, смена типа дня меняет закрытие, день без старта, отметка в 03:59 и в 04:00) | XP уходит не в тот день, серия рвётся ночью | `closeMinutes`/`gameDateAt` (T3), «Дневная смена: 00:30 ещё вчера, 01:00 уже сегодня», «Вечерняя: 03:59 ещё вчера», `closesAt` (T6) |
| 3 | Экономика и фарм (платный переброс без золота, второй переброс того же задания, 3-е своё задание, потолок 25%, повторный «День изменился», 3-я заморозка в месяц, покупки после миграции) | бесконечное золото/XP или «пропавшие» покупки | T6 «+20 только раз», T7 «переброс: бесплатно → 50 → отказ», «своё: 3-е игнор, потолок 28», «заморозка: 3-я отклонена», T5 «легаси-покупка остаётся» |
| 4 | Ответы ИИ (startLevel 0/101/"20", оценки вне 0–100, уровни навыков >7, переписанный текст с чужим рангом/XP, ранг своего задания выше потолка) | завышенный старт, сломанная сборка | T4 `validAnalysis` отбрасывает поля, T8 `validateAiTexts`, T7 «ранг своего задания режется до потолка» |
| 5 | Порядок и дубли между устройствами (перемешанный журнал, два `quests_issued` на дату, два `day_started`, двойной посев магазина, переброс одного задания с двух устройств) | разные состояния на телефонах | T5 «перемешанный журнал = тот же state», T7 «двойной посев — 8 наград», «второй переброс той же questId игнор» |

---

### Task 1: Конфиг баланса и формулы прогрессии

**Files:** Create `src/domain/balance.ts`, `src/domain/progression.ts`, `src/domain/progression.test.ts`. Modify `src/domain/types.ts` (типы `Rank`, `Verify`, `QuestKind`), `src/domain/xp.ts`, `src/domain/xp.test.ts`.

**Interfaces — produces:**
- `types.ts`: `export type Rank = 'E'|'D'|'C'|'B'|'A'|'S'`; `export type Verify = 'auto'|'photo'|'honest'`; `export type QuestKind = 'daily'|'challenge'|'restore'|'custom'`.
- `balance.ts`: `export const BALANCE` (спека §4; `dayTypes`/`rewards` добавятся в T3/T7), `export const RANKS: readonly Rank[] = ['E','D','C','B','A','S']`.
- `xp.ts`: `xpToNext(level: number): number` (без изменений), `levelFromXp(total: number, start = 1): { level: number; into: number; need: number }` — потолок `BALANCE.level.max`, на максимуме `need = 0`; `questXp`, `currencyFor` пока остаются (удаляются в T5/T8).
- `progression.ts`:
  - `startBase(score: number): number`
  - `statPointCost(s: number): number`
  - `baseFromXp(start: number, xp: number): { value: number; into: number; need: number }`
  - `formNorm(avgDailyXp: number): number`
  - `formOf(xpWindow: number, days: number, norm: number): number | null` — `days = 0` → `null`
  - `formStatus(form: number | null): 'new'|'in_form'|'sagging'|'abandoned'`
  - `skillFromXp(start: number, xp: number): { level: number; into: number; need: number }`
  - `rankCap(level: number, skillLevel: number): Rank`, `rankShift(r: Rank, d: number): Rank`
  - `streakBonus(streak: number): number`, `fatiguePenalty(f: number): number`
  - `interface RewardBreakdown { base: number; k: number; bonus: number; penalty: number; mult: number; xp: number; gold: number }`
  - `questReward(i: { rank: Rank; verify: Verify; bonuses: number[]; penalties: number[]; mult?: number }): RewardBreakdown`
  - `goldFor(xp: number): number`

- [ ] **Тест (падает):** `progression.test.ts` и дополнения в `xp.test.ts`:
  ```ts
  test('цена уровня 100×L^1,5 [S§1]', () => {
    expect([3, 10, 20, 40, 55].map(xpToNext)).toEqual([520, 3162, 8944, 25298, 40789]);
    expect(levelFromXp(0, 20)).toEqual({ level: 20, into: 0, need: 8944 });
    expect(levelFromXp(8944, 20).level).toBe(21);
    expect(levelFromXp(1e9, 99)).toMatchObject({ level: 100, need: 0 });
  });
  test('«Зал 45 минут»: 92 XP и 18 золота [S§1]', () => {
    const r = questReward({ rank: 'C', verify: 'auto', bonuses: [streakBonus(10), 0.1, 0.1], penalties: [fatiguePenalty(20)] });
    expect(r).toMatchObject({ base: 70, k: 1, bonus: 0.4, penalty: 0.06, xp: 92, gold: 18 });
  });
  test('потолки бонусов и штрафов', () => {
    expect(questReward({ rank: 'E', verify: 'honest', bonuses: [0.5, 0.25, 0.2, 0.2], penalties: [] }).bonus).toBe(1);
    expect(questReward({ rank: 'E', verify: 'auto', bonuses: [], penalties: [0.2, 0.2, 0.2] }).penalty).toBe(0.5);
    expect(questReward({ rank: 'C', verify: 'honest', bonuses: [], penalties: [] }).xp).toBe(49);
    expect(questReward({ rank: 'C', verify: 'photo', bonuses: [], penalties: [] }).xp).toBe(63);
    expect(questReward({ rank: 'E', verify: 'honest', bonuses: [], penalties: [], mult: 2 }).xp).toBe(28);
    expect(streakBonus(30)).toBe(0.5); expect(goldFor(37)).toBe(7);
  });
  test('Основа: старт и цена очка [S§2]', () => {
    expect([0, 40, 50, 100].map(startBase)).toEqual([5, 31, 38, 70]);
    expect(statPointCost(20)).toBe(150);
    expect(baseFromXp(20, 1725)).toEqual({ value: 30, into: 0, need: 200 });
    expect(baseFromXp(20, 1724).value).toBe(29);
    expect(baseFromXp(50, 3225).value).toBe(60);
    expect(baseFromXp(1, 29700)).toMatchObject({ value: 100, need: 0 });
  });
  test('Форма: пример «болел две недели» → 38% [S§2]', () => {
    const norm = formNorm(40);
    expect(norm).toBe(28);
    expect(Math.round(formOf(150, 14, norm)! * 100)).toBe(38);
    expect(formStatus(formOf(150, 14, norm))).toBe('abandoned');
    expect(formNorm(10)).toBe(15);
    expect(formOf(999, 14, 28)).toBe(1); expect(formOf(0, 0, 28)).toBeNull();
    expect([0.8, 0.79, 0.4, 0.39].map(formStatus)).toEqual(['in_form', 'sagging', 'sagging', 'abandoned']);
  });
  test('навыки 100·n, 1→10 = 4 500 [S§4]', () => {
    expect(skillFromXp(1, 4500)).toMatchObject({ level: 10, need: 0 });
    expect(skillFromXp(2, 199)).toEqual({ level: 2, into: 199, need: 200 });
  });
  test('потолок ранга [S§6]', () => {
    expect(rankCap(55, 2)).toBe('D'); expect(rankCap(55, 8)).toBe('A');
    expect(rankCap(1, 9)).toBe('E'); expect(rankCap(20, 3)).toBe('C'); expect(rankCap(70, 10)).toBe('S');
    expect(rankShift('E', -1)).toBe('E'); expect(rankShift('S', 1)).toBe('S'); expect(rankShift('C', 1)).toBe('B');
  });
  ```
- [ ] `npx vitest run src/domain/progression.test.ts src/domain/xp.test.ts` — FAIL.
- [ ] Реализовать. Нетривиальное: `questReward` — `xp = Math.round(base*k*(1+min(cap,Σb))*(1-min(cap,Σp))*mult)`, бонус/штраф хранить округлёнными до 1e-9 (иначе 0.2+0.1+0.1 ≠ 0.4); `baseFromXp`/`skillFromXp` — цикл «пока хватает на следующее очко».
- [ ] `npx vitest run`, `npm run build` — PASS.
- [ ] Коммит `feat(domain): balance config and v2 progression formulas`.

### Task 2: Каталог 24 навыков, разметка банка заданий, легаси-карты

**Files:** Create `src/domain/skillCatalog.ts`, `src/domain/skillCatalog.test.ts`. Modify `src/domain/questBank.ts` (только добавления — старые поля `difficulty` убираются в T8), Create `src/domain/questBank.test.ts`.

**Interfaces — consumes:** `Rank`, `BALANCE.rank.paramScale`, `BALANCE.skill.mainShare`.
**Produces:**
- `export type SkillId = 'strength'|'mobility'|'sports'|'cardio'|'sleep'|'nutrition'|'reading'|'languages'|'tech'|'routine'|'focus'|'habits'|'social'|'speaking'|'negotiation'|'budget'|'savings'|'earning'|'mindfulness'|'reflection'|'rest'|'leadership'|'delegation'|'teamwork'`
- `interface SkillDef { id: SkillId; title: string; stat: Stat | 'team'; verify: string; examples: { E: string; C: string; A: string } }`, `SKILL_CATALOG: SkillDef[]` (порядок — спека §5.7), `isSkillId(x: unknown): x is SkillId`
- `skillStatShares(id: SkillId): Partial<Record<Stat, number>>` — `team` → `{ cha: 0.5, dis: 0.5 }`
- `splitXp(xp: number, skills: readonly SkillId[]): { skills: [SkillId, number][]; stats: Partial<Record<Stat, number>> }` — сумма долей = xp
- `primaryStat(skills: readonly SkillId[]): Stat` — для `team` → `'cha'`
- `questBank.ts`: у `QuestTemplate` новые поля `skills: [SkillId] | [SkillId, SkillId]`, `maxRank?: Rank`, `scale?: Partial<Record<Rank, number>>`; `paramFor(t: QuestTemplate, rank: Rank, mult: number): number`; новые шаблоны для навыков без шаблонов (mobility, sports, sleep с `auto` `sleepHours >= 7.5`, nutrition, negotiation, leadership, delegation, teamwork, workout с `auto` `workoutMin`); `LEGACY_SKILL_BY_TEMPLATE: Record<string, SkillId>`, `DEFAULT_SKILL_BY_STAT: Record<Stat, SkillId>`, `legacyRank(d: unknown): Rank`.
- `types.ts`: `Quest['auto']['metric']` += `'workoutMin'`.

- [ ] **Тест (падает):**
  ```ts
  test('24 навыка: по 3 на характеристику + 3 рабочих, без Наставничества', () => {
    expect(SKILL_CATALOG).toHaveLength(24);
    for (const s of STAT_KEYS) expect(SKILL_CATALOG.filter(k => k.stat === s)).toHaveLength(3);
    expect(SKILL_CATALOG.filter(k => k.stat === 'team').map(k => k.id)).toEqual(['leadership', 'delegation', 'teamwork']);
    expect(isSkillId('mentoring')).toBe(false); expect(isSkillId(['reading'])).toBe(false);
  });
  test('доли XP [S§1]', () => {
    expect(splitXp(92, ['strength'])).toEqual({ skills: [['strength', 92]], stats: { str: 92 } });
    expect(splitXp(100, ['strength', 'cardio'])).toEqual({ skills: [['strength', 60], ['cardio', 40]], stats: { str: 60, end: 40 } });
    expect(splitXp(49, ['reading', 'tech'])).toEqual({ skills: [['reading', 29], ['tech', 20]], stats: { int: 49 } });
    expect(splitXp(51, ['leadership']).stats).toEqual({ cha: 26, dis: 25 });
    expect(splitXp(100, ['reading', 'teamwork']).stats).toEqual({ int: 60, cha: 20, dis: 20 });
  });
  test('банк: каждый шаблон с валидными навыками, каждый навык покрыт', () => { /* every t.skills isSkillId; union covers all 24 */ });
  test('легаси-карты покрывают все старые templateId', () => {
    for (const id of ['pushups','steps','read','words','plan','focus','compliments','expenses','save','meditate','no_games','no_custom','ai'])
      expect(isSkillId(LEGACY_SKILL_BY_TEMPLATE[id] ?? DEFAULT_SKILL_BY_STAT.str)).toBe(true);
    expect([1, 2, 3, 4, 5, 0, 'x', undefined].map(legacyRank)).toEqual(['E', 'E', 'D', 'C', 'B', 'E', 'E', 'E']);
  });
  test('параметр по рангу', () => {
    const steps = QUEST_TEMPLATES.find(t => t.id === 'steps')!;
    expect(paramFor(steps, 'C', 1)).toBe(Math.round(steps.base * 1.5));
    const read = QUEST_TEMPLATES.find(t => t.id === 'read')!;
    expect(paramFor(read, 'D', 1)).toBe(read.base * 2);
  });
  ```
- [ ] Run — FAIL. Реализовать (ID старых шаблонов не менять — они в журнале). Нетривиальное: `splitXp` — главному `Math.round(0.6x)`, второму остаток; рабочий навык — `Math.round(v/2)` в Харизму, остаток в Дисциплину; одинаковые характеристики суммируются.
- [ ] Run — PASS, `npm run build`. Коммит `feat(domain): 24-skill catalog and skill-tagged quest bank`.

### Task 3: Календарь сезонов, типы дней, закрытие дня

**Files:** Create `src/domain/calendar.ts`, `src/domain/calendar.test.ts`, `src/domain/dayType.ts`, `src/domain/dayType.test.ts`. Modify `src/domain/balance.ts` (`dayTypes: DEFAULT_DAY_TYPES`).

**Interfaces — produces:**
- `calendar.ts`: `type ThemeId = 'mind_spirit'|'body'|'people'|'money_discipline'`; `THEMES: Record<ThemeId, { name: string; stats: Stat[]; teamSkills: boolean }>`; `interface Season { id: string; kind: 'prologue'|'winter'|'spring'|'summer'|'autumn'; name: string; start: ISODate; end: ISODate; defaultTheme: ThemeId | null }`; `seasonOf(date: ISODate): Season`; `themeBonusApplies(theme: ThemeId | null, stat: Stat, skills: readonly SkillId[]): boolean`.
- `dayType.ts`: `type DayKind = 'day'|'evening'|'off'|'rest'`; `interface DayType` (спека §6.1); `DEFAULT_DAY_TYPES: DayType[]`; `validDayType(x: unknown): DayType | null`; `closeMinutes(t: DayType | null): number`; `gameDateAt(ts: number, closeOf: (d: ISODate) => number): ISODate`; `closesAtTs(date: ISODate, closeMin: number): number`; `legacyDayType(work: Win | null, wakeAt: HHMM, bed: HHMM): DayType`.

- [ ] **Тест (падает):**
  ```ts
  test('сезоны [P§6]', () => {
    expect(seasonOf('2026-11-30')).toMatchObject({ kind: 'prologue', defaultTheme: null });
    expect(seasonOf('2026-12-01')).toMatchObject({ id: 'winter-2026', kind: 'winter', start: '2026-12-01', end: '2027-02-28', defaultTheme: 'mind_spirit' });
    expect(seasonOf('2027-03-01').kind).toBe('spring'); expect(seasonOf('2027-08-31').kind).toBe('summer');
    expect(seasonOf('2027-11-30').kind).toBe('autumn'); expect(seasonOf('2028-02-29').id).toBe('winter-2027');
    expect(THEMES.mind_spirit.stats).toEqual(['int', 'spi']);
    expect(themeBonusApplies('people', 'dis', ['leadership'])).toBe(true);
    expect(themeBonusApplies(null, 'int', ['reading'])).toBe(false);
  });
  test('закрытие дня = отбой + 1 ч, в пределах 00:00–04:00 [S§6]', () => {
    const t = (bed: string | null) => closeMinutes({ ...DEFAULT_DAY_TYPES[0], bed });
    expect(['00:00', '01:00', '03:00', '05:00', '23:30', '22:00', '12:00', null].map(t)).toEqual([60, 120, 240, 240, 30, 0, 0, 240]);
    expect(closeMinutes(null)).toBe(240);
  });
  test('игровая дата по закрытию вчерашнего дня', () => {
    const closeOf = (d: string) => (d === '2026-12-01' ? 60 : 240);
    expect(gameDateAt(at('2026-12-02', 0, 59), closeOf)).toBe('2026-12-01');
    expect(gameDateAt(at('2026-12-02', 1, 0), closeOf)).toBe('2026-12-02');
    expect(gameDateAt(at('2026-12-03', 3, 59), closeOf)).toBe('2026-12-02');
    expect(closesAtTs('2026-12-01', 60)).toBe(at('2026-12-02', 1, 0));
  });
  test('типы дней по умолчанию [P§2] и валидация', () => {
    expect(DEFAULT_DAY_TYPES.map(d => [d.kind, d.slots])).toEqual([['day', 4], ['evening', 3], ['off', 5], ['rest', 1]]);
    expect(validDayType({ id: 'x', kind: 'day', label: 'А', wake: '25:00', busy: null, bed: null, slots: 4 })).toBeNull();
    expect(validDayType({ ...DEFAULT_DAY_TYPES[0], slots: 99 })).toBeNull();   // слоты 1–7
    expect(validDayType('x')).toBeNull();
  });
  ```
- [ ] Run — FAIL. Реализовать. Нетривиальное: `gameDateAt` — `cal = gameDate(ts, 0)`, минуты локального времени; `< closeOf(addDays(cal,-1))` → вчера. Сезон по месяцу: дек→зима года `y`, янв/фев→зима года `y-1`. `validDayType`: HH:MM regex, метка 1–40 символов, `slots` целое 1–7.
- [ ] Run — PASS, build. Коммит `feat(domain): seasons calendar, day types and per-day close time`.

### Task 4: Стартовый профиль из анкеты (правила + ИИ)

**Files:** Create `src/domain/startProfile.ts`, `src/domain/startProfile.test.ts`. Modify `src/domain/types.ts` (`Analysis` + необязательные `scores?`, `startLevel?`, `levelWhy?`, `skillLevels?`), `src/domain/interview.ts` (`validAnalysis`), `src/domain/interview.test.ts`, `src/ai/interview.ts` (промпт и JSON-схема разбора), `src/ai/interview.test.ts`.

**Interfaces — consumes:** `startBase`, `SkillId`, `isSkillId`, `ruleStats`, `initialStats`, `cleanAnswers`.
**Produces:**
- `scoreFrom20(v: number): number`
- `ruleStartLevel(scores: Record<Stat, number>): number`
- `ruleSkillLevels(a: Answers): Partial<Record<SkillId, number>>` (таблица спеки §5.2, максимум `BALANCE.skill.rulesStartMax`)
- `interface StartProfile { source: 'ai'|'rules'|'none'; scores: Record<Stat, number>; base: Record<Stat, number>; level: number; levelWhy: Partial<Record<Stat, string>>; skills: Record<SkillId, number> }`
- `startProfile(inputs: { analysis: Analysis | null; answers: Answers | null; profile: Profile | null }[]): StartProfile` — по всем анкетам/онбордингам; оценки — поэлементный максимум; уровень — максимум; навыки — максимум.

- [ ] **Тест (падает):**
  ```ts
  test('старые 1–20 → 0–100', () => { expect([1, 10, 20].map(scoreFrom20)).toEqual([0, 47, 100]); });
  test('правила: уровень = среднее/2 в пределах 1–50 (моё решение)', () => {
    expect(ruleStartLevel(fill(40))).toBe(20); expect(ruleStartLevel(fill(0))).toBe(1); expect(ruleStartLevel(fill(100))).toBe(50);
  });
  test('правила навыков из ответов', () => {
    expect(ruleSkillLevels({ pushups: 25, books: 4, meditation: 'Иногда', tracking: 'Веду регулярно' }))
      .toMatchObject({ strength: 3, reading: 4, mindfulness: 3, budget: 4 });
    expect(Math.max(...Object.values(ruleSkillLevels(MAXED_ANSWERS)))).toBeLessThanOrEqual(4);
  });
  test('ИИ-разбор нового формата', () => {
    const p = startProfile([{ analysis: { ...OLD_ANALYSIS, scores: fill(60), startLevel: 24, levelWhy: { str: 'зал 3 года' }, skillLevels: { strength: 6 } }, answers: {}, profile: null }]);
    expect(p).toMatchObject({ source: 'ai', level: 24, base: fill(44) });
    expect(p.skills.strength).toBe(6); expect(p.skills.reading).toBe(1);
  });
  test('старый ИИ-разбор (stats 1–20) → правила уровня', () => {
    const p = startProfile([{ analysis: OLD_ANALYSIS /* stats все 10 */, answers: {}, profile: null }]);
    expect(p).toMatchObject({ source: 'rules', level: 24, base: fill(36) });   // 47/2 → 24; 5+0.65·47=35.55 → 36
  });
  test('нет ничего → уровень 1, Основа 5', () => { expect(startProfile([])).toMatchObject({ source: 'none', level: 1, base: fill(5) }); });
  test('validAnalysis: плохие новые поля отбрасываются по одному', () => {
    for (const bad of [0, 101, '20', 2.5]) expect(validAnalysis({ ...OLD_ANALYSIS, startLevel: bad })?.startLevel).toBeUndefined();
    expect(validAnalysis({ ...OLD_ANALYSIS, startLevel: 61 })?.startLevel).toBeUndefined();   // ИИ-максимум 60
    expect(validAnalysis({ ...OLD_ANALYSIS, scores: { ...fill(50), str: 140 } })?.scores).toBeUndefined();
    expect(validAnalysis({ ...OLD_ANALYSIS, skillLevels: { strength: 8, reading: 3, mentoring: 5 } })?.skillLevels).toEqual({ reading: 3 });
    expect(validAnalysis({ ...OLD_ANALYSIS, stats: null })).toBeNull();   // старые обязательные поля — как раньше
  });
  ```
- [ ] Run — FAIL. Реализовать. `src/ai/interview.ts`: в схему разбора добавить `scores` (0–100 по 7 сферам, соответствие сфер [S§2]), `startLevel` (1–60) + `levelWhy` (по фразе на сферу), `skillLevels` (таблица [S§4], не выше 7); `stats` 1–20 оставить для совместимости (ИИ выводит из `scores`). Тест `ai/interview.test.ts`: мок-ответ с новыми полями проходит `validAnalysis`.
- [ ] Run — PASS, build. Коммит `feat(domain): start level, base stats and skill levels from interview`.

### Task 5: Replay I — леджер, поток XP, золото, миграция, удаление Тени

**Files:** Modify `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/domain/achievements.ts` (+test), `src/domain/weekly.ts` (+test). Delete `src/domain/shadow.ts`, `src/domain/shadow.test.ts`, `src/domain/skills.ts`, `src/domain/skills.test.ts`. Minimal compile fixes: `src/ui/HeroStage.tsx` (счёт против Тени → «серия N дн.»), `src/ui/HeroExtras.tsx` (топ-3 навыка по уровню), `src/screens/Skills.tsx` (список 24 навыков по группам: название, «Lv n/10», полоска `into/need`; без покупки узлов), `src/screens/Home.tsx` (удалить блок `shadowMetrics`), `src/screens/Analytics.tsx` (убрать линию Тени), `src/screens/Character.tsx` (плашки дней — по `counted`, «очки» → `statInfo.xp`), `src/screens/Shop.tsx` + HeroStage (`currency` → `gold`, «Золото»), `src/ui/pickCelebration.ts` (+test: `win` → `{ kind: 'perfect'; date }`), `src/ai/tasks.ts` (строки истории без Тени).

**Interfaces — consumes:** T1–T4 (`questReward`, `baseFromXp`, `skillFromXp`, `splitXp`, `primaryStat`, `legacyRank`, `LEGACY_SKILL_BY_TEMPLATE`, `DEFAULT_SKILL_BY_STAT`, `seasonOf`, `themeBonusApplies`, `startProfile`, `levelFromXp`).
**Produces:**
- `types.ts`: `Quest` с необязательными `rank`, `skills`, `kind`, `why`, `difficulty?`; `GameEvent` + `season_theme_set`; `quest_completed.verify?`, `photo?`; `LedgerEntry`, `StatInfo` (поля формы пока `null`/`'new'`), `SkillState`, `DayQuest`, `DayResult` (спека §9), `GameState` по спеке §9 без полей дня из T6/T7.
- `replay.ts`: `normQuest(raw: unknown, date: ISODate): DayQuest | null` (экспорт для тестов), `replay(events: GameEvent[], now: number, cutoffHour = 4): GameState` (параметр уйдёт в T6). Цикл по датам от первого дня с заданиями: на начало дня — снимок Основы → слабейшая; тема `themeOn(date)`; затем строки леджера по выполненным.
- `achievements.ts`: без `shadow_*`; `earnAchievements(days, today, startLevel = 1)`; `first_skill` по счётчику `skills` (навык достиг 2).
- `weekly.ts`: `WeeklyKind` без генерации `shadow_wins` (тип остаётся для легаси); без шагов → `stat_quests` по `themeStat`; `xp = BALANCE.weeklyXp`; `WeeklyCtx` + `themeStat: Stat | null`.

- [ ] **Тест (падает)** — фикстура: онбординг `selfRating { str: 9, int: 9, остальные 5 }`, `sportLevel: 1` (Основа str/int выше остальных; слабейшая — `end`).
  ```ts
  test('легаси-журнал 17–19 ноября: XP как есть, ранг/навык по картам, золото 20%', () => {
    const s = replay([onboard, issue('2026-11-17', [q('a', '2026-11-17', 35, 'str', 3, 'pushups')]), done('2026-11-17', 'a'),
      ev({ type: 'skill_unlocked', skillId: 'str1' }), weeklyLegacyShadow], at('2026-11-19'));
    expect(s.totalXp).toBe(35); expect(s.gold).toBe(7 + 25 * s.achievements.length);
    expect(s.skills.strength.xp).toBe(35); expect(s.statInfo.str.xp).toBe(35);
    expect(s.history[0]).toMatchObject({ date: '2026-11-17', xp: 35, completed: 1, issued: 1 });
    expect(s.season).toMatchObject({ kind: 'prologue', xp: 0 });
    expect(s.ledger[0]).toMatchObject({ source: 'quest', questId: 'a', xp: 35, gold: 7, verified: false });
    expect('shadowXp' in s.today).toBe(false);
  });
  test('новое задание C, честное слово, Пролог → 49 XP, 10 золота, в сезон 0', () => {
    const s = replay([onboard, issue('2026-11-20', [nq('b', '2026-11-20', 'C', ['strength'])]), done('2026-11-20', 'b')], at('2026-11-21'));
    expect(s.ledger.at(-1)).toMatchObject({ base: 70, k: 0.7, xp: 49, gold: 10 });
    expect(s.season.xp).toBe(0); expect(s.level).toBe(s.startLevel);
  });
  test('Зима: тема +20% Интеллекту → 59 XP и в сезон', () => {
    const s = replay([onboard, issue('2026-12-01', [nq('c', '2026-12-01', 'C', ['reading'])]), done('2026-12-01', 'c')], at('2026-12-01', 22));
    expect(s.ledger.at(-1)).toMatchObject({ bonus: 0.2, xp: 59 }); expect(s.season).toMatchObject({ kind: 'winter', xp: 59, step: 0 });
  });
  test('season_theme_set меняет тему с даты события до конца сезона', () => { /* body на 2026-12-05 → int-задание 06.12 без бонуса */ });
  test('слабейшая +25%: D Кардио → 35', () => { /* 40·0.7·1.25 */ });
  test('два тега 60/40 → навыки и характеристики', () => {
    /* B ['strength','cardio'] honest = 84 → strength 50, cardio 34; statInfo.str.xp 50, end 34 */
  });
  test('Основа растёт от XP характеристики, стартовая — из анкеты', () => { /* stats.str = baseFromXp(start.base.str, statXp).value */ });
  test('авто-проверка: метрика выполнена → ×1,0 даже после ручной галочки', () => {
    /* nq с auto steps>=6000, done вручную, metric_logged steps 7000 → k 1, verified true */
  });
  test('фото: verify photo → ×0,9; битый photo-блоб → честное слово', () => {});
  test('легаси-покупка остаётся валидной после пересчёта золота', () => {
    /* старый фикс: заработано 300 XP, куплено за 30 при старых 10% → покупка в purchases, gold = 60 − 30 */
  });
  test('500 случайных битых событий не бросают', () => {
    const rnd = seededRng('fuzz'); const vals = [null, undefined, 1, -1, NaN, 'x', [], {}, [1], { a: 1 }, '2026-11-17', 'E', 'Z'];
    const types = ['quests_issued','quest_completed','day_started','day_changed','quest_rerolled','custom_quest_added','season_theme_set','reward_created','reward_purchased','interview_completed','weekly_issued','skill_unlocked','metric_logged','health_packet','boss_created'];
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const evs = Array.from({ length: 500 }, (_, i) => ev({ type: pick(types), date: pick(vals), quests: [{ id: pick(vals), rank: pick(vals), skills: pick(vals), xp: pick(vals), stat: pick(vals) }], questId: pick(vals), quest: pick(vals), dayType: pick(vals), theme: pick(vals), verify: pick(vals), ts: at('2026-11-17') + i } as any));
    expect(() => replay(evs, at('2026-11-20'))).not.toThrow();
  });
  test('перемешанный журнал даёт тот же state', () => { expect(replay(evs, NOW)).toEqual(replay([...evs].reverse(), NOW)); });
  ```
  Старые тесты replay про Тень (`shadowXp`, `won`, `shadowWinStreak`, бонус победы, `skill_unlocked`-эффекты) удалить или переписать на новые правила; остальные (синк, магазин, боссы, недельные, метрики, интервью, календарь) — сохранить, поправив ожидания XP/золота.
- [ ] Run — FAIL. Реализовать. Нетривиальное:
  - `normQuest`: без `rank` → легаси (`legacyRank(difficulty)`, навык по карте, `legacyXp = clamp(q.xp, 0, 10000)`); с `rank` — `rank ∈ RANKS`, `skills` 1–2 валидных различных `SkillId`, иначе задание отбрасывается; `stat` = `primaryStat(skills)`.
  - XP строки: легаси — `legacyXp`, `k = 1`, `verified: false`; новое — `questReward` с `verify` = авто (метрика выполнена) / фото / честное слово; бонусы этой задачи — только тема и слабейшая (серия и штрафы — T6).
  - Золото: `Σ ledger.gold + achievementGold × достижения − покупки` (покупки проверяются как сейчас).
  - Сезон: `xp` = Σ строк с `seasonOf(date).id === seasonOf(today).id` и не Пролог; `step = min(steps, floor(xp / stepXp))`.
  - `statHistory` — Основа на конец каждого закрытого дня.
- [ ] Run — PASS, `npx vitest run`, `npm run build`. Коммит `feat(domain): v2 XP ledger, stats/skills/season flow, legacy migration; remove daily Shadow`.

### Task 6: Replay II — день: закрытие по типу, серия, штрафы, Форма, «День изменился»

**Files:** Modify `src/domain/types.ts` (`day_started` + `dayType?`, `energy?`; новые `day_types_set`, `day_changed`), `src/domain/replay.ts`, `src/domain/replay.test.ts`. Create `src/domain/streak.ts`, `src/domain/streak.test.ts`. Remove `cutoffHour`: `src/useGame.ts`, `src/backup.ts` (+tests), `src/screens/Home.tsx` (сравнение с `today.closesAt`; чек-ин открыт, если всё сделано, или ≥18:00, или календарная дата ≠ `today.date`), `src/screens/Settings.tsx` (убрать выбор часа).

**Interfaces — consumes:** `gameDateAt`, `closeMinutes`, `closesAtTs`, `validDayType`, `legacyDayType`, `DEFAULT_DAY_TYPES`, `streakBonus`, `formNorm`, `formOf`, `formStatus`.
**Produces:**
- `streak.ts`: `dayOutcome(d: { issued: number; done: number; dropped: number; rest: boolean }): { counted: boolean; perfect: boolean; neutral: boolean }`; `nextStreak(prev: number, o: ReturnType<typeof dayOutcome>, freeze: boolean): number`.
- `replay(events: GameEvent[], now: number): GameState`; `GameState.today` + `closesAt`, `dayType`, `energy` (0–100 | null), `changed`, `restDaysLeft`; `GameState.dayTypes`; `StatInfo` с формой; `DayQuest.dropped`; бонус серии, штрафы «Ослабление»/«Перекос», `mult = 2` для `kind: 'restore'`.

- [ ] **Тест (падает):** хелпер `at(date, h = 12, m = 0)` в `replay.test.ts` получает минуты.
  ```ts
  test('итог дня [S§6]', () => {
    expect(dayOutcome({ issued: 5, done: 3, dropped: 0, rest: false })).toMatchObject({ counted: true, perfect: false });
    expect(dayOutcome({ issued: 5, done: 2, dropped: 0, rest: false }).counted).toBe(false);
    expect(dayOutcome({ issued: 4, done: 3, dropped: 1, rest: false })).toMatchObject({ counted: true, perfect: true });
    expect(dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false }).counted).toBe(false);
    expect(nextStreak(10, dayOutcome({ issued: 5, done: 2, dropped: 0, rest: false }), false)).toBe(5);
    expect(nextStreak(7, dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false }), false)).toBe(3);
    expect(nextStreak(7, dayOutcome({ issued: 1, done: 0, dropped: 0, rest: true }), false)).toBe(7);
    expect(nextStreak(7, dayOutcome({ issued: 3, done: 0, dropped: 0, rest: false }), true)).toBe(7);
  });
  test('Дневная смена (отбой 00:00): 00:30 ещё вчера, 01:00 уже сегодня', () => {
    const evs = [onboard, ev({ type: 'day_started', date: '2026-12-01', work: null, wakeAt: '08:00', dayType: DEFAULT_DAY_TYPES[0], ts: at('2026-12-01', 8) })];
    expect(replay(evs, at('2026-12-02', 0, 30)).today).toMatchObject({ date: '2026-12-01', closesAt: at('2026-12-02', 1, 0) });
    expect(replay(evs, at('2026-12-02', 1, 0)).today.date).toBe('2026-12-02');
  });
  test('Вечерняя смена (отбой 03:00): 03:59 ещё вчера; день без старта закрывается в 04:00', () => {});
  test('день без старта и старый day_started без dayType → синтез типа и закрытие 04:00', () => {});
  test('серия: 5 засчитанных дней, затем 2/5 → 2, затем пустой день → 1', () => {});
  test('бонус серии: серия 10 на начало дня, C честное → 59', () => {   // 70·0.7·1.2 = 58.8 (не слабейшая, не тема)
  });
  test('идеальный день: строка perfect_day +50 XP, 10 золота', () => {});
  test('Ослабление: 3 дня без выполненного → D Режим 22', () => {});        // 40·0.7·0.8 = 22.4
  test('Перекос: 7 дней только Силой (≥200 XP, Сила сильнейшая) → −20% к Силе', () => {});
  test('день отдыха: серия не меняется и день не в окне формы; 15-й за месяц — обычный', () => {});
  test('Форма из плана в первые 30 дней: 14 дней по 49 выдано, сделано 2 → ~20%, «Заброшена»', () => {
    /* норма = 0.7·49 = 34.3; 98 / (14·34.3) = 0.204 */
    expect(s.statInfo.str.status).toBe('abandoned'); expect(s.statInfo.str.form!).toBeGreaterThan(0.19); expect(s.statInfo.str.form!).toBeLessThan(0.22); // бонус серии может дать 49→50
  });
  test('«Вернуть форму» ×2: E честное → 28', () => {});
  test('«День изменился»: дневная (4) → вечерняя (3), 1 сделано → 1 dropped; +20 один раз; закрытие по новому отбою', () => {
    /* два day_changed за дату → одна строка source 'day_changed' xp 20 gold 4 */
  });
  test('неверные dayType/energy игнорируются', () => { /* energy 11 → today.energy = lastEnergy·10 или 50 */ });
  test('day_types_set: последнее побеждает, невалидные элементы отброшены, пустой список → умолчания', () => {});
  ```
- [ ] Run — FAIL. Реализовать. Нетривиальное:
  - Два прохода: (1) собрать первые `day_started` и последние `day_changed` по датам → `closeOf(d)`; (2) все даты через `gameDateAt(ts, closeOf)` (интервью, боссы, покупки, перебросы).
  - Снимок на начало дня d: серия, Основа (слабейшая/сильнейшая), «Ослабление» (три предыдущих не-отдыхающих дня без выполненных и d > первого дня), «Перекос» (доля сильнейшей в XP характеристик за 7 закрытых дней > 0,5 и сумма ≥ 200).
  - `dropped` при смене дня: невыполненные с конца порядка выдачи, пока `всего − dropped > слоты` и `выполнено + невыполненные_оставшиеся > слоты`.
  - Форма — после закрытия дня: окно — последние `min(14, n)` закрытых не-отдыхающих дней; норма из плана (`Σ Quest.xp` предпросмотров по долям характеристик / закрытые дни) первые 30 дней от первого дня, потом 60-дневное среднее фактического; `lastRestore` — дата последнего выданного `restore` по характеристике.
  - Energy дня: `day_started.energy·10` → `lastEnergy·10` → `BALANCE.energy.fallback`.
- [ ] Run — PASS, `npx vitest run`, `npm run build`. Коммит `feat(domain): day types, bedtime-based day close, v2 streak, penalties, form`.

### Task 7: Replay III — переброс, свои задания, магазин с эффектами, стартовый набор

**Files:** Modify `src/domain/types.ts` (`quest_rerolled`, `custom_quest_added`, `reward_created.effect?`), `src/domain/balance.ts` (`rewards: DEFAULT_REWARDS`), `src/domain/replay.ts`, `src/domain/replay.test.ts`. Create `src/domain/shopDefaults.ts`, `src/domain/shopDefaults.test.ts`.

**Interfaces — consumes:** цикл дней T6, `rankCap`, `questReward`.
**Produces:**
- `today.rerollsUsed`, `today.nextRerollCost` (0 | 50), `today.customCount`; `rewards[].effect`.
- `DEFAULT_REWARDS: { slug: string; title: string; price: number; effect?: 'streak_freeze' | 'day_off' }[]` (спека §7.6).
- `missingDefaultRewards(events: GameEvent[]): Extract<NewEvent, { type: 'reward_created' }>[]` — `rewardId: 'default:<slug>'` для тех, чьего `reward_created` с таким id в журнале нет.

- [ ] **Тест (падает):**
  ```ts
  test('переброс: 1-й бесплатно, 2-й за 50 при золоте прошлых дней, 3-й отклонён', () => {
    /* 09.11 легаси-задание 300 XP → 60 золота; 10.11: три переброса разных заданий */
    expect(s.today.quests.map(q => q.id)).toEqual([...]);   // 1-й и 2-й заменены, 3-й нет
    expect(s.gold).toBe(60 - 50 + 25 * s.achievements.length); expect(s.today.nextRerollCost).toBe(50);
  });
  test('переброс: сегодняшний заработок не считается; сделанное, restore и custom не перебрасываются; другой ранг замены — отказ', () => {});
  test('второй переброс той же questId (второе устройство) игнорируется', () => {});
  test('своё задание: 3-е за день игнор; XP своих ≤ треть остальных', () => {
    /* обычное B честное 84 + своё B честное 84 → своё засчитано 28; итог дня 112 */
  });
  test('своё задание выше потолка режется до потолка', () => {});
  test('заморозка: пропуск после покупки не режет серию; 3-я покупка в месяц отклонена', () => {});
  test('«день без заданий»: день покупки нейтрален для серии', () => {});
  test('стартовый магазин: 8 наград; двойной посев → 8; удалённая не возвращается', () => {
    const seed = missingDefaultRewards([]);
    expect(seed.map(e => [e.rewardId, e.price])).toEqual([['default:episode', 50], ['default:games', 150], ['default:match', 200],
      ['default:cheatmeal', 200], ['default:freeze', 300], ['default:book', 400], ['default:dayoff', 600], ['default:treat', 1000]]);
    const evs = [...seed, ...seed].map((e, i) => ev({ ...e, ts: i + 1 }));
    expect(replay(evs, NOW).rewards).toHaveLength(8);
    const del = [...evs, ev({ type: 'reward_deleted', rewardId: 'default:games' })];
    expect(missingDefaultRewards(del)).toEqual([]);
  });
  ```
- [ ] Run — FAIL. Реализовать. Нетривиальное: платные траты с эффектом (переброс, `streak_freeze`, `day_off`) принимаются в цикле дня по `золото строк с датой < d − цены всех reward_purchased с ts раньше − ранее принятые платные траты ≥ цена` (спека §6.7, §7.4) и в финальной проверке покупок не перепроверяются, но вычитаются. Урезание своих заданий — пропорционально по их строкам, остаток округления — последней строке.
- [ ] Run — PASS, build. Коммит `feat(domain): reroll, custom quests, shop effects and starter rewards`.

### Task 8: Сборка дня по правилам и тексты ИИ

**Files:** Create `src/domain/assemble.ts`, `src/domain/assemble.test.ts`. Delete `src/domain/generate.ts`, `src/domain/generate.test.ts`. Modify `src/domain/questBank.ts` (убрать `difficulty` из шаблонов), `src/domain/schedule.ts` (+test: `minWindow`, `latestEnd`), `src/domain/difficulty.ts` (+test: пороги 0,85/0,6 из `BALANCE.calibration`), `src/domain/xp.ts` (удалить `questXp`, `currencyFor`), `src/screens/issue.ts` (+test), `src/ai/tasks.ts` (+test), `src/screens/MyDay.tsx` (минимально: передаёт синтезированный `DayType`; полноценный выбор — T9).

**Interfaces — consumes:** `GameState` (T5–T7), `rankCap`, `rankShift`, `paramFor`, `questReward`, `themeBonusApplies`, `freeWindows`, `placeQuests`, `seededRng`.
**Produces:**
- `interface AssembleCtx { date: ISODate; dayType: DayType; wakeAt: HHMM; energy: number; level: number; skills: Record<SkillId, { level: number; lastDate: ISODate | null }>; stats: Record<Stat, number>; statInfo: Record<Stat, Pick<StatInfo, 'form' | 'status' | 'lastRestore'>>; theme: ThemeId | null; bossStats: Stat[]; recent: { date: ISODate; stats: Stat[]; templateIds: string[] }[]; profile: Profile; multipliers: Record<Stat, number>; bestSteps7: number | null; busy: Win[] }`
- `slotsFor(t: DayType, energy: number): { base: number; challenge: 0 | 1 }`
- `rankPlan(total: number, challenge: 0 | 1): { own: number; below: number; challenge: 0 | 1 }`
- `priority(c: { stat: Stat; skill: SkillId; templateId: string }, ctx: AssembleCtx): number`
- `assembleDay(ctx: AssembleCtx): Quest[]` — у каждого `rank`, `skills`, `kind`, `why`, `xp` (предпросмотр), `window`
- `rerollCandidate(ctx: AssembleCtx, q: Quest, today: Quest[]): Quest | null`
- `issue.ts`: `assembleCtx(state: GameState, dayType: DayType, wakeAt: HHMM, energy: number): AssembleCtx`, `buildQuests(state, dayType, wakeAt, energy): Quest[]`
- `ai/tasks.ts`: `aiQuestTexts(cfg: AiConfig, state: GameState, quests: Quest[]): Promise<Record<string, { title: string; why: string }>>`, `validateAiTexts(raw: unknown, ids: string[]): Record<string, { title: string; why: string }>`, `applyTexts(quests: Quest[], t: Record<…>): Quest[]`; `aiDailyQuests`/`validateAiQuests` удаляются; `aiTuning`, `aiWeeklyReport` без Тени.

- [ ] **Тест (падает):** `ctx(over)` — тип `day`, Energy 50, уровень 25, все навыки 3 (потолок C), все формы 1, Пролог, `recent` с всеми характеристиками.
  ```ts
  test('слоты [S§6]', () => {
    expect(slotsFor(DEFAULT_DAY_TYPES[0], 50)).toEqual({ base: 4, challenge: 0 });
    expect(slotsFor(DEFAULT_DAY_TYPES[0], 30)).toEqual({ base: 3, challenge: 0 });
    expect(slotsFor(DEFAULT_DAY_TYPES[0], 80)).toEqual({ base: 4, challenge: 1 });
    expect(slotsFor(DEFAULT_DAY_TYPES[3], 90)).toEqual({ base: 1, challenge: 0 });
  });
  test('смесь рангов 60/30/10', () => {
    expect(rankPlan(4, 0)).toEqual({ own: 2, below: 2, challenge: 0 });
    expect(rankPlan(5, 1)).toEqual({ own: 3, below: 1, challenge: 1 });
    const qs = assembleDay(ctx({ energy: 80 }));
    expect(qs.map(q => q.rank).sort()).toEqual(['B', 'C', 'C', 'C', 'D']);
    expect(qs.filter(q => q.kind === 'challenge')).toHaveLength(1);
  });
  test('Energy < 40: 3 задания, есть Дух, нет вызова и физических C+', () => {});
  test('не больше 2 на характеристику; характеристика без заданий 2 дня попадает в день', () => {
    const qs = assembleDay(ctx({ recent: twoDaysWithout('fin') }));
    expect(qs.some(q => q.stat === 'fin')).toBe(true);
    for (const s of STAT_KEYS) expect(qs.filter(q => q.stat === s).length).toBeLessThanOrEqual(2);
  });
  test('«Вернуть форму»: Заброшена → restore D; был 3 дня назад → нет', () => {});
  test('приоритет: P = 3·босс + 2·(1−форма) + 1,5·тема + min(1, дни/7) − 2·повтор', () => {
    expect(priority({ stat: 'int', skill: 'reading', templateId: 'read' }, ctx({ theme: 'mind_spirit', bossStats: ['int'],
      statInfo: withForm('int', 0.5), skills: withLast('reading', '2026-11-27'), date: '2026-12-01', recent: withTemplate('read') }))).toBeCloseTo(3 + 1 + 1.5 + 4 / 7 - 2);
  });
  test('вечерняя смена: все окна до 16:00; тренировка кончается ≥2 ч до отбоя', () => {});
  test('предпросмотр XP: C честное без бонусов → 49', () => {});
  test('детерминизм: тот же ctx → тот же результат', () => {});
  test('переброс: тот же ранг, другой шаблон, не из сегодняшних', () => {});
  test('validateAiTexts: чужие id отброшены, длины 3–80 / ≤140, ранг и XP не меняются', () => {});
  ```
- [ ] Run — FAIL. Реализовать по спеке §6.4. Нетривиальное: порядок отбора — обязательные → вынужденные характеристики (нет заданий 2 дня) по P → остальные по P с ограничением 2 на характеристику; ранги назначаются после отбора: вызов — кандидату с наибольшим P среди оставшихся, `own` — следующим по P, остальным `rankShift(cap, −1)`; `maxRank` шаблона режет ранг; ничьи — `seededRng(date)`. MyDay: ИИ вызывается после сборки, при ошибке/таймауте — тексты шаблонов и пометка `aiFallback` как сейчас.
- [ ] Run — PASS, `npx vitest run`, `npm run build`. Коммит `feat(domain): rule-based day assembly; AI writes quest texts only`.

### Task 9: UI — Главная, «Мой день», карточка задания, смена дня, своё задание

**Files:** Modify `src/ui/HeroStage.tsx`, `src/screens/Home.tsx`, `src/screens/MyDay.tsx`, `src/screens/replan.ts` (+test), `src/styles.css`. Create `src/ui/QuestCard.tsx`, `src/ui/statBar.ts`, `src/ui/statBar.test.ts`, `src/screens/DayChanged.tsx`, `src/screens/CustomQuest.tsx`.

**Interfaces — consumes:** `GameState` (T5–T7), `buildQuests`, `rerollCandidate`, `assembleCtx`, `aiQuestTexts`, `saveBlob`, `shrinkImage`, `rankCap`, `SKILL_CATALOG`.
**Produces:**
- `statBar(base: number, form: number | null): { base: number; form: number }` — ширины в % (`base`, `base × (form ?? 1)`).
- `pathLabel(season: GameState['season'], today: ISODate): { title: string; sub: string; pct: number }` — Пролог: «Пролог · до Зимы N дн.»; сезон: «Зима · ступень 2/30», «до ступени 3: 40 / 600 XP» (при 1 240 XP).
- `replanForDayType(quests: DayQuest[], nowAt: HHMM, t: DayType, profile: Profile): DayQuest[]` (для отображения после «День изменился»; невыполненные `dropped` не показываются).

UI:
- **HeroStage:** строки характеристик — число Основы и двухслойная полоса (тёмная — Основа /100, яркая — Основа × Форма поверх, [S§2]); статус формы точкой и в `aria-label` («Сила 31, форма 38%, заброшена»). Карточка «Ты : Тень» заменена: серия (иконка `Flame`) + путь сезона (`pathLabel`, полоска). Монеты → «Золото».
- **QuestCard:** буква ранга (бейдж с цветом ранга), название, навык(и) · окно, `why` мелким, значок проверки (`Zap` авто / `Camera` фото / `Hand` честное слово), «+XP» (предпросмотр или итог), галочка (честное слово), кнопка фото (`input type=file accept=image/* capture=environment` → `shrinkImage` → `saveBlob('proof-<uuid>')` → `quest_completed { verify: 'photo', photo }`), кнопка переброса `Shuffle` с ценой («бесплатно» / «50»), для `restore` — метка «×2».
- **MyDay:** карточки `state.dayTypes` (иконки по `kind`) + необязательная утренняя энергия 1–10 → `day_started { dayType, energy, work: busy, wakeAt }`.
- **Home:** действия «День изменился» (лист `DayChanged`: типы дней, подсказка «+20 XP за гибкость», запись `day_changed`) и «Своё задание» (лист `CustomQuest`: название 3–80, навык, ранг от ИИ с таймаутом 15 с или правило «на ранг ниже потолка»; кнопка неактивна при `customCount ≥ 2`).

- [ ] **Тест (падает):** `statBar(48, 0.38)` → `{ base: 48, form: 18.24 }`; `statBar(30, null)` → `{ base: 30, form: 30 }`; `pathLabel` для 2026-11-19 → «Пролог · до Зимы 12 дн.»; для зимы с `xp: 1240` → `title` содержит «ступень 2/30», `pct` ≈ 6,67 (40 из 600); `replanForDayType` — вечерняя смена: окна до 16:00, `dropped` скрыты, сделанные не двигаются.
- [ ] Run — FAIL. Реализовать. Проверка руками (dev-сервер `?now=2026-12-01T09:00`): ширина 375 px без горизонтальной прокрутки, цели касания ≥44 px, переброс/фото/смена дня пишут события, «+XP» обновляется.
- [ ] `npx vitest run`, `npm run build`. Коммит `feat(ui): base+form stat bars, season path, rank quest cards, day-type picker, day changed, reroll, custom quests`.

### Task 10: UI — настройки, магазин, герой, аналитика, достижения, пуши

**Files:** Modify `src/screens/Settings.tsx`, `src/screens/Shop.tsx`, `src/screens/Character.tsx`, `src/screens/Analytics.tsx`, `src/screens/Achievements.tsx`, `src/App.tsx` (посев магазина), `src/ui/StatRadar.tsx` (шкала до 100), `worker/src/push.ts` (+test). Create `src/seed.ts`, `src/seed.test.ts`.

**Interfaces — consumes:** `missingDefaultRewards`, `DEFAULT_DAY_TYPES`, `validDayType`, `THEMES`, `seasonOf`, `GameState.start`, `statInfo`, `skills`.
**Produces:**
- `seedDefaultRewards(): Promise<number>` — читает журнал, дописывает `missingDefaultRewards` одной `appendEvents`; вызывается один раз после `initStorage()` в `App`.
- **Settings:** редактор типов дней (подъём, занят с/до или «нет», отбой, слоты 1–7, подпись) → `day_types_set`; «Сбросить к умолчаниям»; выбор темы сезона (4 темы, в Прологе неактивно с подписью «с 1 декабря») → `season_theme_set`.
- **Shop:** «Золото», метка эффекта у наград с `effect` («заморозка серии, до 2 в месяц», «день без заданий»), у заморозки — остаток на месяц.
- **Character:** «Стартовый уровень N» + объяснения по сферам (`start.levelWhy`, источник «ИИ»/«по правилам»), характеристики — Основа, «+XP до следующего очка», форма и статус; ссылка «Пройти анкету заново» для ИИ-уровня.
- **Analytics:** линии XP и Основы без Тени; дни серии из `history.counted`.
- **Achievements:** без иконок/групп Тени.
- **Пуши (`worker/src/push.ts`):** тексты без Тени («Новый день — новые задания…», «Отметь сделанное, пока день не закрылся»).

- [ ] **Тест (падает):** `seed.test.ts` (fake-indexeddb, как `backup.test.ts`): пустой журнал → 8 событий `reward_created`; повторный вызов → 0; после `reward_deleted` для `default:games` → 0. `worker/src/push.test.ts`: `message('morning', '2026-12-01').body` не содержит «Тен». `StatRadar`: `radarPoints` со значением 100 при `max` 100 лежит на ободе.
- [ ] Run — FAIL. Реализовать. Проверка руками: настройки сохраняют типы дней и тему, магазин показывает стартовый набор один раз на двух вкладках.
- [ ] `npx vitest run`, `npm run build`, `npm run worker:check`. Коммит `feat(ui): day-type and season-theme settings, gold shop starter set, v2 hero and analytics`.

---

## После плана

- Отложенное по этапам — спека §10. Призрак займёт место рядом с серией и путём сезона на Главной (этап 6).
- Перед 1 декабря: прогнать приложение на реальном журнале владельца (экспорт → `backup.dryrun.test.ts`-стиль проверка, что replay не бросает и уровень/золото разумны), без коммита журнала в репозиторий.
