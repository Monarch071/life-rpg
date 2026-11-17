# Life RPG — Этап 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Офлайн‑PWA на GitHub Pages: анкета → персонаж с 7 характеристиками → экран «Мой день» → задания по правилам → XP/уровни/классы, Тень, быстрый ввод, чек‑ин, экспорт/импорт. Без бэкенда и ИИ.

**Architecture:** Всё состояние игры вычисляется чистой функцией `replay(events)` из локального журнала событий в IndexedDB (Dexie). UI пишет только события (`appendEvent`) и читает результат `replay` через `useLiveQuery`. Вся игровая логика — в `src/domain/` без React и без БД, покрыта vitest. Это делает этап 2 (синхронизация журнала с D1) добавлением, а не переделкой.

**Tech Stack:** Vite 5, React 18, TypeScript 5 (strict), Dexie 4 + dexie-react-hooks, vite-plugin-pwa 0.20 (generateSW), vitest 2 + fake-indexeddb, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-17-life-rpg-design.md`

## Global Constraints

- Весь интерфейс на русском.
- iPhone, iOS 27, Safari «На экран Домой»: `display: standalone`, `viewport-fit=cover`, отступы `env(safe-area-inset-*)`, `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, apple-touch-icon 180×180.
- Репозиторий GitHub `life-rpg`, Vite `base: '/life-rpg/'`, PWA `scope` и `start_url` = `/life-rpg/`.
- Только бесплатные технологии, без обязательного ключа ИИ.
- Стиль: тёмный аниме‑интерфейс с неоновыми акцентами; Тень — фиолетовая (`#b14dff`), основной акцент — голубой (`#2fb5ff`). Оригинальный, не копия конкретной игры.
- Характеристики (порядок и id фиксированы): `str` Сила, `end` Выносливость, `int` Интеллект, `dis` Дисциплина, `cha` Харизма, `fin` Финансы, `spi` Дух. Старт 1–20.
- XP за уровень L→L+1 = `round(100 · L^1.5)`. База XP по сложности 1–5: `10/20/35/55/80`. Валюта = `floor(XP · 0.1)`. 10 очков характеристики = +1.
- Игровые сутки заканчиваются в 04:00 (настраивается).
- Уровень и характеристики никогда не уменьшаются.
- Пропуск задания: 50% его XP уходит Тени в этот день, серия сгорает.
- Множитель сложности на характеристику: 0.5–3.0, старт 1.0.
- Задания в день: 3–7.
- Тиры образа: 1 (ур. 1–4), 2 (5–14), 3 (15–29), 4 (30+).
- Устройство без часов: автозачёт только по шагам/весу появится на этапе 2; в MVP все задания отмечаются вручную, но у заданий уже есть поле `auto`.

## Review Focus

1. **Открыл приложение в 01:30** — это ещё вчерашний игровой день: не выдаются новые задания, вчерашние не считаются пропущенными. → тест в Task 2 (`gameDate`).
2. **Не открывал приложение 3+ дня** — пропущенные дни финализируются один раз (штраф, сброс серии, победа Тени), без падения и без двойного штрафа при повторном `replay`. → тест в Task 4.
3. **Работа занимает весь день / нет свободных окон** — задания всё равно выдаются (без окна, «в течение дня»), и ни одно не попадает в рабочее время. → тест в Task 3.
4. **Сон и работа через полночь** (сон 02:00, подъём 10:00, работа 14:00–23:30) — окна считаются правильно. → тест в Task 3.
5. **Импорт битого или чужого JSON** — отклоняется с сообщением, текущие данные не трогаются. → тест в Task 5.

---

## Файловая структура

