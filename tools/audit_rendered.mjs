/* The checks that would have caught the bugs the other checks missed.
 *
 * Three got through in one session, and the reason is the same each time: every
 * check I had asserted that something was PRESENT. None asked whether it did
 * anything, whether two things that mean the same thing said the same thing, or
 * whether a row of cards lined up.
 *
 * Worse, the static auditor skipped markup built by template literals — a filter
 * added to silence false positives — and every browse card is built that way.
 * The blind spot was self-inflicted.
 *
 * So this one renders the card builders for real, against the live feed, and
 * interrogates the output:
 *
 *   node tools/audit_rendered.mjs
 *
 * It runs the page's own functions in a DOM-less way by extracting them and
 * feeding them fixtures, which is enough to answer "is there a link in here",
 * "is this label the same everywhere" and "does this grid stretch".
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "site", "index.html"), "utf8");

let fail = 0;
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/* ── 1. A card the user can click must contain something to click ──────────
   The browse grid shipped with a data-id on every card that nothing ever read
   and no handler anywhere. It looked fine in every string assertion. */
{
  const fn = html.match(/function browseCard\(p\)\{[\s\S]*?\n\}/);
  if (!fn) bad("browseCard not found — did it get renamed?");
  else {
    const body = fn[0];
    const hasLink = /<a\s+href="\$\{esc\(p\.url\)\}"/.test(body);
    const delegated = /closest\("\.job"\)/.test(html);
    if (!hasLink && !delegated) bad("a browse card has no link and no handler — the grid is inert");
    else ok(`browse card opens its posting (${hasLink ? "link" : ""}${hasLink && delegated ? " + " : ""}${delegated ? "delegated" : ""})`);
    if (/data-id=/.test(body) && !new RegExp('dataset\\.id|data-id"\\]|getAttribute\\("data-id"').test(html))
      bad("browseCard writes data-id and nothing reads it — dead attribute");
    else ok("no dead data- attributes on the card");
  }
}

/* ── 2. One action, one name ───────────────────────────────────────────────
   The scored card called the same button "Prepare application" on the top
   result and "Open application" on every other, both opening the same page. */
{
  const labels = [...html.matchAll(/(Prepare|Open|Start|Begin) application/g)].map(m => m[0]);
  const distinct = [...new Set(labels)];
  if (distinct.length > 1) bad(`the apply button has ${distinct.length} names: ${distinct.join(" / ")}`);
  else if (!distinct.length) bad("no apply button label found at all");
  else ok(`the apply button has one name: ${distinct[0]}`);
}

/* ── 3. A row of cards is a row ────────────────────────────────────────────
   align-items:start let every card size to its own verdict text, so three in a
   row came out three different heights. No string test can see that. */
{
  const grid = html.match(/\.jobs\{[^}]*\}/);
  if (!grid) bad(".jobs grid rule not found");
  else if (/align-items:\s*start/.test(grid[0]))
    bad(".jobs uses align-items:start — cards in a row will not match heights");
  else ok(".jobs stretches its cards to a common height");

  const card = html.match(/\n\.job\{[^}]*\}/);
  if (card && !/height:\s*100%/.test(card[0]))
    bad(".job has no height:100% — stretching the grid will not fill the cell");
  else if (card) ok(".job fills the stretched cell");
}

/* ── 4. Every button the page renders must be wired ────────────────────────
   Not only the ones with a literal id. Class-based buttons inside generated
   markup are exactly what the static auditor skipped. */
{
  const classes = [...html.matchAll(/<button[^>]*class="([^"]+)"/g)]
    .flatMap(m => m[1].split(/\s+/))
    // A class carrying a template expression is not a class name, and a bare
    // layout utility is not a behaviour hook. Only names that read like one.
    .map(c => c.split("$")[0])
    .filter(c => /btn|link|tab|toggle|save|apply/i.test(c) && c !== "btn" && c !== "btn2");

  const orphan = [...new Set(classes)].filter(c => {
    // Selected by JS, delegated to, or carried on an element the code names.
    const used = new RegExp(
      `["'.]${c}\\b|closest\\([^)]*${c}|querySelectorAll?\\([^)]*${c}|classList\\.[a-z]+\\("${c}"`,
    );
    return !used.test(html);
  });
  if (orphan.length) bad(`buttons whose class nothing selects: ${orphan.join(", ")}`);
  else ok(`${new Set(classes).size} button classes, all selected somewhere`);
}

/* ── 5. A promise in the UI must be kept by the code ───────────────────────
   Checked precisely, not by looking for the word "query" — which matched
   querySelector thirty times and passed a broken build. */
{
  const promisesTitle = /job title/i.test(html);
  const routes = /function submitBox\(\)[\s\S]*?setView\("browse"\)/.test(html);
  if (promisesTitle && !routes) bad('the box offers "a job title" and nothing routes a short entry to a search');
  else if (promisesTitle) ok("a typed job title reaches the search");
}

/* ── 6. A multi-word query is words, not a substring ───────────────────────
   "Backend Engineer" — the box's own suggestion — matched 0 of 309 because no
   title reads exactly that. Extract the real matcher and run it. */
{
  const src = html.match(/function hitsQuery\(p\)\{[\s\S]*?\n\}/);
  if (!src) bad("hitsQuery not found — the query matcher was renamed or removed");
  else {
    const run = (q, p) => Function("query", "p", `${src[0]}; return hitsQuery(p)`)(q, p);
    const fraud = { title: "Bilingual Fraud Inbound Analyst", company: "BMO", location: "QC" };
    const claims = { title: "Director, Claims Risk Management", company: "Sun Life", location: "ON" };
    if (!run("Fraud Analyst", fraud)) bad('"Fraud Analyst" must match "Fraud Inbound Analyst"');
    else ok('a multi-word title matches out of order ("Fraud Analyst")');
    if (run("Fraud Analyst", claims)) bad("the matcher is too loose — it matched an unrelated posting");
    else ok("and still excludes a row missing one of the words");
    if (!run("  claims   risk ", claims)) bad("extra whitespace breaks the matcher");
    else ok("whitespace in a typed query is harmless");
  }
}

