# Life RPG v2 «Глубина» (этап 5) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax. TDD: сначала падающий тест, потом код.

**Goal:** перки навыков на 3/6/10 (каталог данными, сила по форме) и ржавчина; 8 базовых классов с пересчётом 1-го числа, соло-пассивами и способностями раз в неделю; ранг недели S–D против своих 4 недель и лига Бронза → Легенда; сезонный путь 30 × 600 с наградами и уменьшенной ценой при позднем входе; косметический инвентарь; недельный отчёт Мастера в воскресенье (ИИ по белому списку, иначе правила). Критерий [P§8]: «в воскресенье приходит разбор недели».

**Architecture:** журнал событий — единственный источник правды. Новые чистые модули `perks.ts`, `classes.ts`, `rivalry.ts`, `seasonPath.ts`, `cosmetics.ts`, `masterReport.ts` без знания о журнале; `replay` вызывает их в существующем цикле по датам через снимок начала дня (`formsAt`). Числа — в `BALANCE`. Новые эффекты действуют с `BALANCE.depthSince`, закрытые дни старого журнала не меняются.

**Tech Stack:** React 18 + Vite + TypeScript strict, Dexie, vitest. Worker — только текст воскресного вечернего пуша. Новых зависимостей и миграций D1 нет.

**Spec:** `docs/superpowers/specs/2026-11-21-life-rpg-v2-depth-design.md` (дальше «спека §N»). Конвенции — планы «Ядра», «Автоматики», «Игрового слоя». Числа в тестах — из [S§1], [S§4], [S§5], [S§8], [P§3], [P§5], [P§6].

---

## Global Constraints

- `replay` — чистая, порядок событий не влияет, ни одно событие не бросает; неизвестные типы игнорируются; новые события (`ability_used`, `cosmetic_bought`, `cosmetic_equipped`) валидируются полями, неверное отбрасывается.
- Монотонность: класс, ржавчина, сила перков и пассива — по снимку **начала** дня (закрытые дни < d); ранг недели — при закрытии воскресенья; способность — только за игровую дату самого события.
- До `BALANCE.depthSince` никакой новый эффект не меняет XP/золото закрытых дней (кроме наград пути — датой `depthSince`, спека §2). Существующие тесты `replay.test.ts` остаются зелёными без правок чисел.
- Бонусы (серия, тема, слабейшая, пассив, перки, ржавчина, «Вдохновение») — под общим потолком +100%; множители `mult` («Вернуть форму», «Рывок») — вне потолков.
- Ни одного числа баланса вне `BALANCE`; каталоги перков и вещей — данные в одном месте.
- Репозиторий публичный: в коде, тестах, фикстурах, каталогах — только обобщённые названия. Особый образ — тема, без личных деталей. Названия граней Тени и `dont`-лестниц, траты, места, ответы анкеты не попадают в отчёт ИИ.
- Интерфейс по-русски, «стеклянная ночь» (токены `:root`, `lucide-react`, цели ≥ 44 px, `aria-*`, `prefers-reduced-motion`), листы через `useDialog`, запись через `useWrite`.
- После каждой задачи: `npx vitest run` и `npm run build` зелёные.
- Коммиты conventional, последняя строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

| # | Класс входа | Что может сломаться | Тесты (задача) |
|---|---|---|---|
| 1 | Недоверенные `ability_used` (неизвестная способность, чужой класс, вторая за неделю, дата «вчера», дата до `depthSince`, задание другого дня/легаси/`custom`, `replacement` выше потолка или дубль шаблона, мусорные `quests`, `stat: 'xyz'`) и `cosmetic_*` (неизвестный id, чужой слот, повторная покупка) | исключение, бесплатный XP, раздутое состояние | T5 «чужой класс — игнор», «вторая за неделю — игнор, в понедельник — снова», «за вчера — игнор», «Прозрение выше потолка — игнор», «Универсал stat 'xyz' — игнор»; T6 «повторная покупка — одна», «надеть не своё — игнор» |
| 2 | Время и границы (пересчёт 1-го числа, сброс способности в понедельник, ранг при закрытии воскресенья, неделя на стыке сезонов, ржавчина через дни восстановления, `depthSince`) | меняется прошлое, двойная награда | T4 «до depthSince XP прежний», «3 дня восстановления → простой 27, не ржавый»; T6 «ранг до закрытия воскресенья — только preview», «сброс лиги по воскресенью нового сезона» |
| 3 | Фарм и наложение (класс + перки + ржавчина + «Вдохновение» > потолка, «Рывок» × «Вернуть форму», «Сделка» + платные перебросы, сундук дважды, поздний вход ради дешёвых ступеней, награда ступени дважды) | бесплатный XP/золото | T2 «бонусы ≤ 1»; T5 «Рывок + restore → ×4, не больше», «Сделка: 4-й переброс сверх 1+3 платный»; T3 `stepXpFor` от первой активности; T6 «id path:/week: — одна строка» |
| 4 | Числовые пороги (форма ровно 0,8/0,4; разброс ровно 10%; гистерезис ровно 1,05; доля ровно 0,9/0,8/0,65/0,5; S без условия XP; очки 0 и 35; 6 на ступень; 30-й день простоя) | скачок класса, неверный ранг | T1 `perkPower` таблица, `idleDays` 29/30; T2 `pickClass` 104/105, Странник 10%; T3 `weekRank` таблица, `leagueAfter`, `softReset` |
| 5 | Приватность (грани, `dont`-лестницы, траты/магазины, цели и ответы анкеты в промпте отчёта; данные в воскресном пуше) | утечка в ИИ/пуш | T7 «reportInput без имени грани, dont-лестницы, spend, merchant, целей», «пуш воскресенья без чисел игрока» |

---

### Task 1: `BALANCE`, каталог перков, ржавчина (чистое)

**Files:** Modify `src/domain/balance.ts`, `src/domain/types.ts`, `src/domain/progression.ts`, `src/domain/streak.ts`, `src/domain/shadow.ts`, `src/domain/vitals.ts`. Create `src/domain/perks.ts`, `src/domain/perks.test.ts`.