```
package.json, tsconfig.json, vite.config.ts, index.html
public/icon.svg, public/icons/*.png            иконки PWA (генерируются)
.github/workflows/deploy.yml                   сборка → GitHub Pages
src/main.tsx, src/App.tsx, src/styles.css      вход, нижняя панель вкладок, тема
src/domain/types.ts        все типы (Stat, Profile, Quest, GameEvent, GameState)
src/domain/stats.ts        STATS (id → имя/иконка), initialStats, classFor, tierFor
src/domain/day.ts          gameDate, addDays, minutes helpers
src/domain/xp.ts           xpToNext, levelFromXp, questXp, currencyFor
src/domain/rng.ts          seededRng(date)
src/domain/schedule.ts     freeWindows, placeQuests
src/domain/questBank.ts    QUEST_TEMPLATES
src/domain/generate.ts     generateDailyQuests
src/domain/shadow.ts       shadowXpForDay
src/domain/difficulty.ts   adjustMultipliers
src/domain/replay.ts       replay(events, now) → GameState
src/db.ts                  Dexie, appendEvent, settings
src/useGame.ts             хук: события → GameState
src/backup.ts              exportData, importData
src/ui/Avatar.tsx          SVG‑заглушка аниме‑персонажа по тиру + вариант «Тень»
src/screens/Onboarding.tsx, Home.tsx, MyDay.tsx, QuickInput.tsx, Checkin.tsx, Character.tsx, Settings.tsx
docs/stage-1-iphone.md     инструкция проверки на iPhone
```

Тесты лежат рядом: `src/domain/*.test.ts`, `src/backup.test.ts`.

---

### Task 1: Каркас проекта, PWA, деплой

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/icon.svg`, `public/icons/` (192, 512, maskable 512, apple‑touch 180), `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `.github/workflows/deploy.yml`, `.gitignore` (включая `.superpowers/`, `node_modules`, `dist`)

**Interfaces:**
- Produces: `App` с нижней панелью из 3 вкладок «Главная / Персонаж / Настройки» (пока заглушки), CSS‑переменные темы `--bg #070b16, --panel #0e1630, --text #dbe9ff, --accent #2fb5ff, --shadow #b14dff, --gold #ffd166`, класс `.panel` (светящаяся рамка).

