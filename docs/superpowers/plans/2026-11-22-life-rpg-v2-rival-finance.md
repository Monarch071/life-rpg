# Life RPG v2 «Соперник и финансы» (этап 6) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (or superpowers:executing-plans). Steps use checkbox (`- [ ]`) syntax. TDD: сначала падающий тест, потом код.

**Goal:** призрак (ты месяц назад) с наградой за неделю впереди; индекс роста месяца; зал славы из 6 рекордов; карточка «до и после» 9:16 на устройстве; модуль финансов (категории, ручной ввод, Wallet по правилам магазинов, лимиты месяца, бюджетные проверки недели и месяца, накопления, импорт CSV-выписки, аналитика); продвинутые классы с испытанием 14 дней и второй способностью; финал сезона (карточка и разбор); итоги месяца для точки решения 31 января. Критерий [P§8]: «первая месячная карточка».

**Architecture:** журнал событий — единственный источник правды. Новые чистые модули `finance.ts`, `csvImport.ts`, `rival.ts`, `advanced.ts`, `card.ts` без знания о журнале; `replay` вызывает их в существующем цикле по датам (закрытие дня / воскресенья / последнего дня месяца). Рисование карточки — `src/ui/cardCanvas.ts` по списку операций из `card.ts`. Числа — в `BALANCE`. Новые награды действуют с `BALANCE.rivalSince`.

**Tech Stack:** React 18 + Vite + TypeScript strict, Dexie, vitest. Новых зависимостей нет (CSV и PNG — свои 100 строк и `<canvas>`). Worker и миграции D1 не меняются.

**Spec:** `docs/superpowers/specs/2026-11-22-life-rpg-v2-rival-finance-design.md` (дальше «спека §N»). Конвенции и помощники тестов — план и тесты «Глубины» (`replayDepth.test.ts`: `ev`, `at`, `nq`, `issue`, `done`, `span`, `doneDays`, `onb`).

---

## Global Constraints

- `replay` — чистая, порядок событий не влияет, ни одно событие не бросает; новые события (`fin_*`, `advanced_*`, новые `ability_used`) валидируются полями, неверное отбрасывается.
- Монотонность: вердикты недели — при закрытии воскресенья, месяца — при закрытии последнего дня месяца, дня — при закрытии дня; в вердикт идут только события с `ts < closesAt` (как данные дня).
- До `BALANCE.rivalSince` новые награды (призрак, рекорды, бюджет, продвинутые классы) не меняют XP/золото. Существующие тесты остаются зелёными без правок чисел; `replayDepth.test.ts` не трогаем.
- Бонусы под общим потолком +100%; `mult` («Рекорд», «Союз», «Сбор», Магнат ×2,5) — вне потолков, как «Рывок».
- **Приватность (репозиторий публичный):** в коде, тестах и фикстурах — только обобщённые категории и вымышленные строки («Магазин 1», 100,00); никаких банков, городов, сумм владельца. Финансовые данные (суммы, категории, магазины, заметки, строки выписки, бюджетные вердикты) **никогда** не попадают во вход ИИ (`reportInput`, `questContext`, `aiTuning`, `seasonInput`) и на карточку 9:16. CSV-файл не сохраняется и не отправляется.
- Ни одного числа баланса вне `BALANCE`; каталоги (категории, рекорды, продвинутые классы) — данные в одном месте.
- Интерфейс по-русски, «стеклянная ночь» (токены `:root`, `lucide-react`, цели ≥ 44 px, `aria-*`, `prefers-reduced-motion`), листы через `useDialog`, запись через `useWrite`.
- После каждой задачи: `npx vitest run` и `npm run build` зелёные.
- Коммиты conventional, последняя строка `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

| # | Класс входа | Что может сломаться | Тесты (задача) |
|---|---|---|---|
| 1 | Недоверенные `fin_*` и CSV: `amount` NaN/∞/0/1e12/строка, `date` «2026-02-31», текст 10 КБ с управляющими, 5 000+ строк, неизвестная категория, BOM, `;`/`,`/таб, кавычки с переводом строки, «1 234,50 €», «(300,00)», «12.01.27» | исключение, NaN в суммах, раздутый журнал | T1 `parseAmount`/категория по умолчанию; T2 таблицы `parseMoney`, `parseDate`, `parseCsv`; T3 «мусорный fin_entry_added — игнор», «1001 строка — первые 1000» |
| 2 | Дубли и идемпотентность: повторный импорт того же файла, две одинаковые покупки в день, Wallet пришёл после импорта, Wallet на день раньше, возврат Wallet, удалённый импорт | двойной учёт трат, ложный «в лимите»/«не в лимите» | T2 `rowKey` с номером повтора, `matchWallet` ±1 день жадно; T3 «повторный импорт — 0 новых», «порядок событий не важен», «fin_import_removed — суммы назад» |
| 3 | Время и границы: лимит поднят 30-го, импорт после закрытия месяца, неделя на стыке месяцев, призрак 31→28 и декабрь без призрака, первый рекорд, рекорд серии каждый день, `rivalSince`, испытание через дни отдыха | меняется прошлое, двойная награда, бесплатный XP | T1 `limitFor`, `weekLimit`; T3 «лимит поднят в месяце — вердикт по старому», «поздний импорт — награда та же»; T4 `prevMonthSameDay`, `recordStep`, `streakRecord`; T5 «первая неделя призрака — 4 января», «до rivalSince — без строк» |
| 4 | Фарм и наложение: +1 шаг в день ради рекорда, строка призрака в своём же счёте, «Рекорд» × «Вернуть форму» × Магнат, «Инвестиция» без золота, Чемпион + рекорд, повтор второй способности за неделю, испытание чужого пути | бесплатный XP/золото | T5 «один record-ряд на рекорд в день»; T6 `advancedBonuses` под потолком; T7 «Инвестиция без золота — игнор», «вторая способность дважды за неделю — одна», «путь чужого класса — игнор» |
| 5 | Приватность: магазины, заметки, строки выписки, суммы, категории в ИИ и на карточке; финансовые поля в разборе сезона | утечка в ИИ/сторис | T5 «seasonInput/reportInput без finance»; T9 «cardOps без сумм и магазинов»; T8 «questContext без finance» |

---

### Task 1: `BALANCE` и модуль финансов (чистое)

**Files:** Modify `src/domain/balance.ts`, `src/domain/types.ts`. Create `src/domain/finance.ts`, `src/domain/finance.test.ts`.

**Interfaces — produces:**
- `balance.ts`: `rivalSince`, блоки `rival`, `finance`, `advanced` (спека §12).
- `types.ts`: `FinKind`, события `fin_category_set | fin_entry_added | fin_entry_edited | fin_rule_set | fin_imported | fin_import_removed` (спека §7.1), `ImportRow`, `FinPeriod`, `GameState.finance` (спека §7.7).
- `finance.ts`:
  - `DEFAULT_CATEGORIES: { id: string; title: string; kind: FinKind }[]` — 14 обобщённых (спека §7.2), id `default:<slug>`; `otherOf(kind: FinKind): string` → `'default:other' | 'default:income_other' | 'default:piggy'`
  - `normText(s: string): string` — нижний регистр, `ё→е`, пробелы схлопнуты, без управляющих
  - `matchRule(text: string, rules: { pattern: string; categoryId: string; ts: number }[]): string | null` — самый длинный шаблон, ничья — больший `ts`
  - `limitFor(sets: { month: string; limit: number | null }[], month: string): number | null` — `sets` в порядке `ts`; последнее с `month < M`, иначе первое с `month === M`, иначе `null`
  - `weekLimit(limitOf: (month: string) => number | null, weekStart: ISODate): number | null` — Σ по 7 дням `limit / daysInMonth`, 2 знака; `null`, если у всех дней нет лимита
  - `periodTotals(entries: { date: ISODate; kind: FinKind; amount: number; categoryId: string; dup: boolean }[], from: ISODate, to: ISODate): { income: number; expense: number; saving: number; loggedDays: number; byCat: Record<string, number> }` — дубли пропускаются, категория не ниже 0, суммы до копейки
  - `budgetVerdict(byCat: Record<string, number>, limits: Record<string, number | null>, loggedDays: number, minDays: number): boolean | null` — `null`, если ни одного лимита
  - `validAmount(x: unknown): number | null` — конечное, `0 < |x| ≤ amountMax`, округление до 0,01

- [ ] **Тест (падает):**
  ```ts
  test('правила магазинов: самый длинный шаблон, ничья — позднее', () => {
    const r = [{ pattern: 'магазин', categoryId: 'a', ts: 1 }, { pattern: 'магазин 1', categoryId: 'b', ts: 2 }, { pattern: 'кафе', categoryId: 'c', ts: 3 }, { pattern: 'кафе', categoryId: 'd', ts: 4 }];
    expect(matchRule('ОПЛАТА  МАГАЗИН 1 г. Город', r)).toBe('b');
    expect(matchRule('Кафе Ёлка', r)).toBe('d');
    expect(matchRule('Такси', r)).toBeNull();
    expect(normText(' Ёж\u0007  Кот ')).toBe('еж кот');
  });
  test('лимит месяца: середину месяца не спасти, первый лимит — сразу', () => {
    expect(limitFor([{ month: '2027-01', limit: 1000 }, { month: '2027-02', limit: 5000 }], '2027-02')).toBe(1000);
    expect(limitFor([{ month: '2027-02', limit: 1000 }, { month: '2027-02', limit: 9000 }], '2027-02')).toBe(1000);
    expect(limitFor([{ month: '2027-01', limit: 1000 }, { month: '2027-01', limit: null }], '2027-02')).toBeNull();
    expect(limitFor([], '2027-02')).toBeNull();
  });
  test('лимит недели на стыке месяцев — пропорция по дням', () => {
    // пн 2027-01-25 … вс 2027-01-31 — все в январе: 3100 × 7 / 31 = 700
    expect(weekLimit(m => (m === '2027-01' ? 3100 : null), '2027-01-25')).toBe(700);
    // пн 2027-02-22 … вс 2027-02-28 — февраль 2800/28 = 100 в день
    expect(weekLimit(m => (m === '2027-02' ? 2800 : null), '2027-02-22')).toBe(700);
    // пн 2027-03-29 … вс 2027-04-04: 3 дня марта (3100/31) + 4 дня апреля без лимита
    expect(weekLimit(m => (m === '2027-03' ? 3100 : null), '2027-03-29')).toBe(300);
    expect(weekLimit(() => null, '2027-03-29')).toBeNull();
  });
  test('суммы периода: дубли и возвраты, категория не ниже 0, дни учёта', () => {
    const e = (date: string, kind: FinKind, amount: number, categoryId = 'food', dup = false) => ({ date, kind, amount, categoryId, dup });
    const t = periodTotals([e('2027-01-04', 'expense', 100.1), e('2027-01-04', 'expense', 0.2), e('2027-01-05', 'expense', 50, 'food', true),
      e('2027-01-06', 'expense', -500, 'fun'), e('2027-01-06', 'income', 1000), e('2027-01-07', 'saving', 300), e('2027-02-01', 'expense', 9)], '2027-01-04', '2027-01-10');
    expect(t).toEqual({ income: 1000, expense: 100.3, saving: 300, loggedDays: 2, byCat: { food: 100.3, fun: 0 } });
  });
  test('вердикт: учёт активен и все лимиты соблюдены; без лимитов — null', () => {
    expect(budgetVerdict({ food: 700, fun: 10 }, { food: 700, fun: null }, 3, 3)).toBe(true);
    expect(budgetVerdict({ food: 700.01 }, { food: 700 }, 7, 3)).toBe(false);
    expect(budgetVerdict({ food: 1 }, { food: 700 }, 2, 3)).toBe(false);
    expect(budgetVerdict({ food: 1 }, { food: null }, 7, 3)).toBeNull();
  });
  test('сумма — граница доверия', () => {
    expect([NaN, Infinity, 0, 1e9, '100', null].map(validAmount)).toEqual([null, null, null, null, null, null]);
    expect(validAmount(100.005)).toBe(100.01); expect(validAmount(-300)).toBe(-300);
    expect(DEFAULT_CATEGORIES).toHaveLength(14); expect(otherOf('expense')).toBe('default:other');
  });
  ```
- [ ] `npx vitest run src/domain/finance.test.ts` — FAIL.
- [ ] Реализовать. Суммы — через целые копейки (`Math.round(x * 100)`), без хвостов float.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(finance): categories, rules, limits, period totals`.

