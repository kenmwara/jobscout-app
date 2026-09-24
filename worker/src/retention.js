/**
 * retention — how long the API keeps what it records (2026-09-24).
 *
 * demo_runs holds one row per scoring run: a salted hash of the caller's IP,
 * the time, and the run's tokens and cost. The hash does its job within an
 * hour (the per-hour cap) and the stats page reads at most 90 days of daily
 * totals, so nothing needs a row older than that. Rows past it are deleted by
 * the daily cron in wrangler.toml. The privacy page states the same number,
 * and worker/tools/check_retention.mjs fails if the two ever disagree.
 *
 * Its own module, like cors.js, so the check can import the shipping rule
 * without dragging in unpdf and fflate.
 */
export const DEMO_RUNS_KEEP_DAYS = 90;

/** The first day that is KEPT. Rows with an earlier `day` are deleted. */
export function demoRunsCutoff(nowMs = Date.now()) {
  return new Date(nowMs - DEMO_RUNS_KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
}

/** Delete demo_runs rows older than the keep window. Returns rows deleted. */
export async function sweepDemoRuns(db, nowMs = Date.now()) {
  const r = await db.prepare("DELETE FROM demo_runs WHERE day < ?").bind(demoRunsCutoff(nowMs)).run();
  return r?.meta?.changes ?? 0;
}
