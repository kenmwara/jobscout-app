-- 2026-09-25: JobScout joins the SOAR.
-- sec_seen: one security event per key per time bucket (the key carries its bucket); swept after 2 days.
CREATE TABLE IF NOT EXISTS sec_seen (k TEXT PRIMARY KEY, ts_ms INTEGER NOT NULL);
-- control: the operator's switches. scoring_paused = '1' makes every paid model call answer like the spent budget.
CREATE TABLE IF NOT EXISTS control (k TEXT PRIMARY KEY, v TEXT NOT NULL, ts_ms INTEGER NOT NULL, note TEXT);