### Task 2: Разбор CSV-выписки (чистое)

**Files:** Create `src/domain/csvImport.ts`, `src/domain/csvImport.test.ts`.

**Interfaces — consumes:** T1 (`normText`, `validAmount`). **Produces:**
- `parseCsv(text: string): string[][]` — BOM, разделитель по `detectDelimiter`, кавычки с `""` и переводами строк, CRLF; пустые строки пропускаются; не больше `importLinesMax`
- `detectDelimiter(line: string): ',' | ';' | '\t'`
- `interface ColumnMap { date: number; amount: number | null; debit: number | null; credit: number | null; text: number | null }`
- `guessColumns(header: string[]): Partial<ColumnMap>` — словарь заголовков спека §7.6
- `parseDate(s: string): ISODate | null` — `дд.мм.гггг`, `дд.мм.гг` (→ 20гг), `гггг-мм-дд`, `дд/мм/гггг`, хвост времени; несуществующая дата → `null`
- `parseMoney(s: string): number | null` — разряды пробелами/NBSP/апострофом, дробь — последний `.`/`,` с 1–2 цифрами, валюта отбрасывается, `-`/`−`/скобки — минус
- `rowKey(date: ISODate, amount: number, text: string, n: number): string` — FNV-1a, 8 hex
- `toImportRows(rows: string[][], map: ColumnMap, hasHeader: boolean): { rows: ImportRow[]; skipped: { line: number; reason: 'date' | 'amount' }[] }` — `debit` → минус, `credit` → плюс; текст `normText`-безопасный ≤ 60; `n` — номер повтора тройки в файле
- `matchWallet(imports: { id: string; date: ISODate; amount: number }[], wallet: { id: string; date: ISODate; amount: number; ts: number }[], days: number): Set<string>` — id строк-дублей: списание импорта `-a` ↔ Wallet-трата `a`, |Δдат| ≤ days, жадно: ближайшая дата, затем меньший `ts`; одна Wallet — одной строке

