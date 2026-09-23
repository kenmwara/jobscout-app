/**
 * check_sweeps — a sweep can be kept whole, named by the résumé that earned
 * it, on BOTH surfaces, and the name never becomes a place the résumé lands.
 *
 *   node tools/check_sweeps.mjs
 *   node tools/check_sweeps.mjs --mutate web-uncapped | web-name-by-text
 *                        | web-merge-by-name | android-uncapped | android-nogroup
 *
 * Ken, 2026-09-23: "There's still no way to save a matched sweep, but I can
 * save individual jobs through the heart" and, naming the hard part himself:
 * "Name the sweep by the resume that earned it as one name could have
 * different resumes, thus different sweeps e.g. I've got three resumes!"
 *
 * THREE THINGS HAVE TO HOLD, and two of them are easy to get wrong quietly.
 *
 * 1. THE NAME IS NOT READ OFF THE RÉSUMÉ. It cannot be: the text is never
 *    written to storage, which is the promise check_resume_privacy holds. The
 *    reader names it once and the FINGERPRINT remembers, so the second sweep
 *    from the same résumé arrives named and a different one asks.
 *
 * 2. THE NAME BOX IS CAPPED. A text box beside a résumé is a text box someone
 *    will paste a résumé into. This one must never become the place the
 *    résumé ends up after every other surface stopped keeping it — which
 *    would undo the 09-21 and 09-23 fixes through the feature meant to be
 *    built on top of them.
 *
 * 3. SWEEPS GROUP BY FINGERPRINT, NOT BY NAME. Two résumés a reader gave the
 *    same name are still two résumés. Grouping on the name would quietly
 *    claim a run was scored against something it was not, which is the exact
 *    class of lie this product exists not to tell.
 *
 * Source, not runtime, for the phone's half: it cannot be driven from this
 * suite, and a rule checked only where checking is easy is the failure this
 * repository keeps paying for.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KT = join(ROOT, "android/app/src/main/java/trade/tbot/jobscout");
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

let js = read(join(ROOT, "site/sweeps.js"));
let idx = read(join(ROOT, "site/index.html"));
let sv = read(join(ROOT, "site/saved.html"));
let kt = read(join(KT, "Tracker.kt"));
let main = read(join(KT, "MainActivity.kt"));

if (MUTATE === "web-uncapped")
  js = js.replace(/\.slice\(0, NAME_MAX\)/, "");
if (MUTATE === "web-name-by-text")
  idx = idx.replace(/askSweepName\(btn, run\);/, "JSSweeps.save(run, scoredProfile.split('\\n')[0]);");
if (MUTATE === "web-merge-by-name")
  sv = sv.replace(/if \(!by\.has\(s\.fp\)\) by\.set\(s\.fp, \[\]\);\s*\n\s*by\.get\(s\.fp\)\.push\(s\);/,
                  "if (!by.has(s.name)) by.set(s.name, []);\n    by.get(s.name).push(s);");
if (MUTATE === "android-uncapped")
  kt = kt.replace(/\.trim\(\)\.take\(NAME_MAX\)/, ".trim()");
if (MUTATE === "android-nogroup")
  main = main.replace(/sweeps\.groupBy \{ it\.fp \}/, "sweeps.groupBy { it.name }");

ok(!!js && !!idx && !!sv && !!kt && !!main, "every source this checks was found",
   "a check that silently reads nothing passes forever");

// ── 1. the name comes from the reader, remembered by fingerprint ───────────
ok(/const nameFor = \(fp\) =>/.test(js) && /names\(\)\[fp\]/.test(js),
   "web: a résumé's name is looked up by its fingerprint");
ok(/askSweepName\(btn, run\);/.test(idx) && /JSSweeps\.nameFor\(run\.fp\)/.test(idx),
   "web: a named résumé keeps in one press, an unnamed one is asked about",
   "either it asks every time, or it invents a name for a résumé it cannot read");
ok(/fun nameFor\(ctx: Context, fp: String\)/.test(kt),
   "android: the same lookup, by fingerprint");
ok(/vm\.keepSweep\(known\) else \{ typed = ""; naming = true \}/.test(main.replace(/\s+/g, " ")),
   "android: the same two shapes — a press when named, a box when not");

// nothing anywhere derives the name from the résumé itself
for (const [name, src] of [["web", idx], ["android", main]]) {
  ok(!/nameFor|keepSweep|JSSweeps\.save/.test(src) || !/(scoredProfile|ui\.resume)\s*\.\s*(split|take|substring|lines)/.test(src),
     `${name}: nothing names a sweep by slicing the résumé text`,
     "the text is not ours to read back, and all three of his résumés start with the same line");
}

// ── 2. the box is capped, on both ─────────────────────────────────────────
ok(/NAME_MAX = 60/.test(js) && /\.slice\(0, NAME_MAX\)/.test(js),
   "web: the name is capped before it is stored",
   "an uncapped box beside a résumé is where the résumé ends up");
ok(/maxlength="\$\{JSSweeps\.NAME_MAX\}"/.test(idx),
   "web: and the input says so, rather than truncating silently after the fact");
ok(/const val NAME_MAX = 60/.test(kt) && /\.trim\(\)\.take\(NAME_MAX\)/.test(kt),
   "android: capped the same way, to the same number");

// ── 3. grouped by fingerprint, never by name ──────────────────────────────
ok(/by\.has\(s\.fp\)/.test(sv) && /by\.get\(s\.fp\)\.push\(s\)/.test(sv),
   "web: kept sweeps group on the fingerprint",
   "two résumés a reader gave one name would be merged into one history");
ok(/sweeps\.groupBy \{ it\.fp \}/.test(main),
   "android: the same grouping");

// ── and the two stores agree about what a kept sweep is ───────────────────
ok(/const KEY = "jobscout\.sweeps"/.test(js) && /const val KEY = "jobscout\.sweeps"/.test(kt),
   "both: the same storage key, so the two surfaces mean the same thing by it");
ok(/const CAP = 12/.test(js) && /const val CAP = 12/.test(kt),
   "both: the same cap, so one surface does not silently keep more than the other");
ok(/rename/.test(js) && /fun rename\(ctx: Context, fp: String/.test(kt),
   "both: renaming a résumé renames every sweep it earned");

say(`\ncheck_sweeps: ${checks} assertion(s) across both surfaces`);
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
            : "VERDICT: PASS — a sweep is kept and named by the résumé that earned it, on both");
  process.exitCode = fails ? 1 : 0;
}
