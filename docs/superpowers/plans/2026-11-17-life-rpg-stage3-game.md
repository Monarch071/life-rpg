# Life RPG — этап 3: геймификация и аналитика. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** магазин наград, дерево навыков, недельные и босс‑задания, достижения и титулы, Тень на метриках и экран аналитики с графиками.

**Architecture:** всё новое — события в существующем журнале и чистые функции в `src/domain/`. Состояние вычисляет `replay` (новые поля `GameState`), синхронизация работает без изменений, потому что события общие. В UI появляются новые экраны и нижняя панель на 6 вкладок. Графики — свой маленький SVG‑компонент, без библиотек.

**Tech Stack:** существующие React 18 + Vite + TS + Dexie + vitest. Новых зависимостей нет.

**Spec:** `docs/superpowers/specs/2026-11-17-life-rpg-design.md` (разделы 9, 10, 14 п.3)

## Global Constraints

- Весь текст интерфейса — на русском; кнопки ≥ 44 px; сообщения с `role="status"`/`role="alert"` (как в существующих экранах).
- Новых npm‑зависимостей нет (ни runtime, ни dev).
- TypeScript strict; `npx vitest run` и `npm run build` зелёные после каждой задачи.
- `replay` — чистая и детерминированная функция: никакого `Date.now()`/случайности внутри, результат не зависит от порядка входного массива. Он никогда не бросает исключение на любом событии из сети: невалидные события игнорируются.
- Уровень и характеристики никогда не падают (анти‑цель спеки). Штрафы — только мягкие.
- Новые события добавляются в union `GameEvent` в `src/domain/types.ts`. Неизвестные типы `replay` игнорирует (уже так).
- Существующие поля `GameState` не переименовываются.

## Review Focus

1. Покупка или открытие навыка при нехватке монет или очков (двойное нажатие, два устройства одновременно) → `replay` отбрасывает лишнее событие, баланс не уходит в минус (Task 1).
2. Недельные задания выданы на двух устройствах офлайн → побеждает меньший `ts`, прогресс не задваивается (Task 2).
3. Неделя пересекает смену месяца или года, игровой день до 04:00 → `weekStart` считается от игровой даты (Task 2).
4. История за 90+ дней → аналитика и `replay` не тормозят: всё за один проход, без O(n²) по дням × событиям (Task 3, проверка временем в тесте).
5. Метрика с ≤ 2 значениями → у Тени нет цели по ней, графика нет, `NaN` не выводится (Task 3, Task 5).

---

### Task 1: Магазин и дерево навыков (домен)

**Files:**
- Create: `src/domain/skills.ts`, `src/domain/skills.test.ts`
- Modify: `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/replay.test.ts`

**Interfaces:**
- События:
  ```ts
  | { type: 'reward_created'; rewardId: string; title: string; price: number }
  | { type: 'reward_deleted'; rewardId: string }
  | { type: 'reward_purchased'; rewardId: string }
  | { type: 'skill_unlocked'; skillId: string }
  ```
- `src/domain/skills.ts`:
  ```ts
  export interface SkillNode { id: string; stat: Stat; title: string; desc: string; cost: number; requires: string | null }
  export const SKILLS: SkillNode[]
  export interface SkillEffects { xpBonus: Record<Stat, number>; coinBonus: number; streakFreeze: boolean; calmShadow: boolean }
  export function skillEffects(unlocked: string[]): SkillEffects
  ```
  Узлы (17 шт.). Для каждой из 7 характеристик:
  - `<stat>1`: cost 1, requires null, «+10% XP за задания: <Название>»;
  - `<stat>2`: cost 2, requires `<stat>1`, «ещё +15% XP за задания: <Название>» (итого +25%).

  Плюс три особых узла:
  - `freeze`: stat dis, cost 3, requires `dis1`, «Заморозка серии» — раз в календарную неделю (пн–вс по игровым датам) день без выполненных заданий не обнуляет серию;
  - `coins`: stat fin, cost 3, requires `fin1`, «Монеты +25%»;
  - `calm`: stat spi, cost 3, requires `spi1`, «Спокойствие» — штраф Тени за невыполненные задания 25% вместо 50%.