**Interfaces — produces:**
- `balance.ts`: `depthSince`, блоки `perks`, `rust`, `classes`, `week`, `league`, `season +=` (спека §11); `skill.nearRustDays` → `rust.warnDays` (потребитель `assemble.ts` правится здесь же).
- `perks.ts`:
  - `type PerkEffect = { kind: 'xp'; pct: number } | { kind: 'gold'; pct: number } | { kind: 'relapse'; value: number } | { kind: 'streakMiss'; factor: number } | { kind: 'fatigueDecay'; points: number }`
  - `interface PerkDef { id: string; skill: SkillId; level: 3 | 6 | 10; title: string; desc: string; kind: 'pct' | 'flat'; effect: PerkEffect }`
  - `PERKS: PerkDef[]` — 72 записи (умолчание + особые, спека §3.1)
  - `skillForm(skill: SkillId, forms: Record<Stat, number | null>): number` — `null` → 1; рабочие — среднее `cha`/`dis`
  - `perkPower(p: PerkDef, form: number, rusty: boolean): 0 | 0.5 | 1`
  - `mainSkillPerks(skill: SkillId, level: number, form: number, rusty: boolean): { xp: number; gold: number }`
  - `flatPerks(skills: Record<SkillId, { level: number; rusty: boolean }>, forms: Record<Stat, number | null>): { relapse: number; streakMiss: number; fatigueDecay: number }`
  - `idleDays(lastDate: ISODate | null, before: ISODate, frozen: (d: ISODate) => boolean): number | null` — незамороженные дни в `(lastDate, before)`
  - `isRusty(idle: number | null): boolean`
- `progression.ts`: `questReward(i: { …; goldBonus?: number })` — `gold = round(goldShare × xp × (1 + goldBonus))`; `streakBonus(streak: number, perDay = B.bonus.streakPerDay)`.
- `streak.ts`: `nextStreak(prev, o, freeze, missFactor = B.streak.missFactor)`.
- `shadow.ts`: `facetDay(f, relapse, assist, relapseAdd = S.relapse)`.
- `vitals.ts`: `fatigueNext(prev, day, nightSleep, extraDecay = 0)`.

- [ ] **Тест (падает):**
  ```ts
  test('каталог: 24 навыка × 3 уровня, особые перки [S§3, S§6, S§7]', () => {
    expect(PERKS).toHaveLength(72);
    const p = (s: SkillId, l: number) => PERKS.find(x => x.skill === s && x.level === l)!;
    expect(p('strength', 3).effect).toEqual({ kind: 'xp', pct: 0.1 });
    expect(p('habits', 3)).toMatchObject({ kind: 'flat', effect: { kind: 'relapse', value: 5 } });
    expect(p('routine', 10)).toMatchObject({ kind: 'flat', effect: { kind: 'streakMiss', factor: 0.75 } });
    expect(['mobility', 'sleep', 'mindfulness'].map(s => p(s as SkillId, 6).effect)).toEqual(Array(3).fill({ kind: 'fatigueDecay', points: 3 }));
    expect(p('savings', 6).effect).toEqual({ kind: 'gold', pct: 0.1 });
  });
  test('сила перка по форме [S§4]: pct 80%+/40–79%/ниже; flat 40%+; ржавчина выключает', () => {
    const pct = PERKS.find(x => x.id === 'strength:3')!, flat = PERKS.find(x => x.id === 'habits:3')!;
    expect([0.8, 0.79, 0.4, 0.39].map(f => perkPower(pct, f, false))).toEqual([1, 0.5, 0.5, 0]);
    expect([0.4, 0.39].map(f => perkPower(flat, f, false))).toEqual([1, 0]);
    expect(perkPower(pct, 1, true)).toBe(0);
    expect(mainSkillPerks('strength', 6, 0.85, false)).toEqual({ xp: 0.2, gold: 0 });
    expect(mainSkillPerks('strength', 6, 0.5, false)).toEqual({ xp: 0.1, gold: 0 });
    expect(mainSkillPerks('strength', 2, 1, false)).toEqual({ xp: 0, gold: 0 });
    expect(skillForm('leadership', { str: null, end: null, int: null, dis: 0.6, cha: 1, fin: null, spi: null })).toBe(0.8);
  });
  test('постоянные перки суммируются', () => {
    const lv = (o: Partial<Record<SkillId, number>>) => Object.fromEntries(SKILL_IDS.map(id => [id, { level: o[id] ?? 1, rusty: false }])) as any;
    const F = { str: 1, end: 1, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 };
    expect(flatPerks(lv({ mobility: 6, sleep: 7, mindfulness: 10, habits: 3, routine: 10 }), F)).toEqual({ relapse: 5, streakMiss: 0.75, fatigueDecay: 9 });
    expect(flatPerks(lv({}), F)).toEqual({ relapse: 8, streakMiss: 0.5, fatigueDecay: 0 });
  });
  test('ржавчина [S§4]: 30 незамороженных дней; никогда не качался — нет', () => {
    const none = () => false;
    expect(idleDays('2026-11-20', '2026-12-20', none)).toBe(29);
    expect(idleDays('2026-11-20', '2026-12-21', none)).toBe(30);
    expect(isRusty(29)).toBe(false); expect(isRusty(30)).toBe(true);
    const rec = new Set(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(idleDays('2026-11-20', '2026-12-21', d => rec.has(d))).toBe(27);
    expect(idleDays(null, '2026-12-21', none)).toBeNull(); expect(isRusty(null)).toBe(false);
  });
  test('хуки: золото с бонусом, серия Паладина, срыв 5, спад усталости, Режим 10', () => {
    expect(questReward({ rank: 'C', verify: 'auto', bonuses: [], penalties: [], goldBonus: 0.1 })).toMatchObject({ xp: 70, gold: 15 });
    expect(streakBonus(10, 0.03)).toBe(0.3); expect(streakBonus(30, 0.03)).toBe(0.5);
    expect(facetDay({ strength: 50, cleanRun: 3 }, true, false, 5).strength).toBe(55);
    expect(fatigueNext(20, null, null, 3)).toBe(12);
    expect(nextStreak(8, { counted: false, perfect: false, neutral: false }, false, 0.75)).toBe(6);
  });
  ```
