/**
 * check_drafts_editable — the three drafts are the candidate's to change, on
 * BOTH surfaces, and what leaves the page is what is on the screen.
 *
 *   node tools/check_drafts_editable.mjs
 *   node tools/check_drafts_editable.mjs --mutate web-readonly | web-stale-copy
 *                          | web-no-empty-box | android-readonly | android-stale
 *
 * Ken, 2026-09-23: "There should be an edit capability on the popups in mobile
 * at cover letter writing, re-write resume and screening questions. Currently,
 * they're all write-protected (which doesn't makesense)" and "Applications
 * page is also write-protected in web - again, makes absolutely no sense!
 * Should have capability to edit cover letter, resume and answer those
 * screening questions."
 *
 * Both surfaces rendered what the model returned and stopped, which left the
 * last word on a candidate's own letter with a model. Neither was a decision;
 * both were the same omission, made twice.
 *
 * THE SECOND HALF IS THE DANGEROUS ONE. Making a panel typeable is visible the
 * moment you look at it. What is not visible is a Copy button still holding
 * the text as it was DELIVERED: the web's offer() closed over its `plain`
 * argument, so a reader could rewrite a letter, press Copy, and hand an
 * employer the model's draft instead of their own — discovered, if ever, in
 * front of the employer. So this asserts the read path as hard as the write
 * path, on both surfaces.
 *
 * Source, not runtime, for the same reason as check_resume_privacy: the phone
 * cannot be driven from this suite, and a promise checked only where checking
 * is easy is the failure being fixed.
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

let web = read(join(ROOT, "site/apply.html"));
let apply = read(join(KT, "Apply.kt"));
let mobile = read(join(KT, "Mobile.kt"));
let main = read(join(KT, "MainActivity.kt"));

// Each mutation restores a real past state of one surface.
if (MUTATE === "web-readonly")
  web = web.replace(/el\.contentEditable = "plaintext-only";/, 'el.contentEditable = "false";');
if (MUTATE === "web-stale-copy")
  web = web.replace(/cp\.onclick = \(\) => copyInto\(cp, PACK\[id\], id\);/, "cp.onclick = () => copyInto(cp, plain, id);");
if (MUTATE === "web-no-empty-box")
  web = web.replace(/<p class="ans" data-q=/, '${q.answer ? `<p class="ans" data-q=');
if (MUTATE === "android-readonly")
  apply = apply.replace(/private fun LongText\(text: String, onEdit: \(\(String\) -> Unit\)\? = null\)/,
                        "private fun LongText(text: String)");
if (MUTATE === "android-stale")
  apply = apply.replace(/vm\.editDraft \{ it\.copy\(letter = it\.letter\.copy\(data = t\)\) \}/, "Unit");

ok(!!web && !!apply && !!mobile && !!main, "every source this checks was found",
   "a check that silently reads nothing passes forever");

// ── WEB ────────────────────────────────────────────────────────────────────
ok(/el\.contentEditable = "plaintext-only";/.test(web) && /el\.contentEditable = "true";/.test(web),
   "web: the editable helper sets plaintext-only, with the older fallback",
   "a paste that carries markup lands in a document about to reach an employer");

for (const [id, what] of [["letter", "the cover letter"], ["tailor", "the rebuilt résumé"], ["answers", "the screening answers"]]) {
  ok(new RegExp(`yoursNow\\("${id}"`).test(web),
     `web: ${what} says it is the reader's to change`,
     "an editable region with no cue is an editable region nobody finds");
}
ok(/editable\(\$\("#out-letter"\)/.test(web),
   "web: the letter itself is editable");
ok(/\.dname, \.dcontact, \.dhead, \.dsec h5, \.dtitle, \.dmeta, \.ditem li/.test(web),
   "web: every line of the rebuilt résumé is editable, not just its prose");
ok(/querySelectorAll\("\.ans"\)\.forEach\(el => editable\(/.test(web),
   "web: every screening answer is editable");
ok(/<p class="ans" data-q=/.test(web) && !/q\.answer \? `<p class="ans"/.test(web),
   "web: an UNANSWERED question gets a box too",
   "the ones left for the candidate are the ones Ken asked to be able to answer");

// the read path — the half that fails silently
ok(/cp\.onclick = \(\) => copyInto\(cp, PACK\[id\], id\);/.test(web),
   "web: Copy reads the live text, not the text as delivered",
   "the reader rewrites the letter, presses Copy, and hands over the model's draft");
ok(/download\(new Blob\(\[PACK\[id\]\]/.test(web),
   "web: Download reads the live text too");
ok(/download\(docx\(D\)/.test(web) && /D = readDoc\(box, d\)/.test(web),
   "web: the .docx is built from the edited document",
   "the preview would show the reader's edits while the attached file kept the model's");

// ── ANDROID ────────────────────────────────────────────────────────────────
ok(/fun EditableText\(/.test(mobile) && /cursorBrush = SolidColor\(T\.accent\)/.test(mobile),
   "android: there is one editable component, and it is the language's own field",
   "a second text component is the deviation that costs another build");
ok(/fun editDraft\(f: \(Apply\) -> Apply\)/.test(main) && /patch\(id, f\)/.test(main),
   "android: an edit goes through patch(), so it reaches the KEPT draft as well",
   "close the sheet, reopen it, and the model's version would be back");

const a1 = apply.replace(/\s+/g, " ");
ok(/private fun LongText\(text: String, onEdit: \(\(String\) -> Unit\)\? = null\)/.test(apply),
   "android: the letter takes an edit callback");
ok(/private fun RebuiltResume\(r: ResumeResponse, onEdit: \(\(ResumeResponse\) -> Unit\)\? = null\)/.test(apply),
   "android: the rebuilt résumé takes one");
ok(/private fun Answers\(r: AnswersResponse, onEdit: \(\(AnswersResponse\) -> Unit\)\? = null\)/.test(apply),
   "android: the screening questions take one");
for (const [step, field] of [["letter", "letter"], ["resume", "resume"], ["answers", "answers"]]) {
  ok(new RegExp(`vm\\.editDraft \\{ it\\.copy\\(${field} = it\\.${field}\\.copy\\(data =`).test(a1),
     `android: the ${step} sheet writes its edit back into the draft`,
     "a callback that changes nothing is a text field that forgets every keystroke");
}
// the phone's equivalent of the stale-copy trap: DraftSheet is handed `plain`,
// and it has to be recomputed from the same data the body is editing.
ok(/DraftSheet\("Your résumé, aimed at it", resumeText\(d\)/.test(a1)
   && /DraftSheet\("Their screening questions", answersText\(d\)/.test(a1),
   "android: the sheet's Copy all is recomputed from the edited data",
   "Copy all would hand over the model's version of a document the reader had rewritten");
ok(/placeholder = q\.why\.ifEmpty \{ "yours to answer" \}/.test(a1),
   "android: an unanswered question is a box with the old dead line as its placeholder",
   "naming the work and giving the candidate nowhere to do it is the defect being fixed");
ok(/if \(q\.answer\.isNotBlank\(\)\) CopyChip\(q\.answer\)/.test(a1),
   "android: nothing offers to copy an answer that is not there yet",
   'a chip that pastes "yours to answer" into an employer\'s form is a trap');

say(`\ncheck_drafts_editable: ${checks} assertion(s) across both surfaces`);
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
            : "VERDICT: PASS — the drafts are editable on both surfaces, and what leaves is what is on screen");
  process.exitCode = fails ? 1 : 0;
}