- `GameState` получает:
  ```ts
  skills: { unlocked: string[]; points: number }   // points = доступно сейчас
  rewards: { id: string; title: string; price: number }[]   // не удалённые, в порядке создания
  purchases: { rewardId: string; title: string; price: number; ts: number }[]
  ```

Правила `replay` (решения плана):
- **Очки навыков:** `level − 1 − потрачено`. Чтобы не было круговой зависимости (навыки повышают XP, XP повышает уровень), валидность `skill_unlocked` проверяется по **базовому уровню** — уровню от XP без бонусов навыков и монет. События идут по `(ts, id)`. Событие принимается, если узел существует, ещё не открыт, `requires` открыт и `cost ≤ baseLevel − 1 − уже потрачено`. Иначе оно игнорируется. Итоговые `points` считаются от фактического уровня (с бонусами), не меньше 0.
- **Действие навыка:** бонус XP применяется к заданию, если игровая дата открытия навыка (`gameDate(ts, cutoffHour)`) ≤ `q.date`. XP задания = `round(q.xp × (1 + xpBonus[q.stat]))`. Бонус участвует в `today.xp`, в истории и в расчёте Тени.
- **Монеты:** за задание `currencyFor(xpЗадания) × (1 + coinBonus)` с округлением вниз (`coins` действует с даты открытия так же). Бонус победы над Тенью — как раньше.
- **`freeze` и `calm`:** действуют с даты открытия. Заморозка не делает день победным, только сохраняет `streak`.
- **Награды:** `reward_created` принимается, если `title` — непустая строка ≤ 60 символов, а `price` — целое 1–100000, и id ещё не встречался. `reward_deleted` скрывает награду из `rewards`, но прошлые покупки остаются.
- **Покупки:** `reward_purchased` принимается, если награда существует и не удалена на момент события и если `заработано_до_конца − уже_потрачено ≥ price`. Заработано считается за всё время, это упрощение: UI всё равно не даёт купить без денег. `currency = заработано − потрачено`. В покупку записывается снимок `title` и `price` на момент события.

- [ ] **Step 1: Write the failing tests:**
  - `skills.test.ts`: в `SKILLS` 17 узлов, id уникальны, каждый `requires` ссылается на существующий узел; `skillEffects(['str1','str2','coins'])` → `xpBonus.str === 0.25`, `coinBonus === 0.25`, `streakFreeze === false`.
  - `replay.test.ts`:
    - открытие `str1` при уровне 1 игнорируется (`points === 0`, `unlocked` пуст);
    - при достаточном уровне `str1` принимается, а `str2` без `str1` — нет;
    - задание силы на 20 XP после `str1` даёт 22 XP, задание до даты открытия — 20;
    - два одинаковых `skill_unlocked` → открыт один раз, очки списаны один раз;
    - `freeze`: день без выполненных заданий после открытия не обнуляет серию, второй такой день в ту же неделю — обнуляет;
    - `calm`: Тень за день с пропуском задания на 40 XP получает +10, а не +20;
    - награда 100 монет: покупка при 120 монетах → `currency === 20`; вторая покупка → игнорируется, `currency` всё ещё 20 (Review Focus 1);
    - удалённая награда не покупается, но прошлая покупка остаётся в `purchases`;
    - `reward_created` с `price: -5` или пустым `title` игнорируется.
