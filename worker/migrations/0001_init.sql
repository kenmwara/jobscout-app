-- 0001_init — the schema as it stood on 2026-09-22, when this directory was created.
--
-- Everything here is CREATE ... IF NOT EXISTS, so applying it to the live
-- database that already has these tables changes nothing. That is deliberate:
-- it lets an existing database adopt the migration history without a dump and
-- a restore, and it makes 0001 safe to run twice.
--
-- THE RULE, the same one S-Ryder uses. schema.sql is the truth for a FRESH
-- database and already contains everything the migrations add. The migrations
-- are for databases that predate a change. Add to BOTH: a column that only
-- exists in a migration is missing from every new database, and a column that
-- only exists in schema.sql never reaches production.

CREATE TABLE IF NOT EXISTS demo_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_hash TEXT NOT NULL,
  ts_ms INTEGER NOT NULL,
  day TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_runs_ip ON demo_runs (ip_hash, ts_ms);
CREATE INDEX IF NOT EXISTS idx_runs_day ON demo_runs (day);
CREATE TABLE IF NOT EXISTS feed (day TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cached_showcase (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL);

-- Counted product events (2026-09-18). Deliberately has no ip_hash column: this table and
-- demo_runs are never joined, so a counted step cannot be tied back to a network address.
CREATE TABLE IF NOT EXISTS ev (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_ms   INTEGER NOT NULL,
  day     TEXT NOT NULL,
  market  TEXT NOT NULL DEFAULT 'ca',
  surface TEXT NOT NULL DEFAULT 'web',
  name    TEXT NOT NULL,          -- one of EV_NAMES in src/index.js; anything else is dropped
  detail  TEXT,                   -- a short enum-ish token, capped at 48 chars
  sid     TEXT NOT NULL           -- random per tab (per browser on the saved page), not a person
);
CREATE INDEX IF NOT EXISTS ev_day_name ON ev (day, name);
CREATE INDEX IF NOT EXISTS ev_sid ON ev (sid);
