# Life RPG — этап 2: бэкенд и синхронизация. План реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare Worker + D1 хранит общий журнал событий. iPhone и ПК синхронизируются через него, а «Команды» iOS присылают шаги, сон и календарь, по которым задания засчитываются сами.

**Architecture:** Worker с маршрутами `/register`, `/token`, `/sync`, `/events`, `/ping` поверх интерфейса `Store`: в проде это D1, в тестах — память. Клиент получает модуль `src/sync.ts` (push pending → pull since cursor) и новое событие `health_packet`. `replay` превращает это событие в метрики дня, автозачёт и занятость по календарю. В UI появляются панель «Синхронизация» в настройках и экран входа по ссылке/токену для ПК.

**Tech Stack:** существующий React 18 + Vite + TS + Dexie; Worker на чистом TS без runtime‑зависимостей; `wrangler` (devDependency) для локального запуска и деплоя; vitest (Node 20: `Request`, `Response`, `crypto.subtle` — глобальные).

**Spec:** `docs/superpowers/specs/2026-11-17-life-rpg-design.md` (разделы 7, 9 «Автозачёт», 13, 14 п.2)

## Global Constraints

- Весь текст интерфейса и сообщений об ошибках — на русском.
- Клиент: никаких новых runtime‑зависимостей. Worker: никаких runtime‑зависимостей.
- TypeScript strict. `npx vitest run` и `npm run build` зелёные после каждой задачи.
- Сравнение токена — в постоянном времени: сравнивать SHA‑256 хэши побайтно через XOR‑накопление.
- CORS: разрешены только origin из `ALLOWED_ORIGINS` (через запятую), запросы без `Origin` (от «Команд») пропускаются.
- Лимиты: `/sync` тело ≤ 256 КБ; `POST /events` ≤ 500 событий и ≤ 1 МБ; `GET /events` страница ≤ 1000.
- События не удаляются никогда. Неизвестные типы событий `replay` игнорирует (уже так).
- Настройки `syncUrl`, `syncToken`, `syncCursor`, `lastSyncAt` — локальные для устройства: не экспортируются, импорт их не трогает.
- Токен никогда не попадает в логи и в query‑string. Ссылка входа передаёт его только во фрагменте `#`.

## Review Focus

1. «Команды» шлют числа строками, с запятой, с неразрывным пробелом («8 421»), пустые строки → значение распознано или отброшено, но не 500 (Task 1).
2. Связь рвётся посреди отправки → неподтверждённые события остаются `pending`, следующий синк их досылает, дублей нет (Task 4).
3. Два устройства офлайн выдали задания на один день → после синка у обоих побеждает событие с меньшим `ts` (Task 3).
4. Токен сброшен на одном устройстве → другое получает понятное «Неверный токен», локальные данные не трогаются (Task 2, Task 4).
5. История > 1000 событий при первом входе на ПК → pull листает страницы, пока `more=false` (Task 4).

---

### Task 1: Разбор пакета «Команд»

**Files:**
- Create: `worker/src/parse.ts`
- Test: `worker/src/parse.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HealthPacket {
    date: string; kind: 'morning' | 'evening' | 'other';
    health: { steps?: number; sleepHours?: number; workoutMin?: number; activeKcal?: number; restingHR?: number; weightKg?: number };
    calendar: { title: string; start: string; end: string }[];
  }
  export function num(v: unknown): number | undefined
  export function parseSyncPayload(body: unknown): { ok: true; packet: HealthPacket } | { ok: false; error: string }
  ```