- [ ] **Step 2:** `npx vitest run src/domain` → новые тесты FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` → OK.
- [ ] **Step 5:** коммит `feat(game): reward shop and skill tree in replay`.

---

### Task 2: Недельные и босс‑задания (домен)

**Files:**
- Create: `src/domain/weekly.ts`, `src/domain/weekly.test.ts`
- Modify: `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/day.ts` (добавить `weekStart`), `src/domain/replay.test.ts`, `src/screens/MyDay.tsx`

**Interfaces:**
- `src/domain/day.ts`: `export function weekStart(date: ISODate): ISODate` — понедельник недели этой игровой даты (UTC‑арифметика по строке, как существующий `addDays`).
- Типы:
  ```ts
  export type WeeklyKind = 'active_days' | 'stat_quests' | 'steps_total' | 'shadow_wins'
  export interface WeeklyQuest { id: string; weekStart: ISODate; kind: WeeklyKind; stat: Stat | null; target: number; title: string; xp: number }
  export interface Boss { id: string; title: string; stat: Stat; stages: string[]; done: number; defeated: boolean; abandoned: boolean }
  ```
- События:
  ```ts
  | { type: 'weekly_issued'; weekStart: ISODate; quests: WeeklyQuest[] }
  | { type: 'boss_created'; bossId: string; title: string; stat: Stat; stages: string[] }
  | { type: 'boss_stage_done'; bossId: string; stage: number }
  | { type: 'boss_abandoned'; bossId: string }
  ```
- `src/domain/weekly.ts`:
  ```ts
  export interface WeeklyCtx { weekStart: ISODate; stats: Record<Stat, number>; multipliers: Record<Stat, number>; prevActiveDays: number; prevStatQuests: number; bestSteps7: number | null }
  export function generateWeeklyQuests(ctx: WeeklyCtx): WeeklyQuest[]
  ```
  Ровно 3 задания, id `${weekStart}:w:<kind>`:
  1. `active_days`: «Будь активен N дней из 7», target `clamp(prevActiveDays + 1, 3, 7)`.
  2. `stat_quests` для самой слабой характеристики (ничья — по порядку `STATS`): «Выполни N заданий: <Название>», target `max(3, round(prevStatQuests × 1.1))`.
  3. Если `bestSteps7 !== null`: `steps_total`, «Пройди N шагов за неделю», target = `bestSteps7 × 7 × 1.05`, округлённое вверх до тысячи. Иначе `shadow_wins`: «Победи Тень 3 раза».

  XP: `round(150 × (stat ? multipliers[stat] : 1))`.
- `GameState` получает:
  ```ts
  weekly: { weekStart: ISODate; quests: (WeeklyQuest & { progress: number; done: boolean })[] }
  bosses: Boss[]   // кроме abandoned
  ```
  `weekly` — для недели сегодняшней игровой даты. Если `weekly_issued` для неё нет — `quests: []`.
- `GameState.genWeekly: WeeklyCtx` — готовый контекст для текущей недели. `prev*` берутся из прошлой недели: дни с ≥ 1 выполненным заданием и число выполненных заданий слабейшей характеристики. Без истории — 0.

Правила `replay`:
- `weekly_issued`: побеждает первое по `(ts,id)` для данного `weekStart`.
- Прогресс за даты `weekStart..weekStart+6`:
  - `active_days` — дни с ≥ 1 выполненным ежедневным заданием;
  - `stat_quests` — выполненные ежедневные задания этой характеристики;
  - `steps_total` — сумма `metrics.steps`;
  - `shadow_wins` — финализированные победы + сегодня, если `today.xp > today.shadowXp` (информативно).

  `done` ставится, когда `progress ≥ target`. XP и монеты за выполненное недельное задание начисляются один раз (`statPoints` — нет). Недельное задание прошлой недели засчитывается, если цель достигнута в её пределах. Штрафа за невыполненное нет.
- **Боссы:**
  - `boss_created` принимается, если `title` 1–80 символов, `stat` валиден, `stages` — массив из 2–8 непустых строк ≤ 80 символов, а `bossId` новый.
  - `boss_stage_done` принимается, только если `stage === done` (по порядку) и босс не побеждён и не брошен. Каждый этап даёт 100 XP, +5 очков характеристике и монеты по общей формуле. Последний этап даёт ещё +200 XP бонусом, и `defeated = true`.
  - `boss_abandoned` скрывает босса. Уже полученный XP остаётся.
- **`MyDay.begin`:** если `weekly.quests` пуст для текущей недели, в ту же атомарную запись добавляется `weekly_issued` с `generateWeeklyQuests(fresh.genWeekly)`. `fresh` — это состояние после синка, как уже сделано для ежедневных заданий.

- [ ] **Step 1: Write the failing tests:**
  - `weekStart('2026-11-17')` → `'2026-11-16'`; `weekStart('2026-11-16')` → `'2026-11-16'`; `weekStart('2027-01-01')` → `'2026-12-28'` (Review Focus 3).
  - `generateWeeklyQuests`: 3 задания; без `bestSteps7` третье — `shadow_wins`; с `bestSteps7: 7000` target `steps_total` = 52000; `stat_quests` — для слабейшей характеристики; детерминированность (два вызова равны).
  - `replay`: прогресс `active_days` и `stat_quests` растёт по выполненным заданиям, при цели → `done` и XP +150 ровно один раз. Два `weekly_issued` на одну неделю с разных устройств → в `state.weekly.quests` задания события с меньшим `ts` (Review Focus 2). `steps_total` суммирует шаги недели.
  - Боссы: создание с 1 этапом игнорируется; этап 1 до этапа 0 игнорируется; все этапы по порядку → `defeated`, XP = 100×n + 200; повтор `boss_stage_done` того же этапа не начисляет второй раз; `boss_abandoned` убирает из списка.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npx vitest run` → PASS, `npm run build` → OK.
