# Life RPG — этап 4: ИИ и аниме‑аватар по фото. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** опциональный ИИ по ключу пользователя. Он выдаёт задания дня, вечером корректирует сложность, пишет недельный отчёт и генерирует аниме‑аватар по фото для каждого тира. Без ключа приложение работает как прежде.

**Architecture:** слой `src/ai/` вызывает провайдера прямо из браузера. Ключ и выбранные модели хранятся в локальных настройках устройства (`ai*` уже исключены из экспорта и синка). Результаты ИИ, которые должны видеть оба устройства, записываются событиями журнала (`ai_tuning`, `ai_report`, `avatar_image`). Картинки синхронизируются через новый эндпоинт Worker `/blob` (D1). Любая ошибка или таймаут ИИ ведёт к правилам этапов 1–3.

**Tech Stack:** существующий стек. Для Claude — официальный `@anthropic-ai/sdk` (`dangerouslyAllowBrowser: true`, это обязательный способ по правилам проекта для Claude). Gemini и OpenAI — через `fetch`, без SDK.

**Spec:** `docs/superpowers/specs/2026-11-17-life-rpg-design.md` (разделы 4, 11, 14 п.4)

## Global Constraints

- Ключ ИИ никогда не уходит никуда, кроме выбранного провайдера: не в журнал событий, не в экспорт, не в Worker, не в логи и не в URL. Ключи настроек начинаются с `ai`.
- Приложение без ключа работает полностью. Любая ошибка ИИ (сеть, таймаут 25 с, 4xx/5xx, невалидный ответ, отказ) приводит к тихому переходу на правила и короткой пометке в UI («ИИ недоступен — задания по правилам»).
- Ответ ИИ — недоверенные данные. Всё валидируется по нашим границам до записи в журнал. XP заданий считаем мы (`questXp`), не ИИ.
- Фото пользователя уходит только выбранному провайдеру и только после явного подтверждения: «Фото будет отправлено в <провайдер>. Продолжить?». Исходное фото нигде не сохраняется.
- Модели не зашиваются намертво. Провайдер, ключ, текстовая модель и модель картинок выбираются в настройках. Список моделей загружается у провайдера по ключу.
- Весь текст интерфейса и все промпты для ИИ — на русском, ответы ИИ тоже на русском. Кнопки ≥ 44 px, сообщения с `role="status"`/`role="alert"`.
- Новые зависимости: только `@anthropic-ai/sdk`.
- TypeScript strict; `npx vitest run` и `npm run build` зелёные после каждой задачи. В тестах ни одного реального сетевого вызова: `fetch` подменяется.

## Review Focus

1. ИИ вернул задания с чужой характеристикой, сложностью 9, длительностью 600 мин или пустым названием → такие задания отбрасываются или ограничиваются. Если валидных меньше 3 — правила (Task 2).
2. Ответ ИИ обёрнут в ```json или содержит текст до и после JSON → JSON всё равно извлекается (Task 1).
3. Провайдер ответил 429 или 401 → понятное сообщение в настройках, задания дня по правилам, приложение не зависает (Task 1, Task 2).
4. Картинка от провайдера весит 3 МБ → перед сохранением и синхронизацией её надо ужать до ≤ 600 КБ WebP/JPEG 768 px (Task 4).
5. Сгенерированный аватар есть на iPhone, а ПК подключили позже → ПК скачивает картинку через `/blob` и показывает её. Если картинки нет, остаётся SVG‑аватар без ошибок (Task 3, Task 4).

---

### Task 1: Клиент ИИ и настройки

**Files:**
- Create: `src/ai/providers.ts`, `src/ai/providers.test.ts`, `src/ai/config.ts`, `src/screens/AiPanel.tsx`
- Modify: `src/screens/Settings.tsx` (заменить заглушку «ИИ — этап 4» на `<AiPanel />`), `package.json`

**Interfaces:**
```ts
// src/ai/config.ts
export type AiProvider = 'gemini' | 'claude' | 'openai'
export interface AiConfig { provider: AiProvider; key: string; textModel: string; imageModel: string | null }
export async function getAiConfig(): Promise<AiConfig | null>   // settings: aiProvider, aiKey, aiTextModel, aiImageModel; null, если нет ключа или текстовой модели
export async function saveAiConfig(c: AiConfig): Promise<void>
export async function clearAiConfig(): Promise<void>
export const PROVIDER_NAMES: Record<AiProvider, string>   // 'Google Gemini', 'Claude (Anthropic)', 'OpenAI'