- [ ] **Тест (падает):**
  ```ts
  test('деньги', () => {
    const t: [string, number | null][] = [['1 234,50', 1234.5], ['−300', -300], ['(300,00)', -300], ['1,234.56', 1234.56], ['€ 2 500', 2500],
      ["1'000.5", 1000.5], ['-0,5 EUR', -0.5], ['12,345', 12345], ['', null], ['abc', null], ['1e5', null]];
    for (const [s, v] of t) expect(parseMoney(s), s).toBe(v);
  });
  test('даты', () => {
    expect(['12.01.2027', '12.01.27', '2027-01-12', '12/01/2027', '12.01.2027 14:03:00'].map(parseDate)).toEqual(Array(5).fill('2027-01-12'));
    expect(['31.02.2027', '2027-13-01', '', 'вчера'].map(parseDate)).toEqual([null, null, null, null]);
  });
  test('CSV: BOM, «;», кавычки с переводом строки и ""', () => {
    const csv = '﻿Дата;Сумма;Описание\r\n12.01.2027;-1 250,50;"Магазин 1, ""зал""\nвторая строка"\r\n\r\n13.01.2027;5000;Перевод\r\n';
    expect(parseCsv(csv)).toEqual([['Дата', 'Сумма', 'Описание'], ['12.01.2027', '-1 250,50', 'Магазин 1, "зал"\nвторая строка'], ['13.01.2027', '5000', 'Перевод']]);
    expect(detectDelimiter('a,b,c')).toBe(','); expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(guessColumns(['Дата операции', 'Списание', 'Поступление', 'Назначение платежа'])).toEqual({ date: 0, amount: null, debit: 1, credit: 2, text: 3 });
  });
  test('строки импорта: ключ с номером повтора, пропуски с причиной', () => {
    const rows = [['d', 'a', 't'], ['12.01.2027', '-100', 'Магазин 1'], ['12.01.2027', '-100', 'Магазин 1'], ['xx', '-1', 'x'], ['12.01.2027', '', 'x']];
    const r = toImportRows(rows, { date: 0, amount: 1, debit: null, credit: null, text: 2 }, true);
    expect(r.rows.map(x => x.amount)).toEqual([-100, -100]);
    expect(r.rows[0].key).not.toBe(r.rows[1].key);
    expect(r.rows[0].key).toBe(rowKey('2027-01-12', -100, 'магазин 1', 0));
    expect(r.skipped).toEqual([{ line: 4, reason: 'date' }, { line: 5, reason: 'amount' }]);
    expect(toImportRows([['12.01.2027', '1'.repeat(3), 'x'.repeat(500)]], { date: 0, amount: 1, debit: null, credit: null, text: 2 }, false).rows[0].text).toHaveLength(60);
  });
  test('дубли с Wallet: сумма до копейки, ±1 день, жадно, одна Wallet — одной строке', () => {
    const imp = [{ id: 'i1', date: '2027-01-12', amount: -100 }, { id: 'i2', date: '2027-01-12', amount: -100 }, { id: 'i3', date: '2027-01-15', amount: -100 }, { id: 'i4', date: '2027-01-12', amount: 100 }];
    const w = [{ id: 'w1', date: '2027-01-13', amount: 100, ts: 2 }, { id: 'w2', date: '2027-01-12', amount: 100, ts: 1 }];
    expect([...matchWallet(imp, w, 1)].sort()).toEqual(['i1', 'i2']);
    expect(matchWallet([{ id: 'i', date: '2027-01-12', amount: -100.01 }], w, 1).size).toBe(0);
  });
  ```
- [ ] FAIL → реализовать (без зависимостей; `parseCsv` — конечный автомат по символам).
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(finance): on-device CSV statement parser and wallet dedupe`.

### Task 3: Финансы в `replay`, бюджетные проверки, авто-засчёт «Записать траты»

**Files:** Modify `src/domain/replay.ts`, `src/domain/types.ts` (`AutoMetric += 'finEntries'`, `WeeklyKind += 'budget_week'`, `WeeklyCtx += budget?: boolean`, `LedgerEntry.source += 'budget'`), `src/domain/weekly.ts`, `src/domain/questBank.ts` (шаблон `expenses` — `auto: ≥ n` по `finEntries`). Create `src/domain/replayFinance.test.ts`.

**Interfaces — consumes:** T1, T2. **Produces:**
- `GameState.finance` (спека §7.7); `GameState.genWeekly.budget: boolean` (на понедельник есть лимит).
- `signalOf` возвращает `merchant` для Wallet во внутренний финансовый вход (не в `DayData`); запись `wallet:<eventId>`, `amount > 0` — трата, `< 0` — возврат.
- `metric_logged spend add` → запись `legacy:<eventId>` в «Прочее» (суммы старых дней не теряются).
- Категория записи: правка → правило (по правилам, принятым до закрытия периода — для вердиктов) → «Без категории» (= «Прочее»).
- Дубли импорта: `matchWallet` + повтор `key` в более раннем импорте.
- Недельное `budget_week`: прогресс 1 при закрытии воскресенья, если `budgetVerdict(...) === true` по событиям `ts < closesAt(вс)`; строка `weekly:<ws>:<id>` как у остальных недельных.
- Закрытие последнего дня месяца M ≥ `rivalSince`: `budget:month:<M>` (Бюджет, ранг A × проверка) и `budget:save:<M>` (Накопления, ранг C × проверка); проверка `auto`, если ≥ 50% суммы расходов месяца — из Wallet/импорта, иначе `honest`.
- `DayData.finEntries` — число записей расходов дня, принятых до закрытия дня.

- [ ] **Тест (падает):**
  ```ts
  const cat = (categoryId: string, limit: number | null, ts: number) => ev({ type: 'fin_category_set', categoryId, title: 'Еда', kind: 'expense', limit, ts });
  const spend = (date: string, amount: number, categoryId = 'food', h = 12) => ev({ type: 'fin_entry_added', entryId: `m${++seq}`, date, kind: 'expense', amount, categoryId, ts: at(date, h) });
  const wallet = (date: string, amount: number, merchant: string, h = 13) => ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at(date, h), ts: at(date, h), signal: { kind: 'wallet', amount, merchant } });
  const imp = (importId: string, rows: ImportRow[], ts: number) => ev({ type: 'fin_imported', importId, rows, ts });
  const M = '2027-01', R0 = BALANCE.rivalSince;

  test('мусорные события финансов игнорируются', () => {
    const s = replay([ev({ type: 'fin_entry_added', entryId: 'x', date: '2027-01-05', kind: 'expense', amount: NaN, categoryId: 'food' }),
      ev({ type: 'fin_entry_added', entryId: 'y', date: '2027-02-31', kind: 'expense', amount: 10, categoryId: 'food' }),
      ev({ type: 'fin_entry_added', entryId: 'z', date: '2027-01-05', kind: 'gift', amount: 10, categoryId: 'food' }),
      ev({ type: 'fin_imported', importId: 'i', rows: 'oops' })], at('2027-01-06'));
    expect(s.finance.entries).toEqual([]);
  });
  test('неизвестная категория → «Прочее»; Wallet по правилу; возврат уменьшает', () => {
    const s = replay([cat('food', null, at('2026-12-01')), ev({ type: 'fin_rule_set', ruleId: 'r', pattern: 'магазин 1', categoryId: 'food', ts: at('2026-12-01') }),
      spend('2027-01-05', 10, 'nope'), wallet('2027-01-05', 250, 'МАГАЗИН 1'), wallet('2027-01-05', -50, 'Магазин 1')], at('2027-01-05', 22));
    expect(s.finance.month.byCat).toEqual(expect.arrayContaining([{ id: 'default:other', spent: 10, limit: null }, { id: 'food', spent: 200, limit: null }]));
    expect(s.today.data.finEntries).toBe(3);
  });
  test('импорт: повтор файла — без дублей; Wallet ±1 день — дубль; порядок не важен; удаление импорта', () => {
    const rows = [{ key: 'k1', date: '2027-01-05', amount: -250, text: 'магазин 1' }, { key: 'k2', date: '2027-01-05', amount: -40, text: 'такси' }];
    const evs = [wallet('2027-01-06', 250, 'Магазин 1'), imp('a', rows, at('2027-01-08')), imp('b', rows, at('2027-01-09'))];
    const s = replay(evs, at('2027-01-10'));
    expect(s.finance.month.expense).toBe(290);
    expect(replay([...evs].reverse(), at('2027-01-10')).finance.month.expense).toBe(290);
    expect(s.finance.entries.filter(e => e.dup)).toHaveLength(3);   // import a k1 (Wallet) + b k1, b k2 (повтор ключа)
    expect(replay([...evs, ev({ type: 'fin_import_removed', importId: 'a', ts: at('2027-01-10') })], at('2027-01-10')).finance.month.expense).toBe(290);   // b становится основным
  });
  test('1001 строка в событии — принимаются первые 1000', () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ key: `k${i}`, date: '2027-01-05', amount: -1, text: 'x' }));
    expect(replay([imp('a', rows, at('2027-01-06'))], at('2027-01-07')).finance.month.expense).toBe(1000);
  });
  test('месяц в лимите: лимит поднят в месяце — вердикт по старому; поздний импорт награду не меняет', () => {
    const base = [onb(rating('fin', 'int')), cat('food', 1000, at('2026-12-20')), ...span(`${M}-01`, 15).map(d => spend(d, 70)), cat('food', 9999, at(`${M}-30`))];
    const s = replay(base, at('2027-02-01', 12));
    expect(s.ledger.find(r => r.id === `budget:month:${M}`)).toBeUndefined();   // 1050 > 1000
    const ok = [onb(rating('fin', 'int')), cat('food', 1100, at('2026-12-20')), ...span(`${M}-01`, 15).map(d => spend(d, 70))];
    const s2 = replay(ok, at('2027-02-01', 12));
    expect(s2.ledger.find(r => r.id === `budget:month:${M}`)).toMatchObject({ xp: 140, skills: [['budget', 140]], source: 'budget' });
    const late = replay([...ok, imp('z', [{ key: 'k', date: `${M}-20`, amount: -5000, text: 'x' }], at('2027-02-01', 10))], at('2027-02-01', 12));
    expect(late.ledger.find(r => r.id === `budget:month:${M}`)?.xp).toBe(140);
    expect(late.finance.months[0]).toMatchObject({ month: M, expense: 6050 });
  });
  test('учёт неактивен (< 15 дней) — не в лимите; «10% дохода» — 49 XP', () => {
    const evs = [onb(rating('fin', 'int')), cat('food', 1000, at('2026-12-20')), ...span(`${M}-01`, 14).map(d => spend(d, 1)),
      ev({ type: 'fin_entry_added', entryId: 'inc', date: `${M}-10`, kind: 'income', amount: 1000, categoryId: 'default:salary', ts: at(`${M}-10`) }),
      ev({ type: 'fin_entry_added', entryId: 'sav', date: `${M}-11`, kind: 'saving', amount: 100, categoryId: 'default:piggy', ts: at(`${M}-11`) })];
    const s = replay(evs, at('2027-02-01', 12));
    expect(s.ledger.find(r => r.id === `budget:month:${M}`)).toBeUndefined();
    expect(s.ledger.find(r => r.id === `budget:save:${M}`)).toMatchObject({ xp: 49, skills: [['savings', 49]] });
  });
  test('неделя в лимите — третье недельное; решается в воскресенье', () => {
    const ws = '2027-01-11';
    const wk = generateWeeklyQuests({ weekStart: ws, stats: { str: 5, end: 5, int: 5, dis: 5, cha: 5, fin: 5, spi: 5 }, multipliers: {} as any, prevActiveDays: 3, prevStatQuests: 3, bestSteps7: 8000, themeStat: null, budget: true });
    expect(wk.map(w => w.kind)).toEqual(['active_days', 'stat_quests', 'budget_week']);
    const evs = [cat('food', 3100, at('2026-12-20')), ev({ type: 'weekly_issued', weekStart: ws, quests: wk, ts: at(ws, 8) }), ...span(ws, 3).map(d => spend(d, 200))];
    expect(replay(evs, at('2027-01-17', 12)).weekly.quests[2].done).toBe(false);   // до закрытия воскресенья
    expect(replay(evs, at('2027-01-18', 12)).ledger.some(r => r.id === `weekly:${ws}:${wk[2].id}`)).toBe(true);   // 600 ≤ 700, 3 дня учёта
  });
  test('до rivalSince — без бюджетных строк', () => {
    const m = R0.slice(0, 7), prev = `${addDays(`${m}-01`, -1).slice(0, 7)}`;
    const evs = [cat('food', 1e6, at(addDays(`${prev}-01`, -40))), ...span(`${prev}-01`, 28).map(d => spend(d, 1))];
    expect(replay(evs, at(R0)).ledger.filter(r => r.source === 'budget')).toEqual([]);
  });
  ```
  (Даты января 2027 — после `rivalSince` по умолчанию; при иной дате релиза тесты сдвигаются от `BALANCE.rivalSince`, как в `replayDepth.test.ts`.)
- [ ] FAIL → реализовать. Финансы собираются отдельным проходом после чтения событий; вердикты — в цикле дней на закрытии воскресенья/последнего дня месяца по срезу `ts < closesAt`.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(finance): ledger of spending, wallet rules, import dedupe, budget checks`.

