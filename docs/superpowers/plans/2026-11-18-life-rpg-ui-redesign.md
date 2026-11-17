# Life RPG — редизайн интерфейса. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** перевести весь интерфейс на утверждённый пользователем визуальный стиль из `docs/design/mockup-v3.html` (Life Reset + аниме): почти чёрный фон, огненный оранжевый, фиолетовая Тень, шрифты Unbounded/Manrope, контурные SVG‑иконки вместо эмодзи, анимации.

**Source of truth:** `docs/design/mockup-v3.html` — открой и прочитай CSS целиком: токены `:root`, бейдж уровня `.lvl`/`.bigl`, полоса XP `.xp`, арена `.arena`/`.fig`/`.aura`/`.vs`, счёт `.score`/`.tug`/`.mtr`, задания `.q`/`.ico`/`.chk`/`.float`/`.spark`, кнопка `.btn3d`, панель вкладок `.tabs`, характеристики `.stat`, кристаллы `.gem`/`.hex`, оверлей `.lvlup`/`.rays`/`.huge`/`.conf`. Переносить эти стили в `src/styles.css` (по смыслу, а не копипастой классов‑заглушек), а размеры и цвета — точно.

**Tech:** React 18 + Vite + TS. Новые зависимости: `lucide-react` (иконки, только именованные импорты), `@fontsource/unbounded` и `@fontsource/manrope` (шрифты локально, чтобы работали офлайн; подключать только нужные веса и подмножество `cyrillic` + `latin`). Анимации — только CSS (`transform`/`opacity`), без JS‑библиотек.

## Global Constraints

- Логика игры, события, replay, синк, ИИ не меняются. Меняется только представление: JSX‑разметка, CSS, мелкие презентационные компоненты.
- Все существующие тесты остаются зелёными. `npx vitest run` и `npm run build` после каждой задачи.
- Ни одного эмодзи в роли иконки в интерфейсе (заменить на `lucide-react`). Эмодзи внутри пользовательского текста (названия наград, заметки ИИ) остаются как есть.
- Доступность не ухудшается:
  - контраст текста ≥ 4.5:1 (`--muted` на `--card` — проверить);
  - цели касания ≥ 44 px;
  - иконки без подписи — с `aria-label`, декоративные — `aria-hidden`;
  - фокус виден (`:focus-visible` — оранжевое кольцо);
  - `@media (prefers-reduced-motion: reduce)` отключает все декоративные анимации.