- [ ] `npx vitest run src/domain/perks.test.ts` — FAIL.
- [ ] Реализовать. `PERKS` строится `SKILL_IDS.flatMap(s => [3, 6, 10].map(l => SPECIAL[`${s}:${l}`] ?? defaultPerk(s, l)))`, id `<skill>:<level>`. `flatPerks`: `relapse = min(8, …)` при работающей «Стойкости», `streakMiss = max`, `fatigueDecay` — сумма × мощность.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): perk catalogue, rust, depth balance`.

### Task 2: Классы (чистое)

**Files:** Create `src/domain/classes.ts`, `src/domain/classes.test.ts`. Modify `src/domain/stats.ts` (удалить `classFor`, `PAIRS`; `tierFor` остаётся), `src/domain/types.ts`.

**Interfaces — consumes:** T1. **Produces:**
- `type ClassId = 'warrior' | 'paladin' | 'ranger' | 'sage' | 'strategist' | 'merchant' | 'bard' | 'wanderer'`; `type AbilityId = 'rush' | 'shield' | 'insight' | 'plan' | 'deal' | 'inspire' | 'march' | 'universal'`
- `CLASS_PAIRS: Record<Exclude<ClassId, 'wanderer'>, [Stat, Stat][]>` (спека §4.1)
- `CLASSES: Record<ClassId, { name: string; passive: string; ability: AbilityId; abilityName: string; abilityDesc: string; target: 'quest' | 'day' | 'week' }>`
- `TRAINING: readonly SkillId[]` = `strength, mobility, sports, cardio`
- `classWeights(base: Record<Stat, number>, forms: Record<Stat, number | null>): Record<Stat, number>`
- `classOfPair(a: Stat, b: Stat): Exclude<ClassId, 'wanderer'>`
- `pickClass(w: Record<Stat, number>, cur: { id: ClassId } | null): { id: ClassId; pair: [Stat, Stat] | null }`
- `passivePower(c: { id: ClassId; pair: [Stat, Stat] | null }, forms: Record<Stat, number | null>): 0 | 0.5 | 1`
- `questBonuses(i: { skills: readonly SkillId[]; stat: Stat; verify: Verify; streak: number; theme: boolean; weakest: boolean; cls: { id: ClassId; power: 0 | 0.5 | 1 } | null; perk: { xp: number; gold: number }; rust: boolean; inspire: boolean }): { bonuses: number[]; goldBonus: number }`

- [ ] **Тест (падает):**
  ```ts
  const ALL: Stat[] = ['str', 'end', 'int', 'dis', 'cha', 'fin', 'spi'];
  test('таблица покрывает все 21 пару ровно один раз [S§5]', () => {
    const seen = Object.values(CLASS_PAIRS).flat().map(([a, b]) => [a, b].sort().join('+'));
    expect(seen).toHaveLength(21); expect(new Set(seen).size).toBe(21);
    expect(classOfPair('int', 'str')).toBe('warrior'); expect(classOfPair('spi', 'fin')).toBe('merchant');
  });
  test('вес = Основа × (0,5 + 0,5 × Форма); null = в форме [S§5, S§2 пример]', () => {
    const w = classWeights({ str: 48, end: 40, int: 30, dis: 30, cha: 30, fin: 30, spi: 30 }, { str: 0.38, end: null, int: 1, dis: 1, cha: 1, fin: 1, spi: 1 });
    expect(w.str).toBeCloseTo(33.12); expect(w.end).toBe(40);
  });
  test('Странник при разбросе ≤ 10% среднего; иначе две тяжёлые', () => {
    const w = (v: number[]) => Object.fromEntries(ALL.map((s, i) => [s, v[i]])) as Record<Stat, number>;
    expect(pickClass(w([50, 52, 54, 55, 51, 53, 50]), null)).toEqual({ id: 'wanderer', pair: null });   // разброс 5 ≤ 5,21
    expect(pickClass(w([60, 40, 58, 40, 40, 40, 40]), null)).toEqual({ id: 'warrior', pair: ['str', 'int'] });
  });
  test('гистерезис 5%: новая пара должна опережать на 5% [S§5]', () => {
    const base = { str: 50, end: 50, int: 10, dis: 10, cha: 10, fin: 10, spi: 10 };   // Воин: лучшая пара STR+END = 100
    expect(pickClass({ ...base, cha: 52, spi: 52 }, { id: 'warrior' }).id).toBe('warrior');   // Бард CHA+SPI 104 < 105
    expect(pickClass({ ...base, cha: 52.5, spi: 52.5 }, { id: 'warrior' }).id).toBe('bard');   // ровно 105
    expect(pickClass({ ...base, cha: 52, spi: 52 }, null).id).toBe('bard');                    // первый класс — без гистерезиса
  });
  test('сила пассива по средней форме пары; Странник — всех 7', () => {
    const f = { str: 0.9, end: 0.7, int: 0.2, dis: 1, cha: 1, fin: 1, spi: 1 };
    expect(passivePower({ id: 'warrior', pair: ['str', 'end'] }, f)).toBe(1);     // 0,8
    expect(passivePower({ id: 'warrior', pair: ['str', 'int'] }, f)).toBe(0.5);   // 0,55
    expect(passivePower({ id: 'wanderer', pair: null }, { ...f, str: 0, end: 0, int: 0 })).toBe(0.5);   // 4/7
  });
  test('пример [S§1] «Зал 45 минут» → 92 XP и 18 золота', () => {
    const b = questBonuses({ skills: ['strength'], stat: 'str', verify: 'auto', streak: 10, theme: false, weakest: false,
      cls: { id: 'warrior', power: 1 }, perk: { xp: 0.1, gold: 0 }, rust: false, inspire: false });
    expect(questReward({ rank: 'C', verify: 'auto', bonuses: b.bonuses, penalties: [fatiguePenalty(20)] })).toMatchObject({ bonus: 0.4, xp: 92, gold: 18 });
  });
  test('пассивы по классам и потолок +100%', () => {
    const q = (o: Partial<Parameters<typeof questBonuses>[0]>) => questBonuses({ skills: ['reading'], stat: 'int', verify: 'honest', streak: 0, theme: false, weakest: false, cls: null, perk: { xp: 0, gold: 0 }, rust: false, inspire: false, ...o });
    const sum = (x: { bonuses: number[] }) => x.bonuses.reduce((a, b) => a + b, 0);
    expect(sum(q({ cls: { id: 'sage', power: 0.5 } }))).toBeCloseTo(0.05);
    expect(sum(q({ cls: { id: 'bard', power: 1 }, skills: ['teamwork'], stat: 'cha' }))).toBeCloseTo(0.15);
    expect(sum(q({ cls: { id: 'ranger', power: 1 }, verify: 'auto' }))).toBeCloseTo(0.1);
    expect(sum(q({ cls: { id: 'paladin', power: 1 }, streak: 10 }))).toBeCloseTo(0.3);
    expect(q({ cls: { id: 'merchant', power: 1 }, perk: { xp: 0, gold: 0.1 } }).goldBonus).toBeCloseTo(0.2);
    const big = q({ streak: 25, theme: true, weakest: true, cls: { id: 'wanderer', power: 1 }, perk: { xp: 0.3, gold: 0 }, rust: true, inspire: true });
    expect(questReward({ rank: 'E', verify: 'auto', bonuses: big.bonuses, penalties: [] }).bonus).toBe(1);
  });
  ```
- [ ] `npx vitest run src/domain/classes.test.ts` — FAIL.
- [ ] Реализовать. `pickClass`: разброс/среднее → Странник по порогам 0,10 (без текущего) / 0,095 (из класса) / 0,105 (из Странника); топ-2 по весу (ничья — порядок `STATS`); гистерезис по сумме весов пары. Все сравнения порогов — через `r9` (1,05 × 100 в JS = 105,00000000000001). Удалить `classFor`; временно `className` в replay = `CLASSES[pickClass(classWeights(stats, nulls), null).id].name` до T4.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): base classes, solo passives, quest bonuses`.

