-- morning/evening: минуты от полуночи по местному времени, NULL = выключено
CREATE TABLE push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  tz TEXT NOT NULL,
  morning INTEGER,
  evening INTEGER,
  last_morning TEXT,
  last_evening TEXT
);