- [ ] **Step 5:** коммит `feat(game): weekly quests and boss quests`.

---

### Task 3: Достижения, титулы, история и Тень на метриках (домен)

**Files:**
- Create: `src/domain/achievements.ts`, `src/domain/achievements.test.ts`
- Modify: `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/replay.test.ts`

**Interfaces:**
- `src/domain/achievements.ts`:
  ```ts
  export interface AchievementCounters { questsDone: number; streak: number; shadowWinStreak: number; shadowWins: number; level: number;
    maxStepsDay: number; perfectDays: number; checkins: number; purchases: number; skills: number; weeklyDone: number; bossesDefeated: number }
  export interface AchievementDef { id: string; icon: string; title: string; desc: string; titleReward: string | null; test: (c: AchievementCounters) => boolean }
  export const ACHIEVEMENTS: AchievementDef[]
  ```
  Набор, ровно эти id: `first_quest` (1), `quests_10`, `quests_50`, `quests_100`, `quests_500`, `streak_3`, `streak_7` (титул «Упорный»), `streak_30` (титул «Несгибаемый»), `streak_100` (титул «Легенда»), `shadow_win` (титул «Охотник на Тень»), `shadow_streak_3`, `shadow_streak_7` (титул «Повелитель Тени»), `level_5`, `level_10` (титул «Опытный»), `level_15`, `level_30` (титул «Мастер»), `steps_10k`, `perfect_day` (все задания дня при ≥ 3 выданных), `checkin_7`, `first_purchase`, `first_skill`, `weekly_first`, `boss_first` (титул «Победитель боссов»). Названия и описания — на усмотрение исполнителя, на русском.
- `GameState` получает:
  ```ts
  achievements: { id: string; date: ISODate }[]   // в порядке получения
  title: string                                    // titleReward последнего полученного достижения с титулом, иначе 'Новичок'
  statHistory: { date: ISODate; stats: Record<Stat, number> }[]   // на конец каждого финализированного дня
  metricHistory: { date: ISODate; metrics: Partial<Record<Metric, number>> }[]   // все даты ≤ сегодня, где есть метрики, по возрастанию
  today.shadowMetrics: { metric: Metric; you: number | null; target: number; lowerIsBetter: boolean }[]
  ```
- **Награда за достижение:** +25 монет за каждое (в `currency`).
- **Дата достижения** — первая игровая дата, на конец которой (для сегодняшней — на текущий момент) условие выполнено. Счётчики накапливаются в существующем цикле финализации по дням и один раз для сегодня, без повторных проходов по журналу (Review Focus 4). Покупки, навыки, недельные и боссы относятся к игровой дате события (`gameDate(ts, cutoffHour)`).
- **Тень на метриках** (решение плана: обобщить существующий `bestSteps7` в `best7(metrics, today, metric, lower)`). Для `steps`, `sleepHours`, `readPages`, `water` (больше — лучше) и `screenMin` (меньше — лучше) цель = лучший 7‑дневный средний за 28 дней до сегодня × 1.05 (для `screenMin` — минимальный × 0.95), округлить: шаги до целого, остальное до 0.1. Окно учитывается при ≥ 3 значениях. Метрика без такого окна в `shadowMetrics` не попадает (Review Focus 5). `you` — сегодняшнее значение или `null`. `genInputs.bestSteps7` по‑прежнему считается тем же обобщённым кодом.