### Task 4: Соперник — призрак, индекс, рекорды, итоги месяца (чистое)

**Files:** Create `src/domain/rival.ts`, `src/domain/rival.test.ts`.

**Interfaces — consumes:** `BALANCE.rival`. **Produces:**
- `prevMonthSameDay(d: ISODate): ISODate | null` — `2027-03-31 → null`, `2027-03-28 → 2027-02-28`, `2027-01-05 → 2026-12-05`
- `ghostAt(x: (d: ISODate) => number, d: ISODate, has: (d: ISODate) => boolean): { available: boolean; you: number; ghost: number; lead: number }` — суммы с 1-го числа месяца по d; `available = has(d)`
- `ghostWeek(x: (d: ISODate) => number, weekStart: ISODate, has: (d: ISODate) => boolean): { you: number; ghost: number } | null` — `null`, если хоть у одного дня нет призрака
- `growthIndex(cur: { xp: number; days: number }, prev: { xp: number; days: number } | null): { index: number | null; xpPerDay: number; base: 'prev' | 'base' }`
- `type RecordId = 'streak' | 'steps_day' | 'week_xp' | 'pages_week' | 'focus_day' | 'savings_month'`; `RECORDS: { id: RecordId; title: string; unit: string }[]`
- `recordStep(best: number | null, value: number | null): { best: number | null; beaten: boolean }`
- `streakRecord(s: { best: number; armed: boolean }, streak: number): { best: number; armed: boolean; beaten: boolean }` — `armed` снова `true`, когда серия упала ниже прошлого рекорда до начала новой
- `monthReview(i: { days: number; opened: number; issued: number; done: number; shifts: ('ladder' | 'saving' | 'base' | 'skill')[] }): { opened: boolean; completion: boolean; shift: boolean; pass: boolean; share: number }`

- [ ] **Тест (падает):**
  ```ts
  test('день-призрак: тот же день прошлого месяца, несуществующий — нет', () => {
    expect(prevMonthSameDay('2027-01-05')).toBe('2026-12-05');
    expect(prevMonthSameDay('2027-03-28')).toBe('2027-02-28');
    expect(prevMonthSameDay('2027-03-29')).toBeNull(); expect(prevMonthSameDay('2027-03-31')).toBeNull();
  });
  test('призрак: «впереди на 340 XP» [P§5]', () => {
    const xp: Record<string, number> = { '2026-12-01': 200, '2026-12-02': 100, '2027-01-01': 300, '2027-01-02': 340 };
    const x = (d: string) => xp[d] ?? 0, has = (d: string) => d >= '2027-01-01';
    expect(ghostAt(x, '2027-01-02', has)).toEqual({ available: true, you: 640, ghost: 300, lead: 340 });
    expect(ghostAt(x, '2026-12-02', has).available).toBe(false);
    expect(ghostWeek(x, '2026-12-28', has)).toBeNull();   // 28–31 декабря без призрака
    expect(ghostWeek(x, '2027-01-04', has)).toEqual({ you: 0, ghost: 0 });
  });
  test('индекс роста [P§5]: по дню, база 150 при < 14 днях прошлого', () => {
    expect(growthIndex({ xp: 6000, days: 30 }, { xp: 5000, days: 30 })).toEqual({ index: 120, xpPerDay: 200, base: 'prev' });
    expect(growthIndex({ xp: 4800, days: 24 }, { xp: 6200, days: 31 })).toEqual({ index: 100, xpPerDay: 200, base: 'prev' });   // 6 дней восстановления не штрафуют
    expect(growthIndex({ xp: 4650, days: 31 }, { xp: 1300, days: 13 })).toEqual({ index: 100, xpPerDay: 150, base: 'base' });
    expect(growthIndex({ xp: 0, days: 0 }, null).index).toBeNull();
  });
  test('рекорды: первое значение без награды, строго больше', () => {
    expect(recordStep(null, 8000)).toEqual({ best: 8000, beaten: false });
    expect(recordStep(0, 5)).toEqual({ best: 5, beaten: false });
    expect(recordStep(8000, 8000)).toEqual({ best: 8000, beaten: false });
    expect(recordStep(8000, 8001)).toEqual({ best: 8001, beaten: true });
    expect(recordStep(8000, null)).toEqual({ best: 8000, beaten: false });
    expect(RECORDS.map(r => r.id)).toEqual(['streak', 'steps_day', 'week_xp', 'pages_week', 'focus_day', 'savings_month']);
  });
  test('рекорд серии — раз за серию', () => {
    let s = { best: 10, armed: true };
    const seen = [9, 10, 11, 12, 13, 0, 5, 14].map(v => { const r = streakRecord(s, v); s = { best: r.best, armed: r.armed }; return r.beaten; });
    expect(seen).toEqual([false, false, true, false, false, false, false, true]);
    expect(s.best).toBe(14);
  });
  test('итоги месяца [P§8]: 25/31, 60%, хоть один сдвиг', () => {
    expect(monthReview({ days: 31, opened: 25, issued: 100, done: 60, shifts: ['saving'] })).toMatchObject({ opened: true, completion: true, shift: true, pass: true });
    expect(monthReview({ days: 31, opened: 24, issued: 100, done: 90, shifts: ['ladder'] }).pass).toBe(false);
    expect(monthReview({ days: 28, opened: 23, issued: 0, done: 0, shifts: [] })).toMatchObject({ opened: true, completion: false, shift: false });   // 23 ≥ 28 × 25/31
  });
  ```
