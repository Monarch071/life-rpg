# Life RPG v2 «Игровой слой» (этап 4) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax. TDD: сначала падающий тест, потом код.

**Goal:** лестницы привычек с ритуалами вне слотов, Враг-тень (грани, срывы, спад, битва в последнее воскресенье, изгнание, фигура тени), сезонный босс из 3 вариантов → 3 месячных части с уроном и переносом шагов, одна сюжетная цепочка, Усталость +5 за срыв, условие серии «все ритуалы ИЛИ 60%». Золото и магазин уже готовы с «Ядра» — критерий [P§8] «первая покупка» проверяется вручную.

**Architecture:** журнал событий — единственный источник правды. Новые чистые модули `ladder.ts`, `shadow.ts`, `boss.ts`, `text.ts` без знания о журнале; `replay` вызывает их в существующем цикле по датам. Числа — в `BALANCE`. Новые поля существующих событий только необязательные; новые события валидируются полями.

**Tech Stack:** React 18 + Vite + TypeScript strict, Dexie, vitest. Worker и D1 не меняются (типы событий Worker не проверяет). Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-20-life-rpg-v2-game-layer-design.md` (дальше «спека §N»). Конвенции — планы «Ядра» и «Автоматики». Числа в тестах — из [S§3], [S§6], [S§7], [S§8].

---

## Global Constraints

- `replay` — чистая, порядок событий не влияет, ни одно событие не бросает исключение; неизвестные типы игнорируются; первое событие с данным id сущности побеждает.
- Монотонность: решение по закрытому дню (ритуал, срыв, сила грани, итог окна, битва, урон, шаг босса) — только по событиям, принятым до закрытия этого дня; отметки (`ritual_done`, `shadow_relapse`) — только за игровую дату самого события.
- Ни одного числа баланса вне `BALANCE`. Ни XP не отнимается: срыв — данные, а не наказание.
- Репозиторий публичный: в коде, тестах, фикстурах — только обобщённые цели и привычки («Прочитать 3 книги», «Сладкое»). Никаких целей, мест и сумм владельца.
- Названия граней Тени никогда не уходят в промпты ИИ, пуши, на Главную; `dont`-лестницы в ИИ не уходят.
- Интерфейс по-русски, стиль «стеклянная ночь» (токены `:root`, `lucide-react`, цели касания ≥ 44 px, `aria-*`, `prefers-reduced-motion`), листы через существующий `useDialog`, запись через `useWrite`.
- После каждой задачи: `npx vitest run` и `npm run build` зелёные.
- Коммиты conventional, последняя строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

| # | Класс входа | Что может сломаться | Тесты (задача) |
|---|---|---|---|
| 1 | Недоверенные события сущностей (4 ступени, `per7: 8`, `start: 90`, имя 500 символов с управляющими, неизвестный навык, 2 части босса, 7 шагов цепочки, повтор id) | исключение в replay, раздутое состояние, мусор в UI | T1 «validLadderSteps: 4 ступени → null, per7 8 → null, плохой auto отброшен», «cleanText»; T3 «validBossDraft: 2 части → null»; T5 «start 90 → событие отброшено», «4-я грань игнор» |
| 2 | Время и монотонность (ритуал/срыв «за вчера», два устройства отмечают один ритуал, сигналы соцсетей после закрытия, окно через восстановление, битва на замороженный день) | меняется прошлое, двойной XP | T4 «ritual_done за вчера — игнор», «два ritual_done — одна строка», «3 дня восстановления сдвигают итог окна на 18-е»; T5 «срыв за вчера — игнор», «битва в день отдыха проходит» |
| 3 | Фарм (10 срывов в день ради +5 XP, повторный выбор босса ради 1 500, шаг босса через своё задание/переброс, удары своими заданиями, удары > 5) | бесплатный XP | T5 «два срыва в день → одна строка 5 XP и +8»; T6 «custom не бьёт», «удары ≤ 5 → HP 0 только со всеми шагами», «переброс boss-задания отклонён», «повторный season_boss_set после победы — игнор» |
| 4 | Границы автоматов (ровно 80% / 50%, второй провал, провал на ступени 1, рецидив ступени 5 при полных слотах, изгнание ровно на 30-й день, клэмп 0/100, последнее воскресенье) | застревание или прыжок ступени, ранняя/поздняя награда | T1 таблица `ladderAfterWindow`, `step5Relapse`; T2 `facetDay` 27, изгнание день 29 → нет, 30 → да; `lastSunday`; T4 «рецидив → ступень 4, первая в очереди» |
| 5 | Приватность и безопасность (грань «Ставки на спорт», алкоголь «Несколько раз в неделю», имя грани в промпте, на Главной) | игра из зависимости, утечка | T2 `isSerious`, «алкоголь часто не предлагается»; T3 «имя грани не в questContext/aiTuning/aiWeeklyReport»; T7 «на Главной нет имени грани» |

---

### Task 1: `BALANCE`, `text.ts`, чистые лестницы

**Files:** Modify `src/domain/balance.ts`, `src/domain/types.ts`. Create `src/domain/text.ts`, `src/domain/ladder.ts`, `src/domain/ladder.test.ts`.

**Interfaces — produces:**
- `balance.ts`: блоки `ladder`, `shadow`, `boss`, `chain`, `trophies`, `vitals.fatigue.relapse` (спека §10).
- `text.ts`: `cleanText(s: unknown, max: number): string | null` — убирает управляющие символы (`\u0000-\u001f\u007f`), `trim`, обрезает до `max`; пустое/не строка → `null`.
- `types.ts`: `LadderStep`, `LadderKind`, `FacetKind`, `BossDraft = { title: string; skill: SkillId; parts: { title: string; steps: string[] }[] }`; `QuestKind` += `'boss' | 'chain'`; `Quest.link?` (спека §5.3); `LedgerEntry.source` += `'ritual' | 'ladder' | 'shadow' | 'chain'`; новые события (спека §3.3, §4.1, §5.1, §6).
- `ladder.ts`:
  - `LADDER_PRESETS: Record<'read'|'sport'|'walk'|'meditate'|'water'|'social'|'sweets'|'late', { title: string; kind: LadderKind; skill: SkillId; steps: LadderStep[] }>` (спека §3.2)
  - `genericLadder(title: string, kind: LadderKind): { title; kind; skill: SkillId; steps: LadderStep[] }` — `skill`: `do` → `routine`, `dont` → `habits`
  - `validLadderSteps(x: unknown): LadderStep[] | null`
  - `requiredIn(step: LadderStep, days: { suitable: boolean }[]): number`
  - `ladderAfterWindow(cur: { step: number; attempt: 1 | 2 }, rate: number): { step: number; attempt: 1 | 2; bonus: number; ask: boolean }`
  - `step5Relapse(weekRates: number[]): boolean` — две последние недели < `relapseShare`
  - `ritualXp(step: number): number`

- [ ] **Тест (падает):**
  ```ts
  test('cleanText', () => {
    expect(cleanText('  а\u0007б  ', 40)).toBe('аб'); expect(cleanText('x'.repeat(50), 40)).toHaveLength(40);
    expect(cleanText('   ', 40)).toBeNull(); expect(cleanText(5, 40)).toBeNull();
  });
  test('переходы ступеней [S§7]: 80% / 50–79% один повтор / шаг назад', () => {
    expect(ladderAfterWindow({ step: 1, attempt: 1 }, 5 / 6)).toEqual({ step: 2, attempt: 1, bonus: 100, ask: false });
    expect(ladderAfterWindow({ step: 1, attempt: 1 }, 4 / 6)).toEqual({ step: 1, attempt: 2, bonus: 0, ask: false });
    expect(ladderAfterWindow({ step: 2, attempt: 1 }, 0.5)).toEqual({ step: 2, attempt: 2, bonus: 0, ask: false });
    expect(ladderAfterWindow({ step: 2, attempt: 2 }, 4 / 6)).toEqual({ step: 1, attempt: 1, bonus: 0, ask: true });
    expect(ladderAfterWindow({ step: 3, attempt: 1 }, 0.4)).toEqual({ step: 2, attempt: 1, bonus: 0, ask: true });
    expect(ladderAfterWindow({ step: 1, attempt: 1 }, 0.2)).toEqual({ step: 1, attempt: 1, bonus: 0, ask: true });
    expect(ladderAfterWindow({ step: 4, attempt: 1 }, 0.8)).toEqual({ step: 5, attempt: 1, bonus: 300, ask: false });
    expect([1, 2, 3, 4, 5].map(ritualXp)).toEqual([15, 20, 25, 30, 10]);
  });
  test('нужно за окно и рецидив ступени 5', () => {
    const d = (n: number, of = 14) => Array.from({ length: of }, (_, i) => ({ suitable: i < n }));
    expect(requiredIn({ label: 'x', per7: 3 }, d(14))).toBe(6);
    expect(requiredIn({ label: 'x', per7: 7 }, d(10))).toBe(10);
    expect(step5Relapse([0.5, 0.55])).toBe(true); expect(step5Relapse([0.5, 0.7])).toBe(false); expect(step5Relapse([0.59])).toBe(false);
  });
  test('шаблоны и валидация', () => {
    expect(LADDER_PRESETS.read.steps.map(s => s.per7)).toEqual([3, 5, 5, 7, 7]);
    expect(LADDER_PRESETS.sport.steps.map(s => s.per7)).toEqual([2, 3, 3, 4, 4]);
    expect(LADDER_PRESETS.social).toMatchObject({ kind: 'dont', steps: [{ auto: { metric: 'socialMin', op: '<=', value: 120 } }, {}, {}, {}, {}] });
    expect(genericLadder('Растяжка', 'do').steps.map(s => s.per7)).toEqual([3, 5, 5, 7, 7]);
    const ok = LADDER_PRESETS.read.steps;
    expect(validLadderSteps(ok.slice(0, 4))).toBeNull();
    expect(validLadderSteps([{ ...ok[0], per7: 8 }, ...ok.slice(1)])).toBeNull();
    expect(validLadderSteps([{ ...ok[0], label: '' }, ...ok.slice(1)])).toBeNull();
    expect(validLadderSteps([{ ...ok[0], auto: { metric: 'foo', op: '>=', value: 1 } }, ...ok.slice(1)])![0].auto).toBeUndefined();
  });
  ```
- [ ] `npx vitest run src/domain/ladder.test.ts` — FAIL.
- [ ] Реализовать. `ladderAfterWindow`: `rate ≥ pass` → `{ step: min(5, step+1), bonus: bonus[step-1] }`; `rate ≥ repeat && attempt === 1` → попытка 2; иначе `max(1, step−1)`, `ask`. Метрики auto — через `AUTO_METRIC_INFO`.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): ladder rules, game-layer balance, cleanText`.