Правила разбора (решения плана):
- `num`: число → само, если конечно; строка → убрать все пробельные символы (включая `\u00a0`, `\u202f`), заменить `,` на `.`, `Number()`; пустая/нечисловая → `undefined`.
- Поля здоровья принимаются **и** вложенными в `health`, **и** плоскими на верхнем уровне (плоские проще собрать в «Командах»). Если есть оба, побеждает `health`.
- `sleepMinutes` (плоско или в `health`) → `sleepHours = round(min/60, 2)`, если `sleepHours` не задан.
- `workouts`: массив объектов с `minutes` или чисел → сумма в `workoutMin`; `workoutMin` напрямую тоже принимается.
- Диапазоны (вне — поле отбрасывается): steps 0–200000 (округлить до целого), sleepHours 0–24, workoutMin 0–1440, activeKcal 0–20000, restingHR 20–250, weightKg 20–400.
- `date` обязателен, `/^\d{4}-\d{2}-\d{2}$/` после `trim()`; иначе ошибка `'Поле date должно быть в формате ГГГГ-ММ-ДД'`. Тело не объект → `'Ожидался JSON-объект'`.
- `kind`: `'morning'|'evening'`, иначе `'other'`.
- `calendar`: массив; элемент годится, если `start` и `end` — строки, `Date.parse` обоих конечен и `end > start`. `title` — строка, обрезать до 100 символов (не строка → `''`). Не больше 50 элементов. Не массив → `[]`.

- [ ] **Step 1: Write the failing tests** (`worker/src/parse.test.ts`)

```ts
import { describe, expect, it } from 'vitest'
import { num, parseSyncPayload } from './parse'

describe('num', () => {
  it('терпит строки «Команд»', () => {
    expect(num('8 421')).toBe(8421)
    expect(num('6,8')).toBe(6.8)
    expect(num(' 78.4 ')).toBe(78.4)
    expect(num('')).toBeUndefined()
    expect(num('abc')).toBeUndefined()
    expect(num(NaN)).toBeUndefined()
    expect(num(null)).toBeUndefined()
  })
})

describe('parseSyncPayload', () => {
  it('плоский пакет', () => {
    const r = parseSyncPayload({ date: '2026-11-17', kind: 'evening', steps: '8 421', sleepMinutes: '408', weightKg: '78,4' })
    expect(r).toEqual({ ok: true, packet: { date: '2026-11-17', kind: 'evening',
      health: { steps: 8421, sleepHours: 6.8, weightKg: 78.4 }, calendar: [] } })
  })
  it('вложенный пакет из спеки, тренировки суммируются', () => {
    const r = parseSyncPayload({ date: '2026-11-17', health: { steps: 8421, sleepHours: 6.8,
      workouts: [{ type: 'Бег', minutes: 32 }, { minutes: '10' }], restingHR: 61 },
      calendar: [{ title: 'Работа', start: '2026-11-17T11:00:00+03:00', end: '2026-11-17T20:00:00+03:00' }] })
    expect(r.ok && r.packet.health).toEqual({ steps: 8421, sleepHours: 6.8, workoutMin: 42, restingHR: 61 })
    expect(r.ok && r.packet.calendar).toHaveLength(1)
    expect(r.ok && r.packet.kind).toBe('other')
  })
  it('вне диапазона и мусор отбрасываются, а не ломают', () => {
    const r = parseSyncPayload({ date: '2026-11-17', steps: -5, sleepHours: '30', weightKg: 'много',
      calendar: [{ title: 1, start: 'x', end: 'y' }, 'bad', { start: '2026-11-17T12:00:00Z', end: '2026-11-17T11:00:00Z' }] })
    expect(r).toEqual({ ok: true, packet: { date: '2026-11-17', kind: 'other', health: {}, calendar: [] } })
  })
  it('ошибки формата', () => {
    expect(parseSyncPayload({ steps: 1 })).toEqual({ ok: false, error: 'Поле date должно быть в формате ГГГГ-ММ-ДД' })
    expect(parseSyncPayload([1])).toEqual({ ok: false, error: 'Ожидался JSON-объект' })
  })
})
```

