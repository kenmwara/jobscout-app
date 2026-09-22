/**
 * check_cors — the API answers this project's pages and nobody else's.
 *
 * Until 2026-09-22 the worker sent `Access-Control-Allow-Origin: *`, which let
 * any page on the internet use the scoring demo as its own free backend. The
 * threat model listed it as open and attributed it to the July audit — wrongly,
 * as it turned out: that audit was of the tbot dashboard. The wildcard here was
 * real all the same, and this is the check that keeps it closed.
 *
 * It imports the worker's own allowOrigin, so it tests the shipping decision
 * rather than a copy of it. No server, no network, no D1.
 *
 * WHAT IT DELIBERATELY ASSERTS, beyond the happy path:
 *   - a suffix attack (jobscout.page.evil.com) is refused, because a
 *     startsWith or a naive `.includes("jobscout.page")` would wave it through;
 *   - NO Origin header returns null and NOT a refusal. The Android app uses a
 *     native HTTP client, sends no Origin, and ignores CORS. Turning that into
 *     a block would break the app on every phone while every check stayed green.
 */
import { allowOrigin as shipping } from "../src/index.js";

/* --mutate: prove this check is awake. Each stand-in is a plausible wrong
   implementation, and every one of them must turn the table below red. */
const MUTATE = process.argv.indexOf("--mutate") < 0
  ? null : process.argv[process.argv.indexOf("--mutate") + 1];
const MUTANTS = {
  // what the worker did until 2026-09-22
  wildcard: (r) => r.headers.get("origin") || "*",
  // the tempting one-liner, which waves jobscout.page.evil.com straight through
  startswith: (r) => {
    const o = r.headers.get("origin") || "";
    return o.startsWith("https://jobscout.page") ? o : null;
  },
  // and the one that would break the Android app while every check stayed green
  "block-null": (r) => r.headers.get("origin") ? shipping(r) : "https://jobscout.page",
};
if (MUTATE && !MUTANTS[MUTATE]) {
  console.log(`unknown mutation "${MUTATE}"`); process.exit(2);
}
const allowOrigin = MUTATE ? MUTANTS[MUTATE] : shipping;

const req = (origin) =>
  new Request("https://api.example/api/health",
    { headers: origin === null ? {} : { origin } });

const CASES = [
  // [Origin, expected allowOrigin(), why this case is here]
  ["https://jobscout.page",                  "https://jobscout.page",                  "the Canadian site"],
  ["https://nairobi.jobscout.page",          "https://nairobi.jobscout.page",          "the Kenyan site"],
  ["https://www.jobscout.page",              "https://www.jobscout.page",              "index.html redirects it; apply.html does NOT"],
  ["https://jobscout.tbot.trade",            "https://jobscout.tbot.trade",            "same - the old host still resolves"],
  ["https://jobscout-app.pages.dev",         "https://jobscout-app.pages.dev",         "the Pages project"],
  ["https://preview.jobscout-app.pages.dev", "https://preview.jobscout-app.pages.dev", "a Pages preview"],
  ["http://localhost:8788",                  "http://localhost:8788",                  "local development"],
  ["http://127.0.0.1:3000",                  "http://127.0.0.1:3000",                  "local development"],
  [null,                                     null,                                     "the Android app: no Origin, no header, NOT a refusal"],
  ["https://evil.example.com",               null,                                     "a stranger's page"],
  ["https://jobscout.page.evil.com",         null,                                     "SUFFIX ATTACK — startsWith would pass this"],
  ["https://notjobscout.page",               null,                                     "PREFIX ATTACK — includes() would pass this"],
  ["http://jobscout.page",                   null,                                     "plain http, not the site"],
  ["https://jobscout-app.pages.dev.evil.com", null,                                    "the pattern is anchored at both ends"],
  ["null",                                   null,                                     "a sandboxed iframe sends the string 'null'"],
];

let fails = 0;
for (const [origin, want, why] of CASES) {
  const got = allowOrigin(req(origin));
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${String(origin).padEnd(42)} -> ${String(got).padEnd(42)} ${why}`);
}
console.log(`\ncheck_cors: ${CASES.length} origins`);
if (fails) { console.log(`VERDICT: FAIL (${fails})`); process.exit(1); }
if (MUTATE) {
  console.log(`VERDICT: ASLEEP — the "${MUTATE}" mutation did not fail this check`);
  process.exit(1);
}
console.log("VERDICT: PASS — only this project's pages are answered");
