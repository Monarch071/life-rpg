# Life RPG

Приложение для iPhone (PWA), которое превращает твой день в RPG: задания на день, опыт, характеристики героя и «Тень», с которой ты соревнуешься. Все данные хранятся на телефоне.

## Запуск локально

```
npm install
npm run dev
npm test
```

Сборка: `npm run build`, проверка сборки: `npm run preview`.

## Структура

- `src/domain/` — игровая логика (XP, характеристики, задания, расписание, Тень)
- `src/screens/` — экраны (анкета, «Мой день», персонаж, настройки)
- `src/ui/` — общие компоненты (аватар, диалоги, сохранение файла)
- `src/db.ts`, `src/backup.ts` — хранилище событий (IndexedDB) и экспорт/импорт
- `.github/workflows/deploy.yml` — публикация на GitHub Pages

## Документация

Инструкция по публикации и установке на iPhone: [docs/stage-1-iphone.md](docs/stage-1-iphone.md)

Синхронизация iPhone и компьютера: [docs/stage-2-sync.md](docs/stage-2-sync.md)

Магазин, навыки, боссы, достижения, аналитика: [docs/stage-3-game.md](docs/stage-3-game.md)

Команда «Life RPG — синк» (шаги, сон, вес из «Здоровья»): [docs/shortcuts.md](docs/shortcuts.md)