### Task 3: Ранг недели, лига, сезонный путь, каталог вещей (чистое)

**Files:** Create `src/domain/rivalry.ts`, `src/domain/rivalry.test.ts`, `src/domain/seasonPath.ts`, `src/domain/seasonPath.test.ts`, `src/domain/cosmetics.ts`. Modify `src/domain/weekly.ts`, `src/domain/weekly.test.ts`, `src/domain/types.ts`.

**Interfaces — consumes:** T1 `BALANCE`. **Produces:**
- `rivalry.ts`: `type WeekRank = 'S' | 'A' | 'B' | 'C' | 'D'`; `weekRank(share: number, xp: number, avg4: number): WeekRank`; `avgPrev(weeks: (number | null)[]): number` (`null` — неделя без выдачи; все `null` → `150 × 7`); `leagueTier(points: number): 0 | 1 | 2 | 3 | 4 | 5`; `leagueAfter(points: number, rank: WeekRank | null, recovery: boolean): number`; `softReset(points: number): number`; `chestPick(weekStart: ISODate, owned: ReadonlySet<string>): string | null`.
- `seasonPath.ts`: `stepXpFor(season: { start: ISODate; end: ISODate }, firstActive: ISODate | null): number`; `stepRewards(kind: Exclude<SeasonKind, 'prologue'>, step: number): { gold: number; items: string[]; title: string | null }`.
- `cosmetics.ts`: `type CosmeticSlot`, `interface CosmeticDef` (спека §7), `COSMETICS: CosmeticDef[]`, `cosmeticById(id: string): CosmeticDef | null`, `RARE_POOL: string[]` (6), `SHOP_COSMETICS: string[]` (8, цены 100–800), `trophyItemId(trophyId: string): string`.
- `weekly.ts`: `WeeklyCtx.easy?: boolean` (спека §5.3).

- [ ] **Тест (падает):**
  ```ts
  test('ранг недели [P§5]', () => {
    expect(weekRank(0.9, 1260, 1050)).toBe('S'); expect(weekRank(0.9, 1259, 1050)).toBe('A');
    expect([0.8, 0.79, 0.65, 0.6499, 0.5, 0.49].map(s => weekRank(s, 0, 1050))).toEqual(['A', 'B', 'B', 'C', 'C', 'D']);
    expect(avgPrev([null, null, null, null])).toBe(1050); expect(avgPrev([1200, null, 800, null])).toBe(1000);
  });
  test('лига: 6 очков на ступень, 0–35, восстановление гасит минус, мягкий сброс [P§5, S§8]', () => {
    expect(leagueAfter(5, 'B', false)).toBe(6); expect(leagueTier(6)).toBe(1);
    expect(leagueAfter(6, 'D', false)).toBe(5); expect(leagueAfter(6, 'D', true)).toBe(6);
    expect(leagueAfter(0, 'D', false)).toBe(0); expect(leagueAfter(34, 'S', false)).toBe(35); expect(leagueTier(35)).toBe(5);
    expect(leagueAfter(7, null, false)).toBe(7);
    expect(softReset(14)).toBe(6); expect(softReset(3)).toBe(0); expect(softReset(35)).toBe(24);
  });
  test('сундук детерминирован и не повторяется', () => {
    const a = chestPick('2026-12-21', new Set()); expect(a).toBe(chestPick('2026-12-21', new Set()));
    expect(RARE_POOL).toContain(a); expect(chestPick('2026-12-21', new Set(RARE_POOL))).toBeNull();
    expect(chestPick('2026-12-21', new Set([a!]))).not.toBe(a);
  });
  test('цена ступени: 600; поздний вход пропорционально [S§8]', () => {
    const w = { start: '2026-12-01', end: '2027-02-28' };
    expect(stepXpFor(w, '2026-11-17')).toBe(600); expect(stepXpFor(w, '2026-12-01')).toBe(600);
    expect(stepXpFor(w, '2027-01-15')).toBe(300); expect(stepXpFor(w, '2027-02-28')).toBe(60); expect(stepXpFor(w, null)).toBe(600);
  });
  test('награды ступеней [P§6]', () => {
    expect(stepRewards('winter', 1)).toEqual({ gold: 50, items: [], title: null });
    expect(stepRewards('winter', 3).items).toEqual(['season:winter:3']);
    expect(stepRewards('winter', 10).items).toEqual(['bg:winter']);
    expect(stepRewards('winter', 20).items).toEqual(['frame:winter']);
    expect(stepRewards('winter', 30)).toEqual({ gold: 50, items: ['season:winter:30', 'look:winter'], title: 'Покоритель Зимы' });
    const all = Array.from({ length: 30 }, (_, i) => stepRewards('spring', i + 1));
    expect(all.reduce((a, r) => a + r.gold, 0)).toBe(1500); expect(all.flatMap(r => r.items)).toHaveLength(13);
    expect(all.flatMap(r => r.items).every(id => cosmeticById(id))).toBe(true);
    expect(SHOP_COSMETICS.map(id => cosmeticById(id)!.price!).every(p => p >= 100 && p <= 800)).toBe(true);
    expect(cosmeticById(SHOP_COSMETICS[0])!.price).toBe(100);   // первая — самая дешёвая (тест покупки в T6)
  });
  // weekly.test.ts
  test('после ранга D недельные облегчены', () => {
    const c = { ...ctx, prevActiveDays: 5, prevStatQuests: 10, bestSteps7: 8000 };
    const [d, s, st] = generateWeeklyQuests({ ...c, easy: true });
    expect(d.target).toBe(5); expect(s.target).toBe(9); expect(st.target).toBe(48000);   // 6−1; round(11×0,8); ceil(8000×7×1,05×0,8/1000)×1000
  });
  ```