// src/ai/providers.ts
export class AiError extends Error { constructor(message: string, readonly kind: 'auth'|'rate'|'network'|'bad_response'|'refusal'|'other') }
export async function listModels(provider: AiProvider, key: string): Promise<{ text: string[]; image: string[] }>
export async function generateJson(cfg: AiConfig, system: string, user: string, schema: object): Promise<unknown>  // распарсенный JSON или AiError
export async function generateImage(cfg: AiConfig, photo: Blob, prompt: string): Promise<Blob>                   // AiError, если imageModel null или провайдер не умеет
export function extractJson(text: string): unknown   // первый сбалансированный {...} или [...] (с учётом строк и экранирования); снимает ```json-ограждения; при неудаче бросает AiError('bad_response')
```

Решения по провайдерам:
- **Gemini** (`https://generativelanguage.googleapis.com/v1beta`, заголовок `x-goog-api-key`):
  - Модели — `GET /models?pageSize=200`. Текстовые — те, у кого в `supportedGenerationMethods` есть `generateContent` и в имени нет `image`/`embedding`/`tts`/`audio`. Картинки — те, у кого в имени `image`. Префикс `models/` срезать.
  - Текст — `POST /models/{m}:generateContent` с `{systemInstruction:{parts:[{text}]}, contents:[{role:'user',parts:[{text}]}]}`. JSON просим в промпте (схему вставляем в текст) и разбираем через `extractJson`. Без `generationConfig` формата: поле в API менялось, а неизвестное поле даёт 400.
  - Картинка — тот же метод с `parts:[{text: prompt},{inline_data:{mime_type, data}}]` и `generationConfig:{responseModalities:['TEXT','IMAGE']}`. Результат — первая часть с `inlineData`/`inline_data` в `candidates[0].content.parts`, где `thought !== true`.
- **Claude** (`@anthropic-ai/sdk`, `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`):
  - Модели — `client.models.list()`, все в `text`, а `image: []` (Claude картинки не рисует).
  - JSON — `client.messages.create({ model, max_tokens: 16000, system, messages:[{role:'user',content:user}], output_config:{ effort:'low', format:{ type:'json_schema', schema } } })`.
  - `stop_reason === 'refusal'` → `AiError('refusal')`.
  - Ошибки SDK → `AiError` по классу: `AuthenticationError` → auth, `RateLimitError` → rate, `APIConnectionError` → network.
  - Модель по умолчанию в выпадающем списке — `claude-opus-5-5`, если она есть в списке.
- **OpenAI** (`https://api.openai.com/v1`, `Authorization: Bearer`):
  - Модели — `GET /models`. Картинки — id, начинающиеся с `gpt-image`. Текст — id, начинающиеся с `gpt-` или `o`, без `image`/`audio`/`realtime`/`tts`/`transcribe`/`embedding`.
  - JSON — `POST /chat/completions` с `response_format:{type:'json_schema', json_schema:{name:'result', schema, strict:false}}`, текст — `choices[0].message.content` → `extractJson`.
  - Картинка — `POST /images/edits`, multipart: `model`, `image` (файл), `prompt`, `size: '1024x1536'`. Результат — `data[0].b64_json`. `response_format` не передавать.
