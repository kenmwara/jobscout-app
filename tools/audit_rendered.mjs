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
  // The builder moved to site/rose.js (one glyph for every page); the guard
  // lives there now and every page inherits it.
  const saved = readFileSync(join(root, "site", "saved.html"), "utf8");
  const rosejs = readFileSync(join(root, "site", "rose.js"), "utf8");
  const rose = rosejs.match(/function roseSVG\(fit[^)]*\)\s*\{[\s\S]{0,300}/)?.[0] || "";
  if (!/fit !== null|fit === null|fit == null/.test(rose))
    bad("rose.js draws the rose without ruling out null — an unscored save shows a 0");
  else ok("saved.html draws no number for an unscored save");
  if (!/min:\s*null/.test(saved))
    bad("saved.html has no band for an unscored save — it lands under \"below 55\"");
  else ok("saved.html files an unscored save in its own band");

  const apply = readFileSync(join(root, "site", "apply.html"), "utf8");
  const guard = /const isScored = [\s\S]{0,160}/.exec(apply)?.[0] || "";
  if (!/fit !== null/.test(guard))
    bad("apply.html has no isScored guard — Number.isFinite(+null) is true, so it prints \"scored 0 out of 100\"");
  // The intent is 'the branch is gated on isScored', not the exact spelling —
  // pinning the whole condition made a legitimate '&& !S.stretch' read as a
  // regression. Anchored on the guard, open at the end.
  else if (!/if \(isScored && \+S\.fit < 55\b/.test(apply))
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

/* ── 13. A #fragment must exist on the page it points at ───────────────────
   Five pages footer-link to "privacy#counted". privacy.html had the section —
   "What is counted" — and no id on it, so every one of those links quietly
   landed at the top of the page instead. Nothing checked fragments at all. */
{
  // stats.html moved to ops/ on 2026-09-20 — it is no longer deployed.
  const pages = ["index.html", "apply.html", "saved.html", "privacy.html"];
  const src = Object.fromEntries(pages.map(f => [f, readFileSync(join(root, "site", f), "utf8")]));
  const idsOf = (html) => new Set(
    [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
      .concat([...html.matchAll(/<a[^>]+name="([^"]+)"/g)].map(m => m[1])));

  let checked = 0;
  for (const page of pages) {
    for (const m of src[page].matchAll(/href="([^"]*#[^"]+)"/g)) {
      const [target, frag] = m[1].split("#");
      if (!frag || frag === "top") continue;          // "#top" is the page itself
      // Where does it point? Same page when the target is empty, else a sibling
      // page written without its .html extension, the way Pages serves them.
      const file = target === "" ? page : (target.endsWith(".html") ? target : target + ".html");
      if (!src[file]) continue;                        // external or dynamic
      checked++;
      // A fragment built by script is fine as long as SOMETHING writes that id.
      const scripted = new RegExp(`id="\\$\\{|id = "${frag}"|getElementById\\("${frag}"\\)`).test(src[file]);
      if (!idsOf(src[file]).has(frag) && !scripted)
        bad(`${page} links to ${m[1]} and ${file} has no "${frag}" — the link lands at the top`);
    }
  }
  if (checked) ok(`${checked} in-page anchors all resolve`);
}

/* ── 14. An IIFE may not touch a binding declared below it ────────────────
   `view = "browse"` inside an IIFE that runs before `let view` is reached: a
   ReferenceError that killed every line of script after it. The markup all
   arrived and nothing worked. (The sibling shape — a function assigning a name
   it also declares locally — is check 10.)

   Scoped to IIFE bodies on purpose. An earlier cut tried to infer "runs at load"
   by counting braces across the whole file, but the slice spans markup and
   template literals, so the depth was meaningless and the check silently
   matched nothing. Finding the blocks by their own delimiters is exact. */
{
  const script = html.slice(html.indexOf("<script>"), html.lastIndexOf("</script>"));
  const lines = script.split("\n");

  const declaredAt = new Map();
  lines.forEach((l, i) => {
    const m = /^(?:let|var)\s+(.+?);\s*$/.exec(l);
    if (!m) return;
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/[\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name) && !declaredAt.has(name)) declaredAt.set(name, i);
    }
  });

  // Every `(function ...(){` / `(() => {` at column 0, to its `})();`
  const bodies = [];
  lines.forEach((l, i) => {
    if (!/^\(\s*(?:function|\(|async)/.test(l)) return;
    for (let j = i + 1; j < lines.length && j < i + 200; j++) {
      if (/^\}\s*\)\s*\(\s*\)\s*;?\s*$/.test(lines[j])) { bodies.push([i, j]); return; }
    }
  });

  const offenders = [];
  for (const [from, to] of bodies) {
    for (const [name, declLine] of declaredAt) {
      if (declLine <= to || name.length < 3) continue;   // declared after this IIFE
      // Inside a TEMPLATE LITERAL a single backslash-w collapses to "w", so this
      // regex silently became [^.w$]name s*= and could never match. Doubled.
      // Inside a TEMPLATE LITERAL a lone backslash-w collapses to "w", so this
      // silently became [^.w$]name s*= and could never match anything.
      const assign = new RegExp(`(^|[^.\\w$])${name}\\s*=[^=]`);
      for (let i = from; i <= to; i++) {
        const l = lines[i];
        if (!assign.test(l) || /^\s*(\/\/|\*|\/\*)/.test(l) || /<\/?[a-zA-Z]/.test(l)) continue;
        if (new RegExp(`(let|var|const)\\s+${name}\\b`).test(l)) continue;
        offenders.push(`${name} assigned at script line ${i + 1}, inside an IIFE, declared at ${declLine + 1}`);
        break;
      }
    }
  }
  if (offenders.length) offenders.forEach((o) => bad(`temporal dead zone: ${o}`));
  else ok(`${bodies.length} IIFE bodies, none touching a binding declared below`);
}

/* ── 15. A class the CSS styles and the page never sets ────────────────────
   `.scores` and `.scard` were styled for months and set on nothing. The rules
   nested under them — the whole below-floor panel among them — never applied.
   Valid CSS, present elements, silent failure: the same shape as the two
   temporal-dead-zone bugs above, and just as invisible to a check that only
   asks whether a thing EXISTS.

   Conservative on purpose: any mention of the bare word anywhere outside the
   <style> block counts as used, so a class assembled by concatenation is never
   reported. What it catches is the name only the stylesheet believes in. */
{
  const style = html.slice(html.indexOf("<style>"), html.lastIndexOf("</style>"));
  const rest = html.slice(0, html.indexOf("<style>")) + html.slice(html.lastIndexOf("</style>"));

  // Class selectors, minus the ones inside comments (which is where the
  // deleted names are now explained).
  const bare = style.replace(/\/\*[\s\S]*?\*\//g, " ");
  const styled = new Set();
  for (const m of bare.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) styled.add(m[1]);

  // A name is "used" if it appears anywhere else in the file at all.
  const orphans = [...styled].filter((c) => !new RegExp(`\\b${c.replace(/-/g, "\\-")}\\b`).test(rest));

  if (orphans.length) orphans.forEach((c) => bad(`.${c} is styled but the page never sets it`));
  else ok(`${styled.size} styled classes, every one of them set somewhere`);
}

/* ── 16. Every setView() names a view that exists ──────────────────────────
   setView("home") hid both #v-landing and #v-browse and left a header above
   an empty document. No error, no blank-screen crash, nothing for a check
   that asks whether elements are present — the elements were all present and
   all hidden. */
{
  const views = new Set([...html.matchAll(/id="v-([\w-]+)"/g)].map((m) => m[1]));
  // A comment explaining the bug is not a call site — the first run of this
  // check flagged its own cautionary tale.
  const code = html.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ 	]*\/\/.*$/gm, " ");
  const calls = [...code.matchAll(/setView\(\s*"([\w-]+)"/g)].map((m) => m[1]);
  const wrong = [...new Set(calls)].filter((v) => !views.has(v));
  if (!views.size) bad("no #v-* view containers found — this check cannot fire");
  else if (wrong.length) wrong.forEach((v) => bad(`setView("${v}") names no #v-${v} container`));
  else ok(`${new Set(calls).size} setView targets, all of them real views`);
}

/* ── 17. A retry puts the button's own words back ──────────────────────────
   apply.html's `failed(id, msg, label)` restores a button's text. The label
   is passed at the call site, 350 lines from the markup that first set it, so
   renaming the button renamed it only until the first failure — after which
   "Write the letter" came back as "Draft it". Both halves read fine alone. */
{
  const apply = readFileSync(join(root, "site", "apply.html"), "utf8");
  const markup = new Map();
  for (const m of apply.matchAll(/<button[^>]*\bid="do-(\w+)"[^>]*>([^<]+)<\/button>/g))
    markup.set(m[1], m[2].trim());

  const wrong = [];
  for (const m of apply.matchAll(/failed\(\s*"(\w+)"[\s\S]{0,200}?,\s*"([^"]+)"\s*\)/g)) {
    const want = markup.get(m[1]);
    if (want && m[2] !== want) wrong.push(`failed("${m[1]}", …, "${m[2]}") but the button says "${want}"`);
  }
  if (!markup.size) bad("no do-* buttons found in apply.html — this check cannot fire");
  else if (wrong.length) wrong.forEach((w) => bad(`retry label drift: ${w}`));
  else ok(`${markup.size} step buttons, every retry restores its own words`);
}

console.log("");
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
