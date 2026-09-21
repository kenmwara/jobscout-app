#!/usr/bin/env node
/**
 * check_bar_bleed.mjs — a bar that paints, bleeds. (field-and-bar pack)
 *
 * For every bar-like element: if it paints a background, its border box must
 * reach both edges of its scroll container. A bar that paints and is inset is
 * the defect in one rule, whatever produced it: the mockup's header was
 * painted --canvas inside the phone's padding and drew two seams down the
 * market wash. A GEOMETRY check, so it catches the next one too.
 *
 *   node tools/check_bar_bleed.mjs
 *   node tools/check_bar_bleed.mjs --mutate inset-bar
 */
import { chromium } from "playwright";
import { openRoute, openMockup } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const TOL = 1.0;
const fails = []; let cells = 0;
const b = await chromium.launch();
const TARGETS = [["landing", "site"], ["browse", "site"], ["apply", "site"], ["saved", "site"], ["home", "mockup"], ["matches", "mockup"], ["draft", "mockup"], ["saved", "mockup"]];
for (const [route, kind] of TARGETS) for (const theme of ["light", "dark"]) {
  const { page, ctx } = kind === "site" ? await openRoute(b, route, theme) : await openMockup(b, route, theme);
  if (MUTATE === "inset-bar") await page.addStyleTag({ content: ".ahead,header.site{background:var(--canvas) !important;margin-inline:16px !important}" });
  const bad = await page.evaluate(TOL => {
    const out = [];
    const bars = document.querySelectorAll("header, .ahead, .phdr, .toolbar, .sheet__bar, [data-bar], .bar--solid, #taxGrid");
    for (const el of bars) {
      const cs = getComputedStyle(el); if (cs.display === "none") continue;
      const m = (cs.backgroundColor || "").match(/rgba?\(([^)]+)\)/);
      const alpha = m ? (m[1].split(",")[3] !== undefined ? parseFloat(m[1].split(",")[3]) : 1) : 0;
      const paints = alpha > 0.01 || (cs.backgroundImage && cs.backgroundImage !== "none");
      if (!paints) continue;
      let host = el.parentElement, hostBox = null;
      while (host && host !== document.documentElement) { const hs = getComputedStyle(host); if (hs.overflow !== "visible" || hs.overflowY !== "visible" || hs.position === "relative" || hs.contain !== "none") { hostBox = host.getBoundingClientRect(); break; } host = host.parentElement; }
      const r = el.getBoundingClientRect(), L = hostBox ? hostBox.left : 0, R = hostBox ? hostBox.right : innerWidth;
      const gapL = r.left - L, gapR = R - r.right;
      if (gapL > TOL || gapR > TOL) out.push({ sel: (typeof el.className === "string" && el.className) || el.tagName, bg: cs.backgroundColor, gapL: Math.round(gapL), gapR: Math.round(gapR), host: host ? ((typeof host.className === "string" && host.className) || host.tagName) : "viewport" });
    }
    return out;
  }, TOL);
  cells++;
  for (const x of bad) fails.push(`${route}/${theme}: <${x.sel}> paints ${x.bg} but is inset ${x.gapL}px / ${x.gapR}px inside ${x.host} — the ground shows beside it as a seam; drop the background or bleed it`);
  await ctx.close();
}
await b.close();
console.log(`check_bar_bleed: ${cells} cells`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 20).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ every bar that paints reaches both edges of its container");
