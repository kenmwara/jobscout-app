/**
 * check_ev_shape — machines are not counted as people, and a day that looks like machines is
 * flagged (2026-09-25).
 *
 * From 09-20 to 09-24 the stats page read ~2,000 visits a day with a hundred pastes and single
 * digit runs. It was our own Playwright checks: the page posts to the live worker from wherever
 * it is served, and every check page is a fresh tab. Four guards now stand between a script and
 * the count, and this checks each one against the code that ships:
 *
 *   1. the page stays silent under automation (navigator.webdriver) - index.html and saved.html
 *   2. the worker refuses crawler / unfurler / headless user agents before the INSERT
 *   3. /api/stats marks a machine-shaped day (worker/src/counted.js botShaped), and the numbers
 *      it is tested on are the real 09-24 (flagged) and the real human remainder (not flagged)
 *   4. the operator dashboard says so before anything else
 *
 * --live reads the deployed /api/stats and fails on any flagged day in the last 30: that is the
 * nightly flag, and it goes red the first night the counts stop looking like people.
 *
 *   node worker/tools/check_ev_shape.mjs
 *   node worker/tools/check_ev_shape.mjs --live
 *   node worker/tools/check_ev_shape.mjs --mutate <page-counts-bots|worker-lets-bots|ua-open|shape-blind|dash-hides>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as shipping from "../src/counted.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const arg = k => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const MUTATE = arg("--mutate");
const MUTANTS = ["page-counts-bots", "worker-lets-bots", "ua-open", "shape-blind", "dash-hides"];
if (MUTATE && !MUTANTS.includes(MUTATE)) { console.log(`unknown mutation "${MUTATE}"`); process.exit(2); }

let fails = 0;
const is = (ok, what) => { if (!ok) fails++; console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`); };

if (process.argv.includes("--live")) {
  const API = process.env.API || "https://jobscout-app-api.kenmwara.workers.dev";
  const d = await (await fetch(`${API}/api/stats?days=30`, { headers: { authorization: `Bearer ${process.env.STATS_TOKEN || ""}` } })).json();   // operator-only since 09-25
  is(Array.isArray(d.daily) && d.daily.every(r => Array.isArray(r.suspect)), "the deployed /api/stats carries a suspect list per day");
  for (const r of d.daily || [])
    is(!(r.suspect || []).length, `${r.day}  visits ${r.people}  pastes ${r.pastes ?? "?"}  runs ${r.runs}  peak10 ${r.peak10 ?? "?"}` +
      ((r.suspect || []).length ? `  <- ${r.suspect.join("; ")}` : ""));
  console.log(fails ? `\nVERDICT: FAIL - ${fails} machine-shaped day(s); run python worker/tools/ev_quarantine.py` : "\nVERDICT: PASS");
  process.exitCode = fails ? 1 : 0;   // not process.exit(): with fetch's socket still open it crashes libuv on Windows
} else {

let pages = ["site/index.html", "site/saved.html"].map(p => [p, readFileSync(join(ROOT, p), "utf8")]);
let worker = readFileSync(join(ROOT, "worker/src/index.js"), "utf8");
let dash = readFileSync(join(ROOT, "ops/stats.html"), "utf8");
let { isBotUA, botShaped } = shipping;
if (MUTATE === "page-counts-bots") pages[0][1] = pages[0][1].replace(/if \(navigator\.webdriver\) return;/, "");
if (MUTATE === "worker-lets-bots") worker = worker.replace(/if \(isBotUA\(/, "if (false && isBotUA(");
if (MUTATE === "ua-open") isBotUA = ua => false;
if (MUTATE === "shape-blind") botShaped = () => [];
if (MUTATE === "dash-hides") dash = dash.replace(/id="suspect"/, "");

// 1. the page: ev() returns under automation before it builds or sends anything
for (const [p, s] of pages) {
  const body = (s.match(/function ev\(n, d\)\{([\s\S]*?)\n\}/) || [])[1] || "";
  is(/^\s*(\/\/[^\n]*\n\s*)*if \(navigator\.webdriver\) return;/.test(body), `${p}: ev() returns first when navigator.webdriver`);
}

// 2. the worker: the UA test comes before the INSERT in the /api/ev handler
const h = worker.slice(worker.indexOf('url.pathname === "/api/ev"'), worker.indexOf('url.pathname === "/api/stats"'));
is(/if \(isBotUA\(request\.headers\.get\("user-agent"\)\)\) return/.test(h) && h.indexOf("isBotUA(") < h.indexOf("INSERT INTO ev"),
   "/api/ev refuses a bot user agent before it writes");
is(!/user.?agent/i.test((worker.match(/INSERT INTO ev[^"]*"/) || [""])[0]), "the user agent is not written to ev");
const UA = {
  refused: ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
            "WhatsApp/2.23.20.0 A", "TelegramBot (like TwitterBot)", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
            "curl/8.5.0", "python-requests/2.32.3", "node-fetch/1.0", ""],
  counted: ["Mozilla/5.0 (Linux; Android 14; CUBOT P80) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "okhttp/4.12.0", "JobScout/27 CFNetwork/1568.100.1 Darwin/24.0.0"],
};
const wrongR = UA.refused.filter(u => !isBotUA(u)), wrongC = UA.counted.filter(u => isBotUA(u));
is(!wrongR.length, `crawlers, unfurlers, headless and scripts are refused${wrongR.length ? ": let through " + wrongR.join(" | ") : ""}`);
is(!wrongC.length, `phones, desktops and both apps are counted${wrongC.length ? ": refused " + wrongC.join(" | ") : ""}`);

// 3. the shape rule, on the real days
const day0924 = { people: 1510, pastes: 101, runs: 5, peak10: 43 };   // what /api/stats said on 09-25
const human0919 = { people: 74, pastes: 21, runs: 51, peak10: 6 };    // 09-19 after ev_quarantine.py
const quiet = { people: 13, pastes: 4, runs: 5, peak10: 3 };          // 09-24 after ev_quarantine.py
is(botShaped(day0924).length >= 2, `the real 09-24 is flagged (${botShaped(day0924).join("; ") || "nothing"})`);
is(botShaped({ ...day0924, peak10: 0, runs: 3 }).length >= 1, "pastes and visits without runs are flagged without the burst");
is(!botShaped(human0919).length && !botShaped(quiet).length, "a human day, busy or quiet, is not flagged");
is(/SUM\(name='paste'\) pastes/.test(worker) && /peak10/.test(worker) && /suspect = botShaped\(r\)/.test(worker),
   "/api/stats computes pastes, peak10 and suspect for every day");

// 4. the dashboard leads with it
is(/id="suspect"/.test(dash) && /Do not quote these numbers/.test(dash), "ops/stats.html warns before the funnel when a day is suspect");

console.log(`\ncheck_ev_shape: bar = ${JSON.stringify(shipping.SHAPE)}`);
if (MUTATE && fails) { console.log(`VERDICT: the "${MUTATE}" mutation was caught (${fails} failure(s)) - awake`); process.exit(0); }
if (MUTATE) { console.log(`VERDICT: ASLEEP — the "${MUTATE}" mutation did not fail this check`); process.exit(1); }
if (fails) { console.log(`VERDICT: FAIL (${fails})`); process.exit(1); }
console.log("VERDICT: PASS");

}