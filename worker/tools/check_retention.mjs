/**
 * check_retention — demo_runs rows really are deleted after the stated window,
 * and the privacy page states the same window the code enforces (2026-09-24).
 *
 * It imports the shipping rule (src/retention.js) and runs the sweep against a
 * stand-in database that records the SQL and the bound cutoff, so it tests the
 * deletion that ships, not a description of it. Then it checks the two places
 * the rule can silently stop existing: the cron trigger in wrangler.toml, and
 * the scheduled() handler in the worker. Finally the page: the number on
 * privacy.html must equal DEMO_RUNS_KEEP_DAYS, so the page cannot promise a
 * window the code does not keep.
 *
 *   node worker/tools/check_retention.mjs
 *   node worker/tools/check_retention.mjs --mutate <page-drift|no-cron|no-handler|keeps-forever>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as shipping from "../src/retention.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MUTATE = process.argv.indexOf("--mutate") < 0 ? null : process.argv[process.argv.indexOf("--mutate") + 1];
const MUTANTS = ["page-drift", "no-cron", "no-handler", "keeps-forever"];
if (MUTATE && !MUTANTS.includes(MUTATE)) { console.log(`unknown mutation "${MUTATE}"`); process.exit(2); }

let page = readFileSync(join(ROOT, "site/privacy.html"), "utf8");
let toml = readFileSync(join(ROOT, "worker/wrangler.toml"), "utf8");
let worker = readFileSync(join(ROOT, "worker/src/index.js"), "utf8");
let sweep = shipping.sweepDemoRuns;
if (MUTATE === "page-drift") page = page.replace(/deleted after <b>\d+ days<\/b>/, "deleted after <b>30 days</b>");
if (MUTATE === "no-cron") toml = toml.replace(/\[triggers\][\s\S]*$/, "");
if (MUTATE === "no-handler") worker = worker.replace(/async scheduled\(/, "async notScheduled(");
if (MUTATE === "keeps-forever") sweep = async () => 0;   // a sweep that runs and deletes nothing

let fails = 0;
const is = (ok, what) => { if (!ok) fails++; console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`); };

// 1. the sweep deletes from demo_runs everything before now - KEEP days
const calls = [];
const db = { prepare: sql => ({ bind: (...a) => ({ run: async () => { calls.push({ sql, a }); return { meta: { changes: 7 } }; } }) }) };
const NOW = Date.UTC(2026, 11, 31);          // 2026-12-31
const n = await sweep(db, NOW);
const want = new Date(NOW - shipping.DEMO_RUNS_KEEP_DAYS * 86400_000).toISOString().slice(0, 10);
is(calls.length === 1 && /DELETE FROM demo_runs WHERE day < \?/i.test(calls[0].sql), "the sweep issues DELETE FROM demo_runs WHERE day < ?");
is(calls.length === 1 && calls[0].a[0] === want, `the cutoff is now minus ${shipping.DEMO_RUNS_KEEP_DAYS} days (${want})`);
is(n === 7, "the sweep reports the rows it deleted");

// 2. something actually runs it
is(/\[triggers\][\s\S]*crons\s*=\s*\[\s*"[^"]+"/.test(toml), "wrangler.toml declares a cron trigger");
is(/async scheduled\([^)]*\)\s*{[\s\S]{0,200}sweepDemoRuns\(/.test(worker), "the worker's scheduled() handler calls sweepDemoRuns");

// 3. the page promises what the code keeps
const m = page.match(/id="retention-demo-runs"[^>]*>[^<]*deleted after <b>(\d+) days<\/b>/);
is(!!m && Number(m[1]) === shipping.DEMO_RUNS_KEEP_DAYS,
   `privacy.html states ${m ? m[1] : "no"} days; the code keeps ${shipping.DEMO_RUNS_KEEP_DAYS}`);

console.log(`\ncheck_retention: demo_runs kept ${shipping.DEMO_RUNS_KEEP_DAYS} days`);
if (fails) { console.log(`VERDICT: FAIL (${fails})`); process.exit(1); }
if (MUTATE) { console.log(`VERDICT: ASLEEP — the "${MUTATE}" mutation did not fail this check`); process.exit(1); }
console.log("VERDICT: PASS — the window is enforced, scheduled, and stated truthfully");
