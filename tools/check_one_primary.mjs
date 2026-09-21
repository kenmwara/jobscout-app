#!/usr/bin/env node
/**
 * check_one_primary.mjs — one filled primary per region; no action offered
 * twice around itself. (sanity suite, site-bound via tools/lib/routes.mjs)
 *
 * "Primary" is measured, not named: a button whose background is the
 * computed --action. Regions: each card / step / sheet is its own region,
 * everything else is the screen. A list of cards may show one per card.
 *
 *   node tools/check_one_primary.mjs
 *   node tools/check_one_primary.mjs --mutate three-primaries | repeat-action
 */
import { chromium } from "playwright";
import { openRoute } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const REGION = ".job, .step, .panel, .refusal, .hsheet, .jcard, .limited, .empty, .banner";
const fails = []; let scanned = 0;
const b = await chromium.launch();
for (const route of ["landing", "browse", "apply", "saved", "sheet", "states"]) {
  const { page, ctx } = await openRoute(b, route, "light");
  if (MUTATE === "three-primaries") await page.evaluate(() => {
    const probe = document.createElement("span"); probe.style.color = "var(--action)"; document.body.appendChild(probe); const rgb = getComputedStyle(probe).color; probe.remove();
    const prim = [...document.querySelectorAll("button, a.btn")].find(el => getComputedStyle(el).backgroundColor === rgb && el.getBoundingClientRect().height);
    if (!prim) return; for (let i = 0; i < 2; i++) { const c = prim.cloneNode(true); c.textContent = "Another action " + i; prim.parentElement.appendChild(c); } });
  /* the detail screen's real shape: a card offering the primary and the page
     offering it again around it. The apply page hides its step buttons until
     a résumé is pasted, so the mutation plants the pair rather than hoping
     to find one. */
  if (MUTATE === "repeat-action") await page.evaluate(() => {
    const host = document.querySelector(".job, .step, .panel"); if (!host) return;
    const mk = () => { const b = document.createElement("button"); b.className = "btn"; b.style.cssText = "background:var(--action);color:var(--action-on);min-height:44px"; b.textContent = "Prepare application →"; return b; };
    host.appendChild(mk()); document.body.appendChild(mk()); });
  const r = await page.evaluate(REGION => {
    const probe = document.createElement("span"); probe.style.color = "var(--action)"; document.body.appendChild(probe); const actionRGB = getComputedStyle(probe).color; probe.remove();
    const filled = [...document.querySelectorAll("button, a.btn, a.applybtn, [role='button']")].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.height && getComputedStyle(el).backgroundColor === actionRGB && !el.closest("[hidden]"); });
    const name = el => (typeof el.className === "string" && el.className) || el.tagName;
    const byRegion = new Map();
    for (const el of filled) { const region = el.closest(REGION) || document.body; if (!byRegion.has(region)) byRegion.set(region, []); byRegion.get(region).push((el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)); }
    const over = []; for (const [region, labels] of byRegion) if (labels.length > 1) over.push(`${name(region)}: ${labels.length} filled — ${labels.join(" | ")}`);
    const byLabel = new Map();
    for (const el of filled) { const t = (el.textContent || "").trim().replace(/\s+/g, " "); if (t.length < 4) continue; if (!byLabel.has(t)) byLabel.set(t, []); byLabel.get(t).push(el.closest(REGION) || document.body); }
    const dupes = [];
    for (const [t, regions] of byLabel) for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++)
      if (regions[i] !== regions[j] && (regions[i].contains(regions[j]) || regions[j].contains(regions[i]))) { dupes.push(`"${t.slice(0, 44)}" offered both inside <${name(regions[j]).slice(0, 26)}> and around it`); i = regions.length; break; }
    return { over, dupes };
  }, REGION);
  scanned++;
  for (const x of r.over) fails.push(`${route} A/primary: ${x} — a filled button is a recommendation; more than one is none`);
  for (const x of r.dupes) fails.push(`${route} B/repeat: ${x} — the page already says it`);
  await ctx.close();
}
await b.close();
console.log(`check_one_primary: ${scanned} routes`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 20).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ one filled primary per region, no action repeated around itself");
