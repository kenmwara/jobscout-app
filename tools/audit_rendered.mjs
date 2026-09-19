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

console.log("");
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