- Общее:
  - Таймаут 25 с для текста и 120 с для картинки (`AbortSignal.timeout`).
  - HTTP 401/403 → `auth`, 429 → `rate`, сбой `fetch`/abort → `network`, прочее → `other`.
  - Тексты ошибок для UI: `aiErrorText(e: unknown): string` в `providers.ts`. auth → «Ключ не подошёл», rate → «Лимит запросов исчерпан, попробуй позже», network → «Нет связи с ИИ», bad_response → «ИИ ответил непонятно», refusal → «ИИ отказался отвечать», other → «Ошибка ИИ».

**AiPanel** (в «Настройки»):
- Выбор провайдера: три кнопки‑чипа, Gemini помечен «бесплатно, рекомендуем».
- Поле ключа: `type="password"`, `autocomplete="off"`.
- Кнопка «Проверить ключ и загрузить модели» → `listModels`. Затем два `select`: «Модель для текста» и «Модель для картинок» (для Claude второй скрыт, вместо него текст «Claude не рисует картинки — для аватара выбери Gemini или OpenAI»). Кнопка «Сохранить».
- Если ИИ настроен: «ИИ включён: <провайдер>, <модель>», кнопки «Изменить» и «Отключить ИИ» (`clearAiConfig`).
- Под полем ключа — подсказка: «Ключ хранится только на этом устройстве и отправляется только в <провайдер>.»

- [ ] **Step 1: Write the failing tests** (`providers.test.ts`, `fetch` через `vi.stubGlobal`, для Claude — `vi.mock('@anthropic-ai/sdk')` с фейковым классом, у которого есть `models.list` и `messages.create`):
  - `extractJson('```json\n{"a":1}\n```')` → `{a:1}`; `extractJson('Вот: {"a":"}{"} спасибо')` → `{a:'}{'}`; `extractJson('нет json')` бросает `AiError` с kind `bad_response` (Review Focus 2).
  - Gemini `listModels` разделяет текстовые и image‑модели и срезает `models/`.
  - Gemini `generateJson` шлёт `x-goog-api-key` (ключ не попадает в URL) и разбирает текст ответа.
  - Ответ 429 → `AiError` с kind `rate`; 401 → `auth`; сбой `fetch` → `network` (Review Focus 3).
  - Gemini `generateImage` возвращает `Blob` с типом из `inlineData.mimeType`. Ответ без картинки → `bad_response`.
  - OpenAI `generateJson` шлёт `response_format.type === 'json_schema'`; `generateImage` шлёт `FormData` с `model` и `image`.
  - Claude `generateJson` передаёт `output_config.format.type === 'json_schema'`; `stop_reason: 'refusal'` → kind `refusal`.
  - `getAiConfig` возвращает `null` без ключа; `exportData()` не содержит `aiKey` (уже так — проверить тестом).
- [ ] **Step 2:** FAIL. **Step 3:** `npm i @anthropic-ai/sdk`, реализовать. **Step 4:** `npx vitest run` → PASS, `npm run build` → OK.
- [ ] **Step 5:** коммит `feat(ai): provider clients (Gemini, Claude, OpenAI) and AI settings`.

---

### Task 2: Задания, корректировка сложности и недельный отчёт от ИИ

**Files:**
- Create: `src/ai/tasks.ts`, `src/ai/tasks.test.ts`
- Modify: `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/screens/MyDay.tsx`, `src/screens/Checkin.tsx`, `src/screens/Analytics.tsx`

**Interfaces:**
- События:
  ```ts
  | { type: 'ai_tuning'; date: ISODate; factors: Partial<Record<Stat, number>>; note: string }
  | { type: 'ai_report'; weekStart: ISODate; text: string }
  ```
