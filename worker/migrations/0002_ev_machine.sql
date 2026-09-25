-- 0002_ev_machine — where the counted sessions that were machines go (2026-09-25).
-- See schema.sql and worker/tools/ev_quarantine.py.
CREATE TABLE IF NOT EXISTS ev_machine (
  id      INTEGER PRIMARY KEY,    -- the row's id in ev
  ts_ms   INTEGER NOT NULL,
  day     TEXT NOT NULL,
  market  TEXT NOT NULL,
  surface TEXT NOT NULL,
  name    TEXT NOT NULL,
  detail  TEXT,
  sid     TEXT NOT NULL,
  rule    TEXT NOT NULL           -- burst | twin | fast | ci, see ev_quarantine.py
);
CREATE INDEX IF NOT EXISTS ev_machine_day ON ev_machine (day);
