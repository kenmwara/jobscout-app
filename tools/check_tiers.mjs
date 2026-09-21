#!/usr/bin/env node
/**
 * check_tiers.mjs — design system v3, stage 2. Container weight IS
 * importance, measured as GEOMETRY (fill cannot carry it: on light the fact
 * fill is heavier than the verdict fill).
 *
 *   tier 1 verdict  taller AND wider-padded AND pill-radius
 *   tier 2 fact     shorter, tighter, small-radius, still a container
 *   tier 3 context  no container at all
 *
 *   node tools/check_tiers.mjs
 *   node tools/check_tiers.mjs --mutate fat-fact | boxed-date | pill-fact
 */
import { chromium } from "playwright";
import { openRoute } from "./lib/routes.mjs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const ROUTES = ["browse", "apply", "saved"], THEMES = ["light", "dark"];
const TRANSPARENT = new Set(["rgba(0, 0, 0, 0)", "transparent"]);
const fails = []; let n = 0;

const b = await chromium.launch();
for (const route of ROUTES) for (const theme of THEMES) {
  const { page, ctx } = await openRoute(b, route, theme);
  if (MUTATE === "fat-fact") await page.addStyleTag({ content: ".tier2{height:26px !important}" });
  if (MUTATE === "boxed-date") await page.addStyleTag({ content: ".tier3{background:var(--sunken) !important;padding:0 8px !important}" });
  if (MUTATE === "pill-fact") await page.addStyleTag({ content: ".tier2{border-radius:var(--r-pill) !important}" });
  const r = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".meta").forEach((m, i) => {
      if (!m.getBoundingClientRect().height) return;
      const g = s => { const el = m.querySelector(s); if (!el) return null; const c = getComputedStyle(el), b = el.getBoundingClientRect();
        return { h: +b.height.toFixed(1), padX: parseFloat(c.paddingLeft) || 0, rad: parseFloat(c.borderTopLeftRadius) || 0, bg: c.backgroundColor }; };
      out.push({ i, t1: g(".tier1"), t2: g(".tier2"), t3: g(".tier3") });
    });
    return out;
  });
  for (const m of r) {
    n++;
    const w = `${route}/${theme} meta#${m.i}`;
    if (!m.t2) { fails.push(`${w}: no tier 2 — the fact chip is missing`); continue; }
    if (!m.t3) { fails.push(`${w}: no tier 3 — the date is missing`); continue; }
    if (!TRANSPARENT.has(m.t3.bg)) fails.push(`${w}: tier 3 paints ${m.t3.bg} — context has NO container`);
    if (TRANSPARENT.has(m.t2.bg)) fails.push(`${w}: tier 2 has no background — a fact is still a container`);
    if (!m.t1) continue;   /* a swept card has no verdict, correctly */
    if (m.t1.h <= m.t2.h) fails.push(`${w}: verdict ${m.t1.h}px is not taller than fact ${m.t2.h}px`);
    if (m.t1.padX <= m.t2.padX) fails.push(`${w}: verdict padding ${m.t1.padX}px is not wider than fact ${m.t2.padX}px`);
    if (Math.abs(m.t1.rad - m.t2.rad) < 2) fails.push(`${w}: verdict and fact share a radius (${m.t1.rad}px) — same shape, no hierarchy`);
  }
  await ctx.close();
}
await b.close();
console.log(`check_tiers: ${n} meta rows`);
if (!n && !MUTATE) { console.error("  ✗ no .meta rows found on any route — the selector or the markup moved"); process.exit(1); }
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); }
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 20).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ verdict taller, wider and differently shaped than fact; context bare");