- [ ] FAIL → реализовать (пороги ранга — через `r9`: 1,2 × 1 050 не ровно 1 260 в JS; `round10`, мин. `season.minStepXp`; хэш — `seededRng(weekStart)` из `rng.ts`). Названия вещей — обобщённые («Шарф Зимы II», «Плащ звездочёта»).
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(domain): week rank, league, season path rewards, cosmetics catalogue`.

### Task 4: Replay — снимок дня, перки, ржавчина, класс и пассив

**Files:** Modify `src/domain/replay.ts`, `src/domain/types.ts`, `src/domain/assemble.ts`, `src/domain/assemble.test.ts`, `src/screens/MyDay.tsx` (контекст сборки). Create `src/domain/replayDepth.test.ts` (свои хелперы `at/ev/nq/issue/done/span/doneDays` по образцу `replay.test.ts`; `onb(profile)`; `rating(pair)` — профиль онбординга, где у пары 9, у остальных 5).

**Interfaces — consumes:** T1, T2. **Produces:**
- `replay.ts`: внутренняя `formsAt(closedBefore): Record<Stat, { form; norm; xp14 }>` — тот же расчёт, что `statInfo`, вызывается в цикле на начало каждого дня ≥ `depthSince` и в конце; на начало дня — снимок `{ base, forms, skills: { level, idle, rusty }, cls }`.
- Класс: `firstDay` → `pickClass(…, null)`; каждое 1-е число → `pickClass(…, cur)`; история `{ date, id, pair }[]`.
- Бонусы задания при `d ≥ depthSince` — `questBonuses` (пассив, перк главного навыка, ржавчина — первому по времени выполнения заданию дня с тегом, «Вдохновение» — T5); `goldBonus` в `questReward`. До — прежний набор.
- Постоянные перки при `d ≥ depthSince`: `facetDay(…, relapseAdd)`, `nextStreak(…, missFactor)`, `fatigueNext(…, extraDecay)`.
- `skillLast` обновляется и выполненным ритуалом лестницы.
- `GameState`: `skills[id] += { idleDays, rusty, perks: PerkView[] }`, `cls` (спека §10), `className = cls.name`.
- `AssembleCtx.skills[id] += idleDays: number | null`; «на грани» = `idleDays ≥ rust.warnDays`.

- [ ] **Тест (падает)** (`replayDepth.test.ts`):
  ```ts
  test('класс по онбордингу: Сила и Интеллект → Воин с первого дня; пересчёт 1-го', () => {
    const s = replay([onb(rating('str', 'int')), issue('2026-12-21', [nq('a', '2026-12-21', 'E', ['strength'])])], at('2026-12-21', 22));
    expect(s.cls).toMatchObject({ id: 'warrior', name: 'Воин', pair: ['str', 'int'], since: '2026-12-21', nextRecalc: '2027-01-01' });
    expect(s.className).toBe('Воин');
  });
  test('ржавчина: 30 дней простоя → +0,5 первому заданию, снята', () => {
    const evs = [onb(rating('str', 'int')), issue('2026-11-20', [nq('a', '2026-11-20', 'E', ['strength'])]), done('2026-11-20', 'a'),
      issue('2026-12-21', [nq('b', '2026-12-21', 'E', ['strength']), nq('c', '2026-12-21', 'E', ['strength'])])];
    expect(replay(evs, at('2026-12-21', 9)).skills.strength).toMatchObject({ idleDays: 30, rusty: true });
    const s = replay([...evs, done('2026-12-21', 'b', at('2026-12-21', 18)), done('2026-12-21', 'c', at('2026-12-21', 19))], at('2026-12-21', 22));
    expect(s.ledger.find(r => r.questId === 'b')!.bonus).toBe(0.5);   // форма 0 → пассив 0; ржавчина +0,5
    expect(s.ledger.find(r => r.questId === 'c')!.bonus).toBe(0);
    expect(s.skills.strength).toMatchObject({ rusty: false, lastDate: '2026-12-21' });
  });
  test('дни восстановления не считаются в простой', () => {
    const s = replay([onb(rating('str', 'int')), issue('2026-11-20', [nq('a', '2026-11-20', 'E', ['strength'])]), done('2026-11-20', 'a'),
      ev({ type: 'recovery_started', date: '2026-12-01', quests: 0, ts: at('2026-12-01', 9) }), ev({ type: 'recovery_ended', date: '2026-12-04', ts: at('2026-12-04', 9) })], at('2026-12-21', 9));
    expect(s.skills.strength).toMatchObject({ idleDays: 27, rusty: false });
  });
  test('до depthSince XP прежний: задание 1 декабря без пассива', () => {
    const s = replay([onb(rating('str', 'int')), issue('2026-12-01', [nq('a', '2026-12-01', 'C', ['strength'])]), done('2026-12-01', 'a')], at('2026-12-02'));
    expect(s.ledger.find(r => r.questId === 'a')).toMatchObject({ bonus: 0, xp: 49 });
  });
  test('пассив Воина на тренировке после depthSince: +0,1 при новой форме', () => {
    const s = replay([onb(rating('str', 'int')), issue('2026-12-16', [nq('a', '2026-12-16', 'C', ['strength'])]), done('2026-12-16', 'a')], at('2026-12-16', 22));
    expect(s.ledger.find(r => r.questId === 'a')).toMatchObject({ bonus: 0.1, xp: 54 });   // 70 × 0,7 × 1,1
  });
  test('перки в состоянии: Силовые 3 открыт', () => {
    const s = replay([onb(rating('str', 'int')), ...doneDays('2026-12-16', 3, 'strength', 'S')], at('2026-12-19'));
    expect(s.skills.strength.level).toBeGreaterThanOrEqual(3);
    expect(s.skills.strength.perks[0]).toMatchObject({ id: 'strength:3', level: 3, kind: 'pct' });
  });
  // assemble.test.ts: «на грани» по idleDays, а не по календарю
  test('на грани ржавчины — по дням простоя', () => {
    const c = ctxWith({ skills: { ...skills, mobility: { level: 3, lastDate: '2026-11-01', idleDays: 22 } } });
    expect(assembleDay(c).some(q => q.kind === 'daily' && q.why?.includes('ржав'))).toBe(false);
    const c2 = ctxWith({ skills: { ...skills, mobility: { level: 3, lastDate: '2026-11-01', idleDays: 23 } } });
    expect(assembleDay(c2)[0].skills).toEqual(['mobility']);
  });
  ```
- [ ] FAIL → реализовать. Вынести тело `statInfo` в `formsAt`; конец replay использует его же (существующие тесты формы не меняются).
- [ ] `npx vitest run` (весь `replay.test.ts` зелёный без правок чисел), `npm run build` — PASS. Коммит `feat(replay): day snapshot, perks, rust, class and passive`.

### Task 5: Replay — способности

**Files:** Modify `src/domain/replay.ts`, `src/domain/types.ts`, `src/domain/assemble.ts`, `src/domain/assemble.test.ts`, `src/domain/replayDepth.test.ts`.

**Interfaces — consumes:** T2, T4. **Produces:**
- Событие `ability_used` (спека §4.4) и валидация.
- `assemble.ts`: `rerollCandidates(ctx: AssembleCtx, q: Quest, today: Quest[], n: number): Quest[]` — до `n` разных шаблонов по правилам `rerollCandidate`; `rerollCandidate` = `rerollCandidates(…, 1)[0] ?? null`.
- `GameState.today.ability: { rush: string | null; shield: boolean; inspire: boolean; march: boolean; freeRerolls: number }`; `cls.ability.{ usedOn, available }`; `today.nextRerollCost` учитывает `freeRerolls`.

- [ ] **Тест (падает):**
  ```ts
  const use = (date: string, ability: string, extra = {}, h = 10) => ev({ type: 'ability_used', date, ability, ts: at(date, h), ...extra });
  test('Рывок ×2 на тренировку; второй за неделю — игнор; в понедельник — снова', () => {
    const base = [onb(rating('str', 'int')), issue('2026-12-22', [nq('a', '2026-12-22', 'C', ['strength'])]), done('2026-12-22', 'a')];
    const x = replay(base, at('2026-12-22', 22)).ledger.find(r => r.questId === 'a')!;
    const y = replay([...base, use('2026-12-22', 'rush', { questId: 'a' })], at('2026-12-22', 22)).ledger.find(r => r.questId === 'a')!;
    expect(y.mult).toBe(2); expect(Math.abs(y.xp - 2 * x.xp)).toBeLessThanOrEqual(1);
    const wk = replay([...base, use('2026-12-22', 'rush', { questId: 'a' }), issue('2026-12-23', [nq('b', '2026-12-23', 'C', ['strength'])]),
      use('2026-12-23', 'rush', { questId: 'b' }), done('2026-12-23', 'b'), issue('2026-12-28', [nq('c', '2026-12-28', 'C', ['strength'])]),
      use('2026-12-28', 'rush', { questId: 'c' }), done('2026-12-28', 'c')], at('2026-12-28', 22));
    expect(wk.ledger.find(r => r.questId === 'b')!.mult).toBe(1); expect(wk.ledger.find(r => r.questId === 'c')!.mult).toBe(2);
  });
  test('недоверенные способности отбрасываются', () => {
    const base = [onb(rating('str', 'int')), issue('2026-12-22', [nq('a', '2026-12-22', 'C', ['reading'])])];
    const s = replay([...base, use('2026-12-22', 'shield'), use('2026-12-22', 'rush', { questId: 'a' }) /* не тренировка */,
      use('2026-12-21', 'rush', { questId: 'a' }, 30) /* игровая дата ts — 22-е, а date — 21-е */, use('2026-12-10', 'rush', { questId: 'a' }), use('2026-12-22', 'zzz')], at('2026-12-22', 12));
    expect(s.today.ability).toEqual({ rush: null, shield: false, inspire: false, march: false, freeRerolls: 0 });
    expect(s.cls.ability.available).toBe(true);
  });
  test('Щит Паладина: пропуск не режет серию', () => { /* серия 4 → день 0 из 2 со щитом → серия 4, без щита → 2 */ });
  test('Вдохновение Барда: +0,2 к бонусам всех заданий дня', () => { /* rating('cha','spi'): bonus строки = 0,2 + пассив (не соц.) 0 */ });
  test('Марш: цель 8 000 шагов засчитана при 6 400', () => { /* rating('end','spi'); qa(…, '>=', 8000) + пакет steps 6400 → verify auto */ });
  test('Сделка: 1 + 3 бесплатных переброса, 5-й платный 50', () => { /* rating('cha','fin'); 4 quest_rerolled без списания, 5-й списывает */ });
  test('Прозрение: бесплатная замена вне счёта перебросов; выше потолка — игнор', () => { /* rating('int','spi'); replacement C при потолке E → игнор */ });
  test('Универсал: XP задания уходит в новую характеристику; stat «xyz» — игнор', () => { /* все 5 → Странник; stat 'fin' → skills ['budget'], statInfo.fin.xp > 0 */ });
  test('План: невыполненные недельные заменяются присланными валидными', () => { /* rating('int','fin'); quests с 1 мусорным → заменены только валидные */ });
  test('Рывок + Вернуть форму → ×4, не больше', () => { /* restore-задание тренировки: mult 4 */ });
  ```
  Каждый тест-заглушка реализуется полностью по комментарию (конкретные числа: серия 4 → 4 / 2; бонус 0,2; `verify: 'auto'`; `spendable` −50 только на 5-й; `mult: 4`).
- [ ] FAIL → реализовать: способности собираются в карту `date → AbilityUse` (первая по `ts` в неделе на класс-способность); класс на дату — из истории T4. «Прозрение» и «Сделка» встраиваются в существующую обработку перебросов (цена 0, не увеличивает `rerollsOn` для «Прозрения»).
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(replay): weekly class abilities`.