- `GameState` получает `reports: { weekStart: ISODate; text: string }[]` (последний по `ts` на неделю, по убыванию недели) и `today.aiNote: string | null` (заметка последнего `ai_tuning` за вчера или сегодня).
- Правила `replay`:
  - `ai_tuning` за дату D применяется при финализации дня D после `adjustMultipliers`: `multipliers[s] = clamp(multipliers[s] × factor, 0.5, 3.0)`. Сам `factor` предварительно ограничивается `[0.9, 1.1]`; нечисловые значения и неизвестные характеристики (`Object.hasOwn(STATS, s)`) игнорируются. Если на одну дату пришло несколько событий, побеждает первое по `(ts, id)`.
  - `ai_report`: `text` — строка, обрезанная до 4000 символов; `weekStart` — валидный понедельник (как в `weekly_issued`). Иначе событие игнорируется.
- `src/ai/tasks.ts`:
  ```ts
  export function questContext(state: GameState, profile: Profile, work: Win | null, wakeAt: HHMM): string  // компактный русский текст: цели, характеристики и множители, 14 дней истории (xp/тень/выполнено/выдано), метрики 7 дней, энергия, свободные окна, привычки
  export async function aiDailyQuests(cfg: AiConfig, state: GameState, profile: Profile, work: Win | null, wakeAt: HHMM): Promise<Quest[]>  // бросает AiError
  export function validateAiQuests(raw: unknown, ctx: { date: ISODate; multipliers: Record<Stat, number>; windows: Win[]; energy: Profile['energy']; wakeAt: HHMM }): Quest[]  // ≥3, иначе AiError('bad_response')
  export async function aiTuning(cfg: AiConfig, state: GameState, checkin: { went: string; notWent: string; energy: number }): Promise<{ factors: Partial<Record<Stat, number>>; note: string }>
  export async function aiWeeklyReport(cfg: AiConfig, state: GameState): Promise<string>
  ```
  - Схема ответа на задания: `{ quests: [{ title: string, stat: Stat, difficulty: 1-5, minutes: 5-120, allDay: boolean, why: string }] }` — 3–7 штук.
  - `validateAiQuests`:
    - `title` обрезается (trim) и должен быть 3–80 символов;
    - `stat` должен быть ключом `STATS`;
    - `difficulty` — целое 1–5;
    - `minutes` — целое 5–120, для `allDay` — 0;
    - дубликаты названий удаляются, лишнее сверх 7 отбрасывается.

    Каждое задание получает `id = ${date}:ai:${i}`, `templateId = 'ai'`, `auto: null`, `xp = questXp(difficulty, multipliers[stat])`, а окна раскладываются существующим `placeQuests`. Если валидных меньше 3 — `AiError` (Review Focus 1).
  - Системный промпт заданий (на русском): заданий 3–7. Минимум одно — на самую слабую характеристику; задания должны влезать в свободные окна; сложность следует текущему уровню и вчерашнему выполнению, растёт постепенно. Никаких медицинских рисков и экстремальных нагрузок; при низкой энергии или сне < 6 ч — легче. Задания конкретные и измеримые («Прочитать 15 страниц», а не «Почитать»).
  - Схема тюнинга: `{ factors: { <stat>: number }, note: string }`; `note` — одна‑две фразы поддержки на завтра, ≤ 200 символов.
  - Отчёт: текст 150–400 слов, разделы «Что получилось», «Закономерности», «Слабые места», «План на неделю». Возвращается строкой, обрезка до 4000.
- **`MyDay.begin`:** если ИИ настроен, а заданий на сегодня нет — `aiDailyQuests` с общим таймаутом 25 с. При `AiError` или таймауте — `buildQuests` (правила), и после начала дня показывается статус «ИИ недоступен — задания по правилам». Запись — как раньше, одной атомарной пачкой.
- **`Checkin.save`:** после записи `checkin` чек‑ин закрывается сразу. Если ИИ настроен, `aiTuning` запускается в фоне и при успехе дописывает `ai_tuning` с датой чек‑ина. Ошибка фона молча игнорируется.
- **Home:** если `today.aiNote` есть — строка «🤖 <note>» под счётом.
- **Analytics:** блок «Недельный отчёт ИИ». Если для прошлой недели (`weekStart(today) − 7`) отчёта нет и ИИ настроен — кнопка «Составить отчёт за прошлую неделю»: `aiWeeklyReport`, затем запись `ai_report`. Показывается последний отчёт: заголовок «Неделя с дд.мм», текст с переносами строк. Разметку как HTML не рендерить, только текст. Без ИИ — «Подключи ИИ в настройках, чтобы получать недельный отчёт».