- [ ] **Step 1:** `git init`, `npm create vite@latest . -- --template react-ts`, добавить зависимости `dexie dexie-react-hooks` и dev `vite-plugin-pwa vitest fake-indexeddb @vite-pwa/assets-generator`.
- [ ] **Step 2:** `vite.config.ts`: `base: '/life-rpg/'`, VitePWA `registerType: 'autoUpdate'`, manifest `{name: 'Life RPG', short_name: 'Life RPG', lang: 'ru', display: 'standalone', background_color: '#070b16', theme_color: '#070b16', start_url: '/life-rpg/', scope: '/life-rpg/'}` с иконками; vitest `environment: 'node'`.
- [ ] **Step 3:** `index.html`: `lang="ru"`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, apple‑meta из Global Constraints, `<link rel="apple-touch-icon">`. `styles.css`: `body` фон `--bg`, `padding: env(safe-area-inset-top) … env(safe-area-inset-bottom)`, нижняя панель с отступом снизу на safe‑area.
- [ ] **Step 4:** Нарисовать `public/icon.svg` (неоновый меч/искра на тёмном фоне), сгенерировать PNG через `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`.
- [ ] **Step 5:** `deploy.yml`: на push в `main` → `npm ci && npm test -- --run && npm run build` → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`.
- [ ] **Step 6:** Запустить `npm run build` — Expected: `dist/` содержит `manifest.webmanifest` и `sw.js`, без ошибок TS.
- [ ] **Step 7:** Commit `chore: scaffold Life RPG PWA`.

---

### Task 2: Ядро домена — типы, дни, XP, характеристики, классы

**Files:**
- Create: `src/domain/types.ts`, `src/domain/day.ts`, `src/domain/xp.ts`, `src/domain/stats.ts`, `src/domain/rng.ts`
- Test: `src/domain/day.test.ts`, `src/domain/xp.test.ts`, `src/domain/stats.test.ts`

**Interfaces:**
- Produces (`types.ts`):
```ts
export type Stat = 'str'|'end'|'int'|'dis'|'cha'|'fin'|'spi';
export type HHMM = string;            // '09:30'
export type ISODate = string;         // '2026-11-17' — игровая дата
export interface WorkTemplate { label: string; start: HHMM; end: HHMM }
export interface Profile {
  name: string;
  wake: HHMM; sleep: HHMM;                    // обычные подъём/отбой
  workTemplates: WorkTemplate[];
  goals: { text: string; months: number; stat: Stat }[];
  sportLevel: 0|1|2|3;                         // 0 — не занимаюсь … 3 — регулярно
  stepsUsual: number;
  badHabits: string[]; goodHabits: string[];   // id из списка анкеты
  energy: { morning: number; day: number; evening: number; night: number }; // 1–5
  selfRating: Record<Stat, number>;            // 1–10
}
export interface Quest {
  id: string; date: ISODate; title: string; stat: Stat;
  difficulty: 1|2|3|4|5; minutes: number;
  window: { start: HHMM; end: HHMM } | null;   // null — «в течение дня»
  xp: number;
  auto: { metric: 'steps'|'sleepHours'|'weightKg'; op: '>='|'<='; value: number } | null;
  templateId: string;
}
export type Metric = 'steps'|'sleepHours'|'weightKg'|'screenMin'|'spend'|'mood'|'water'|'readPages'|'workoutMin';
export type GameEvent = { id: string; ts: number; deviceId: string } & (
  | { type: 'onboarding_completed'; profile: Profile }
  | { type: 'day_started'; date: ISODate; work: { start: HHMM; end: HHMM } | null; wakeAt: HHMM }
  | { type: 'busy_until'; date: ISODate; until: HHMM }
  | { type: 'quests_issued'; date: ISODate; quests: Quest[] }
  | { type: 'quest_completed'; date: ISODate; questId: string }
  | { type: 'metric_logged'; date: ISODate; metric: Metric; value: number; mode: 'set'|'add' }
  | { type: 'checkin'; date: ISODate; went: string; notWent: string; energy: number }
  | { type: 'avatar_updated'; params: AvatarParams }
);
export interface AvatarParams { hair: string; hairColor: string; outfitColor: string; eyes: string }
export interface DayResult { date: ISODate; xp: number; shadowXp: number; completed: number; issued: number; won: boolean }
export interface GameState {
  profile: Profile | null; avatar: AvatarParams;
  totalXp: number; level: number; xpInto: number; xpNeed: number;
  stats: Record<Stat, number>; statPoints: Record<Stat, number>;
  currency: number; streak: number; shadowWinStreak: number;
  className: string; tier: 1|2|3|4;
  multipliers: Record<Stat, number>;
  today: { date: ISODate; started: boolean; work: {start:HHMM;end:HHMM}|null; wakeAt: HHMM|null;
           quests: (Quest & { done: boolean })[]; xp: number; shadowXp: number;
           metrics: Partial<Record<Metric, number>>; checkedIn: boolean; lastEnergy: number|null;
           busyUntil: HHMM|null };
  history: DayResult[];   // финализированные дни, по возрастанию
  genInputs: { bestSteps7: number|null; lastSleepHours: number|null; recentTemplateIds: string[] };
    // для generateDailyQuests: лучший 7‑дневный средний по шагам (из metric_logged steps), сон за последний день с данными, templateId заданий за 2 прошлых дня
}
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
```
- Produces: `gameDate(ts: number, cutoffHour = 4): ISODate` (локальное время), `addDays(d: ISODate, n: number): ISODate`, `toMin(h: HHMM): number`, `fromMin(m: number): HHMM` (по модулю 1440); `xpToNext(level: number): number`, `levelFromXp(total: number): { level: number; into: number; need: number }`, `questXp(difficulty: 1|2|3|4|5, mult: number): number` = `round(BASE[d-1]·mult)`, `currencyFor(xp: number): number`; `STATS: Record<Stat, {name: string; icon: string}>`, `initialStats(p: Profile): Record<Stat, number>`, `classFor(stats: Record<Stat, number>): string`, `tierFor(level: number): 1|2|3|4`; `seededRng(seed: string): () => number` (mulberry32 от хэша строки).

- [ ] **Step 1: Тесты**
```ts
test('до 04:00 — ещё вчера', () => {
  expect(gameDate(new Date(2026,10,18,1,30).getTime())).toBe('2026-11-17');
  expect(gameDate(new Date(2026,10,18,4,0).getTime())).toBe('2026-11-18');
});
test('xp', () => {
  expect(xpToNext(1)).toBe(100); expect(xpToNext(4)).toBe(800);
  expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 100 });
  expect(levelFromXp(383)).toEqual({ level: 3, into: 0, need: 520 }); // 100+283
  expect(questXp(3, 1.1)).toBe(39); expect(currencyFor(39)).toBe(3);
});
test('initialStats: rating*2 + бонусы, в пределах 1–20', ...) // sportLevel 3 → str,end +2; всё clamp 1..20
test('classFor берёт две старшие характеристики', () => {
  expect(classFor({str:15,end:14,int:3,dis:3,cha:3,fin:3,spi:3})).toBe('Воин');
});
test('tierFor', () => { expect([1,4,5,14,15,29,30].map(tierFor)).toEqual([1,1,2,2,3,3,4]); });
```
- [ ] **Step 2:** `npx vitest run src/domain` — Expected: FAIL (нет модулей).
- [ ] **Step 3:** Реализовать. `initialStats`: `rating*2`, затем `str,end += sportLevel>=2 ? 2 : 0`, clamp 1–20. `classFor`: таблица пар (неупорядоченных) из двух старших, минимум: str+end Воин, int+dis Стратег, cha+spi Лидер, fin+dis Торговец, int+spi Мудрец, str+dis Страж, end+spi Странник, cha+fin Дипломат, int+cha Бард; иначе по старшей: «Искатель (<имя>)». При равенстве — порядок `STATS`.
- [ ] **Step 4:** `npx vitest run src/domain` — Expected: PASS.
- [ ] **Step 5:** Commit `feat(domain): types, days, xp, stats`.

---

### Task 3: Расписание и генерация заданий по правилам

**Files:**
- Create: `src/domain/schedule.ts`, `src/domain/questBank.ts`, `src/domain/generate.ts`
- Test: `src/domain/schedule.test.ts`, `src/domain/generate.test.ts`

**Interfaces:**
- Consumes: типы и хелперы Task 2.
- Produces:
```ts
type Win = { start: HHMM; end: HHMM };
freeWindows(wakeAt: HHMM, sleepAt: HHMM, busy: Win[]): Win[]  // окна ≥ 10 мин, по порядку от подъёма; работа с переходом через полночь допустима
placeQuests(quests: Omit<Quest,'window'>[], windows: Win[], energy: Profile['energy'], wakeAt: HHMM): Quest[]
interface QuestTemplate { id: string; stat: Stat; difficulty: 1|2|3|4|5; base: number; unit: string;
  title: (n: number) => string; minutes: (n: number) => number; allDay?: boolean; badHabit?: string;
  auto?: (n: number) => Quest['auto']; physical?: boolean }