### Task 2: Чистая Тень и Усталость за срыв

**Files:** Create `src/domain/shadow.ts`, `src/domain/shadow.test.ts`. Modify `src/domain/vitals.ts`, `src/domain/vitals.test.ts`.

**Interfaces — consumes:** T1 `BALANCE.shadow`, `cleanText`. **Produces:**
- `facetDay(f: { strength: number; cleanRun: number }, relapse: boolean, assist: boolean): { strength: number; cleanRun: number }`
- `banished(f: { strength: number; cleanRun: number }): boolean`
- `battleOutcome(strength: number | null): { result: 'crush' | 'win' | 'draw' | 'lost'; xp: number; trophy: 'rare' | null; plan: boolean } | null`
- `lastSunday(month: string /* 'ГГГГ-ММ' */): ISODate`
- `facetStart(kind: FacetKind, answers: Answers | null, freq?: 'rare' | 'sometimes' | 'often' | 'daily'): number`
- `isSerious(name: string, kind: FacetKind, answers: Answers | null): boolean`
- `facetSuggestions(profile: Profile | null, answers: Answers | null): { kind: FacetKind; name: string; start: number }[]` — без серьёзных, без дублей по `kind`
- `masterPlan(facets: { name: string; strength: number }[], hasDontLadder: boolean): string` — текст «плана Мастера» правилами
- `vitals.ts`: `fatigueNext(prev, day: { …; relapses?: number } | null, nightSleep)` — `+relapse × relapses`

