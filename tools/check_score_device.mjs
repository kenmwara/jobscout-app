#!/usr/bin/env node
/**
 * check_score_device.mjs — the score is the ROSE, never a bare numeral.
 * (sanity suite, bound to the site's surfaces via tools/lib/routes.mjs)
 *
 * The bare numeral shipped twice on the phone ("Sun Life · fit 28", then
 * "fit 70" after that was reported). Nothing was watching. This watches:
 *   1. no text node states a score in prose (fit 70, score: 70, 70/100,
 *      70 out of 100) outside the rose itself; explanation surfaces are
 *      exempt narrowly - a number doing narrative work in a sentence is not
 *      a score display standing in for the device
 *   2. every element declaring data-band owns a rose
 *
 *   node tools/check_score_device.mjs
 *   node tools/check_score_device.mjs --mutate bare-score   # must FAIL
 */
import { chromium } from "playwright";
import { openRoute } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const PROSE = [/\bfit\s+\d{1,3}\b/i, /\bscore[:\s]+\d{1,3}\b/i, /\bmatch(?:es)?[:\s]+\d{1,3}\b/i, /\b\d{1,3}\s*\/\s*100\b/, /\b\d{1,3}\s+out of\s+100\b/i, /\b(?:rated|rating)\s+\d{1,3}\b/i];
const fails = []; let scanned = 0;
const b = await chromium.launch();
for (const route of ["landing", "browse", "apply", "saved", "states"]) {
  const { page, ctx } = await openRoute(b, route, "light");
  if (MUTATE === "bare-score") await page.evaluate(() => { const o = document.querySelector(".job .co, #co, .row .t"); if (o) o.textContent = o.textContent + " · fit 70"; });
  const r = await page.evaluate(src => {
    const out = { prose: [], roseless: [] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim(); if (!t) continue;
      const el = n.parentElement; if (!el) continue;
      if (el.closest("svg.rose, .fit")) continue;                                   /* the real device */
      if (el.closest("script, style, [hidden]")) continue;
      if (el.closest(".state__b, .ev__b, .refusal, .prep__lede, .lede, .mini, .fnote, .how, .sub, .grounded, p.big")) continue;   /* explanation, narrowly */
      const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
      for (const s of src) { if (new RegExp(s.source, s.flags).test(t)) { out.prose.push(`${(typeof el.className === "string" && el.className) || el.tagName}: "${t.slice(0, 60)}"`); break; } }
    }
    document.querySelectorAll("[data-band]").forEach(el => { if (el.matches("svg.rose")) return; if (!el.querySelector("svg.rose")) out.roseless.push((typeof el.className === "string" && el.className) || el.tagName); });
    return out;
  }, PROSE.map(r => ({ source: r.source, flags: r.flags })));
  scanned++;
  for (const x of [...new Set(r.prose)]) fails.push(`${route}: the score is written as prose — ${x}. It is the rose, with the numeral inside it.`);
  for (const x of [...new Set(r.roseless)]) fails.push(`${route}: <${x}> declares a band but carries no rose`);
  await ctx.close();
}
await b.close();
console.log(`check_score_device: ${scanned} routes`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 20).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ every score is a rose; no score is written as prose");