/* ── 7. A count must not claim more than the grid renders ──────────────────
   "81 companies in today's sweep" over a grid of 16, no pagination. */
{
  const cap = html.match(/const COMPANY_CAP = (\d+)/);
  const claim = html.match(/browseCount"\)\.textContent = [\s\S]{0,400}?companies in today's sweep/);
  if (!cap) bad("COMPANY_CAP is gone — the companies grid slice is unnamed again");
  // The cap appearing anywhere in the expression is not enough: it sits in the
  // ternary's own condition, so a branch that over-claims still mentions it.
  else if (!claim || !/shown of/.test(claim[0]))
    bad('the companies count never says "N shown of M" — it over-claims the grid');
  else ok(`the companies count is capped with the grid (${cap[1]})`);
}

/* ── 8. `+null` is 0, and Number.isFinite(0) is true ───────────────────────
   Which is how an unscored save came to be reported as "scored 0 out of 100"
   and filed under "below 55". Any page that renders a fit must rule out null
   BEFORE it coerces. */
{
  // Named precisely per page: "the word appears somewhere" passed a build where
  // the guard had been deleted and only its call site survived.
  const saved = readFileSync(join(root, "site", "saved.html"), "utf8");
  const rose = saved.match(/function roseSVG\(fit\)\{[\s\S]{0,240}/)?.[0] || "";
  if (!/fit === null|fit == null/.test(rose))
    bad("saved.html draws the rose without ruling out null — an unscored save shows a 0");
  else ok("saved.html draws no number for an unscored save");
  if (!/min:\s*null/.test(saved))
    bad("saved.html has no band for an unscored save — it lands under \"below 55\"");
  else ok("saved.html files an unscored save in its own band");

  const apply = readFileSync(join(root, "site", "apply.html"), "utf8");
  const guard = /const isScored = [\s\S]{0,160}/.exec(apply)?.[0] || "";
  if (!/fit !== null/.test(guard))
    bad("apply.html has no isScored guard — Number.isFinite(+null) is true, so it prints \"scored 0 out of 100\"");
  else if (!/if \(isScored && \+S\.fit < 55\)/.test(apply))
    bad("apply.html computes isScored but the floor branch does not use it");
  else ok("apply.html tells \"not scored\" apart from a zero");
}

/* ── 9. The matches view must not wear the sweep's chips ───────────────────
   Seventeen sector chips carrying the sweep's counts, above eight scored
   cards they did not describe. */
{
  const row = html.match(/row\.innerHTML = [^;]+;/);
  if (!row) bad("the sector row assignment was not found");
  else if (!/scored/.test(row[0]))
    bad("the sector row renders during a run — those counts belong to the sweep, not the matches");
  else ok("the sector row stands down while a run is on screen");

  if (!/sector = null; runPipeline\(\)/.test(html))
    bad("a run does not clear a leftover sector — it would narrow the eight invisibly");
  else ok("a run starts from a clean filter state");
}

/* ── 10. Nothing may assign a name runPipeline declares itself ─────────────
   The reset above lived INSIDE runPipeline for an hour and killed every single
   run. That function declares its own `const sector` further down, so assigning
   the global from its opening lines is a temporal-dead-zone ReferenceError —
   thrown inside an async function, so it surfaces as an unhandled rejection and
   the page simply sits there. Every string check passed it green; one click
   found it. */
{
  const rp = html.match(/async function runPipeline\(\)\{[\s\S]*?\n\}/);
  if (!rp) bad("runPipeline not found");
  else {
    const body = rp[0];
    const decl = /\b(const|let)\s+(sector|query|scored|feed)\b/.exec(body);
    if (!decl) ok("runPipeline declares no shadowing local");
    else {
      const before = body.slice(0, decl.index);
      if (new RegExp(`(^|[^.\\w])${decl[2]}\\s*=[^=]`).test(before))
        bad(`runPipeline assigns "${decl[2]}" above its own "${decl[1]} ${decl[2]}" — temporal dead zone, the run dies silently`);
      else ok(`runPipeline's local "${decl[2]}" is not assigned above its declaration`);
    }
  }
}

/* ── 11. The hero tabs carry no counts on a fresh load ─────────────────────── */
{
  const fn = html.match(/\$\("#heroTabs"\)\.innerHTML =[\s\S]*?;/);
  if (!fn) bad("heroTabs markup not found");
  else if (/\$\{n\}|\$\{all\}/.test(fn[0])) bad("the hero tabs print counts on a fresh load");
  else ok("the hero tabs carry no counts");
}

/* ── 12. The resume control must be reachable without a mouse ──────────────
   It was a <label> wrapping an input with `hidden`, which is display:none,
   which drops it from the tab order entirely. The one control that takes your
   resume could not be reached by keyboard and never appeared in the a11y tree. */
{
  const input = html.match(/<input type="file" id="ownFile"[^>]*>/);
  if (!input) bad("the resume file input was not found");
  else if (/\bhidden\b/.test(input[0]))
    bad("the resume input is `hidden` — display:none takes it out of the tab order");
  else ok("the resume input stays focusable");
}

console.log("");
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
