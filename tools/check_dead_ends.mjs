#!/usr/bin/env node
/**
 * check_dead_ends.mjs — a blocked action carries its own unblock.
 * (sanity suite, bound to the site's surfaces via tools/lib/routes.mjs)
 *
 *   A. text that states a requirement, error or block must sit in a container
 *      that DECLARES the block (data-blocked) and carries a control that
 *      resolves it (an input, a textarea, a button, [data-unblock]). A
 *      .refusal is the declared form of a block and is exempt.
 *   B. nothing asks the reader to supply something only the SYSTEM can (a
 *      posting, the feed, the scorer). A missing posting is a refusal.
 *
 *   node tools/check_dead_ends.mjs
 *   node tools/check_dead_ends.mjs --mutate dead-end | system-blame
 */
import { chromium } from "playwright";
import { openRoute, openMockupDraft } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const BLOCK = /\b(required|needed|missing|unavailable|not available|must (?:have|add|provide)|please (?:add|provide|upload)|cannot|can't|unable to|failed|error)\b/i;
const SYSTEM_OWNED = /\b(posting|listing|feed|sweep|scorer|server|worker|api)\b/i;
/* copy that EXPLAINS rather than blocks: the product's own promise lines */
const EXPLAINS = /\b(cannot fit|cannot fill|cannot disagree|is missing from your|nothing .* is missing)\b/i;
const fails = []; let scanned = 0;
const b = await chromium.launch();
for (const route of ["landing", "browse", "apply", "saved", "sheet", "states", "mockup-draft"]) {
  const { page, ctx } = route === "mockup-draft" ? await openMockupDraft(b) : await openRoute(b, route, "light");
  if (MUTATE === "dead-end") await page.evaluate(() => { const c = document.querySelector(".step, .job"); if (c) { const n = document.createElement("p"); n.textContent = "profile required"; c.appendChild(n); } });
  if (MUTATE === "system-blame") await page.evaluate(() => { const c = document.querySelector(".step, .job"); if (c) { const n = document.createElement("p"); n.textContent = "posting required"; const btn = document.createElement("button"); btn.className = "btn"; btn.textContent = "Retry"; c.setAttribute("data-blocked", "x"); c.appendChild(n); c.appendChild(btn); } });
  const r = await page.evaluate(({ blockSrc, blockFlags, sysSrc, sysFlags, exSrc, exFlags }) => {
    const BLOCK = new RegExp(blockSrc, blockFlags), SYS = new RegExp(sysSrc, sysFlags), EX = new RegExp(exSrc, exFlags);
    const out = { dead: [], blame: [] };
    const CONTAINER = ".job, .step, .panel, .state, .refusal, .ev, .hsheet, .banner, .box, .limited, .empty, .jcard, .draft, .sheet";
    /* the mockup harness explains itself outside the phone frame; only the product is judged */
    const walker = document.createTreeWalker(document.querySelector(".screen") || document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim(); if (!t || t.length < 4) continue;
      const el = n.parentElement; if (!el || el.closest("script, style, [hidden]")) continue;
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
      if (el.closest("button, a[href], label")) continue;                   /* a block stated ON a control is the remedy */
      if (!BLOCK.test(t) || EX.test(t)) continue;
      const box = el.closest(CONTAINER) || document.body;
      if (box.closest(".refusal")) continue;
      const declared = box.closest("[data-blocked]");
      const name = (typeof el.className === "string" && el.className) || el.tagName;
      if (!declared) out.dead.push(`${name}: "${t.slice(0, 58)}" (container declares no data-blocked)`);
      else if (!declared.querySelector(".btn--unblock, [data-unblock], input:not([type=hidden]), textarea, button:not([hidden])")) out.dead.push(`${name}: "${t.slice(0, 58)}" (data-blocked but no unblock control)`);
      if (SYS.test(t)) out.blame.push(`${name}: "${t.slice(0, 58)}"`);
    }
    return out;
  }, { blockSrc: BLOCK.source, blockFlags: BLOCK.flags, sysSrc: SYSTEM_OWNED.source, sysFlags: SYSTEM_OWNED.flags, exSrc: EXPLAINS.source, exFlags: EXPLAINS.flags });
  scanned++;
  for (const x of [...new Set(r.dead)]) fails.push(`${route} A/dead-end: ${x} — states a block with no declared unblock in the same container`);
  for (const x of [...new Set(r.blame)]) fails.push(`${route} B/blame: ${x} — asks the reader for something only the system can supply`);
  await ctx.close();
}
await b.close();
console.log(`check_dead_ends: ${scanned} routes`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 20).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ every stated block has a declared unblock beside it; none blames the reader for the system");