### Task 6: Replay — ранг недели, лига, сезонный путь, инвентарь

**Files:** Modify `src/domain/replay.ts`, `src/domain/types.ts`, `src/domain/replayDepth.test.ts`, `src/screens/MyDay.tsx` (передать `genWeekly.easy`).

**Interfaces — consumes:** T3, T4, T5. **Produces:**
- В цикле дней, в конце закрытого воскресенья ≥ `depthSince`: `WeekResult`, строка `source: 'week_rank'` id `week:<weekStart>` (`xp: 0`), сундук в инвентарь, очки лиги (мягкий сброс перед первой неделей нового сезона).
- В конце каждого дня: новые ступени пути сезона даты d → строки `source: 'season_step'` id `path:<seasonId>:<k>` (`xp: 0`, `gold: 50`) датой `max(d, depthSince)`, вещи и титул.
- События `cosmetic_bought` (в общей очереди покупок по `ts`, цена из каталога) и `cosmetic_equipped`.
- `GameState`: `week`, `league`, `season += { stepXp, joined, rewards, title }`, `season.step` по `stepXp`, `cosmetics`, `title` — самый поздний из титулов достижений и пути, `genWeekly.easy` (прошлая неделя — D).

- [ ] **Тест (падает):**
  ```ts
  const week = (from: string, perDay = 1, doneShare = 1) => span(from, 7).flatMap(d => {
    const qs = Array.from({ length: perDay }, (_, i) => nq(`${d}-${i}`, d, 'E', ['reading']));
    return [issue(d, qs), ...qs.slice(0, Math.round(perDay * doneShare)).map(x => done(d, x.id))];
  });
  test('ранг недели решается при закрытии воскресенья [P§5]', () => {
    const evs = [onb(rating('str', 'int')), ...week('2026-12-21')];
    const open = replay(evs, at('2026-12-27', 12));
    expect(open.week.results).toEqual([]); expect(open.week.preview).toMatchObject({ rank: 'A', share: 1, avg4: 1050 });
    const s = replay(evs, at('2026-12-28', 12));
    expect(s.week.results[0]).toMatchObject({ weekStart: '2026-12-21', rank: 'A', points: 2, gold: 300, chest: null });
    expect(s.ledger.filter(r => r.id === 'week:2026-12-21')).toMatchObject([{ source: 'week_rank', xp: 0, gold: 300, date: '2026-12-27' }]);
    expect(s.league).toMatchObject({ tier: 0, name: 'Бронза', points: 2 });
  });
  test('неделя < 3 дней с выдачей — без ранга', () => {
    const s = replay([onb(rating('str', 'int')), ...week('2026-12-21').slice(0, 4)], at('2026-12-28', 12));
    expect(s.week.results[0]).toMatchObject({ rank: null, points: 0, gold: 0 });
  });
  test('D → следующая неделя облегчена', () => {
    const s = replay([onb(rating('str', 'int')), ...week('2026-12-21', 2, 0)], at('2026-12-28', 12));
    expect(s.week.results[0].rank).toBe('D'); expect(s.genWeekly.easy).toBe(true);
  });
  test('сезонный путь: ступени, золото по 50 один раз, вещь на 3-й, ранние — датой depthSince', () => {
    const s = replay([onb(rating('str', 'int')), ...doneDays('2026-12-01', 20, 'reading', 'S')], at('2026-12-21', 12));
    expect(s.season.stepXp).toBe(600); expect(s.season.rewards).toHaveLength(s.season.step);
    expect(s.season.rewards.every(r => r.gold === 50)).toBe(true);
    expect(s.season.rewards.find(r => r.step === 3)!.items).toEqual(['season:winter:3']);
    expect(s.season.rewards.filter(r => r.date < '2026-12-16')).toEqual([]);
    expect(new Set(s.ledger.filter(r => r.source === 'season_step').map(r => r.id)).size).toBe(s.season.step);
    expect(s.cosmetics.owned.map(o => o.id)).toContain('season:winter:3');
  });
  test('поздний вход: цена ступени от первой активности', () => {
    const s = replay([onb(rating('str', 'int')), ...doneDays('2027-01-15', 2, 'reading')], at('2027-01-16', 12));
    expect(s.season).toMatchObject({ stepXp: 300, joined: '2027-01-15' });
  });
  test('мягкий сброс лиги на стыке сезонов', () => { /* набрать 14 очков до 28.02.2027 (7 недель A) → первая неделя весны: 6 + очки недели */ });
  test('D в неделе с днём восстановления очко не снимает', () => { /* 2 недели B (2 очка) → неделя D с recovery_started/ended внутри → points 2 */ });
  test('вещи: покупка один раз по цене каталога, надеть только своё', () => {
    const item = SHOP_COSMETICS[0], price = cosmeticById(item)!.price!;   // 100
    const base = [onb(rating('str', 'int')), ...doneDays('2026-12-16', 5, 'reading', 'S')];
    const before = replay(base, at('2026-12-21', 14)).gold;
    const s = replay([...base,
      ev({ type: 'cosmetic_bought', itemId: item, ts: at('2026-12-21', 9) }), ev({ type: 'cosmetic_bought', itemId: item, ts: at('2026-12-21', 10) }),
      ev({ type: 'cosmetic_bought', itemId: 'nope', ts: at('2026-12-21', 11) }),
      ev({ type: 'cosmetic_equipped', slot: cosmeticById(item)!.slot, itemId: item, ts: at('2026-12-21', 12) }),
      ev({ type: 'cosmetic_equipped', slot: 'frame', itemId: 'frame:winter', ts: at('2026-12-21', 13) })], at('2026-12-21', 14));
    expect(s.cosmetics.owned.filter(o => o.id === item)).toHaveLength(1);
    expect(s.cosmetics.equipped).toEqual({ [cosmeticById(item)!.slot]: item });
    expect(s.gold).toBe(before - price);
  });
  ```
  Заглушки дописываются полностью (сброс: `league.points` = 6 + очки первой весенней недели; восстановление: `points` остаётся 2).