- [ ] **Step 2:** `npx vitest run worker/src/parse.test.ts` → FAIL (модуля нет).
- [ ] **Step 3:** реализовать `num` и `parseSyncPayload` в `worker/src/parse.ts` по правилам выше.
- [ ] **Step 4:** `npx vitest run worker/src/parse.test.ts` → PASS.
- [ ] **Step 5:** `git add worker && git commit -m "feat(worker): tolerant Shortcuts payload parser"`

---

### Task 2: Worker — маршруты, авторизация, хранилище, D1

**Files:**
- Create: `worker/src/store.ts`, `worker/src/index.ts`, `worker/src/memoryStore.ts` (только для тестов), `worker/src/index.test.ts`, `worker/migrations/0001_init.sql`, `worker/wrangler.toml`, `worker/tsconfig.json`
- Modify: `package.json` (devDependency `wrangler@^3`, scripts `worker:dev`, `worker:check`)

**Interfaces:**
- Consumes: `parseSyncPayload`, `HealthPacket` (Task 1).
- Produces (HTTP — контракт для Task 4):
  - `POST /register` body `{token}` (строка 32–200 символов) → `201 {ok:true}`; если токен уже есть → `409 {ok:false,error:'Сервер уже привязан'}`.
  - `POST /token` (Bearer старый) body `{token}` → `200 {ok:true}`, старый токен перестаёт работать.
  - `POST /sync` (Bearer) → пишет событие `{id: crypto.randomUUID(), ts: Date.now(), deviceId: 'shortcuts', type: 'health_packet', ...packet}`; ответ `200 {ok:true, received:{date, ...packet.health, calendar: <число>}}`; ошибка разбора → `400 {ok:false,error}`.
  - `POST /events` (Bearer) body `{events: object[]}`; каждое должно иметь строковые `id`, `type`, `deviceId` и числовой `ts`, иначе `400`; >500 шт. или тело >1 МБ → `413`. Поля `pending`/`seq` у входящих отбрасываются. Ответ `200 {ok:true, inserted:<новых>}`.
  - `GET /events?since=<seq>` (Bearer) → `200 {events: (event & {seq})[], next: <seq последнего или since>, more: boolean}`, по возрастанию `seq`, до 1000.
  - `GET /ping` (Bearer) → `200 {ok:true, lastHealthAt: number|null, serverTime: number}`.
  - Нет/неверный токен → `401 {ok:false,error:'Неверный токен'}`. Токена ещё нет (не зарегистрирован) → тоже `401`. Неизвестный путь → `404`. `OPTIONS` → `204` с CORS.
  - Тело ответа всегда JSON (`content-type: application/json; charset=utf-8`). Ответы на запросы с разрешённым `Origin` несут `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Access-Control-Allow-Headers: authorization, content-type`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`. Запрос с `Origin` не из списка → `403`.
  - `export default { fetch(req: Request, env: Env): Promise<Response> }`, где `interface Env { DB: D1Like; ALLOWED_ORIGINS: string }`; для тестов экспортировать `handle(req: Request, store: Store, allowedOrigins: string[]): Promise<Response>`.
- `worker/src/store.ts`:
  ```ts
  export interface Store {
    getTokenHash(): Promise<string | null>
    setTokenHashIfAbsent(hash: string): Promise<boolean>   // false, если уже был
    replaceTokenHash(hash: string): Promise<void>
    insertEvents(evs: { id: string; ts: number; type: string; body: string }[]): Promise<number> // INSERT OR IGNORE, вернуть число новых
    eventsSince(seq: number, limit: number): Promise<{ seq: number; body: string }[]>
    lastHealthAt(): Promise<number | null>                 // max(ts) где type='health_packet'
  }
  export class D1Store implements Store { constructor(db: D1Like) }
  ```
  `D1Like` — минимальный собственный интерфейс (`prepare(sql).bind(...).run()/all()/first()`, `batch([...])`), без `@cloudflare/workers-types`. Вставку делать одним `db.batch` и суммировать `meta.changes`.
- Схема `0001_init.sql`:
  ```sql
  CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, ts INTEGER NOT NULL, type TEXT NOT NULL, body TEXT NOT NULL);
  CREATE INDEX events_type_ts ON events(type, ts);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  ```
  Хэш токена — `meta` с ключом `token_hash` (решение: D1 вместо KV — одна привязка, меньше шагов деплоя). Хэш — hex SHA‑256 токена.
- `wrangler.toml`: `name = "life-rpg-sync"`, `main = "src/index.ts"`, `compatibility_date = "2025-09-01"`, `[vars] ALLOWED_ORIGINS = "https://monarch071.github.io,http://localhost:5173,http://localhost:4173"`, `[[d1_databases]] binding = "DB"`, `database_name = "life-rpg"`, `database_id = "REPLACE_AT_DEPLOY"`, `migrations_dir = "migrations"`.
- `worker/tsconfig.json`: strict, `lib: ["ES2022"]`, `types: []`, `include: ["src"]`, `exclude` тестов не нужен (тесты тоже должны типизироваться; добавь `"types": ["vitest/globals"]` не надо — тесты импортируют из `vitest`). Если `Request`/`Response`/`crypto` не видны без DOM, добавь `"lib": ["ES2022", "DOM"]`. Скрипт `"worker:check": "tsc -p worker"`.

- [ ] **Step 1: Write the failing tests** (`worker/src/index.test.ts`, с `MemoryStore` из `memoryStore.ts`). Обязательные кейсы:
  - `register`: первый → 201, второй → 409; `/ping` без токена → 401; с токеном → 200 `{ok:true,lastHealthAt:null}`.
  - `POST /events` с двумя событиями → `inserted: 2`; повтор тех же → `inserted: 0`; `GET /events?since=0` возвращает 2 события с `seq` 1 и 2, без полей `pending`; `next: 2`, `more: false`.
  - Пагинация: 1001 событие (вставить через store напрямую) → первая страница 1000, `more: true`, вторая (`since=next`) — 1, `more: false`.
  - Событие без `ts` → 400; 501 событие → 413.
  - `/sync` с плоским пакетом → 200, `received.steps === 8421`; затем `GET /events` содержит `type: 'health_packet'`, `deviceId: 'shortcuts'`; `/ping` → `lastHealthAt` число. `/sync` без `date` → 400 с русским `error`.
  - Тело `/sync` длиной 300 КБ → 413.
  - `POST /token` → старый токен на `/ping` даёт 401, новый — 200.
  - CORS: `OPTIONS` с `Origin: https://monarch071.github.io` → 204 и `access-control-allow-origin`; `GET /ping` с `Origin: https://evil.example` → 403; без `Origin` → работает.