- [ ] FAIL → реализовать.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(rival): ghost, growth index, records, month review`.

### Task 5: Соперник в `replay` + финал сезона (вход разбора)

**Files:** Modify `src/domain/replay.ts`, `src/domain/types.ts` (`GameState += ghost, growth, records, avatarHistory, activity, seasonReviews`; `LedgerEntry.source += 'ghost' | 'record'`; `ai_report += scope?: 'season'`), `src/domain/masterReport.ts`. Create `src/domain/replayRival.test.ts`.

**Interfaces — consumes:** T3, T4. **Produces:**
- `x(d)` — XP строк леджера даты d; `has(d)` — `seasonOf(первое число прошлого месяца d).kind !== 'prologue'`.
- `GameState.ghost` (спека §3.3); строка `ghost:<ws>` `+50 XP` при закрытии воскресенья ≥ `rivalSince`, если `ghostWeek` не `null` и `you > ghost`.
- `GameState.growth` (спека §4): рабочие дни — закрытые и не замороженные.
- `GameState.records` (спека §5): `record:<id>:<date>` `+100 XP` (Чемпион — +200, T7) только за `beaten` и дату ≥ `rivalSince`; шаги — `plausibleSteps` без флага; страницы дня ≤ 500; фокус ≤ 960; накопления — `finance` месяца.
- `GameState.avatarHistory: { date: ISODate; tier: 1|2|3|4; blob: string }[]`; `GameState.activity: { opened: ISODate[] }` — даты событий с `deviceId !== 'shortcuts'` за 400 дней.
- `ai_report` с `scope: 'season'` → `GameState.seasonReviews: { seasonId: string; text: string }[]`, не в `reports` (1 марта — понедельник, иначе столкнулся бы с отчётом недели).
- `masterReport.ts`: `seasonInput(state: GameState, seasonId: string): SeasonInput` (белый список спека §9), `seasonReviewByRules(i: SeasonInput): string` (3 раздела ≤ 1 500 символов).

- [ ] **Тест (падает):**
  ```ts
  test('первая награда призрака — неделя 4–10 января; строка одна', () => {
    const evs = [onb(rating('int', 'spi')), ...doneDays('2026-12-01', 41, 'reading', 'C')];   // 1 дек — 10 янв
    const s = replay(evs, at('2027-01-11', 12));
    expect(s.ledger.filter(r => r.source === 'ghost').map(r => r.id)).toEqual(['ghost:2027-01-04']);   // январь > декабря за счёт серии
    expect(s.ghost).toMatchObject({ available: true, weeksWon: 1 });
    expect(replay(evs, at('2026-12-20')).ghost.available).toBe(false);
  });
  test('рекорд шагов: первый без награды, побит — +100 один раз в день; флаг — не рекорд', () => {
    const steps = (date: string, n: number, h = 13) => ev({ type: 'health_packet', date, kind: 'other', health: { steps: n }, calendar: [], ts: at(date, h) });
    const d = '2027-01-05';
    const s = replay([onb(rating('end', 'str')), ...doneDays('2027-01-03', 4, 'cardio'), steps('2027-01-03', 9000), steps('2027-01-04', 9500),
      steps(d, 9600), steps(d, 9700, 18), steps('2027-01-06', 60000)], at('2027-01-07', 12));
    expect(s.ledger.filter(r => r.source === 'record').map(r => r.id)).toEqual(['record:steps_day:2027-01-04', `record:steps_day:${d}`]);
    expect(s.records.find(r => r.id === 'steps_day')).toMatchObject({ value: 9700, date: d, prev: 9500 });
  });
  test('индекс роста: декабрь против базы 150, январь против декабря', () => {
    const s = replay([onb(rating('int', 'spi')), ...doneDays('2026-12-01', 62, 'reading', 'C')], at('2027-02-01', 12));
    expect(s.growth.months.map(m => [m.month, m.index !== null])).toEqual([['2027-01', true], ['2026-12', true]]);
    expect(s.growth.months[1].index).toBe(Math.round(100 * s.growth.months[1].xpPerDay / 150));
  });
  test('дни открытия — без событий Shortcuts; разбор сезона отдельно от отчётов недели', () => {
    const s = replay([ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at('2027-01-05'), ts: at('2027-01-05'), signal: { kind: 'focus', state: 'on' } }),
      ev({ type: 'checkin', date: '2027-01-06', went: '', notWent: '', energy: 5, ts: at('2027-01-06', 21) }),
      ev({ type: 'ai_report', weekStart: '2026-12-01', text: 'сезон', final: true, scope: 'season', ts: at('2027-03-01') })], at('2027-03-02'));   // weekStart — начало разобранного сезона
    expect(s.activity.opened).toEqual(['2027-01-06', '2027-03-01']);
    expect(s.reports).toEqual([]); expect(s.seasonReviews).toEqual([{ seasonId: seasonOf('2026-12-01').id, text: 'сезон' }]);
  });
  test('приватность: вход разбора сезона и недели без финансов', () => {
    const s = replay([onb(rating('fin', 'int')), ...doneDays('2026-12-01', 10, 'budget'),
      ev({ type: 'fin_entry_added', entryId: 'e', date: '2026-12-03', kind: 'expense', amount: 4321, categoryId: 'food', note: 'СекретнаяЗаметка' }),
      ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at('2026-12-04'), ts: at('2026-12-04'), signal: { kind: 'wallet', amount: 777, merchant: 'СекретМагазин' } })], at('2026-12-12'));
    for (const j of [JSON.stringify(seasonInput(s, s.season.id)), JSON.stringify(reportInput(s, '2026-12-07'))])
      for (const x of ['4321', '777', 'СекретнаяЗаметка', 'СекретМагазин', 'food', 'finance', 'budget:']) expect(j).not.toContain(x);
    expect(seasonReviewByRules(seasonInput(s, s.season.id))).toContain('Что взять в следующий сезон');
  });
  test('до rivalSince — без строк ghost/record', () => {
    const s = replay([onb(rating('int', 'spi')), ...doneDays(addDays(BALANCE.rivalSince, -40), 39, 'reading')], at(addDays(BALANCE.rivalSince, -1)));
    expect(s.ledger.filter(r => r.source === 'ghost' || r.source === 'record')).toEqual([]);
  });
  ```
- [ ] FAIL → реализовать.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(rival): ghost weeks, hall of fame, growth index in replay; season review input`.

### Task 6: Продвинутые классы (чистое)

**Files:** Create `src/domain/advanced.ts`, `src/domain/advanced.test.ts`. Modify `src/domain/types.ts` (`AdvancedId`, `AbilityId2`, события `advanced_trial_started { date; classId }`, `advanced_trial_abandoned { date }`, `advanced_path_switched { date; classId }`; `ability_used.ability: AbilityId | AbilityId2`, поля `skill?: SkillId; facetId?: string`).