- [ ] **Step 1: Write the failing tests:**
  - `validateAiQuests`:
    - 5 валидных → 5 `Quest` с нашим XP и окнами из `placeQuests`;
    - задание со `stat: 'magic'`, `difficulty: 9`, `minutes: 600` или пустым `title` отбрасывается;
    - 2 валидных → `AiError`;
    - дубликаты названий удалены.
  - `aiDailyQuests` с замоканным `generateJson` → вызывает его с промптом, содержащим имя героя и слабейшую характеристику; при `AiError` пробрасывает.
  - `replay`:
    - `ai_tuning` с `factors: { str: 1.5 }` применяет 1.1;
    - `str: 'x'` игнорируется;
    - множитель не выходит за 0.5–3.0;
    - второй `ai_tuning` на ту же дату игнорируется;
    - `ai_report` с не‑понедельником игнорируется;
    - текст обрезается до 4000;
    - `today.aiNote` берётся из вчерашнего тюнинга.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npx vitest run` → PASS, `npm run build` → OK.
- [ ] **Step 5:** коммит `feat(ai): AI daily quests, evening tuning, weekly report`.

---

### Task 3: Синхронизация картинок через Worker

**Files:**
- Create: `worker/migrations/0002_blobs.sql`, `src/blobs.ts`, `src/blobs.test.ts`
- Modify: `worker/src/index.ts`, `worker/src/store.ts`, `worker/src/memoryStore.ts`, `worker/src/index.test.ts`, `src/db.ts` (новая таблица Dexie)

**Interfaces:**
- SQL: `CREATE TABLE blobs (name TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, ts INTEGER NOT NULL);` — `data` хранится в base64.
- `Store` получает `putBlob(name, mime, dataB64): Promise<void>` (перезапись) и `getBlob(name): Promise<{ mime: string; data: string } | null>`.
- HTTP (Bearer, тот же CORS):
  - `PUT /blob/<name>`, где `name` соответствует `/^[a-z0-9-]{1,64}$/`. Тело — байты картинки, `content-type` один из `image/webp|image/jpeg|image/png`, не больше 1 МБ, иначе 413. Неверное имя или тип → 400. Ответ `200 {ok:true}`.
  - `GET /blob/<name>` → байты с исходным `content-type` и `cache-control: private, max-age=31536000, immutable`, либо `404 {ok:false,error:'Нет такого файла'}`.
  - CORS: разрешить метод `PUT`, `Allow-Methods: GET, POST, PUT, OPTIONS`.
- Dexie: `db.version(2).stores({ events: 'id, ts, pending, seq', settings: 'key', blobs: 'name' })`, таблица `blobs: Table<{ name: string; blob: Blob; uploaded: 0 | 1 }, string>`. Существующие данные сохраняются (только добавление таблицы).
- `src/blobs.ts`:
  ```ts
  export async function saveBlob(name: string, blob: Blob): Promise<void>   // локально uploaded:0, потом пытается выгрузить, если синк настроен
  export async function getBlob(name: string): Promise<Blob | null>          // локально, иначе GET с сервера (если синк настроен) → сохранить локально uploaded:1; ошибка → null
  export async function uploadPendingBlobs(): Promise<void>                   // все uploaded:0 → PUT; успех → uploaded:1; ошибки молча
  export function useBlobUrl(name: string | null): string | null              // React-хук: getBlob → URL.createObjectURL, revoke при смене или размонтировании
  ```
  `uploadPendingBlobs` вызывается в конце успешного `syncNow` (в `src/sync.ts`, без ожидания, ошибки не влияют на результат синка).
- Тело `PUT` в Worker читать с проверкой длины по `content-length` до чтения и по фактической длине после. Храним base64.

- [ ] **Step 1: Write the failing tests:**
  - Worker:
    - `PUT` с картинкой 10 байт → 200, `GET` возвращает те же байты и `content-type`;
    - `PUT` 1.1 МБ → 413;
    - имя `../x` → 400;
    - тип `text/html` → 400;
    - `GET` несуществующего → 404;
    - без токена → 401;
    - `OPTIONS` разрешает `PUT`.
  - Клиент (`fake-indexeddb` + `fetch` через `handle` и `MemoryStore`, как в `sync.test.ts`):
    - `saveBlob` при включённом синке выгружает на сервер;
    - на «втором устройстве» с пустой БД `getBlob` скачивает и кэширует (Review Focus 5);
    - без синка `getBlob` неизвестного → `null` без исключений;
    - сервер недоступен при `saveBlob` → блоб остаётся `uploaded:0`, следующий `uploadPendingBlobs` выгружает.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npx vitest run`, `npm run worker:check`, `npm run build` → OK. Локальный дым через `wrangler dev` для `PUT`/`GET` (как в этапе 2), dev‑сервер остановить.