- [ ] **Step 1: Write the failing tests:**
  - `ACHIEVEMENTS`: id уникальны, ровно 23; `test` для `streak_7` верен на 7 и неверен на 6.
  - `replay`: первое выполненное задание → `first_quest` с сегодняшней датой и `currency` +25. 7 дней подряд с выполненными заданиями → `streak_7` с датой 7‑го дня и `title === 'Упорный'`. Без достижений `title === 'Новичок'`. Достижение не дублируется при дальнейшем выполнении условий.
  - `statHistory` длиной = числу финализированных дней, значения не убывают.
  - `shadowMetrics`: 5 дней шагов 8000 → цель 8400, `you` = сегодняшние шаги. 2 дня данных → шагов в `shadowMetrics` нет. `screenMin` с днями 120 → цель 114, `lowerIsBetter`.
  - Производительность: 120 дней по 5 заданий + метрики → `replay` < 200 мс (`performance.now()`).
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npx vitest run` → PASS, `npm run build` → OK.
- [ ] **Step 5:** коммит `feat(game): achievements, titles, stat/metric history, shadow metric targets`.

---

### Task 4: Экраны — вкладки, задания, магазин, герой

**Files:**
- Create: `src/screens/Quests.tsx`, `src/screens/Shop.tsx`, `src/screens/Skills.tsx`, `src/screens/Achievements.tsx`
- Modify: `src/App.tsx`, `src/screens/Character.tsx`, `src/screens/Home.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: всё из Task 1–3, `appendEvent` из `src/db.ts`.

Поведение:
- **Нижняя панель — 6 вкладок:** `🏠 Главная`, `⚔️ Задания`, `🧍 Герой`, `📈 Анализ`, `🪙 Магазин`, `⚙️` (подпись «Настройки» в `aria-label`, видимой подписи нет). Иконка над короткой подписью, каждая ячейка ≥ 44 px, всё влезает в 375 px без горизонтальной прокрутки. Вкладка «Анализ» до Task 5 показывает заглушку «Скоро».
- **`Quests`:**
  - Раздел «Неделя»: 3 недельных задания с полосой прогресса `progress/target`, «✓ Выполнено» и XP. Если недельных нет — текст «Недельные задания появятся, когда начнёшь день».
  - Раздел «Боссы»: карточки боссов с этапами. Следующий этап — кнопка «Этап выполнен» (+100 XP, на последнем «+300 XP — победа над боссом!»), пройденные — зачёркнуты. Кнопка «Сдаться» — с подтверждением.
  - Форма «Новый босс»: «Цель» (кнопки‑подсказки из `profile.goals[].text` подставляют текст и `stat`), выбор характеристики, «Этапы» (textarea, по одному на строку, 2–8). Валидация с русскими ошибками, как правила Task 2.
- **`Shop`:**
  - Баланс 🪙.
  - Список наград с ценой и кнопкой «Купить», недоступной при нехватке монет (подпись «Не хватает N»). Покупка — с подтверждением «Купить «<название>» за N?». После покупки статус «Куплено! Наслаждайся 🎉».
  - Форма «Новая награда»: название и цена, с валидацией по правилам Task 1. «Удалить» у награды — с подтверждением.
  - «История покупок»: последние 20.
  - Пустое состояние: «Придумай награды за свои монеты — например, «1 час игр — 150».»
- **`Skills`** (внутри вкладки «Герой», под характеристиками):
  - «Очки навыков: N».
  - 7 веток по характеристикам, узлы карточками в трёх состояниях: открыт / доступен (кнопка «Открыть за N») / закрыт (причина: «Нужен узел …» или «Не хватает очков»). Открытие — с подтверждением.
- **`Achievements`** (во вкладке «Герой»): сетка всех 23. Полученные — цветные, с датой `дд.мм`, неполученные — серые с описанием. Текущий титул — под именем героя в `Character` и на `Home` рядом с классом.
- **`Home`:** показывает новое достижение тостом «🏆 <название>» на 4 с, с `role="status"`. Новое = полученное с датой сегодня и id ещё не показанный на этом устройстве; показанные хранить в `settings` под ключом `seenAchievements` — синхронизировать не нужно, ключ локальный, добавить в `isLocal` в `src/backup.ts`.