- [ ] **Тест (падает):**
  ```ts
  test('сила грани [S§7]: +8 / −2 / неделя −5, клэмп', () => {
    let f = { strength: 50, cleanRun: 0 };
    for (let i = 0; i < 6; i++) f = facetDay(f, false, false);
    expect(f).toEqual({ strength: 38, cleanRun: 6 });
    f = facetDay(f, true, false); expect(f).toEqual({ strength: 46, cleanRun: 0 });
    for (let i = 0; i < 7; i++) f = facetDay(f, false, false);
    expect(f.strength).toBe(27);
    expect(facetDay({ strength: 98, cleanRun: 3 }, true, false).strength).toBe(100);
    expect(facetDay({ strength: 50, cleanRun: 0 }, false, true)).toEqual({ strength: 47, cleanRun: 1 });
  });
  test('изгнание: сила 0 и 30 чистых дней', () => {
    let f = { strength: 30, cleanRun: 0 };
    for (let i = 0; i < 13; i++) f = facetDay(f, false, false);
    expect(f.strength).toBe(0);
    for (let i = 13; i < 29; i++) f = facetDay(f, false, false);
    expect(banished(f)).toBe(false);
    expect(banished(facetDay(f, false, false))).toBe(true);
  });
  test('битва [S§7]', () => {
    expect(battleOutcome(27)).toEqual({ result: 'crush', xp: 400, trophy: 'rare', plan: false });
    expect([30, 49].map(s => battleOutcome(s)!.xp)).toEqual([250, 250]);
    expect(battleOutcome(50)).toEqual({ result: 'draw', xp: 50, trophy: null, plan: true });
    expect(battleOutcome(69)!.result).toBe('draw');
    expect(battleOutcome(70)).toEqual({ result: 'lost', xp: 0, trophy: null, plan: false });
    expect(battleOutcome(null)).toBeNull();
    expect(['2026-11', '2026-12', '2027-01', '2027-02'].map(lastSunday)).toEqual(['2026-11-29', '2026-12-27', '2027-01-31', '2027-02-28']);
  });
  test('старт из анкеты, безопасность, предложения', () => {
    expect(facetStart('smoke', { smoking: 'Регулярно' })).toBe(80);
    expect(facetStart('alcohol', { alcohol: 'Пару раз в месяц' })).toBe(30);
    expect(facetStart('games', { games_hours: 3 })).toBe(65);
    expect(facetStart('social', { screen_hours: 1 })).toBe(30);
    expect(facetStart('procr', null)).toBe(50);
    expect(facetStart('custom', null, 'daily')).toBe(80);
    expect(isSerious('Ставки на спорт', 'custom', null)).toBe(true);
    expect(isSerious('Сладкое', 'custom', null)).toBe(false);
    expect(isSerious('Пиво', 'alcohol', { alcohol: 'Несколько раз в неделю' })).toBe(true);
    expect(isSerious('Пиво', 'alcohol', { alcohol: 'Пару раз в месяц' })).toBe(false);
    const p = { badHabits: ['social', 'smoke'] } as unknown as Profile;
    expect(facetSuggestions(p, { smoking: 'Иногда', alcohol: 'Несколько раз в неделю', screen_hours: 5 }))
      .toEqual([{ kind: 'social', name: 'Соцсети', start: 65 }, { kind: 'smoke', name: 'Курение', start: 50 }]);
  });
  // vitals.test.ts
  test('Усталость +5 за срыв [S§3]', () => {
    expect(fatigueNext(50, { bigDay: false, rest: false, calm: false, lowEvening: false, relapses: 2 }, null)).toBe(55);
    expect(fatigueNext(50, { bigDay: false, rest: false, calm: false, lowEvening: false }, null)).toBe(45);
  });
  ```