- [ ] **Step 5:** коммит `feat(sync): avatar image blobs via Worker + D1`.

---

### Task 4: Аниме‑аватар по фото

**Files:**
- Create: `src/ai/avatar.ts`, `src/ai/avatar.test.ts`, `src/screens/AvatarAi.tsx`
- Modify: `src/domain/types.ts`, `src/domain/replay.ts`, `src/domain/replay.test.ts`, `src/ui/Avatar.tsx`, `src/screens/Character.tsx`, `src/screens/Home.tsx`

**Interfaces:**
- Событие `| { type: 'avatar_image'; tier: 1|2|3|4; blob: string }` (имя блоба).
- `GameState.avatarImages: Partial<Record<1|2|3|4, string>>` — последний по `ts` для каждого тира. Невалидный `tier` или `blob` (не по `/^[a-z0-9-]{1,64}$/`) игнорируются.
- `src/ai/avatar.ts`:
  ```ts
  export function avatarPrompt(params: AvatarParams, tier: 1|2|3|4, name: string): string
  export async function shrinkImage(blob: Blob, maxSide = 768): Promise<Blob>   // canvas → image/webp q=0.85 (если Safari не умеет webp — image/jpeg q=0.85); цель ≤ 600 КБ: при превышении повторить с q−0.15 до 0.4
  export async function generateAvatar(cfg: AiConfig, photo: Blob, params: AvatarParams, tier: 1|2|3|4, name: string): Promise<Blob>  // shrinkImage(photo, 1024) → generateImage → shrinkImage(result)
  ```
  - `avatarPrompt` (по‑английски — модели картинок лучше понимают английский; это промпт для провайдера, а не текст интерфейса): «Anime-style full-body character portrait of the person in the photo. Keep their facial features, face shape and skin tone recognizable. Hair: <hair> <hairColor>. Outfit main color <outfitColor>. Tier <n>:».
    - Тир 1 — простая повседневная одежда, мягкий свет.
    - Тир 2 — лёгкая броня и плащ.
    - Тир 3 — богатая экипировка, светящиеся акценты.
    - Тир 4 — легендарный герой, сияющая аура.

    Плюс общие условия: «Dark neon background, vertical 2:3, single character, no text, no watermark, safe for work.»