**Interfaces — consumes:** `classes.ts`, `BALANCE.advanced`. **Produces:**
- `type AdvancedId = 'champion' | 'guard' | 'crusader' | 'keeper' | 'archmage' | 'hermit' | 'architect' | 'treasurer' | 'magnate' | 'diplomat' | 'leader' | 'storyteller' | 'rover' | 'ascetic' | 'harmony'`
- `type AbilityId2 = 'record' | 'bastion' | 'vow' | 'wall' | 'explore' | 'silence' | 'blueprint' | 'audit' | 'invest' | 'alliance' | 'gather' | 'saga' | 'expedition' | 'fast' | 'balance'`
- `type Mech = 'quest_mult' | 'day_mult' | 'guard' | 'pledge' | 'invest' | 'chain' | 'card'`
- `ADVANCED: Record<AdvancedId, { name: string; from: ClassId; focus: readonly SkillId[] | 'all'; passive: string; ability: AbilityId2; abilityName: string; abilityDesc: string; mech: Mech; k: number; days: number }>` (спека §8.3)
- `pathsOf(base: ClassId): AdvancedId[]` — Странник → `['harmony']`, иначе 2
- `trialOpen(i: { level: number; date: ISODate; firstDay: ISODate | null; lastFail: ISODate | null; active: boolean; base: ClassId; classId: AdvancedId }): boolean`
- `trialStep(t: { day: number; counted: number; focusDone: number }, d: { frozen: boolean; counted: boolean; focusDone: number }): { day: number; counted: number; focusDone: number; result: 'pass' | 'fail' | null }` — замороженный день не считается
- `advancedBonuses(id: AdvancedId, q: { skills: readonly SkillId[]; stat: Stat; verify: Verify }, power: 0 | 0.5 | 1): { xp: number; gold: number; mult: number }` — доп. пассив; Магнат — `mult 2.5` для главного навыка `earning` и `verify ≠ 'honest'`
- `pledgeReward(rankBase: number, days: number, k: number): number` — `rankBase × days × (k − 1)`

- [ ] **Тест (падает):**
  ```ts
  test('каталог: 15 классов, по 2 пути у базовых, 1 у Странника, соло-способности [P§3]', () => {
    expect(Object.keys(ADVANCED)).toHaveLength(15);
    for (const b of ['warrior', 'paladin', 'sage', 'strategist', 'merchant', 'bard', 'ranger'] as ClassId[]) expect(pathsOf(b)).toHaveLength(2);
    expect(pathsOf('wanderer')).toEqual(['harmony']);
    expect(ADVANCED.keeper).toMatchObject({ ability: 'wall', mech: 'guard', days: 3 });
    expect(ADVANCED.leader).toMatchObject({ ability: 'gather', mech: 'quest_mult', k: 2 });
    expect(ADVANCED.diplomat).toMatchObject({ ability: 'alliance', mech: 'quest_mult', k: 2 });
    expect(ADVANCED.treasurer.mech).toBe('day_mult');   // «Аудит» без ИИ
  });
  test('доступ: уровень 20, 15-й день, 7 дней после провала, только свой путь', () => {
    const i = { level: 20, date: '2027-01-15', firstDay: '2027-01-01', lastFail: null, active: false, base: 'warrior' as ClassId, classId: 'champion' as AdvancedId };
    expect(trialOpen(i)).toBe(true);
    expect(trialOpen({ ...i, level: 19 })).toBe(false);
    expect(trialOpen({ ...i, date: '2027-01-14' })).toBe(false);
    expect(trialOpen({ ...i, lastFail: '2027-01-09' })).toBe(false); expect(trialOpen({ ...i, lastFail: '2027-01-08' })).toBe(true);
    expect(trialOpen({ ...i, classId: 'hermit' })).toBe(false); expect(trialOpen({ ...i, active: true })).toBe(false);
  });
  test('испытание: 10 засчитанных из 14 и 8 заданий фокуса; отдых продлевает окно', () => {
    let t = { day: 0, counted: 0, focusDone: 0 }, r: ReturnType<typeof trialStep> | null = null;
    for (let i = 0; i < 14; i++) { r = trialStep(t, { frozen: i === 3, counted: i < 11, focusDone: 1 }); t = r; }
    expect(r).toMatchObject({ day: 13, result: null });
    r = trialStep(t, { frozen: false, counted: true, focusDone: 0 });
    expect(r).toMatchObject({ day: 14, counted: 11, focusDone: 13, result: 'pass' });
    expect(trialStep({ day: 13, counted: 9, focusDone: 20 }, { frozen: false, counted: false, focusDone: 0 }).result).toBe('fail');
    expect(trialStep({ day: 13, counted: 12, focusDone: 7 }, { frozen: false, counted: true, focusDone: 0 }).result).toBe('fail');
  });
  test('доп. пассивы и Магнат', () => {
    expect(advancedBonuses('diplomat', { skills: ['social'], stat: 'cha', verify: 'honest' }, 1)).toEqual({ xp: 0.2, gold: 0, mult: 1 });
    expect(advancedBonuses('treasurer', { skills: ['reading'], stat: 'int', verify: 'auto' }, 0.5)).toEqual({ xp: 0, gold: 0.075, mult: 1 });
    expect(advancedBonuses('magnate', { skills: ['earning'], stat: 'fin', verify: 'photo' }, 1).mult).toBe(2.5);
    expect(advancedBonuses('magnate', { skills: ['earning'], stat: 'fin', verify: 'honest' }, 1).mult).toBe(1);
    expect(pledgeReward(70, 7, 2)).toBe(490); expect(pledgeReward(70, 3, 3)).toBe(420);
  });
  ```