- [ ] **Step 2:** `npx vitest run worker` → FAIL.
- [ ] **Step 3:** реализовать `store.ts`, `memoryStore.ts`, `index.ts`, миграцию, `wrangler.toml`, `tsconfig.json`; `npm i -D wrangler@^3`.
- [ ] **Step 4:** `npx vitest run worker` → PASS; `npm run worker:check` → без ошибок; `npm run build` → OK.
- [ ] **Step 5: Локальный дым‑тест с настоящим D1:** в `worker/`: `npx wrangler d1 migrations apply life-rpg --local`, затем `npx wrangler dev --local --port 8787` в фоне; `curl -X POST localhost:8787/register -d '{"token":"<32+ символа>"}'` → 201; `curl -H "Authorization: Bearer …" -X POST localhost:8787/sync -d '{"date":"2026-11-17","steps":"8 421"}'` → 200; `curl -H "Authorization: Bearer …" "localhost:8787/events?since=0"` → событие с `seq`. Остановить dev‑сервер. Каталог `worker/.wrangler/` добавить в `.gitignore`. Записать вывод в отчёт.
- [ ] **Step 6:** `git add -A worker package.json package-lock.json .gitignore && git commit -m "feat(worker): sync API on D1 with token auth and CORS"`

---

### Task 3: Клиент — событие `health_packet` в игре