- **`AvatarAi`** (раздел «Аватар от ИИ» во вкладке «Герой»):
  - Без ИИ или без модели картинок — текст «Подключи Gemini или OpenAI в настройках, чтобы создать аватар по фото».
  - Кнопка «Выбрать фото» (`<input type="file" accept="image/*">`, без `capture`, чтобы можно было взять из галереи).
  - Перед отправкой — подтверждение с `Confirm`: «Фото будет отправлено в <провайдер> для создания аватара. Исходное фото нигде не сохраняется. Продолжить?».
  - Процесс — «Рисую аватар… это может занять до минуты» с `role="status"`, кнопка заблокирована.
  - Результат — превью и две кнопки: «Сохранить для тира N» (`saveBlob('avatar-t<N>-<8 случайных hex>', blob)` + `appendEvent avatar_image`) и «Попробовать ещё раз».
  - Ошибки — через `aiErrorText`.
  - Ниже — сетка тиров 1–4 с уже сохранёнными картинками (`useBlobUrl`).
  - Когда текущий тир выше, чем у последней сохранённой картинки, а ИИ настроен — подсказка «Новый тир! Создай новый образ».
- **`Avatar`**:
  - Новый необязательный проп `image?: string | null` (URL). Если он есть — `<img>` того же размера, `object-fit: cover`, со скруглением; `alt` по правилам `decorative`.
  - Тень = тот же `<img>` с CSS‑фильтром `brightness(0.35) saturate(0) drop-shadow(0 0 12px var(--shadow))` и фиолетовым наложением.
  - Если загрузка картинки не удалась (`onError`) — SVG‑аватар как раньше.
- **Home и Character:** изображение для текущего тира — `state.avatarImages[state.tier]` или ближайший меньший тир. URL берётся через `useBlobUrl`.

- [ ] **Step 1: Write the failing tests:**
  - `avatarPrompt` содержит цвет волос и описание тира 3;
  - `replay` с `avatar_image` для тиров 1 и 3 → `avatarImages` с обоими, второй `avatar_image` того же тира побеждает по `ts`, `blob: '../x'` игнорируется;
  - `generateAvatar` с замоканными `generateImage`/`shrinkImage` вызывает их по порядку и возвращает ужатый блоб. `shrinkImage` в Node без canvas тестировать не нужно — вынести логику выбора качества в чистую функцию `nextQuality(size, q)` и протестировать её (Review Focus 4).
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** `npx vitest run` → PASS, `npm run build` → OK.
- [ ] **Step 5: Проверка в браузере** (Playwright MCP, 390×844, только DOM‑проверки, без реального ИИ):
  - без ИИ раздел показывает подсказку;
  - с подменённым через `evaluate` `generateImage` — недоступно, поэтому вместо этого вставить событие `avatar_image` и блоб в IndexedDB через `evaluate` → на «Главной» `<img>` для героя и Тени. Битый блоб → SVG.

  Dev‑сервер остановить. Файлы — только в temp‑папке.
- [ ] **Step 6:** коммит `feat(ai): anime avatar from photo per tier`.

---

### Task 5: Документация

**Files:**
- Create: `docs/stage-4-ai.md`
- Modify: `README.md`

Простой русский, по шагам:
- как получить бесплатный ключ Gemini в Google AI Studio (aistudio.google.com → «Get API key» → создать ключ → скопировать);
- как вставить ключ в «Настройки → ИИ» и выбрать модели;
- что делает ИИ: задания утром, совет вечером, недельный отчёт, аватар;
- что уходит провайдеру (данные игры для заданий и отчёта, фото только для аватара и только после подтверждения) и что ключ хранится только на устройстве — на ПК его надо ввести отдельно;
- что делать при «Лимит запросов исчерпан» и «Ключ не подошёл»;
- Claude и OpenAI — платные, и для аватара Claude не подходит.

Подписи — точно как в коде, в «ёлочках».
- [ ] **Step 1:** написать. **Step 2:** коммит `docs: stage 4 AI guide`.

---

### После задач (контроллер)

`npx wrangler d1 migrations apply life-rpg --remote` (миграция 0002), `npx wrangler deploy` из `worker/`, проверить `OPTIONS /blob/x` → разрешён `PUT`. Затем слить в main и выложить.