- [ ] FAIL → реализовать. Порядок в конце дня d: строки заданий → недельные → **ступени пути** → (воскресенье) **ранг недели** — чтобы строки с золотом попадали в `goldSoFar` следующего дня.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(replay): week rank, league, season path, cosmetics`.

### Task 7: Недельный отчёт Мастера и воскресный пуш

**Files:** Create `src/domain/masterReport.ts`, `src/domain/masterReport.test.ts`. Modify `src/ai/tasks.ts`, `src/ai/tasks.test.ts`, `src/screens/Analytics.tsx`, `worker/src/push.ts`, `worker/src/push.test.ts`.

**Interfaces — consumes:** T4–T6 (`GameState`). **Produces:**
- `reportWeek(today: ISODate): ISODate` — воскресенье → `weekStart(today)`, иначе `weekStart(today) − 7`.
- `interface ReportInput { weekStart: ISODate; days: { date: ISODate; xp: number; done: number; issued: number; counted: boolean }[]; metrics: Partial<Record<(typeof AI_METRICS)[number], number>>; vitals: { hp: number | null; energy: number | null; focus: number | null; fatigue: number | null }; score: WeekScore; final: boolean; league: string; cls: { name: string; passivePower: number; abilityUsed: boolean }; seasonStep: number; newPerks: string[]; nearRust: string[]; rusty: string[]; ladders: { active: number; ritualsDone: number }; shadow: number | null; weakest: string; baseGain: { stat: string; delta: number } | null }`
- `reportInput(state: GameState, weekStart: ISODate): ReportInput` — только белый список (спека §8); `AI_METRICS` переезжает в `masterReport.ts`, `tasks.ts` импортирует.
- `reportByRules(i: ReportInput): string` — 4 раздела, ≤ 1 500 символов.
- `weekReportOf(state: GameState): { weekStart: ISODate; text: string; ai: boolean }`.
- `aiWeeklyReport(cfg: AiConfig, state: GameState, weekStart = reportWeek(state.today.date)): Promise<string>` — промпт из `reportInput`.
- Worker: `message('evening', date)` в воскресенье → `{ title: 'Разбор недели', body: 'Мастер разобрал твою неделю — загляни', tag: 'weekly' }`.

- [ ] **Тест (падает):**
  ```ts
  test('какая неделя', () => {
    expect(reportWeek('2026-12-27')).toBe('2026-12-21'); expect(reportWeek('2026-12-28')).toBe('2026-12-21');
    expect(reportWeek('2026-12-30')).toBe('2026-12-21'); expect(reportWeek('2027-01-03')).toBe('2026-12-28');
  });
  test('вход отчёта — белый список: без граней, dont-лестниц, трат, магазинов, целей', () => {
    const s = stateWith({ /* грань «СекретнаяГрань», dont-лестница «СекретнаяЛестница», metric spend 999, wallet merchant «СекретМагазин», goal «СекретнаяЦель» */ });
    const j = JSON.stringify(reportInput(s, '2026-12-21'));
    for (const x of ['СекретнаяГрань', 'СекретнаяЛестница', 'СекретМагазин', 'СекретнаяЦель', '999', 'spend']) expect(j).not.toContain(x);
    expect(reportInput(s, '2026-12-21').shadow).toEqual(expect.any(Number));
  });
  test('текст правил: 4 раздела, ранг и план', () => {
    const t = reportByRules(sampleInput({ score: { share: 0.7, xp: 900, avg4: 1050, days: 6, rank: 'B' }, weakest: 'Финансы', nearRust: ['Мобильность'] }));
    for (const h of ['Что получилось', 'Закономерности', 'Слабые места', 'План на неделю']) expect(t).toContain(h);
    expect(t).toContain('B'); expect(t).toContain('Финансы'); expect(t).toContain('Мобильность'); expect(t.length).toBeLessThanOrEqual(1500);
  });
  test('weekReportOf: ИИ-текст за неделю побеждает правила', () => {
    expect(weekReportOf({ ...s, reports: [{ weekStart: '2026-12-21', text: 'ИИ' }] })).toEqual({ weekStart: '2026-12-21', text: 'ИИ', ai: true });
    expect(weekReportOf({ ...s, reports: [] }).ai).toBe(false);
  });
  // tasks.test.ts — промпт aiWeeklyReport (мок generateJson) не содержит тех же секретов и содержит «ранг недели»
  // worker/src/push.test.ts
  test('воскресный вечер — разбор недели без данных игрока', () => {
    expect(message('evening', '2026-12-27')).toMatchObject({ title: 'Разбор недели', tag: 'weekly' });
    expect(message('evening', '2026-12-28').tag).toBe('evening');
    expect(message('evening', '2026-12-27').body).not.toMatch(/\d/);
  });
  ```
- [ ] FAIL → реализовать. `Analytics.tsx`: кнопка пишет `ai_report` за `reportWeek(today)`.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(report): sunday master report, rules fallback, whitelist`.

