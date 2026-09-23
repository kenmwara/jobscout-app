/**
 * check_apply_parity — a match can be applied to on BOTH surfaces, or neither.
 *
 *   node tools/check_apply_parity.mjs
 *   node tools/check_apply_parity.mjs --mutate android-gated | android-nolabel
 *                                              | web-drops | web-relabels
 *
 * Ken, 2026-09-23: "Web has an 'apply anyway' button for low scores, while
 * mobile doesn't - should be standardized across both."
 *
 * He was right, and the shapes of the two surfaces explain how it happened.
 * The web card emitted a button in both branches of one ternary, so a
 * below-floor posting always carried a quiet "Apply anyway". The phone decided
 * the same thing two lines earlier:
 *
 *     val open = p != null && (s.fit >= FIT_FLOOR || ui.stretch)
 *
 * and then hung BOTH the click and the label off `open`. A posting under the
 * floor was a dead tile until the candidate found the near-miss band and
 * pressed "Apply to these anyway" — a control that is only drawn when the
 * WHOLE sweep is a near miss. Below the floor in a mixed sweep there was no
 * route at all.
 *
 * So the two surfaces disagreed about whether the score is our opinion or the
 * candidate's decision, and the phone had taken the harsher reading.
 *
 * THIS IS A PARITY CHECK, the same shape as check_resume_privacy and for the
 * same reason: the expensive defects in this repository are all one surface
 * fixed and the product claimed. A promise about what a candidate can do has
 * to be asserted on every surface they can do it from.
 *
 * Source, not runtime: the phone cannot be driven from this suite, and a
 * parity rule tested only where testing is easy is the failure being fixed.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AND_SRC = join(ROOT, "android/app/src/main/java/trade/tbot/jobscout/MainActivity.kt");
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

let and = read(AND_SRC);
let web = read(join(ROOT, "site/index.html"));

// Each mutation puts back a real past state of one surface.
//
// The line ending is matched as (\r?\n), because these sources are CRLF on the
// machine they are written on and the first draft of this mutation looked for
// `null` followed by a bare newline. It matched nothing, changed not one
// character, and the run reported ASLEEP — which is the only reason this is
// not still a green line guarding nothing. Force a mutation to fail before
// believing any of them.
if (MUTATE === "android-gated")
  and = and.replace(/val open = p != null(\r?\n)/, "val open = p != null && (s.fit >= FIT_FLOOR || ui.stretch)$1");
if (MUTATE === "android-nolabel")
  and = and.replace(/else if \(s\.fit >= FIT_FLOOR\) "Prepare application →" else "Apply anyway →"/,
                    '"Prepare application →"');
if (MUTATE === "web-drops")
  web = web.replace(/: `<button class="applybtn stretch" type="button">Apply anyway →<\/button>`/, ": ``");
if (MUTATE === "web-relabels")
  web = web.replace(/>Apply anyway →<\/button>`/, ">Prepare application →</button>`");

ok(!!and && !!web, "both surfaces' sources were found",
   "a parity check that silently reads one file passes forever");

// ---- the window ----------------------------------------------------------
// SCOPED to the job list, not to the file. The first draft asserted on
// /^\s*val open = .*$/m and matched a local of the same name in the apply
// screen, so it reported the card gated when the card was fine — the same
// failure as doc_check reading `None` out of the phrase "the checks".
//
// And the END anchor is searched FROM the start: `item { MFoot(onOpen) }`
// closes three different lists in this file and the FIRST one sits above the
// job list, so slicing to its first occurrence handed back an empty window.
const CARD_FROM = and.indexOf("items(sorted, key = { it.id })");
const CARD = CARD_FROM < 0 ? ""
  : and.slice(CARD_FROM, and.indexOf("item { MFoot(onOpen) }", CARD_FROM));

ok(CARD.length > 200,
   "android: the job-list block this checks was located",
   `the window between the list and its foot is ${CARD.length} chars — every assertion below would be passing on nothing`);

// ---- the phone offers the action on every scored card --------------------
// The gate is the whole defect: anything narrowing `open` past "we have the
// posting" takes the action away from a card the web would have offered it on.
const openLine = (CARD.match(/^\s*val open = .*$/m) || [""])[0].trim();
ok(/^val open = p != null$/.test(openLine),
   "android: every card with a posting can act — the action is not gated on the fit",
   `saw \`${openLine}\` — a below-floor posting is a dead tile on the phone while the web offers it`);

// ---- and names a stretch as one, in the web's words ----------------------
const andAction = CARD.replace(/\s+/g, " ");
ok(/action = if \(!open\) null else if \(s\.fit >= FIT_FLOOR\) "Prepare application →" else "Apply anyway →"/.test(andAction),
   "android: above the floor it prepares, below it applies anyway",
   "one label for both cases either hides a stretch or refuses a fit");

// ---- the web still emits a button in BOTH branches -----------------------
const webAction = web.replace(/\s+/g, " ");
ok(/x\.fit >= FIT_FLOOR \? `<button class="applybtn" type="button">Prepare application →<\/button>` : `<button class="applybtn stretch" type="button">Apply anyway →<\/button>`/.test(webAction),
   "web: the card's action ternary has a button on both sides",
   "the surface this parity is measured against must keep offering it");

// ---- and both send the same thing to the worker -------------------------
// Neither surface asks the candidate to set a flag: it is derived from the
// fit, so "apply anyway" means the same thing on the phone as on the laptop.
ok(/const stretch = x\.fit < FIT_FLOOR;/.test(web),
   "web: the stretch flag is derived from the fit, not from a mode the reader set");
ok(/val stretch: Boolean = fit < FIT_FLOOR/.test(read(join(ROOT, "android/app/src/main/java/trade/tbot/jobscout/Api.kt"))),
   "android: the same derivation, so the worker sees one contract",
   "if the phone threaded a flag instead, its below-floor letters would be refused");

// ---- the near-miss band keeps its own pill on both ----------------------
// It is a different affordance — a whole sweep at once — and it survives the
// per-card fix on both surfaces, which is what "standardized" means here.
ok(/Apply to these anyway/.test(and) && /Apply to these anyway/.test(web),
   "both: the near-miss band still offers the sweep-wide opt-in");

say(`\ncheck_apply_parity: ${checks} assertion(s) across both surfaces`);
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
            : "VERDICT: PASS — a low score can be applied to from either surface");
  process.exitCode = fails ? 1 : 0;
}