QUEST_TEMPLATES: QuestTemplate[]   // ≥ 6 на каждую характеристику, ≥ 1 на каждую вредную привычку анкеты
interface GenCtx { date: ISODate; profile: Profile; stats: Record<Stat, number>; multipliers: Record<Stat, number>;
  wakeAt: HHMM; work: Win | null; busy: Win[]; yesterday: DayResult | null; lastEnergy: number | null;
  lastSleepHours: number | null; bestSteps7: number | null; recentTemplateIds: string[] }
generateDailyQuests(ctx: GenCtx): Quest[]
```

- [ ] **Step 1: Тесты**
```ts
test('сон и работа через полночь', () => {
  expect(freeWindows('10:00','02:00',[{start:'14:00',end:'23:30'}]))
    .toEqual([{start:'10:00',end:'14:00'},{start:'23:30',end:'02:00'}]);
});
test('весь день занят → окон нет, но задания выдаются без окна', () => {
  const q = generateDailyQuests(ctx({ work: {start:'10:00', end:'02:00'} }));
  expect(q.length).toBeGreaterThanOrEqual(3);
  expect(q.every(x => x.window === null || x.minutes <= 0)).toBe(true);
});
test('ни одно задание не пересекается с работой', ...) // 20 разных дат, work 11:00–20:00
test('количество 3–7: первый день 4; вчера 100% и энергия 8 → больше; энергия 3 → меньше и нет сложности ≥4', ...)
test('есть задание на самую слабую характеристику и на шаги с auto steps', ...)
test('детерминизм: тот же ctx → те же задания', ...)
test('сон < 6 ч → у physical‑заданий сложность ≤ 2', ...)
```
- [ ] **Step 2:** `npx vitest run src/domain/schedule src/domain/generate` — Expected: FAIL.
- [ ] **Step 3:** Реализовать. Количество: первый день 4; иначе `clamp(3 + round(yesterdayRate·2) + (energy≥7?1:0) − (energy≤4?1:0), 3, 7)`. Состав: (1) шаги, `n = bestSteps7 ? ceil(bestSteps7·1.05/500)·500 : max(3000, profile.stepsUsual)`, `allDay`, `auto steps >= n`; (2) самая слабая характеристика; (3) если есть вредная привычка — её шаблон (`allDay`); (4) остальное — взвешенная выборка `seededRng(date)`: вес = 2 для характеристик целей + 1/(stat) для слабых, без повторов `recentTemplateIds` за 2 дня. Количество в шаблоне `n = round(base·mult)`; XP через `questXp`. `placeQuests`: самые длинные задания — в окна с наибольшей энергией (утро до 12, день 12–17, вечер 17–22, ночь 22+ от подъёма); не влезает — `window: null`.
- [ ] **Step 4:** Тесты — Expected: PASS.
- [ ] **Step 5:** Commit `feat(domain): schedule and rule-based quests`.

---

### Task 4: Тень, адаптивная сложность, replay

**Files:**
- Create: `src/domain/shadow.ts`, `src/domain/difficulty.ts`, `src/domain/replay.ts`
- Test: `src/domain/shadow.test.ts`, `src/domain/difficulty.test.ts`, `src/domain/replay.test.ts`

**Interfaces:**
- Consumes: всё из Task 2–3.
- Produces:
```ts
shadowXpForDay(prevDailyXp: number[], winStreak: number): number
  // 75‑й перцентиль (линейная интерполяция, индекс 0.75·(n−1)) последних 14 значений × (1 + 0.02·winStreak), округлить; пусто → 40