- [ ] FAIL → реализовать.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(classes): advanced class catalogue and trial rules`.

### Task 7: Продвинутые классы в `replay`

**Files:** Modify `src/domain/replay.ts`, `src/domain/classes.ts` (пассив базового × `passiveMult` при продвинутом; Крестоносец — `perDay 0.03`, потолок `0.6`), `src/domain/types.ts` (`ClassState += advanced, trial, trialOptions, nextTrial`; `today.ability += pledges, guard, dayMult`; `LedgerEntry.source += 'ability' | 'invest'`). Create `src/domain/replayAdvanced.test.ts`.

**Interfaces — consumes:** T5, T6. **Produces (спека §8):**
- Испытание по событиям (валидация: `date === gd(ts)`, ≥ `rivalSince`, `trialOpen`); итог при закрытии 14-го незамороженного дня; во время испытания базовый класс 1-го числа не пересчитывается.
- Фиксация до `season.end`; `advanced_path_switched` — в первые 7 дней сезона, путь того же базового; базовый сменился → продвинутый снимается 1-го дня нового сезона.
- Вторая способность: свой недельный счётчик `${ws}|${ability}`; механики `quest_mult` (как «Рывок»), `day_mult` (строка `ability:<id>:<date>` при закрытии дня), `guard` (Стена — день как заморозка серии и окна лестниц; Бастион — короткая ночь 0), `pledge` (строка при закрытии N-го дня), `invest` (платная трата в очереди трат; `invest:<date>` +450 при доле недели ≥ 0,7), `chain` (финал цепочки ×2), `card` (только отметка).
- Доп. пассивы: бонусы задания через `advancedBonuses`; Страж HP +10 (≤ 100); Хранитель — `freezePerMonth + 1`; Архимаг — XP навыков Интеллекта ×1,15 в `splitXp`; Отшельник — ночной спад Усталости ×2; Аскет — `clean 4`; Архитектор — финал цепочки +20%; Чемпион — `record` +200.

- [ ] **Тест (падает):**
  ```ts
  // уровень 20+: onb + стартовый уровень из анализа анкеты (как в replay.test.ts) — помощник `lvl20()`
  test('испытание Чемпиона: 14 дней → продвинутый со следующего дня до конца сезона', () => {
    const t0 = '2027-01-20';
    const s = replay([...lvl20('str', 'end'), ...doneDays('2026-12-20', 46, 'strength', 'C'),
      ev({ type: 'advanced_trial_started', date: t0, classId: 'champion', ts: at(t0, 9) })], at('2027-02-04', 12));
    expect(s.cls.advanced).toMatchObject({ id: 'champion', since: '2027-02-03', until: '2027-02-28' });   // 14-й день — 2 февраля
    expect(s.cls.trial).toBeNull();
    expect(s.cls.id).toBe('warrior');   // 1 февраля, во время испытания, базовый не пересчитывался
  });
  test('чужой путь, до 15-го дня, повтор раньше 7 дней — игнор', () => {
    const t0 = '2027-01-20';
    const s = replay([...lvl20('str', 'end'), ...doneDays('2027-01-10', 12, 'strength'),
      ev({ type: 'advanced_trial_started', date: t0, classId: 'hermit', ts: at(t0, 9) }),
      ev({ type: 'advanced_trial_started', date: t0, classId: 'champion', ts: at(t0, 10) })], at(t0, 12));
    expect(s.cls.trial).toBeNull();   // первый день 10 янв → открыто с 24-го
  });
  test('«Рекорд» ×3 вне потолков; вторая способность — раз в неделю', () => {
    const d = '2027-02-08';   // после успешного испытания (фикстура `champion()` из теста выше)
    const evs = [...champion(), issue(d, [nq('a', d, 'C', ['strength']), nq('b', d, 'C', ['strength'], { kind: 'restore' })]),
      ev({ type: 'ability_used', date: d, ability: 'record', questId: 'a', ts: at(d, 9) }),
      ev({ type: 'ability_used', date: d, ability: 'record', questId: 'b', ts: at(d, 10) }), done(d, 'a'), done(d, 'b')];
    const s = replay(evs, at(d, 22));
    expect(s.ledger.find(r => r.id === 'quest:a')!.mult).toBe(3);
    expect(s.ledger.find(r => r.id === 'quest:b')!.mult).toBe(2);   // второе применение за неделю отброшено
  });
  test('«Инвестиция» без золота — игнор; с золотом — 450 через 7 дней при доле ≥ 70%', () => {
    const d = '2027-02-08';
    expect(replay([...magnate({ gold: 100 }), ev({ type: 'ability_used', date: d, ability: 'invest', ts: at(d, 9) })], at(d, 12)).cls.advanced!.ability.usedOn).toBeNull();
    const s = replay([...magnate({ gold: 400 }), ev({ type: 'ability_used', date: d, ability: 'invest', ts: at(d, 9) }), ...doneDays(d, 8, 'earning')], at('2027-02-16', 12));
    expect(s.ledger.find(r => r.id === `invest:${d}`)).toMatchObject({ gold: 450, xp: 0 });
  });
  test('«Стена» Хранителя: 3 дня пропуска не роняют серию', () => {
    const d = '2027-02-08';
    const s = replay([...keeper({ streak: 10 }), ev({ type: 'ability_used', date: d, ability: 'wall', ts: at(d, 9) }), ...span(d, 3).map(x => issue(x, [nq(`q${x}`, x, 'E', ['routine'])]))], at('2027-02-11', 12));
    expect(s.streak).toBe(10);
  });
  test('Чемпион: рекорд +200', () => {
    expect(replay(champion({ stepsRecordOn: '2027-02-09' }), at('2027-02-10', 12)).ledger.find(r => r.id === 'record:steps_day:2027-02-09')!.xp).toBe(200);
  });
  ```
  (Фикстуры `lvl20`, `champion`, `magnate`, `keeper` — в шапке файла: профиль, стартовый уровень 20 через `interview_completed.analysis.startLevel`, история заданий фокуса и успешное испытание.)
- [ ] FAIL → реализовать.
- [ ] `npx vitest run`, `npm run build` — PASS. Коммит `feat(classes): advanced classes — trial, fixation, passives, second abilities`.

### Task 8: Интерфейс — финансы

**Files:** Modify `src/screens/Analytics.tsx` (переключатель «Прогресс | Финансы»), `src/screens/QuickInput.tsx` (кнопка «Трата / доход» вместо поля `spend`), `src/screens/Settings.tsx` (валюта), `src/styles.css`. Create `src/screens/Finance.tsx`, `src/screens/FinEntrySheet.tsx`, `src/screens/FinCategories.tsx`, `src/screens/FinImport.tsx`, `src/ui/finView.ts`, `src/ui/finView.test.ts`.

**Interfaces — consumes:** T1–T3. **Produces:**
- `finView.ts`: `money(n: number, cur: string): string` (`1 234,5 €` → `'1 234,50 €'`, неразрывные пробелы); `catTone(spent: number, limit: number | null): 'ok' | 'warn' | 'over' | null`; `pace(spent: number, limit: number, day: number, days: number): number` (процент темпа); `importSummary(rows: ImportRow[], state: GameState): { fresh: number; walletDup: number; seen: number }`; `CURRENCIES = ['₽', '₸', '$', '€', '₴', 'Br']`.
- `FinEntrySheet` — вид (расход/доход/отложить), сумма (`parseAmount` из QuickInput), категория-чипы, дата (сегодня/вчера), заметка ≤ 60 → `fin_entry_added`; правка/удаление → `fin_entry_edited`; при смене категории Wallet/импорта — галочка «Запомнить для …» → `fin_rule_set`.
- `FinCategories` — список, создать/переименовать/лимит/архив (`fin_category_set`), правила магазинов (`fin_rule_set`, удалить — `categoryId: null`).
- `FinImport` — шаги файл → колонки (`guessColumns`, ручной выбор, `csvMapping` в настройках по ключу заголовков) → предпросмотр (`importSummary`, пропуски с причинами) → «Добавить» (`fin_imported` чанками по 1000). Файл > 2 МБ — отказ с текстом. Ничего не уходит в сеть.
- `Finance` — спека §7.8: месяц со стрелками, итоги, категории полосами с `role="progressbar"` и `aria-valuetext` («Еда: 7 000 из 10 000, 70%»), «разобрать N», список записей, график 6 месяцев.

- [ ] **Тест (падает):**
  ```ts
  test('деньги и тон категории', () => {
    expect(money(1234.5, '€')).toBe('1 234,50 €'); expect(money(-300, '₽')).toBe('−300,00 ₽');
    expect([[700, 1000], [800, 1000], [1000, 1000], [1000.01, 1000], [5, null]].map(([s, l]) => catTone(s as number, l))).toEqual(['ok', 'warn', 'warn', 'over', null]);
    expect(pace(500, 3100, 10, 31)).toBe(155);
  });
  test('сводка импорта: новые, дубли Wallet, уже было', () => {
    const st = replay([ev({ type: 'signal_logged', deviceId: 'shortcuts', at: at('2027-01-05'), ts: at('2027-01-05'), signal: { kind: 'wallet', amount: 100, merchant: 'Магазин 1' } }),
      ev({ type: 'fin_imported', importId: 'a', rows: [{ key: 'k1', date: '2027-01-04', amount: -50, text: 'x' }], ts: at('2027-01-06') })], at('2027-01-07'));
    expect(importSummary([{ key: 'k1', date: '2027-01-04', amount: -50, text: 'x' }, { key: 'k2', date: '2027-01-05', amount: -100, text: 'магазин 1' }, { key: 'k3', date: '2027-01-05', amount: -7, text: 'y' }], st))
      .toEqual({ fresh: 1, walletDup: 1, seen: 1 });
  });
  // tasks.test.ts: questContext(state с finance-записями «СекретМагазин» 4321) не содержит «СекретМагазин», «4321», «finance»
  ```
- [ ] FAIL → реализовать.
- [ ] `npx vitest run`, `npm run build` — PASS; ручная проверка на телефоне: трата из Быстрого ввода, лимит категории, импорт файла-примера (вымышленного) дважды — во второй раз «новых 0». Коммит `feat(ui): finance — entries, categories and limits, rules, CSV import, analytics`.

### Task 9: Карточка 9:16 и интерфейс соперника, финал сезона, итоги месяца

**Files:** Create `src/domain/card.ts`, `src/domain/card.test.ts`, `src/ui/cardCanvas.ts`, `src/screens/CardSheet.tsx`, `src/screens/HallOfFame.tsx`, `src/screens/MonthReview.tsx`. Modify `src/ui/saveFile.ts` (+ тест), `src/ui/HeroStage.tsx`, `src/screens/Home.tsx`, `src/screens/Analytics.tsx`, `src/screens/SeasonPath.tsx` (метка сезонного призрака), `src/ai/tasks.ts` (`aiSeasonReview`), `src/styles.css`.

**Interfaces — consumes:** T4, T5. **Produces:**
- `card.ts`: `monthCard(state: GameState, month: string): CardModel | null` (null — в месяце нет закрытых дней с заданиями); `seasonCard(state: GameState, seasonId: string): CardModel | null`; `interface CardModel { kind: 'month' | 'season' | 'week'; title: string; before: { date: ISODate; level: number; avatar: { blob: string } | { params: AvatarParams; tier: 1|2|3|4 } }; after: CardModel['before']; index: number | null; record: { title: string; value: string } | null; gains: { stat: Stat; delta: number }[]; streak: number; step: number | null }`; `cardOps(m: CardModel, w = 1080, h = 1920): CardOp[]` — `{ op: 'rect' | 'text' | 'image' | 'bar'; … }`; `levelAt(state: GameState, date: ISODate): number`.
- `cardCanvas.ts`: `renderCard(ops: CardOp[], images: Record<'before' | 'after', CanvasImageSource | null>): Promise<Blob>` (`canvas.toBlob('image/png')`); SVG-аватар → `Image` через `renderToStaticMarkup`.
- `saveFile.ts`: `saveFile(blob: Blob, name: string): Promise<SaveResult>`; `saveBackup` вызывает его.
- `ai/tasks.ts`: `aiSeasonReview(cfg: AiConfig, state: GameState, seasonId: string): Promise<string>` — только `seasonInput`; ответ → `ai_report { weekStart: season.start, text, final: true, scope: 'season' }`.
- Главная: строка призрака в `versus-card` (спека §11), полупрозрачная фигура у метки на полосе пути, «Призрак появится 1 января» до первого месяца; карточки периода (1–7 числа — месяц; последний день сезона и 7 дней после — сезон с разбором; `decisionDate` и 7 дней после — итоги месяца); показ — `localStorage` в `try/catch`.
- Анализ → Прогресс: индекс роста (крупно + 12 месяцев), `HallOfFame`, список карточек месяцев, «Итоги месяца» (`MonthReview` по `monthReview`).
- Празднование нового рекорда — `Celebration` с текстом «Новый рекорд: …».

- [ ] **Тест (падает):**
  ```ts
  test('модель карточки: уровни и аватар на даты, лучший рекорд месяца', () => {
    const s = stateFixture();   // декабрь с заданиями, avatar_image tier 1 в ноябре и tier 2 20 декабря, рекорд шагов 12 декабря
    const m = monthCard(s, '2026-12')!;
    expect(m.before.date).toBe('2026-11-30'); expect(m.after.date).toBe('2026-12-31');
    expect(m.before.avatar).toEqual({ blob: 'avatar-1' }); expect(m.after.avatar).toEqual({ blob: 'avatar-2' });
    expect(m.after.level).toBe(levelAt(s, '2026-12-31'));
    expect(m.record).toMatchObject({ title: 'Максимум шагов за день' });
    expect(monthCard(s, '2026-06')).toBeNull();
  });
  test('cardOps: 9:16, без сумм и магазинов; рекорд накоплений — без суммы', () => {
    const m = { ...monthCard(stateFixture(), '2026-12')!, record: { title: 'Рекорд накоплений', value: '' } };
    const ops = cardOps(m);
    expect(ops[0]).toMatchObject({ op: 'rect', x: 0, y: 0, w: 1080, h: 1920 });
    const text = ops.filter(o => o.op === 'text').map(o => (o as { text: string }).text).join(' ');
    expect(text).toContain('Индекс роста'); expect(text).not.toMatch(/₽|₸|\$|€|Магазин/);
    for (const o of ops) if ('x' in o) { expect(o.x).toBeGreaterThanOrEqual(0); expect(o.x).toBeLessThanOrEqual(1080); }
  });
  test('saveFile: имя и тип файла', async () => {
    const shared: File[] = [];
    Object.assign(navigator, { canShare: () => true, share: async ({ files }: { files: File[] }) => { shared.push(...files) } });
    expect(await saveFile(new Blob(['x'], { type: 'image/png' }), 'card-2026-12.png')).toBe('shared');
    expect(shared[0]).toMatchObject({ name: 'card-2026-12.png', type: 'image/png' });
  });
  test('строка призрака', () => {
    expect(ghostLine({ available: true, lead: 340 } as GameState['ghost'])).toBe('Ты впереди призрака на 340 XP');
    expect(ghostLine({ available: true, lead: -120 } as GameState['ghost'])).toBe('Отстаёшь от призрака на 120 XP');
    expect(ghostLine({ available: false, lead: 0 } as GameState['ghost'], '2026-12-20')).toBe('Призрак появится 1 января');
  });
  ```
  (`ghostLine(g, today?)` — в `src/ui/statBar.ts`, тест там же.)
- [ ] FAIL → реализовать. `canvas` в тестах не нужен: тестируется `cardOps`, рендер — ручная проверка.
- [ ] `npx vitest run`, `npm run build` — PASS; ручная проверка на iPhone: карточка за прошлый месяц → «Поделиться» → «Сохранить изображение»; строка призрака; рекорд с празднованием. Коммит `feat(ui): ghost, hall of fame, growth index, before/after card, season finale, month review`.

### Task 10: Интерфейс — продвинутые классы; сверка этапа

**Files:** Modify `src/ui/ClassCard.tsx`, `src/ui/skillView.ts` (+ тест), `src/ui/QuestCard.tsx` (пункты «Рекорд», «Союз», «Сбор»), `src/styles.css`, `README.md` (раздел «Финансы и импорт выписки»: формат CSV, что никуда не отправляется).

**Interfaces — consumes:** T7, T9 (`CardSheet` для «Саги»). **Produces:**
- `skillView.ts`: `trialText(t: NonNullable<GameState['cls']['trial']>): string` → `'Испытание: день 6/14 · засчитано 5/10 · заданий фокуса 4/8'`; `abilityTarget(id: AbilityId2): 'quest' | 'day' | 'skill' | 'facet' | 'invest' | 'chain' | 'card'`.
- `ClassCard`: блок «Продвинутый путь» (два пути: пассив, способность, «Начать испытание» → `advanced_trial_started` с подтверждением), прогресс испытания, «Отказаться» (`advanced_trial_abandoned`), продвинутый класс со второй способностью: выбор навыка (Обет), грани (Пост — названия граней только здесь), подтверждение 300 золота (Инвестиция), «Сага» открывает `CardSheet` с `kind: 'week'`, «Аудит» — лист трёх советов по правилам из `finance.month` (на устройстве).
- В первые 7 дней сезона — «Сменить путь» (`advanced_path_switched`).

- [ ] **Тест (падает):**
  ```ts
  test('текст испытания и цели способностей', () => {
    expect(trialText({ classId: 'champion', start: '2027-01-20', day: 6, counted: 5, focusDone: 4, need: { days: 10, quests: 8 } })).toBe('Испытание: день 6/14 · засчитано 5/10 · заданий фокуса 4/8');
    expect(['record', 'vow', 'fast', 'invest', 'wall', 'saga', 'explore'].map(a => abilityTarget(a as AbilityId2))).toEqual(['quest', 'skill', 'facet', 'invest', 'day', 'card', 'chain']);
  });
  ```
- [ ] FAIL → реализовать.
- [ ] Сверка этапа: `npx vitest run`, `npm run build`; `grep -rn` по `src/` и `docs/` на суммы/названия банков/городов владельца — пусто; ручная проверка: испытание видно на «Герое» при уровне 20+, карточка за прошлый месяц сохраняется; в коммите релиза — `BALANCE.rivalSince` = дата выхода. Коммит `feat(ui): advanced class paths, trial progress, second abilities`.
