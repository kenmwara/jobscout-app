/* Does every link, control and page on the site actually do something?
 *
 * Written after four bugs reached a live build — a logo that was a bare div, an
 * upload control that existed only in the view model, a placeholder promising
 * something the code refused, and a page that ended in a screenful of nothing.
 *
 *   node tools/audit_site.mjs            # the local files
 *   node tools/audit_site.mjs --live     # what is actually deployed
 *
 * Deliberately static: it parses the shipped HTML rather than driving a browser,
 * so it runs in a second and in CI. It cannot prove a handler does the RIGHT
 * thing. It proves the control is reachable, the target exists, and nothing
 * points at something that is not there.
 *
 * It is also tuned to have no false positives, because an auditor that cries
 * wolf is one nobody runs. Three things fooled the first version: markup built
 * inside <script> with template literals, selectors assembled at runtime as
 * `$("#cp-" + id)`, and two different spellings of the same market stamp.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "site");
const live = process.argv.includes("--live");
const BASE = "https://jobscout.page/";
// stats.html moved to ops/ on 2026-09-20 — it is no longer deployed.
const PAGES = ["index.html", "apply.html", "saved.html", "privacy.html"];

let fail = 0;
const bad = (p, m) => { fail++; console.log(`  FAIL  ${p.padEnd(13)} ${m}`); };
const ok = (p, m) => console.log(`  ok    ${p.padEnd(13)} ${m}`);

/** Anything a template literal produced is generated at runtime, not shipped markup. */
const generated = (v) => v.includes("${");

async function load(page) {
  if (!live) return readFileSync(join(site, page), "utf8");
  const r = await fetch(BASE + (page === "index.html" ? "" : page));
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

function brand(page, html) {
  const anchor = /<a[^>]*class="brand"/.test(html);
  const div = /<div[^>]*class="brand"/.test(html);
  if (div && !anchor) return bad(page, "the logo is a <div> — it does nothing when clicked");
  if (!anchor) return bad(page, "no brand mark found");
  ok(page, "logo is a link");
}

function links(page, html) {
  const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(m => m[0]);
  const hrefs = anchors
    .map(t => (t.match(/href="([^"]*)"/) || [])[1])
    .filter(h => h !== undefined && !generated(h));
  if (!hrefs.length) return bad(page, "no links at all — is the header there?");

  for (const href of new Set(hrefs)) {
    if (/^(https?:|mailto:|tel:)/.test(href)) continue;
    // Cloudflare rewrites mailto: into /cdn-cgi/l/email-protection and serves
    // that path itself — it is not a file in site/ and never will be.
    if (href.startsWith("/cdn-cgi/")) continue;
    if (href === "#") {
      // Legitimate when script owns the click. A bug only if nothing drives it.
      const driven = anchors.some(t => {
        if (!/href="#"/.test(t)) return false;
        const id = (t.match(/id="([^"]+)"/) || [])[1];
        if (!id) return false;
        return new RegExp(`["'#]${id}\\b`).test(html.replace(/\sid="[^"]+"/g, ""));
      });
      if (!driven) bad(page, 'href="#" with nothing driving it');
      continue;
    }
    if (href.startsWith("#")) {
      const id = href.slice(1);
      if (!new RegExp(`id="${id}"`).test(html)) bad(page, `#${id} has no target on the page`);
      continue;
    }
    const target = href.replace(/[?#].*$/, "").replace(/\/$/, "") || "index";
    const tries = [target, `${target}.html`, join(target, "index.html")];
    if (!tries.some(c => existsSync(join(site, c)))) bad(page, `link "${href}" points at nothing`);
  }
  ok(page, `${new Set(hrefs).size} distinct links, all resolvable`);
}

function controls(page, html) {
  const ids = [...html.matchAll(/<(?:button|input|textarea|select)\b[^>]*\bid="([^"]+)"/g)]
    .map(m => m[1])
    .filter(id => !generated(id));

  const orphans = ids.filter(id => {
    const body = html.replace(new RegExp(`\\sid="${id}"`, "g"), "");
    const literal = new RegExp(`["'#]${id}["'\\)\\s]|getElementById\\("${id}"\\)`);
    if (literal.test(body)) return false;
    // Selectors are often assembled: `$("#cp-" + id)` reaches every cp-* there is.
    const prefix = id.replace(/-[^-]+$/, "-");
    return prefix !== id && !new RegExp(`["'#]${prefix}["']\\s*\\+`).test(body);
  });

  if (orphans.length) bad(page, `controls with no code behind them: ${orphans.join(", ")}`);
  else ok(page, `${ids.length} named controls, all reachable from code`);
}

function uploads(page, html) {
  for (const [tag] of html.matchAll(/<input\b[^>]*type="file"[^>]*>/g)) {
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    const hidden = /\bhidden\b|display:\s*none/.test(tag);
    if (!hidden) { ok(page, "file input is visible"); continue; }
    const reachable =
      (id && new RegExp(`<label[^>]*for="${id}"`).test(html)) ||
      /<label[^>]*class="up"/.test(html) ||
      (id && new RegExp(`${id}[^\n]*\\.click\\(\\)`).test(html));
    if (reachable) ok(page, "hidden file input has a label or opener");
    else bad(page, `file input ${id || "(unnamed)"} is hidden with nothing to open it`);
  }
}

function promises(page, html) {
  const says = [
    ...(html.match(/placeholder="([^"]*)"/g) || []),
    ...(html.match(/aria-label="([^"]*)"/g) || []),
  ].join(" ").toLowerCase();
  if (!/job title/.test(says)) return;
  const gated = /own\.length > 40 \? own : null/.test(html);
  const searches = /query|searchSweep|jobTitleSearch/.test(html);
  if (gated && !searches) bad(page, 'offers "type a job title" but the run refuses anything shorter than 40 characters');
  else ok(page, "the job-title promise is honoured");
}

function market(page, html) {
  // Two spellings: setAttribute on the shared pages, dataset on index.
  if (/setAttribute\("data-market"|dataset\.market\s*=/.test(html)) ok(page, "stamps data-market");
  else bad(page, "does not stamp data-market — it will render in the wrong palette");
}

console.log(live ? `auditing ${BASE}\n` : "auditing site/\n");
for (const page of PAGES) {
  let html;
  try { html = await load(page); }
  catch (e) { bad(page, `could not be loaded: ${e.message}`); continue; }
  brand(page, html);
  links(page, html);
  controls(page, html);
  uploads(page, html);
  promises(page, html);
  market(page, html);
  console.log("");
}
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