adjustMultipliers(m: Record<Stat,number>, last7: {stat: Stat; done: boolean}[], ): Record<Stat,number>
  // доля ≥ 0.85 → ×1.10; < 0.5 → ×0.85; нет заданий — без изменений; clamp 0.5–3.0
replay(events: GameEvent[], now: number, cutoffHour?: number): GameState
DEFAULT_AVATAR: AvatarParams
```
`replay`: сортировка по `(ts, id)`; дубли `id` игнорируются; повторный `quests_issued` на ту же дату игнорируется (побеждает первый); `quest_completed` к неизвестному/уже выполненному заданию игнорируется. Для каждой даты < сегодня, где были `quests_issued`, — финализация ровно один раз: XP дня = сумма выполненных; Тень дня = `shadowXpForDay` + 50% XP невыполненных; `won = xp > shadowXp`; при победе бонус `max(10, round(0.15·xp))` к totalXp; серия = подряд дни с ≥1 выполненным (дни без `quests_issued` её рвут); `adjustMultipliers` по заданиям последних 7 финализированных дней. Очки характеристики за выполненное задание = `difficulty`; `stats[s] = initial[s] + floor(points/10)`.

- [ ] **Step 1: Тесты**
```ts
test('shadow', () => { expect(shadowXpForDay([],0)).toBe(40); expect(shadowXpForDay([10,20,30,40],5)).toBe(36); });
test('multipliers', ...) // 7/7 str → 1.1; 1/4 int → 0.85; 3.0 не превышается
test('3 дня без открытия: финализируются один раз, серия 0, Тень побеждает', () => {
  const s1 = replay(evs, now); const s2 = replay([...evs].reverse(), now);
  expect(s1).toEqual(s2); expect(s1.streak).toBe(0); expect(s1.history.at(-1)!.won).toBe(false);
});
test('уровень и характеристики не падают после пропусков', ...)
test('повторный quests_issued на ту же дату игнорируется', ...)
test('дубль события по id не удваивает XP', ...)
test('победа над Тенью даёт бонус и растит shadowWinStreak', ...)
```
- [ ] **Step 2:** Run — Expected: FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Run `npx vitest run` — Expected: всё PASS.
- [ ] **Step 5:** Commit `feat(domain): shadow, difficulty, replay`.

---

### Task 5: Хранилище, хук игры, экспорт/импорт

**Files:**
- Create: `src/db.ts`, `src/useGame.ts`, `src/backup.ts`
- Test: `src/backup.test.ts` (с `import 'fake-indexeddb/auto'`)

**Interfaces:**
- Consumes: `GameEvent`, `replay`.
- Produces:
```ts
db: Dexie & { events: Table<GameEvent & { pending: 1|0; seq?: number }, string>; settings: Table<{key: string; value: unknown}, string> }
appendEvent(e: DistributiveOmit<GameEvent,'id'|'ts'|'deviceId'>): Promise<void>  // id = crypto.randomUUID(), pending=1
getSetting<T>(key: string, fallback: T): Promise<T>; setSetting(key: string, value: unknown): Promise<void>
useGame(): GameState | undefined   // useLiveQuery(events) → replay(events, Date.now(), cutoffHour); перерасчёт при visibilitychange
exportData(): Promise<Blob>        // {app:'life-rpg', schema:1, exportedAt, events, settings без ключей ИИ}
importData(file: Blob): Promise<{ ok: true; events: number } | { ok: false; error: string }>
```
`deviceId` — генерируется один раз, хранится в settings. При старте: `navigator.storage?.persist?.()`.

- [ ] **Step 1: Тесты**
```ts
test('экспорт → импорт восстанавливает те же события', ...)
test('битый JSON → ok:false, существующие события не тронуты', async () => {
  await appendEvent(...); const r = await importData(new Blob(['{oops']));
  expect(r.ok).toBe(false); expect(await db.events.count()).toBe(1);
});
test('чужой JSON (нет app или schema > 1) → ok:false', ...)
```
- [ ] **Step 2:** Run — FAIL. **Step 3:** Реализовать; импорт — проверка `app==='life-rpg'`, `schema===1`, каждое событие имеет `id/ts/type`; замена в одной транзакции `clear()+bulkPut`. **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat: event store, game hook, backup`.