**Files:**
- Modify: `src/domain/types.ts`, `src/domain/replay.ts`, `src/screens/issue.ts`
- Test: `src/domain/replay.test.ts` (добавить), `src/screens/issue.test.ts` (создать)

**Interfaces:**
- Produces:
  - В union `GameEvent`: `| { type: 'health_packet'; date: ISODate; kind: 'morning'|'evening'|'other'; health: HealthData; calendar: { title: string; start: string; end: string }[] }`, где `export interface HealthData { steps?: number; sleepHours?: number; workoutMin?: number; activeKcal?: number; restingHR?: number; weightKg?: number }`.
  - `GameState.today.calendar: { title: string; start: HHMM; end: HHMM }[]` — из **последнего по ts** `health_packet` с `date === today`; время — локальное `HH:MM` от `new Date(iso)`; элементы длительностью ≥ 20 ч (весь день) пропускаются; элементы, чей старт по локальной дате не совпадает с `date` пакета, пропускаются (календарь «на завтра»).
  - `GameState.lastHealth: { ts: number; date: ISODate; health: HealthData } | null` — последний по ts пакет.
  - `buildQuests` передаёт `busy: state.today.calendar.map(({start, end}) => ({start, end}))`.

Правила `replay` (решения плана):
- Значения здоровья проверять `Number.isFinite`, иначе игнорировать (данные с сервера — граница доверия; replay не должен падать ни на каком пакете — тест на `health: null`/`calendar: null`).
- Метрики даты пакета: `steps = max(текущее, пакет)`; `workoutMin = max(текущее, пакет)`; `sleepHours`, `weightKg` — перезаписываются пакетом (последний по ts побеждает, как и ручной ввод).
- **Автозачёт:** после основного цикла, до подсчёта XP: каждое выданное задание с `auto`, у которого `metrics[q.date][auto.metric]` определена и удовлетворяет `op/value`, становится `done`. Работает и для ручного `metric_logged`. Работает для прошлых дней тоже (пакет пришёл поздно → день пересчитывается).

- [ ] **Step 1: Write the failing tests** (в `replay.test.ts`, используй существующие хелперы файла):
  - `health_packet` со `steps: 9000` → `today.metrics.steps === 9000`, задание `steps` с `auto {steps >= 8000}` → `done`, XP начислен.
  - два пакета за день: 5000, затем 3000 (позже) → `steps === 5000`; пакеты сна 6.5, затем 7 → `sleepHours === 7`.
  - `steps: 7000` при `auto >= 8000` → не `done`.
  - ручной `metric_logged steps set 8500` тоже засчитывает авто‑задание.
  - пакет за вчера с шагами → вчерашнее задание `done`, `history.at(-1).xp` включает его.
  - пакет `{ health: null, calendar: null }` (через `as any`) → `replay` не бросает.
  - `today.calendar`: пакет за сегодня с событием 11:00–20:00 локального времени (строить ISO через `new Date(y,m,d,11).toISOString()`) → `[{title, start:'11:00', end:'20:00'}]`; событие на весь день и событие с другой датой — отфильтрованы; `lastHealth.health.steps` выставлен.
  - Review Focus 3: два `quests_issued` на один день с разных `deviceId`, позднее пришло первым в массиве → в `today.quests` задания события с меньшим `ts`.
  - `issue.test.ts`: `buildQuests` при календаре 11:00–20:00 и выходном не ставит ни одно задание с окном, пересекающим 11:00–20:00.