- Цвета только через CSS‑переменные из `:root` (никаких сырых hex в компонентах, кроме `--c` для цвета характеристики через `STAT_COLORS`).
- Safe‑area iPhone: `padding-top: env(safe-area-inset-top)`, нижняя панель с `env(safe-area-inset-bottom)` — сохранить.
- Ширина 375 px без горизонтальной прокрутки на всех экранах.
- Скриншоты и логи браузерных проверок — только в `C:\Users\edikg\AppData\Local\Temp\claude\life-rpg-e2e\`. Если Playwright создаст `C:\Users\edikg\Работа с Insolvo\.playwright-mcp`, удалить его.

---

### Task 1: Основа — токены, шрифты, иконки, базовые элементы, панель вкладок

**Files:** `package.json`, `src/main.tsx` (импорт шрифтов), `src/styles.css`, Create `src/ui/icons.tsx`, `src/ui/LevelBadge.tsx`, `src/ui/XpBar.tsx`, Modify `src/App.tsx` (панель вкладок).

**Produces:**
- `src/ui/icons.tsx`: `export const STAT_ICONS: Record<Stat, LucideIcon>` (str `Dumbbell`, end `Footprints` или `PersonStanding`, int `BookOpen`, dis `Target`, cha `MessageCircle`, fin `Coins`, spi `Flower2`/`Sparkles`) и `export const STAT_COLORS: Record<Stat, string>` (`'var(--str)'` …). Также `export function StatIcon({ stat, size }: { stat: Stat; size?: number })` — плитка `.ico` с цветом `--c`.
- `LevelBadge({ level, big }: { level: number; big?: boolean })` — скошенный оранжевый бейдж («LEVEL» под цифрой).
- `XpBar({ into, need })` — 30 делений, заполнено `round(into/need*30)`, подпись «<into> / <need> XP» (числа `toLocaleString('ru-RU')`), `role="progressbar"` с `aria-valuenow/min/max`.
- `styles.css`: токены из макета в `:root` (`--bg --bg2 --card --card2 --line --text --muted --fire --fire2 --fire-deep --shadow --shadow2 --up --gold` + 7 цветов характеристик). Под них перестраиваются существующие базовые классы: `body`, `.app`, `.content`, `.panel` → карточка `--card` с `--line`, `.btn` → тёмная 3D‑кнопка, `.btn.primary` → оранжевая `.btn3d`, `.btn.ghost`, `.field` и инпуты (тёмные, рамка `--line`, фокус оранжевый), `.chips`, `.sheet`/`.sheet-wrap` (нижний лист со скруглением 24px и полоской‑«ручкой»), `.muted`, `.err`, `.ok`, заголовки (`h1, h2, h3` — Unbounded). Шрифт тела — Manrope. Анимации `in` (появление со «пружиной») и `stagger` для списков (`animation-delay: calc(var(--i) * 40ms)`).
- Панель вкладок: иконки `Home`, `Swords`, `User`, `ChartLine`/`LineChart`, `ShoppingBag`, `Settings` (подпись «Настройки» только в `aria-label`), активная — оранжевая с подсветкой и полоской снизу (как `.tabs .tab.on` в макете).
- [ ] Реализовать, `npx vitest run`, `npm run build`.
- [ ] Коммит `feat(ui): design tokens, fonts, icons, level badge, segmented XP bar, tab bar`.

### Task 2: Главная — шапка, арена, счёт, задания, анимация выполнения

**Files:** `src/screens/Home.tsx`, `src/styles.css`, Create `src/ui/Arena.tsx`.

- Шапка: `LevelBadge`, имя, «<класс> · «<титул>»» (титул фиолетовым), монеты (иконка `Coins` в золотом кружке), под ней `XpBar` и строка «серия N дней» с иконкой `Flame`.
- `Arena({ state, image })`: карточка с тегами «ТЫ»/«ТЕНЬ», два `Avatar` (Тень зеркально), ауры, «VS», idle‑парение (`.fig`/`.aura` из макета). Тень впереди (`today.shadowXp > today.xp`) — Тень крупнее/ярче аура (класс `lead`), ты впереди — твоя.
- Счёт: «Ты N XP» / «Тень M XP» и канат `.tug`. Доля = `xp/(xp+shadowXp)` (если оба 0 — 50%), маркер анимированно двигается при изменении (`transition: left .6s`).
- «Тень по метрикам» — компактные плитки `.mtr` с мини‑полосками (существующая логика `shadowMetrics`, только вид).
- Задания: карточки `.q` со `StatIcon`, названием, «<характеристика> · <окно>», «+XP», квадратной кнопкой‑галочкой 44 px (`aria-label="Выполнить: <название>"`). Выполненные приглушены и зачёркнуты. При нажатии: галочка «пружинит», над карточкой всплывает «+N XP», 5 искр (как `.float`/`.spark`, но один раз, а не бесконечно — `animation-iteration-count: 1`, элемент удаляется через 1.2 с). Существующий «попап +XP» заменить этим.
- Остальные блоки Главной (кнопки «Занят до…», быстрый ввод, чек‑ин, заметка ИИ 🤖 → иконка `Bot`, баннеры) — в новый стиль, логика без изменений.
- [ ] Реализовать, тесты, сборка. Проверка в браузере 390×844 и 375×812 (DOM‑проверки и, если получится, скриншот в temp): нет горизонтальной прокрутки, есть `.arena`, клик по галочке добавляет всплывающий «+XP».
- [ ] Коммит `feat(ui): home — arena, tug score, quest cards with completion burst`.

### Task 3: Герой, навыки, достижения, задания недели, магазин, аналитика, настройки

**Files:** `src/screens/Character.tsx`, `Skills.tsx`, `Achievements.tsx`, `Quests.tsx`, `Shop.tsx`, `Analytics.tsx`, `Settings.tsx`, `SyncPanel.tsx`, `AiPanel.tsx`, `AvatarAi.tsx`, `src/ui/LineChart.tsx` (только цвета), `src/styles.css`.

- Герой: большой `LevelBadge big`, класс, титул‑плашка с иконкой `Crown`, «Очки навыков: N»; характеристики строками `.stat`: `StatIcon`, название, зелёное «▲N» = прирост за последние 7 дней по `statHistory` (если нет данных — пусто), крупное число (Unbounded 900). Аватар и редакторы образа — в карточках нового стиля.
- Навыки: ветки по характеристикам с цветом ветки; узел — карточка: открыт (заливка цветом, иконка `Check`), доступен (рамка цвета + 3D‑кнопка «Открыть за N»), закрыт (иконка `Lock`, приглушён).
- Достижения: сетка кристаллов `.gem/.hex` (полученные — градиент по цвету достижения и мягкое покачивание, неполученные — серые с `Lock`), под кристаллом название и дата; описание — по нажатию/в подписи (сохранить доступный текст). Иконки достижений: сопоставление id → lucide (`Flame` серии, `Ghost`/`Skull` Тень, `Trophy` уровни, `Footprints` шаги, `Star` идеальный день, `Moon` чек‑ины, `ShoppingBag` покупка, `Sparkles` навык, `CalendarCheck` неделя, `Swords` босс, `Medal` задания).
- Задания (неделя, боссы): карточки, прогресс — сегментная полоса как `XpBar` (переиспользовать с подписью), босс — карточка с иконкой `Swords`, этапы — список с галочками.
- Магазин: баланс крупно с золотой монетой, награды — карточки с ценой в золотой «таблетке», 3D‑кнопка «Купить».
- Аналитика: карточки‑сводки, цвета графиков — `--fire` (ты), `--shadow` (Тень), характеристики — их цвета.
- Настройки и панели (синхронизация, ИИ, аватар ИИ): карточки, иконки разделов (`RefreshCw`, `Bot`, `Image`, `Bell`, `Download`/`Upload`).
- [ ] Реализовать, тесты, сборка, проверка 375 px на всех вкладках (нет горизонтальной прокрутки, нет `NaN`).
- [ ] Коммит `feat(ui): hero, skills, achievement gems, quests, shop, analytics, settings restyle`.

### Task 4: Праздники — новый уровень, достижение, победа над Тенью

**Files:** Create `src/ui/Celebration.tsx`, Modify `src/App.tsx` (или `Home.tsx`), `src/styles.css`, `src/backup.ts` (isLocal).

- `Celebration`: полноэкранный оверлей как `.lvlup` в макете (лучи, «падающий» бейдж, конфетти, заголовок, подзаголовок, плашки наград, 3D‑кнопка «Продолжить»), `role="dialog"`, `aria-modal`, фокус на кнопке, закрытие по кнопке и Esc.
- Триггеры, проверяются при изменении `state`:
  1. Уровень вырос: `state.level > seenLevel`. Заголовок «Тень отступает», подзаголовок «Ты стал сильнее вчерашнего себя», награда «+1 очко навыка».
  2. Вчерашний день — победа над Тенью (`history.at(-1)` с `won` и датой вчера), показывается один раз в день: «Победа над Тенью», «+<бонус> XP».

  Хранить `seenLevel` и `seenWinDate` в локальных настройках с префиксом `seen` и добавить префикс в `isLocal`. При первом запуске, когда `seenLevel` ещё нет, просто записать текущий уровень и не показывать оверлей — иначе после синка старой истории всплывёт поздравление.
- Тост достижения (уже есть на Главной) — перевести в стиль: тёмная карточка с кристаллом и вылетом снизу.
- `prefers-reduced-motion`: оверлей показывается без лучей, конфетти и «падения».
- [ ] Реализовать. Тест на чистую функцию выбора праздника `pickCelebration(state, seen): Celebration | null` (уровень вырос → level; первый запуск → null; победа вчера, ещё не показана → win; уже показана → null). `npx vitest run`, `npm run build`.
- [ ] Коммит `feat(ui): level-up and shadow-win celebrations`.

### Task 5: Онбординг, «Мой день», листы, финальная полировка

**Files:** `src/screens/Onboarding.tsx`, `MyDay.tsx`, `Checkin.tsx`, `QuickInput.tsx`, `JoinSync.tsx`, `src/ui/Confirm.tsx`, `src/ui/ErrorBoundary.tsx`, `src/styles.css`, `index.html` (`theme-color` = `--bg`).

- Онбординг: прогресс‑полоса сверху (оранжевая), «Шаг N из 11», крупный заголовок Unbounded, варианты ответов — карточки‑кнопки на всю ширину (выбранный — оранжевая рамка и заливка 12%), внизу 3D‑кнопка «Далее». Анимация смены шага — сдвиг и проявление.
- «Мой день»: шаблоны работы — крупные карточки с иконкой `Briefcase`, «Выходной» — `Palmtree`, «Другое время» — `Clock`.
- Чек‑ин: энергия 1–10 — сегментная шкала с цветом от красного к зелёному. Быстрый ввод — плитки с иконками (`Smartphone`, `Wallet`, `Smile`, `GlassWater`, `BookOpen`).
- Все нижние листы — единый вид (ручка, скругление 24, тень).
- Финальная проверка в браузере (DOM‑проверки):
  - все экраны на 375 и 390;
  - в разметке нет эмодзи‑иконок: заголовки и кнопки проверить скриптом через `evaluate` по регулярке `\p{Extended_Pictographic}` в `button, h1, h2, h3, nav` и перечислить, где остались;
  - контраст `--muted` на `--card` ≥ 4.5 (посчитать).
- [ ] Коммит `feat(ui): onboarding, my day, sheets polish`.