---

### Task 6: Онбординг‑анкета

**Files:**
- Create: `src/screens/Onboarding.tsx`
- Modify: `src/App.tsx` (если `state.profile === null` — показывать онбординг вместо вкладок)

**Interfaces:**
- Consumes: `appendEvent`, `initialStats`, `STATS`, `Profile`.
- Produces: событие `onboarding_completed`.

Шаги (по одному экрану, кнопки «Назад/Далее», прогресс‑полоска): 1) имя; 2) сон: обычный подъём и отбой; 3) работа: шаблоны рабочих часов (1–3, «Добавить»); 4) цели на 3–12 месяцев (до 3, у каждой — срок и характеристика); 5) здоровье и спорт (уровень 0–3, обычные шаги/день); 6) финансы (самооценка + есть ли цель накоплений — в `goals`); 7) навыки и отношения (самооценка Интеллект/Харизма); 8) привычки: полезные и вредные — чипы (`games` «Игры», `social` «Соцсети», `late` «Поздний отбой», `junk` «Фастфуд», `smoke` «Курение», `procr` «Прокрастинация» + свои); 9) энергия по времени суток 1–5; 10) самооценка всех 7 характеристик 1–10; 11) итог: карточка персонажа с рассчитанными характеристиками и классом → «Начать». Шаг «Команды» добавит этап 2.

- [ ] **Step 1:** Реализовать экраны; валидация: подъём/отбой обязательны, ≥1 шаблон работы или галочка «не работаю».
- [ ] **Step 2:** `npm run dev`, пройти анкету в браузере при ширине 390px — Expected: после «Начать» открывается Главная, перезагрузка не возвращает анкету.
- [ ] **Step 3:** Commit `feat: onboarding questionnaire`.

---

### Task 7: Главная — аватар и Тень, «Мой день», задания, быстрый ввод, чек‑ин

**Files:**
- Create: `src/ui/Avatar.tsx`, `src/screens/Home.tsx`, `src/screens/MyDay.tsx`, `src/screens/QuickInput.tsx`, `src/screens/Checkin.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useGame`, `appendEvent`, `generateDailyQuests`, `GameState.today`.
- Produces: `<Avatar params tier shadow? size />` — SVG аниме‑персонаж в полный рост (волосы/глаза/одежда из `params`, детали одежды и аура растут с `tier`); `shadow` = тот же SVG с `filter: brightness(.35) saturate(0) drop-shadow(0 0 8px var(--shadow))` и фиолетовой обводкой.