### Task 8: Интерфейс — навыки и перки, класс, способности

**Files:** Modify `src/screens/Skills.tsx`, `src/screens/Character.tsx`, `src/ui/QuestCard.tsx`, `src/styles.css`. Create `src/ui/ClassCard.tsx`, `src/ui/skillView.ts`, `src/ui/skillView.test.ts`.

**Interfaces — consumes:** T4, T5 (`GameState.skills[*].perks/rusty/idleDays`, `cls`, `today.ability`), `rerollCandidates`. **Produces:**
- `skillView.ts`: `rustBadge(k: SkillState): { text: string; tone: 'warn' | 'bad' } | null` («ржавеет через 5 дн.» при простое 25; «ржавый»); `perkDot(p: PerkView | undefined): 'locked' | 'on' | 'half' | 'off'`; `passiveText(cls: GameState['cls']): string`.
- `ClassCard` — карточка класса и кнопки дневных/недельных способностей (`ability_used`), лист смены класса (`localStorage` «показано», `try/catch`).
- `QuestCard` — пункты «Рывок» / «Прозрение» (лист из `rerollCandidates(ctx, q, today, 3)`) / «Универсал» (выбор характеристики), только при `cls.ability.available` и подходящем задании.

- [ ] **Тест (падает):**
  ```ts
  test('бейдж ржавчины', () => {
    expect(rustBadge({ idleDays: 25, rusty: false } as SkillState)).toEqual({ text: 'ржавеет через 5 дн.', tone: 'warn' });
    expect(rustBadge({ idleDays: 31, rusty: true } as SkillState)).toEqual({ text: 'ржавый', tone: 'bad' });
    expect(rustBadge({ idleDays: 10, rusty: false } as SkillState)).toBeNull(); expect(rustBadge({ idleDays: null, rusty: false } as SkillState)).toBeNull();
  });
  test('точки перков и текст пассива', () => {
    expect(perkDot(undefined)).toBe('locked'); expect(perkDot({ power: 0.5 } as PerkView)).toBe('half'); expect(perkDot({ power: 0 } as PerkView)).toBe('off');
    expect(passiveText({ passive: { text: '+10% XP за тренировки', power: 0.5 } } as GameState['cls'])).toBe('+10% XP за тренировки — вполовину');
  });
  ```
- [ ] FAIL → реализовать компоненты (`aria-label` на точках: «Перк 6 „Знаток“: работает вполовину»; кнопки ≥ 44 px; лист навыка — `useDialog`).
- [ ] `npx vitest run`, `npm run build` — PASS; ручная проверка на телефоне: открыть навык, применить способность. Коммит `feat(ui): skills with perks and rust, class card, abilities`.

### Task 9: Интерфейс — сезон и лига, разбор недели, снаряжение

**Files:** Modify `src/ui/HeroStage.tsx`, `src/screens/Home.tsx`, `src/screens/Character.tsx`, `src/screens/Shop.tsx`, `src/ui/Avatar.tsx`, `src/ui/Celebration.tsx`, `src/ui/statBar.ts`, `src/ui/statBar.test.ts`, `src/styles.css`. Create `src/screens/SeasonPath.tsx`, `src/ui/Wardrobe.tsx`.

**Interfaces — consumes:** T6, T7. **Produces:**
- `statBar.ts`: `pathLabel` использует `season.stepXp`; `leagueChip(l: GameState['league']): { name: string; into: number; of: 6 }`.
- `SeasonPath` — лист: 30 ступеней с наградами, цена и поздний вход, лига, последние 8 недель.
- Главная: чип лиги и ранг-предпросмотр в `versus-card`; карточка «Разбор недели» (вс/пн) — `weekReportOf`; при ключе ИИ и отсутствии отчёта — один вызов `aiWeeklyReport` за открытие (ref-защита) → `ai_report`; фон и рамка из `cosmetics.equipped`.
- `Wardrobe` — полка по слотам, «Надеть/Снять» (`cosmetic_equipped`); `Avatar` рисует слои `head/neck/cloak/emblem`; `Shop` — раздел «Снаряжение» (`cosmetic_bought`, проверка цены как у обычных покупок).

- [ ] **Тест (падает):**
  ```ts
  test('путь сезона с уменьшенной ценой ступени', () => {
    const s = { kind: 'winter', name: 'Зима', step: 2, xp: 700, stepXp: 300 } as GameState['season'];
    expect(pathLabel(s, '2027-01-20')).toEqual({ title: 'Зима · ступень 2/30', sub: 'до ступени 3: 100 / 300 XP', pct: expect.closeTo(33.3, 1) });
  });
  test('чип лиги', () => {
    expect(leagueChip({ tier: 1, name: 'Серебро', points: 8, seasonId: 'winter-2026' })).toEqual({ name: 'Серебро', into: 2, of: 6 });
    expect(leagueChip({ tier: 5, name: 'Легенда', points: 35, seasonId: 'winter-2026' })).toEqual({ name: 'Легенда', into: 5, of: 6 });
  });
  ```
- [ ] FAIL → реализовать. Снег фона — CSS, при `prefers-reduced-motion` без анимации; `role="progressbar"` у пути и лиги.
- [ ] `npx vitest run`, `npm run build` — PASS; ручная проверка в воскресенье: пуш «Разбор недели» → карточка на Главной (с ключом ИИ и без). Коммит `feat(ui): season path, league, sunday report, wardrobe`.
