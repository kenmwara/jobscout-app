/**
 * check_resume_privacy — the résumé is never written to storage, on EITHER surface.
 *
 *   node tools/check_resume_privacy.mjs
 *   node tools/check_resume_privacy.mjs --mutate android-save | android-restore
 *                                                | android-noscrub | web-keeps
 *
 * WHY THIS EXISTS, and it is the most expensive lesson in this repository.
 *
 * The web kept the résumé in browser storage. That was found on 2026-09-21,
 * fixed, and a scrubber added for records already written. The threat model
 * then recorded it as closed — for the PRODUCT.
 *
 * It was closed for one surface. The Android app went on doing exactly what
 * the web had just stopped doing: `keepRun` wrote the whole résumé into
 * SharedPreferences as `SavedRun.profile`, in plain text, on every run, and
 * the launch path read it straight back into the box. Which is how the
 * operator came to ask why his own résumé was in the upload bar when he
 * opened the app.
 *
 * So for two days the product's threat model and its privacy page both said a
 * résumé is "never written to storage" while one of its two surfaces wrote one
 * every single run. Not a lie anybody told: a fix applied to the surface where
 * the bug was reported, and a claim made for the product.
 *
 * THE RULE THIS ENCODES: a promise made for the product must be checked on
 * every surface that could break it. `check_gaps --only privacy` covered the
 * web, and covering the web is what made the gap invisible.
 *
 * It is deliberately a SOURCE check, not a runtime one. There is no way to run
 * the Android app in this suite, and a privacy promise that is only tested
 * where it is convenient to test is the failure being fixed.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AND = join(ROOT, "android/app/src/main/java/trade/tbot/jobscout");
const MUTATE = process.argv.indexOf("--mutate") < 0
  ? null : process.argv[process.argv.indexOf("--mutate") + 1];

let fails = 0, checks = 0;
const say = (s) => { try { console.log(s); } catch { /* stdout is gone */ } };
const ok = (cond, what, saw = "") => {
  checks++;
  if (cond) { say(`  ok    ${what}`); return; }
  fails++;
  say(`  FAIL  ${what}${saw ? `\n        ${saw}` : ""}`);
};

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

let main = read(join(AND, "MainActivity.kt"));
let store = read(join(AND, "Tracker.kt"));
let web = read(join(ROOT, "site/index.html"));

// Each mutation puts back exactly what the app used to do.
if (MUTATE === "android-save") main = main.replace(/profile = ""/, "profile = u.resume");
if (MUTATE === "android-restore") main = main.replace(/resume = ""/, "resume = r?.profile.orEmpty()");
if (MUTATE === "android-noscrub") store = store.replace(/run\.profile\.isNotEmpty\(\)/, "false");
// Every occurrence, not the first: the page clears this in more than one
// place, so replacing one left another standing and the check reported
// itself asleep when it was the MUTATION that had done nothing.
if (MUTATE === "web-keeps") web = web.replace(/scoredProfile = "";/g, "scoredProfile = r.profile || \"\";");

ok(!!main && !!store && !!web, "the sources this checks were all found",
   "a privacy check that silently reads nothing passes forever");

// ---- Android: nothing writes the résumé to disk -------------------------
ok(!/profile\s*=\s*u\.resume/.test(main),
   "android: the saved run stores a fingerprint, not the résumé text",
   "SavedRun is being constructed with profile = u.resume, which is SharedPreferences in plain text");

ok(!/resume\s*=\s*r\?\.profile/.test(main),
   "android: the launch state does not read a résumé back out of storage",
   "the box would open with the last résumé already in it");

ok(/run\.profile\.isNotEmpty\(\)/.test(store) && /save\(ctx,\s*clean\)/.test(store),
   "android: a record written before the fix is scrubbed on load",
   "stopping the write only helps the next run; every phone that already ran the app still holds one");

// ---- Web: the surface this was fixed on stays fixed ---------------------
ok(/scoredProfile\s*=\s*"";/.test(web),
   "web: the résumé text is not carried across a reload");

ok(/"profile" in r/.test(web) && /delete r\.profile/.test(web),
   "web: a pre-09-21 record is still scrubbed");

say(`\ncheck_resume_privacy: ${checks} assertion(s) across both surfaces`);
if (MUTATE) {
  if (!fails) {
    say(`VERDICT: ASLEEP — the "${MUTATE}" mutation did not fail this check`);
    process.exitCode = 1;
  } else {
    say(`VERDICT: the "${MUTATE}" mutation was caught (${fails} failure(s)) — awake`);
    process.exitCode = 0;
  }
} else {
  say(fails ? `VERDICT: FAIL (${fails})`
            : "VERDICT: PASS — neither surface writes a résumé to storage");
  process.exitCode = fails ? 1 : 0;
}