- [ ] **Step 2:** `npx vitest run src` → новые тесты FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` → OK.
- [ ] **Step 5:** `git commit -am "feat(game): health packets — metrics, auto-credit, calendar busy time"`

---

### Task 4: Клиент — движок синхронизации

**Files:**
- Create: `src/sync.ts`, `src/sync.test.ts`
- Modify: `src/backup.ts` (isLocal: + ключи, начинающиеся с `sync`, и `lastSyncAt`), `src/useGame.ts` (вынести `loadState`)

**Interfaces:**
- Consumes: HTTP‑контракт Task 2; `db`, `getSetting`, `setSetting`, `StoredEvent` из `src/db.ts`.
- Produces:
  ```ts
  export const DEFAULT_SYNC_URL: string            // '' до деплоя; заполняется при деплое
  export interface SyncConfig { url: string; token: string }
  export async function getSyncConfig(): Promise<SyncConfig | null>   // из settings syncUrl/syncToken
  export type SyncResult = { ok: true; pushed: number; pulled: number } | { ok: false; error: string }
  export function syncNow(): Promise<SyncResult>   // single-flight: параллельные вызовы получают один промис; без конфига → {ok:true,pushed:0,pulled:0}
  export async function enableSync(url: string): Promise<SyncResult>  // новый токен → /register → сохранить → syncNow
  export async function joinSync(url: string, token: string): Promise<SyncResult> // /ping → сохранить, syncCursor=0 → syncNow
  export async function rotateToken(): Promise<SyncResult>             // POST /token, сохранить новый
  export async function disableSync(): Promise<void>                   // удалить syncToken/syncCursor/lastSyncAt (события остаются)
  export function loginLink(cfg: SyncConfig, appUrl: string): string    // `${appUrl}#sync=${enc(token)}&url=${enc(url)}`
  export function parseLoginHash(hash: string): SyncConfig | null
  export function newToken(): string                // 32 случайных байта → base64url (43 символа)
  ```
  `src/useGame.ts`: `export async function loadState(): Promise<GameState>` (события + cutoffHour → `replay(…, now(), cutoff)`); `useGame` переиспользует ту же логику преобразования.
- Алгоритм `syncNow`:
  1. **Push:** `pending=1` события по `ts`, пачками по 40 (лимит запросов D1 на бесплатном тарифе); поля `pending`/`seq` не отправлять; после `200` пометить `pending=0` **только отправленные id** (одна транзакция). Ошибка → остановиться, вернуть ошибку; неотправленное остаётся `pending`.
  2. **Pull:** цикл `GET /events?since=<syncCursor>` пока `more`; каждую страницу в одной транзакции `bulkPut({...e, pending:0})` + `syncCursor = next`.
  3. `lastSyncAt = now()`.
  - URL: убирать хвостовой `/`. Заголовки: `Authorization: Bearer <token>`, `content-type: application/json`. Таймаут запроса 15 с (`AbortSignal.timeout`).
  - Ошибки (русские): сеть/таймаут → `'Нет связи с сервером'`; 401 → `'Неверный токен — войди заново'`; 409 при регистрации → `'Этот сервер уже привязан. Подключись по ссылке с первого устройства'`; прочее → `` `Ошибка сервера (${status})` ``.

- [ ] **Step 1: Write the failing tests** (`src/sync.test.ts`, `fake-indexeddb/auto` как в существующих тестах БД; `fetch` подменять `vi.stubGlobal` фейковым сервером в памяти, повторяющим контракт Task 2 — можно переиспользовать `handle` + `MemoryStore` из `worker/src`, вызывая `handle(new Request(url, init), store, [])`):
  - `enableSync` → токен 43 символа сохранён, событие из `appendEvent` после `syncNow` → на сервере, локально `pending===0`, `seq` выставлен.
  - Два «устройства» (очистить локальную БД и `joinSync` тем же токеном) → второе получает все события первого; `loadState()` даёт тот же `profile`.
  - Review Focus 2: fetch падает на второй пачке push (250 pending событий) → первые 40 `pending=0`, остальные `1`; повторный `syncNow` досылает, на сервере ровно 250.
  - Review Focus 5: на сервере 2500 событий → после `joinSync` локально 2500, `syncCursor === 2500`.
  - Review Focus 4: сервер отвечает 401 → `{ok:false, error:'Неверный токен — войди заново'}`, локальные события не удалены.
  - single‑flight: два параллельных `syncNow()` → один и тот же промис (`toBe`).
  - `parseLoginHash(new URL(loginLink(cfg,'https://x/app/')).hash)` → `cfg`; мусорный hash → `null`.
  - `exportData()` не содержит ключей `syncToken`, `syncUrl`, `syncCursor`.
- [ ] **Step 2:** `npx vitest run src/sync.test.ts` → FAIL.
- [ ] **Step 3:** реализовать.
- [ ] **Step 4:** `npx vitest run` → PASS; `npm run build` → OK.
- [ ] **Step 5:** `git commit -am "feat(sync): push/pull engine, login link, token rotation"` (с новыми файлами через `git add`).

---

### Task 5: Клиент — интерфейс синхронизации

**Files:**
- Create: `src/screens/SyncPanel.tsx`, `src/screens/JoinSync.tsx`, `src/useSync.ts`
- Modify: `src/screens/Settings.tsx`, `src/App.tsx`, `src/screens/Onboarding.tsx`, `src/screens/MyDay.tsx`

**Interfaces:**
- Consumes: всё из Task 4; `state.lastHealth` из Task 3.
- Produces: `useSync(): { status: 'off'|'idle'|'syncing'|'error'; error: string|null; lastSyncAt: number|null; run: () => void }`.

Поведение:
- `useSync` (вызывается один раз в `App`): `syncNow()` при монтировании, при `visibilitychange→visible`, при `online`, раз в 60 с пока вкладка видима, и через 2 с после появления новых `pending` событий (`useLiveQuery` по `db.events.where('pending').equals(1).count()`, debounce). Ошибки не бросать — только статус.
- `JoinSync` — экран «Подключение к синхронизации»: поля «Адрес сервера» (по умолчанию `DEFAULT_SYNC_URL`) и «Токен», кнопка «Подключить» → `joinSync`, статус/ошибка, кнопка «Отмена». В `App`: если `parseLoginHash(location.hash)` не `null` — показать `JoinSync` с подставленными значениями **поверх всего, включая онбординг**, и требовать нажатия «Подключить» (не подключать автоматически); после успеха или отмены — `history.replaceState(null, '', location.pathname + location.search)`.
- `Onboarding`, первый шаг: кнопка‑ссылка «У меня уже есть прогресс — войти» → `JoinSync` (без значений). После успешного входа появится `onboarding_completed` из pull, и `App` сам покажет игру.
- `SyncPanel` (в `Settings` вместо отключённой кнопки «Синхронизация — этап 2»):
  - выключено: поле «Адрес сервера» (`DEFAULT_SYNC_URL`), кнопки «Включить синхронизацию» (`enableSync`) и «У меня уже есть токен» (→ `JoinSync`).
  - включено: «Последняя синхронизация: <чч:мм / N мин назад>», ошибка красным, кнопка «Синхронизировать сейчас»; блок «Для «Команд»»: адрес `<url>/sync` и токен (скрыт точками, кнопка «Показать»), кнопки «Скопировать адрес» и «Скопировать токен» (`navigator.clipboard.writeText`, при ошибке — показать текст для ручного копирования); «Последние данные из «Команд»: <дата/время>, шаги N, сон N ч» из `state.lastHealth` или «ещё не приходили»; кнопка «Ссылка для входа с компьютера» → копирует `loginLink(cfg, location.origin + import.meta.env.BASE_URL)`; «Сбросить токен» (диалог‑подтверждение «Другие устройства и «Команды» перестанут синхронизироваться, пока не введёшь новый токен») → `rotateToken`; «Отключить на этом устройстве» → `disableSync`.
  - `Settings` должен получить `state` из `App` (сейчас без пропсов) — передать.
- `MyDay.begin`: если `getSyncConfig()` не `null` — сначала `await Promise.race([syncNow(), timeout 4 с])`, затем `const fresh = await loadState()` и выдавать задания только если `fresh.today.quests.length === 0` (решает «первое устройство выдаёт задания дня»). Ошибка синка не блокирует начало дня.
- Все кнопки ≥ 44 px, `role="status"`/`role="alert"` для сообщений, как в существующих экранах.

- [ ] **Step 1:** реализовать.
- [ ] **Step 2:** `npx vitest run` → PASS; `npm run build` → OK.
- [ ] **Step 3: Проверка в браузере** (Playwright MCP, viewport 390×844; скриншоты/логи сохранять только в `C:\Users\edikg\AppData\Local\Temp\claude\life-rpg-e2e\`, не в другие папки): поднять `wrangler dev --local` (Task 2, Step 5) и `npm run dev`; во вкладке A пройти онбординг, «Включить синхронизацию» с адресом `http://localhost:8787`, начать день; скопировать ссылку входа; во второй вкладке‑контексте с чистым хранилищем открыть ссылку → «Подключить» → видна та же игра и те же задания; `curl` `/sync` с `steps` ≥ цели → после «Синхронизировать сейчас» задание на шаги засчитано в обеих вкладках. Остановить серверы.
- [ ] **Step 4:** `git add -A src && git commit -m "feat(ui): sync panel, login by link, auto sync, first device issues quests"`