- [ ] `npx vitest run src/domain/shadow.test.ts src/domain/vitals.test.ts` — FAIL.
- [ ] Реализовать. `isSerious`: регулярное выражение `/алког|наркот|веществ|казино|ставк|азарт|гемблинг|самоповрежд/i` по имени или `kind === 'alcohol'` с ответом «Несколько раз в неделю». `facetStart` — таблица спеки §4.1.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): shadow facets, battle, safety; fatigue +5 per relapse`.

### Task 3: Чистые боссы и цепочки, ИИ-черновики, белый список

**Files:** Create `src/domain/boss.ts`, `src/domain/boss.test.ts`, `src/ai/game.ts`, `src/ai/game.test.ts`. Modify `src/ai/tasks.test.ts`.

**Interfaces — consumes:** T1 `cleanText`, `BossDraft`, `validLadderSteps`. **Produces:**
- `boss.ts`:
  - `partHp(stepsDone: number, steps: number, hits: number): number`
  - `partWindows(start: ISODate, end: ISODate): { start: ISODate; end: ISODate }[]` — 3 календарных месяца сезона
  - `bossOptionsByRules(i: { goals: { text: string; stat: Stat }[]; legacy: { title: string; stat: Stat }[]; yearGoal: string | null; theme: ThemeId | null }): BossDraft[]`
  - `validBossDraft(x: unknown): BossDraft | null`
  - `chainByRules(goal: string): string[]`; `validChainSteps(x: unknown): string[] | null`
- `ai/game.ts`:
  - `aiBossOptions(cfg: AiConfig, goals: string[], fallback: BossDraft[]): Promise<BossDraft[]>` — ровно 3, невалидные заменяются `fallback[i]`
  - `aiChainSteps(cfg: AiConfig, goal: string): Promise<string[]>` — невалидный ответ → `AiError('bad_response')`
  - `aiLadderSteps(cfg: AiConfig, title: string): Promise<LadderStep[]>` — только `do`; невалидный → `AiError('bad_response')`

- [ ] **Тест (падает):**
  ```ts
  test('HP части: 80 за шаги, 4 за удар, не больше 5', () => {
    expect(partHp(0, 3, 0)).toBe(100); expect(partHp(1, 3, 2)).toBe(65); expect(partHp(3, 3, 0)).toBe(20);
    expect(partHp(3, 3, 5)).toBe(0); expect(partHp(0, 3, 9)).toBe(80);
  });
  test('части = месяцы сезона', () => {
    expect(partWindows('2026-12-01', '2027-02-28')).toEqual([
      { start: '2026-12-01', end: '2026-12-31' }, { start: '2027-01-01', end: '2027-01-31' }, { start: '2027-02-01', end: '2027-02-28' }]);
  });
  test('варианты босса правилами: цели → легаси → цель года → тема, без дублей', () => {
    const o = bossOptionsByRules({ goals: [{ text: 'Прочитать 3 книги', stat: 'int' }, { text: 'Прочитать 3 книги', stat: 'int' }],
      legacy: [{ title: 'Пробежать 10 км', stat: 'end' }], yearGoal: 'Выучить основы языка', theme: 'mind_spirit' });
    expect(o.map(x => x.title)).toEqual(['Прочитать 3 книги', 'Пробежать 10 км', 'Выучить основы языка']);
    expect(o.map(x => x.skill)).toEqual(['reading', 'cardio', 'reading']);
    expect(o.every(x => x.parts.length === 3 && x.parts.every(p => p.steps.length === 3))).toBe(true);
    expect(bossOptionsByRules({ goals: [], legacy: [], yearGoal: null, theme: 'body' })).toHaveLength(3);
  });
  test('валидация черновиков', () => {
    const ok = bossOptionsByRules({ goals: [], legacy: [], yearGoal: null, theme: 'body' })[0];
    expect(validBossDraft(ok)).toEqual(ok);
    expect(validBossDraft({ ...ok, parts: ok.parts.slice(0, 2) })).toBeNull();
    expect(validBossDraft({ ...ok, skill: 'flying' })).toBeNull();
    expect(validBossDraft({ ...ok, parts: [{ title: 'a', steps: ['x'.repeat(81), 'y'] }, ok.parts[1], ok.parts[2]] })).toBeNull();
    expect(chainByRules('Запустить хобби-проект')).toHaveLength(4);
    expect(validChainSteps(['a', 'b'])).toBeNull(); expect(validChainSteps(Array(7).fill('шаг'))).toBeNull();
  });
  // game.test.ts (vi.mock('./providers') как в tasks.test.ts)
  test('aiBossOptions: невалидный вариант заменяется правилами', async () => {
    const fb = bossOptionsByRules({ goals: [], legacy: [], yearGoal: null, theme: 'body' });
    gen.mockResolvedValue({ options: [fb[1], { title: 'x' }] });
    const r = await aiBossOptions(cfg, ['Цель'], fb);
    expect(r).toEqual([fb[1], fb[1], fb[2]]);
  });
  // tasks.test.ts
  test('грани Тени не уходят в ИИ', async () => {
    const s = replay([{ id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent,
      { id: 'f', ts: 2, deviceId: 'd', type: 'facet_added', facetId: 'f1', name: 'СЕКРЕТ-ГРАНЬ', kind: 'custom', start: 50 } as GameEvent],
      new Date(2026, 10, 17, 12).getTime());
    expect(questContext(s, profile)).not.toContain('СЕКРЕТ-ГРАНЬ');
    // ответы ИИ — те же заглушки, что в существующем тесте «aiTuning и aiWeeklyReport»
    gen.mockResolvedValue({ factors: {}, note: 'ok' }); await aiTuning(cfg, s, { went: '', notWent: '', energy: 5 }).catch(() => {});
    gen.mockResolvedValue({ text: 'ok' }); await aiWeeklyReport(cfg, s).catch(() => {});
    for (const c of gen.mock.calls) expect(JSON.stringify(c)).not.toContain('СЕКРЕТ-ГРАНЬ');
  });
  ```
- [ ] `npx vitest run src/domain/boss.test.ts src/ai/game.test.ts src/ai/tasks.test.ts` — FAIL (последний — пока нет `facet_added` в replay; после T5 он проходит, поэтому в этой задаче помечается `test.todo` и включается в T5).
- [ ] Реализовать. Общие части правил — константа `RULE_PARTS` (спека §5.1); темы-заглушки — по одной обобщённой цели на характеристику темы. Промпты ИИ получают только тексты целей (уже уходят в `questContext`).
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): boss parts, chains, AI drafts`.

### Task 4: Replay I — лестницы, ритуалы, серия

**Files:** Modify `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/domain/streak.ts`, `src/domain/streak.test.ts`, `src/domain/achievements.ts`, `src/domain/types.ts`.

**Interfaces — consumes:** T1 всё из `ladder.ts`. **Produces:**
- `dayOutcome(d: { issued; done; dropped; rest; rituals?: { due: number; done: number } })`
- `GameState.ladders: { id: string; title: string; kind: LadderKind; skill: SkillId; status: 'active' | 'queued' | 'auto';
  step: 1|2|3|4|5; attempt: 1|2; windowStart: ISODate | null; windowDays: number; done: number; required: number;
  todayDone: boolean; todayVerify: 'auto' | 'honest' | null; label: string; xp: number; ask: boolean; facetId: string | null }[]`
- `GameState.trophies` (спека §8.3); счётчик `laddersMastered`, достижение `ladder_master`.
- В цикле дат — даты от первой `ladder_created` до сегодня.

- [ ] **Тест (падает)** (хелперы):
  ```ts
  const ladder = (id = 'l1', extra: Record<string, unknown> = {}, date = '2026-12-01') => ev({ type: 'ladder_created', ladderId: id, title: 'Чтение',
    kind: 'do', skill: 'reading', steps: LADDER_PRESETS.read.steps, ts: at(date, 9), ...extra });
  const rit = (date: string, id = 'l1', ts = at(date, 21)) => ev({ type: 'ritual_done', ladderId: id, date, ts });
  const rits = (dates: string[]) => dates.map(d => rit(d));

  test('окно 14 дней: 5 из 6 → ступень 2, ритуалы по 15 и бонус 100 [S§7]', () => {
    const s = replay([onboard, ladder(), ...rits(['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-08', '2026-12-10'])], at('2026-12-15'));
    expect(s.ladders[0]).toMatchObject({ step: 2, attempt: 1, status: 'active', windowStart: '2026-12-15' });
    expect(s.ledger.filter(r => r.source === 'ritual').map(r => r.xp)).toEqual([15, 15, 15, 15, 15]);
    expect(s.ledger.find(r => r.source === 'ladder')).toMatchObject({ xp: 100, date: '2026-12-14' });
    expect(s.skills.reading.xp).toBe(175);
  });
  test('4 из 6 → повтор; повтор провален → шаг назад и вопрос', () => {
    const w1 = rits(['2026-12-01', '2026-12-03', '2026-12-05', '2026-12-08']);
    expect(replay([onboard, ladder(), ...w1], at('2026-12-15')).ladders[0]).toMatchObject({ step: 1, attempt: 2 });
    const w2 = rits(['2026-12-15', '2026-12-17', '2026-12-19', '2026-12-21']);
    expect(replay([onboard, ladder(), ...w1, ...w2], at('2026-12-29')).ladders[0]).toMatchObject({ step: 1, attempt: 1, ask: true });
  });
  test('отметка только за сегодня и один раз', () => {
    const s = replay([onboard, ladder(), rit('2026-12-01', 'l1', at('2026-12-02', 10)), rit('2026-12-02'), rit('2026-12-02', 'l1', at('2026-12-02', 22))], at('2026-12-03'));
    expect(s.ledger.filter(r => r.source === 'ritual')).toHaveLength(1);
  });
  test('восстановление ставит окно на паузу', () => {
    const rec = [ev({ type: 'recovery_started', date: '2026-12-03', quests: 0, ts: at('2026-12-03', 9) }),
      ev({ type: 'recovery_ended', date: '2026-12-06', ts: at('2026-12-06', 9) })];
    const base = [onboard, ladder(), ...rec, ...rits(['2026-12-01', '2026-12-02', '2026-12-07', '2026-12-08', '2026-12-10'])];
    expect(replay(base, at('2026-12-15')).ladders[0].step).toBe(1);
    expect(replay(base, at('2026-12-18')).ladders[0].step).toBe(2);
  });
  test('не больше 3 активных, очередь со следующего дня после освобождения', () => {
    const ls = ['l1', 'l2', 'l3', 'l4'].map(id => ladder(id));
    expect(replay([onboard, ...ls], at('2026-12-02')).ladders.map(l => l.status)).toEqual(['active', 'active', 'active', 'queued']);
    const s = replay([onboard, ...ls, ev({ type: 'ladder_removed', ladderId: 'l2', ts: at('2026-12-05', 10) })], at('2026-12-07'));
    expect(s.ladders.map(l => [l.id, l.status])).toEqual([['l1', 'active'], ['l3', 'active'], ['l4', 'active']]);
    expect(s.ladders[2].windowStart).toBe('2026-12-06');
  });
  test('авто-ритуал по данным: шаги ≥ 5 000', () => {
    const s = replay([onboard, ladder('w', { title: 'Прогулка', skill: 'cardio', steps: LADDER_PRESETS.walk.steps }),
      ev({ type: 'health_packet', date: '2026-12-02', kind: 'other', health: { steps: 6000 }, calendar: [], ts: at('2026-12-02', 18), deviceId: 'shortcuts' })], at('2026-12-03'));
    expect(s.ledger.find(r => r.source === 'ritual')).toMatchObject({ xp: 15, verified: true, date: '2026-12-02' });
  });
  test('серия: все ритуалы ИЛИ 60% заданий [S§6]', () => {
    const qs = (d: string) => issue(d, [nq(`${d}a`, d, 'E', ['strength']), nq(`${d}b`, d, 'E', ['cardio'])]);
    const s = replay([onboard, ladder(), qs('2026-12-01'), rit('2026-12-01'), qs('2026-12-02')], at('2026-12-03'));
    expect(s.history.map(h => h.counted)).toEqual([true, false]);
  });
  test('рецидив ступени 5 → ступень 4, трофей и 750 XP бонусов', () => {
    const one = Array.from({ length: 5 }, () => ({ label: 'раз', per7: 1 }));
    const starts = ['2026-12-01', '2026-12-15', '2026-12-29', '2027-01-12'];
    const evs = [onboard, ladder('l1', { steps: one }), ...starts.flatMap(d => rits([d, addDays(d, 1)]))];
    const at5 = replay(evs, at('2027-01-26'));
    expect(at5.ladders[0]).toMatchObject({ step: 5, status: 'auto' });
    expect(at5.trophies).toMatchObject([{ kind: 'avatar' }]);
    expect(at5.ledger.filter(r => r.source === 'ladder').reduce((a, r) => a + r.xp, 0)).toBe(750);
    expect(at5.achievements.some(a => a.id === 'ladder_master')).toBe(true);
    expect(replay(evs, at('2027-02-09')).ladders[0]).toMatchObject({ step: 4, status: 'active' });
  });
  ```
  `streak.test.ts`: `dayOutcome({ issued: 0, done: 0, dropped: 0, rest: false, rituals: { due: 2, done: 2 } }).counted === true`; `rituals: { due: 2, done: 1 }` и 0 из 2 заданий → `false`; `rest: true` → `neutral`.
- [ ] `npx vitest run src/domain/replay.test.ts src/domain/streak.test.ts` — FAIL.
- [ ] Реализовать: сбор `ladder_*`/`ritual_done` в первом проходе (валидация спеки §3.3); в цикле дат для каждой лестницы — активность (слоты, очередь), засчёт дня (`ritual_done` ∪ `autoOkOf` по `auto` ступени), строка `ritual` через `splitXp(xp, [skill])`; при закрытии — счётчик незамороженных дней (`restDays ∪ dayOff`), итог окна `ladderAfterWindow`, недели ступени 5 `step5Relapse`; `outcomeOf` получает `rituals`. `ladder_updated` применяется со следующего окна.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(replay): habit ladders, rituals, streak by rituals`.

### Task 5: Replay II — Враг-тень

**Files:** Modify `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/domain/achievements.ts`, `src/domain/types.ts`, `src/ai/tasks.test.ts` (включить todo из T3).

**Interfaces — consumes:** T2 всё из `shadow.ts`, `fatigueNext(…relapses)`; T4 лестницы (`assist`). **Produces:**
- `GameState.shadow: { strength: number | null; facets: { id: string; name: string; kind: FacetKind; strength: number; cleanRun: number; banished: boolean; serious: boolean; relapsedToday: boolean }[];
  nextBattle: ISODate; lastBattle: { date: ISODate; strength: number; result: 'crush' | 'win' | 'draw' | 'lost'; xp: number; plan: string | null } | null }`
- счётчики `facetsBanished`, `shadowWins`; достижения `banish`, `shadow_win`.

- [ ] **Тест (падает):**
  ```ts
  const facet = (id = 'f1', start = 50, kind = 'custom', date = '2026-12-01') => ev({ type: 'facet_added', facetId: id, name: 'Сладкое', kind, start, ts: at(date, 9) });
  const relapse = (date: string, id = 'f1', ts = at(date, 21)) => ev({ type: 'shadow_relapse', facetId: id, date, ts });

  test('сила по дням и честная отметка +5 XP в «Контроль привычек»', () => {
    const s = replay([onboard, facet(), relapse('2026-12-07'), relapse('2026-12-07', 'f1', at('2026-12-07', 22))], at('2026-12-15'));
    expect(s.shadow.facets[0]).toMatchObject({ strength: 27, cleanRun: 7, banished: false });
    expect(s.shadow.strength).toBe(27);
    expect(s.ledger.filter(r => r.source === 'shadow')).toMatchObject([{ xp: 5, date: '2026-12-07', skills: [['habits', 5]] }]);
  });
  test('срыв за вчера и после закрытия — игнор; 4-я грань и start 90 — игнор', () => {
    const s = replay([onboard, facet(), relapse('2026-12-02', 'f1', at('2026-12-03', 10)), facet('f2', 90), facet('f3'), facet('f4'), facet('f5')], at('2026-12-04'));
    expect(s.ledger.some(r => r.source === 'shadow')).toBe(false);
    expect(s.shadow.facets.map(f => f.id)).toEqual(['f1', 'f3', 'f4']);
  });
  test('Усталость +5 за срыв вчера [S§3]', () => {
    const sleep5 = (d: string) => ev({ type: 'health_packet', date: d, kind: 'morning', health: { sleepHours: 5 }, calendar: [], ts: at(d, 8), deviceId: 'shortcuts' });
    const base = [onboard, facet(), issue('2026-12-01', [nq('a', '2026-12-01', 'E', ['strength'])]), sleep5('2026-12-07'), sleep5('2026-12-08')];
    expect(replay(base, at('2026-12-08')).today.vitals.fatigue).toBe(20);
    expect(replay([...base, relapse('2026-12-07')], at('2026-12-08')).today.vitals.fatigue).toBe(25);
  });
  test('битва 27 декабря: сила 0 → 400 XP и редкий трофей; изгнание на 30-й день', () => {
    const evs = [onboard, facet('f1', 30)];
    const s = replay(evs, at('2026-12-28'));
    expect(s.shadow.lastBattle).toMatchObject({ date: '2026-12-27', strength: 0, result: 'crush', xp: 400 });
    expect(s.ledger.find(r => r.id.startsWith('battle:'))).toMatchObject({ xp: 400, source: 'shadow', date: '2026-12-27' });
    expect(s.trophies).toMatchObject([{ kind: 'rare', date: '2026-12-27' }]);
    expect(replay(evs, at('2026-12-30')).shadow.facets[0].banished).toBe(false);   // закрыто 29 дней
    const t = replay(evs, at('2026-12-31'));
    expect(t.shadow.facets[0].banished).toBe(true); expect(t.shadow.strength).toBeNull();
    expect(t.achievements.some(a => a.id === 'banish')).toBe(true);
  });
  test('битва в день отдыха проходит; без граней битвы нет', () => {
    const rest = startDay('2026-12-27', { dayType: DT[3] });
    // старт 60 c 20 декабря: 8 чистых дней → 60 − 16 − 5 = 39
    expect(replay([onboard, facet('f1', 60, 'custom', '2026-12-20'), rest], at('2026-12-28')).shadow.lastBattle).toMatchObject({ strength: 39, result: 'win', xp: 250 });
    expect(replay([onboard], at('2026-12-28')).shadow.lastBattle).toBeNull();
  });
  test('срыв по данным: соцсети 150 мин при живом источнике — +8 без XP', () => {
    const sig = (h: number, m: number, state: string) => ev({ type: 'signal_logged', at: at('2026-12-02', h, m), signal: { kind: 'app', app: 'social', state }, ts: at('2026-12-02', h, m), deviceId: 'shortcuts' });
    const s = replay([onboard, facet('f1', 50, 'social'), sig(10, 0, 'open'), sig(12, 30, 'close')], at('2026-12-03'));
    expect(s.shadow.facets[0].strength).toBe(50 - 2 + 8);
    expect(s.ledger.some(r => r.source === 'shadow')).toBe(false);
  });
  ```
  (150 мин = две сессии? Одна сессия ≤ 180 — 150 мин засчитывается целиком: `sessionMaxMin` 180.)
- [ ] `npx vitest run src/domain/replay.test.ts src/ai/tasks.test.ts` — FAIL.
- [ ] Реализовать: `facet_*`/`shadow_relapse` в первом проходе; в цикле дат с `facet_added` — при закрытии дня `facetDay` (срыв = честная отметка ∪ данные по правилам `leOk` с порогом `dataRelapseMin`; `assist` из T4), строка `shadow` за честную отметку, `relapses` для Усталости следующего дня, битва в `lastSunday` месяца, изгнание. `masterPlan` для ничьей.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(replay): shadow enemy — facets, relapses, battle, banishment`.

### Task 6: Replay III и сборка — сезонный босс, части, цепочка

**Files:** Modify `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/domain/assemble.ts`, `src/domain/assemble.test.ts`, `src/screens/issue.ts`, `src/screens/issue.test.ts`, `src/domain/achievements.ts`.

**Interfaces — consumes:** T3 `partHp`, `partWindows`, `bossOptionsByRules`, `validBossDraft`, `validChainSteps`. **Produces:**
- `AssembleCtx` += `bossStep: { title: string; skill: SkillId; link: NonNullable<Quest['link']> } | null`, `chainStep: (same) | null`
- `GameState.seasonBoss`, `bossOptions` (спека §5.6), `chain`, `chainsDone`; `genInputs` += `bossStats: Stat[]`, `bossStep`, `chainStep`
- `normQuest` принимает `kind: 'boss' | 'chain'` и `link` (невалидный `link` → поле отброшено, задание `daily`)
- `issue.ts`: `assembleCtx` берёт `bossStats`, `bossStep`, `chainStep` из `state.genInputs`

- [ ] **Тест (падает):**
  ```ts
  // assemble.test.ts
  const link = { kind: 'boss', season: 'winter-2026', part: 0, step: 0 } as const;
  const bossStep = { title: 'Разбить цель на шаги', skill: 'reading' as SkillId, link };
  test('шаг босса и цепочки — сразу после обязательных, ранг — потолок навыка', () => {
    const qs = assembleDay(ctx({ bossStep, chainStep: { title: 'Собрать идеи', skill: 'tech', link: { kind: 'chain', chainId: 'c1', step: 0 } } }));
    expect(qs[0]).toMatchObject({ kind: 'boss', title: 'Разбить цель на шаги', rank: 'C', link });
    expect(qs[1]).toMatchObject({ kind: 'chain' }); expect(qs).toHaveLength(4);
  });
  test('шаг босса не выдаётся в отдых и восстановление; не перебрасывается', () => {
    expect(assembleDay(ctx({ bossStep, dayType: DEFAULT_DAY_TYPES[3] })).some(q => q.kind === 'boss')).toBe(false);
    expect(assembleDay(ctx({ bossStep, recovery: { quests: 2 } })).some(q => q.kind === 'boss')).toBe(false);
    const b = assembleDay(ctx({ bossStep }))[0];
    expect(rerollCandidate(ctx(), b, [b])).toBeNull();
  });
  test('шаблоны вредных привычек больше не кандидаты', () => {
    const days = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'];
    const ids = days.flatMap(date => assembleDay(ctx({ date, profile: { ...profile, badHabits: ['social', 'games', 'smoke'] } })).map(q => q.templateId));
    expect(ids.filter(id => ['no_social', 'no_games', 'no_smoke'].includes(id))).toEqual([]);
  });
  // replay.test.ts
  const draft = { title: 'Прочитать 3 книги', skill: 'reading', parts: [0, 1, 2].map(i => ({ title: `Часть ${i + 1}`, steps: ['Шаг А', 'Шаг Б'] })) };
  const setBoss = (ts = at('2026-12-02', 10), seasonId = 'winter-2026') => ev({ type: 'season_boss_set', seasonId, boss: draft, ts });
  const bq = (id: string, d: string, part: number, step: number) => nq(id, d, 'C', ['reading'], { kind: 'boss', link: { kind: 'boss', season: 'winter-2026', part, step } });
  const hit = (id: string, d: string) => nq(id, d, 'E', ['reading']);
  test('урон части: шаги 80, удары 4; победа части +300', () => {
    const d3 = '2026-12-03', d4 = '2026-12-04';
    const evs = [onboard, setBoss(),
      issue(d3, [bq('s0', d3, 0, 0), hit('h1', d3), hit('h2', d3)]), done(d3, 's0'), done(d3, 'h1'), done(d3, 'h2')];
    const s = replay(evs, at(d4, 7));
    expect(s.seasonBoss!.parts[0]).toMatchObject({ hp: 52, hits: 2, status: 'active', steps: [{ done: true }, { done: false }] });
    expect(s.genInputs.bossStep).toMatchObject({ title: 'Шаг Б', link: { part: 0, step: 1 } });
    const t = replay([...evs, issue(d4, [bq('s1', d4, 0, 1), hit('h3', d4), hit('h4', d4), hit('h5', d4), hit('h6', d4)]),
      ...['s1', 'h3', 'h4', 'h5', 'h6'].map(id => done(d4, id))], at('2026-12-05'));
    expect(t.seasonBoss!.parts[0]).toMatchObject({ hp: 0, hits: 5, status: 'defeated' });
    expect(t.ledger.filter(r => r.source === 'boss')).toMatchObject([{ xp: 300, date: d4, stats: { int: 300 } }]);
    expect(t.genInputs.bossStep).toBeNull();   // часть 2 начнётся 1 января
  });
  test('свои задания не бьют; чужой link — обычное задание; переброс шага отклонён', () => {
    const d = '2026-12-03';
    const s = replay([onboard, setBoss(),
      ev({ type: 'custom_quest_added', date: d, quest: { ...hit('c1', d), kind: 'custom' }, ts: at(d, 9) }), done(d, 'c1'),
      issue(d, [bq('x', d, 0, 1), bq('s0', d, 0, 0)]), done(d, 'x'),
      ev({ type: 'quest_rerolled', date: d, questId: 's0', replacement: hit('r', d), ts: at(d, 10) })], at(d, 23));
    expect(s.seasonBoss!.parts[0]).toMatchObject({ hits: 0, hp: 100 });
    expect(s.ledger.some(r => r.questId === 'x')).toBe(true);
    expect(s.today.quests.map(q => q.id)).toEqual(['x', 's0', 'c1']);   // s0 не заменён
  });
  test('сезонная победа +1 500 и легендарный трофей один раз', () => {
    const win = (part: number, d1: string) => { const d2 = addDays(d1, 1); return [
      issue(d1, [bq(`a${part}`, d1, part, 0), ...[1, 2, 3, 4, 5].map(i => hit(`h${part}${i}`, d1))]), done(d1, `a${part}`), ...[1, 2, 3, 4, 5].map(i => done(d1, `h${part}${i}`)),
      issue(d2, [bq(`b${part}`, d2, part, 1)]), done(d2, `b${part}`)]; };
    const evs = [onboard, setBoss(), ...win(0, '2026-12-03'), ...win(1, '2027-01-05'), ...win(2, '2027-02-02')];
    const s = replay([...evs, setBoss(at('2027-02-10', 10))], at('2027-02-11'));
    expect(s.seasonBoss!.defeated).toBe(true);
    expect(s.ledger.filter(r => r.source === 'boss').map(r => r.xp)).toEqual([300, 300, 300, 1500]);
    expect(s.trophies).toMatchObject([{ kind: 'legendary', date: '2027-02-03' }]);
    expect(s.achievements.some(a => a.id === 'season_boss')).toBe(true);
  });
  test('цепочка: одна активная, шаги по порядку, +200 по завершении', () => {
    const cq = (id: string, d: string, step: number) => nq(id, d, 'D', ['tech'], { kind: 'chain', link: { kind: 'chain', chainId: 'c1', step } });
    const start = (id: string) => ev({ type: 'chain_started', chainId: id, title: 'Хобби-проект', skill: 'tech', steps: ['Идеи', 'Проба', 'Результат'], ts: at('2026-12-02', 9) });
    const evs = [onboard, start('c1'), start('c2'),
      ...['2026-12-03', '2026-12-04', '2026-12-05'].flatMap((d, i) => [issue(d, [cq(`c${i}`, d, i)]), done(d, `c${i}`)])];
    const s = replay(evs, at('2026-12-06'));
    expect(s.chain).toBeNull(); expect(s.chainsDone).toBe(1);
    expect(s.ledger.find(r => r.source === 'chain')).toMatchObject({ xp: 200, date: '2026-12-05', stats: { int: 200 } });
  });
  test('легаси-босс остаётся в bossStats и вариантах', () => {
    const s = replay([onboard, ev({ type: 'boss_created', bossId: 'b1', title: 'Старая цель', stat: 'fin', stages: ['a', 'b'] })], at('2026-12-02'));
    expect(s.genInputs.bossStats).toEqual(['fin']);
    expect(s.bossOptions[0].title).toBe('Старая цель');
  });
  ```
  `issue.test.ts`: существующая проверка `bossStats: ['fin']` остаётся зелёной через `genInputs.bossStats`.
- [ ] `npx vitest run src/domain/assemble.test.ts src/domain/replay.test.ts src/screens/issue.test.ts` — FAIL.
- [ ] Реализовать: `season_boss_*`/`chain_*` в первом проходе (валидация спеки §5.1, §6; повторный `season_boss_set` после победы — игнор); в цикле дат — окна частей, текущая часть для шагов/ударов, продвижение шага только при совпадении `link` с текущим на дату выдачи, удары `daily`/`challenge` со статом босса (≤ 5), строки `boss` (`boss:part:<season>:<i>`, `boss:season:<season>`), трофей; цепочка; `genInputs.bossStep/chainStep/bossStats` на сегодня; `bossOptions` правилами. `assemble.ts`: вставка шагов после обязательных (не `rest`, не `recovery`, не `dayOff`), фильтр `badHabit`, `rerollCandidate` → `null` для `boss`/`chain`; replay отклоняет `quest_rerolled` для них.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(game): season boss parts, story chain, assembly priority`.

### Task 7: UI — ритуалы, лестницы, Тень в чек-ине и на «Герое»

**Files:** Create `src/screens/Ladders.tsx`, `src/screens/Shadow.tsx`, `src/ui/ShadowFigure.tsx`, `src/ui/BattleSheet.tsx`, `src/ui/gameView.ts`, `src/ui/gameView.test.ts`. Modify `src/screens/Home.tsx`, `src/screens/Checkin.tsx`, `src/screens/Quests.tsx`, `src/screens/Character.tsx`, `src/styles.css`.

**Interfaces — consumes:** T4 `GameState.ladders`, `trophies`; T5 `GameState.shadow`; T1/T2 `LADDER_PRESETS`, `genericLadder`, `facetSuggestions`, `facetStart`, `isSerious`; T3 `aiLadderSteps`. **Produces:**
- `gameView.ts`: `ritualChip(l: GameState['ladders'][number]): { text: string; sub: string; state: 'done' | 'auto' | 'later' | 'todo' }`; `shadowScale(strength: number): { scale: number; opacity: number }` (округление до 0,01); `battleSeen(date: ISODate, store?: Storage | null): boolean`, `markBattleSeen(date: ISODate, store?: Storage | null): void` (в `try/catch`).

- [ ] **Тест (падает)** `gameView.test.ts`:
  ```ts
  test('фигура тени по силе', () => {
    expect(shadowScale(0)).toEqual({ scale: 0.7, opacity: 0.25 });
    expect(shadowScale(100)).toEqual({ scale: 1.2, opacity: 0.85 });
  });
  test('чип ритуала', () => {
    const l = { title: 'Чтение', step: 1, done: 2, required: 6, todayDone: false, todayVerify: null, label: '10 страниц', status: 'active' } as GameState['ladders'][number];
    expect(ritualChip(l)).toEqual({ text: 'Чтение · 10 страниц', sub: 'ступень 1 · 2/6', state: 'todo' });
    expect(ritualChip({ ...l, todayDone: true, todayVerify: 'auto' }).state).toBe('auto');
  });
  test('битва показана: без хранилища и при исключении — false, без падения', () => {
    expect(battleSeen('2026-12-27', null)).toBe(false);
    const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage;
    expect(() => markBattleSeen('2026-12-27', bad)).not.toThrow(); expect(battleSeen('2026-12-27', bad)).toBe(false);
  });
  test('на Главной нет имени грани', () => {
    const s = replay([{ id: 'o', ts: 1, deviceId: 'd', type: 'onboarding_completed', profile } as GameEvent,   // profile — как в ai/tasks.test.ts
      { id: 'f', ts: 2, deviceId: 'd', type: 'facet_added', facetId: 'f', name: 'СЕКРЕТ', kind: 'custom', start: 50 } as GameEvent], new Date(2026, 11, 2, 12).getTime());
    render(<Home state={s} profile={s.profile!} go={() => {}} interview={() => {}} />);
    expect(document.body.textContent).not.toContain('СЕКРЕТ');
  });
  ```
  (Если в проекте нет `@testing-library/react`, последний тест — через `renderToStaticMarkup` из `react-dom/server`.)
- [ ] `npx vitest run src/ui/gameView.test.ts` — FAIL.
- [ ] Реализовать по спеке §9:
  - **Home:** полоса «Ритуалы» над заданиями (`ritualChip`, касание → `ritual_done`, `aria-pressed`); бейдж «Босс»/«Сюжет» на `QuestCard` и скрытый переброс для них; `BattleSheet` при `shadow.lastBattle` и `!battleSeen`.
  - **Checkin:** разделы «Ритуалы» (невыполненные сегодня) и «Тень» («Был срыв», подпись про +5 XP); при сохранении — `ritual_done` и `shadow_relapse` отдельными событиями до `checkin`.
  - **Quests → «Привычки»** (`Ladders.tsx`): активные с 5 точками ступеней и полосой окна, очередь, ступень 5; «Новая лестница» — предложения из `goodHabits` + шаблоны, своя (название, вид, подходящие дни), кнопка ИИ только для `do`; лист «Что мешает?» при `ask` → `ladder_updated`; «Убрать» через `Confirm`.
  - **Character → «Враг-тень»** (`Shadow.tsx`): `ShadowFigure` за аватаром (`shadowScale`, `aria-label="Враг-тень, сила N"`), грани с полосами и «чисто N дн.», «Был срыв», «Добавить грань» (предложения, частота, карточка безопасности для `isSerious` с кнопками «Понятно» / «Это бытовая привычка — добавить»), «Убрать», дата битвы, итог прошлой, полка трофеев.
  - **BattleSheet:** CSS-анимация ~1,5 с; `@media (prefers-reduced-motion: reduce)` — без анимации; у `serious`-грани — только карточка.
- [ ] `npx vitest run`, `npm run build` — PASS; ручная проверка на телефоне: отметка ритуала, срыв в чек-ине, фигура тени, лист битвы в режиме «уменьшить движение». Коммит `feat(ui): rituals, ladders, shadow enemy, battle sheet`.

### Task 8: UI — босс сезона, цепочка, прежние цели

**Files:** Create `src/screens/SeasonBoss.tsx`, `src/screens/Chain.tsx`. Modify `src/screens/Quests.tsx`, `src/ui/gameView.ts`, `src/ui/gameView.test.ts`, `src/styles.css`.

**Interfaces — consumes:** T6 `seasonBoss`, `bossOptions`, `chain`; T3 `aiBossOptions`, `aiChainSteps`, `chainByRules`, `validBossDraft`. **Produces:** `gameView.ts`: `partView(p: NonNullable<GameState['seasonBoss']>['parts'][number]): { label: string; tone: 'muted' | 'active' | 'late' | 'won' | 'lost'; next: string | null }`.

- [ ] **Тест (падает):**
  ```ts
  test('вид части босса', () => {
    const p = { title: 'Часть 1', start: '2026-12-01', end: '2026-12-31', steps: [{ title: 'А', done: true }, { title: 'Б', done: false }], hits: 2, hp: 52, status: 'active' } as const;
    expect(partView(p)).toEqual({ label: 'Часть 1 · HP 52', tone: 'active', next: 'Б' });
    expect(partView({ ...p, status: 'late' }).tone).toBe('late');
    expect(partView({ ...p, hp: 0, status: 'defeated' })).toMatchObject({ tone: 'won', next: null });
  });
  ```
- [ ] `npx vitest run src/ui/gameView.test.ts` — FAIL.
- [ ] Реализовать: вкладка «Задания» — «Неделя» → «Привычки» (T7) → «Босс сезона» (в Прологе — «Босс появится с началом сезона»; без босса — 3 карточки `bossOptions`, при ключе ИИ — кнопка «Варианты от Мастера» → `aiBossOptions`, и «Свой» с формой 3 × 2–5 шагов через `validBossDraft`; выбор → `season_boss_set`; с боссом — 3 карточки частей с HP-полосой `role="progressbar"`, шагами и `partView`, «Сдаться» через `Confirm` → `season_boss_abandoned`; победа — `Celebration`) → «Сюжет» (`Chain.tsx`: активная с шагами или «Начать из цели» — цель из `profile.goals`/свой текст, шаги `chainByRules`/`aiChainSteps`, правка перед стартом, `chain_started`; «Бросить» → `chain_abandoned`) → «Прежние цели» (легаси-боссы, только если есть; без формы создания — `NewBoss` удаляется).
- [ ] `npx vitest run`, `npm run build` — PASS; ручная проверка: выбор босса, шаг в «Моём дне», HP после выполнения; **первая покупка в «Магазине»** (критерий этапа [P§8]). Коммит `feat(ui): season boss, story chain, legacy goals`.