Поведение:
- Если `!today.started` — поверх Главной модальное «Мой день»: кнопки шаблонов работы + «Выходной» + «Другое время» (два time‑input). По нажатию: `day_started{wakeAt: текущее HH:MM}`, затем сразу `generateDailyQuests(...)` → `quests_issued` (только если в состоянии ещё нет заданий на дату).
- Главная сверху вниз: уровень, класс, полоска XP, валюта; аватар и Тень рядом; табло «Ты N XP · Тень M XP» (у лидера — подсветка); серия 🔥; список заданий (время/«в течение дня», характеристика‑иконка, сложность ★, +XP; тап → `quest_completed`, с короткой анимацией «+XP»); кнопки «Быстрый ввод», «Занят до…» (`busy_until` → перерасчёт окон только для невыполненных при отображении), «Чек‑ин» (активна после 18:00 или если все задания выполнены).
- Быстрый ввод: крупные кнопки — вода +1 стакан (`add`), экранное время (мин, `set`), траты (₽, `add`), настроение 1–5 (`set`), чтение +стр (`add`), тренировка +мин (`add`), сон (ч, `set`), вес (кг, `set`).
- Чек‑ин: «Что получилось», «Что нет», энергия 1–10 → `checkin`.

- [ ] **Step 1:** Реализовать `Avatar` и проверить 4 тира + Тень на тестовой странице в dev.
- [ ] **Step 2:** Реализовать экраны.
- [ ] **Step 3:** Проверка в браузере 390×844: начать день, отметить 2 задания → XP и полоска растут, табло «Ты против Тени» меняется; быстрый ввод воды 3 раза → 3; чек‑ин сохраняется; перезагрузка — всё на месте. Перевести системные часы/или подставить `now` +1 день через `?now=` (только в dev) — вчерашний день финализирован, новый «Мой день».
- [ ] **Step 4:** Commit `feat: home, my day, quests, quick input, checkin`.

---

### Task 8: Персонаж и Настройки

**Files:**
- Create: `src/screens/Character.tsx`, `src/screens/Settings.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useGame`, `appendEvent`, `exportData`, `importData`, `setSetting/getSetting`, `STATS`.

- Персонаж: большой аватар, класс, тир, 7 характеристик (значение, полоска очков до следующего +1, множитель сложности ×1.1 и т. п.), история последних 7 дней (победа/поражение над Тенью). Редактор образа: прическа (3–4 варианта), цвет волос, глаза, цвет одежды → `avatar_updated`.
- Настройки: «Экспорт» (скачивание `life-rpg-YYYY-MM-DD.json`; на iOS через `navigator.share` с файлом, если доступно, иначе ссылка‑скачивание), «Импорт» (выбор файла → подтверждение «Заменить все данные?» → результат), час конца игровых суток (0–6, по умолчанию 4), версия приложения. Заглушки разделов «Синхронизация», «ИИ», «Уведомления» с подписью «Этап 2/4/5».

- [ ] **Step 1:** Реализовать.
- [ ] **Step 2:** Проверка: экспорт → очистить сайт → импорт → состояние совпадает; импорт битого файла показывает ошибку и не трогает данные.
- [ ] **Step 3:** Commit `feat: character and settings screens`.

---

### Task 9: Проверка, деплой, инструкция для iPhone

**Files:**
- Create: `docs/stage-1-iphone.md`, `README.md` (коротко: что это, как запустить локально)

- [ ] **Step 1:** `npx vitest run` и `npm run build` — Expected: PASS, сборка без ошибок.
- [ ] **Step 2:** `npm run preview`, в браузере 390×844: полный путь анкета → день → задания → чек‑ин; Lighthouse/DevTools «Application»: manifest без ошибок, SW активен, офлайн‑перезагрузка открывает приложение.
- [ ] **Step 3:** С разрешения пользователя: создать репозиторий `life-rpg` на GitHub, запушить `main`, включить Pages (Source: GitHub Actions), дождаться зелёного workflow, открыть `https://<user>.github.io/life-rpg/`.
- [ ] **Step 4:** `docs/stage-1-iphone.md` — для человека, который никогда не программировал, каждое действие отдельной строкой: открыть ссылку в Safari → «Поделиться» → «На экран Домой» → «Добавить» → открыть с иконки → пройти анкету → что проверить (список из Step 2) → как сделать экспорт. Отдельно: «если что‑то не так — что прислать» (скриншот, что нажимал).
- [ ] **Step 5:** Commit `docs: stage 1 iPhone guide`, push.