---

### Task 6: Документация для пользователя

**Files:**
- Create: `docs/shortcuts.md`, `docs/stage-2-sync.md`
- Modify: `README.md` (ссылки на новые документы)

Требования:
- Язык — простой русский для не‑программиста, каждый шаг — одно действие, названия кнопок «как на экране» в кавычках‑ёлочках.
- `docs/shortcuts.md`: создать команду «Life RPG — синк», которая собирает **плоский** JSON (`date`, `kind`, `steps`, `sleepMinutes`, `weightKg`, `workoutMin`, `calendar`) действиями «Текущая дата», «Форматировать дату» (формат «ГГГГ-ММ-ДД», свой формат `yyyy-MM-dd`), «Найти образцы здоровья» (Шаги — сегодня, «Вычислить статистику» → «Сумма»; Анализ сна — со вчерашнего 18:00, значение «В кровати»/«Сон», сумма длительностей в минутах; Вес — последний), «Найти события Календаря» (сегодня), «Словарь», «Получить содержимое URL» (метод POST, тело запроса JSON, заголовок `Authorization` = `Bearer <токен>`), «Показать результат» для проверки. Затем две автоматизации «Время суток» (10:30 → `kind` = `morning`, 22:30 → `evening`) с выключенным «Спрашивать до запуска». Раздел «Как проверить»: запустить вручную → ответ `"ok": true` → в приложении «Настройки → Синхронизация → Последние данные». Раздел «Если не работает»: 401 → токен; 400 → дата; нет шагов → разрешения «Здоровья» для «Команд». Предупреждение вверху: названия действий в iOS 27 могли немного измениться — искать по смыслу.
- `docs/stage-2-sync.md`: как включить синхронизацию на iPhone, как войти с компьютера по ссылке, чек‑лист проверки (задания одинаковые на обоих устройствах; отметка на одном появляется на другом в течение минуты; шаги из «Команд» засчитывают задание), что делать, если «Неверный токен».
- [ ] **Step 1:** написать документы.
- [ ] **Step 2:** `git add docs README.md && git commit -m "docs: Shortcuts setup and stage 2 sync guide"`

---

### После задач (делает контроллер, не субагент)

1. `npx wrangler login` (пользователь подтверждает в браузере), `npx wrangler d1 create life-rpg` → `database_id` в `wrangler.toml`; `npx wrangler d1 migrations apply life-rpg --remote`; `npx wrangler deploy`.
2. Проверить `curl https://life-rpg-sync.<subdomain>.workers.dev/ping` → 401 JSON.
3. Вписать адрес в `DEFAULT_SYNC_URL`, коммит, слить в main, push → GitHub Pages.