- [ ] **Step 1:** реализовать.
- [ ] **Step 2:** `npx vitest run` → PASS; `npm run build` → OK.
- [ ] **Step 3: Проверка в браузере** (Playwright MCP, 390×844). Скриншоты — только с явным `filename` в `C:\Users\edikg\AppData\Local\Temp\claude\life-rpg-e2e\`.
  - `npm run dev` → онбординг → начать день → выполнить задание (тост достижения);
  - создать награду и купить её;
  - создать босса и пройти этап;
  - открыть навык (чтобы хватило очков, можно добавить события через `indexedDB` в `evaluate`);
  - убедиться, что вкладки влезают на 375 px.

  После проверки остановить dev‑сервер.
- [ ] **Step 4:** коммит `feat(ui): quests, shop, skills, achievements tabs`.

---

### Task 5: Аналитика и Тень на метриках в UI

**Files:**
- Create: `src/ui/LineChart.tsx`, `src/ui/lineChart.test.ts`, `src/screens/Analytics.tsx`
- Modify: `src/App.tsx` (вкладка «Анализ»), `src/screens/Home.tsx` (полоски метрик)

**Interfaces:**
- `src/ui/LineChart.tsx`:
  ```ts
  export interface Series { label: string; color: string; values: (number | null)[] }
  export function chartPath(values: (number | null)[], w: number, h: number, min: number, max: number): string  // 'M..L..', разрывы на null — новый 'M'; пусто → ''
  export default function LineChart(props: { labels: string[]; series: Series[]; height?: number; unit?: string; title: string }): JSX.Element
  ```
  SVG с `viewBox` и шириной 100%. Подписи оси X: первая, средняя, последняя (`дд.мм`). Ось Y: min и max. Легенда цветными точками. `role="img"` и `aria-label` = `title` + последние значения. Цвета берутся из CSS‑переменных темы (`var(--accent)`, `var(--shadow)` и т. п. — смотри `styles.css`). Если min === max, расширить диапазон на ±1. Если все значения `null`, график не рисуется: компонент возвращает `<p className="muted">Нет данных</p>`.
- `Analytics`:
  - Переключатель периода «7 дн / 30 дн / 90 дн» (по умолчанию 30).
  - Сводка карточками: «Выполнено заданий» (% за период), «Побед над Тенью», «Средний XP в день», «Серия».
  - Графики:
    - «XP: ты и Тень» по `history`;
    - «Характеристики» по `statHistory` — чипы выбора характеристики, по умолчанию самая высокая;
    - по одному графику на метрику из `metricHistory`, у которой ≥ 3 значений за период: шаги, сон, вес, настроение, экранное время, траты, вода, чтение. Единицы измерения — в подписи.
  - Пустое состояние: «Графики появятся после нескольких дней игры».
  - Недельный отчёт ИИ — заглушка «Недельный отчёт ИИ — на этапе 4» (кнопка disabled).
- `Home`: под счётом «Ты N XP · Тень M XP» — компактный блок «Тень по метрикам». Для каждой `today.shadowMetrics` — строка «👣 Шаги 5 820 / 8 400» с полосой прогресса. Для `lowerIsBetter` полоса заполнена, пока `you ≤ target`, и подписана «не больше». При `you === null` выводится «—». Если массив пуст, блок не показывается.

- [ ] **Step 1: Write the failing test** (`lineChart.test.ts`):
  - `chartPath([1, 2, 3], 100, 10, 1, 3)` → `'M0,10L50,5L100,0'`;
  - `chartPath([1, null, 3], 100, 10, 1, 3)` → `'M0,10M100,0'`;
  - `chartPath([], 100, 10, 0, 1)` → `''`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npx vitest run` → PASS, `npm run build` → OK.
- [ ] **Step 5: Проверка в браузере:** с историей из 30+ дней (события через `evaluate` в `indexedDB`) экран аналитики показывает графики, ничего не вылезает за 375 px, `NaN` нигде нет. Скриншоты — в ту же temp‑папку.
- [ ] **Step 6:** коммит `feat(ui): analytics charts and shadow metric bars`.

---

### Task 6: Документация

**Files:**
- Create: `docs/stage-3-game.md`
- Modify: `README.md`

Простой русский для не‑программиста. Что нового и как этим пользоваться: магазин (придумать награды), навыки (откуда очки), недельные задания и боссы, достижения и титулы, аналитика, Тень по метрикам. Чек‑лист проверки на iPhone. Подписи кнопок — точно как в коде, в «ёлочках».

- [ ] **Step 1:** написать. **Step 2:** коммит `docs: stage 3 guide`.
