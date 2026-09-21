#!/usr/bin/env node
/**
 * check_parallax.mjs — the card's parallax, measured (sanity pack).
 *
 *   A  TRACKING  the transform differs between two pointer positions and is
 *                3d (perspective present; a flat skew is the "too subtle" bug)
 *   B  REDUCED   with prefers-reduced-motion, hovering produces no transform
 *   C  STRETCHED the mockup card's link covers the WHOLE card and the heart
 *                is still reachable on top of it (depth on an ANCESTOR of the
 *                anchor silently shrinks the link to the title's box)
 *   D  ARRIVAL   cards start pending, resolve to in, and end at opacity 1 -
 *                also inside an overflow container (the mockup's frame)
 *
 * Runs on the MOCKUP (.jcard, A-D) and the SITE's browse list (.job, A B D:
 * the site card is not a stretched link, its title is).
 *
 *   node tools/check_parallax.mjs
 *   node tools/check_parallax.mjs --mutate flat | ignore-motion | shrink-link | bury-actions
 */
import { chromium } from "playwright";
import { openRoute, SITE } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const MOCK = SITE.replace(/\/site$/, "/mockups/mobile.html");
const fails = []; let n = 0;
const mut = async p => {
  if (MUTATE === "flat") await p.addStyleTag({ content: ".jcard:hover,.job:hover{transform:translateY(-2px) !important}" });
  if (MUTATE === "ignore-motion") await p.addStyleTag({ content: "@media (prefers-reduced-motion: reduce){.jcard:hover,.job:hover{transform:perspective(900px) rotateY(6deg) !important}}" });
  if (MUTATE === "shrink-link") await p.addStyleTag({ content: ".jcard__title{transform:translateZ(20px) !important}" });
  if (MUTATE === "bury-actions") await p.addStyleTag({ content: ".jcard__link::after{z-index:9 !important}.jcard__actions{z-index:0 !important;position:static !important}" });
};
const b = await chromium.launch();
async function open(target, reduce) {
  if (target === "mockup") {
    const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: reduce ? "reduce" : "no-preference" });
    const p = await ctx.newPage(); await p.goto(MOCK, { waitUntil: "networkidle" }); await p.waitForSelector("#view .card.jcard", { timeout: 15000 }); await mut(p); await p.waitForTimeout(600);
    return { p, ctx, card: p.locator("#view .card.jcard").first(), all: "#view .card.jcard", title: ".jcard__title" };
  }
  const ctx = await b.newContext({ viewport: { width: 1360, height: 1000 }, reducedMotion: reduce ? "reduce" : "no-preference" });
  const p = await ctx.newPage(); await p.goto(SITE + "/index.html", { waitUntil: "networkidle" });
  await p.evaluate(() => typeof setView === "function" && setView("browse")); await p.waitForSelector("#browseJobs .job", { timeout: 20000 }); await mut(p); await p.waitForTimeout(800);
  return { p, ctx, card: p.locator("#browseJobs .job").first(), all: "#browseJobs .job", title: "h3.role" };
}
for (const target of ["mockup", "site"]) {
  /* A (+ C on the mockup) */
  { const { p, ctx, card } = await open(target, false);
    await card.scrollIntoViewIfNeeded(); const box = await card.boundingBox();
    const read = () => card.evaluate(el => getComputedStyle(el).transform);
    /* a list that re-renders under a stationary pointer gets no pointermove;
       the nudge is what a real hand does anyway */
    await p.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2); await p.waitForTimeout(200); await p.mouse.move(box.x + box.width * 0.15 + 2, box.y + box.height * 0.2 + 1); await p.waitForTimeout(260); const left = await read();
    await p.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.8); await p.waitForTimeout(200); await p.mouse.move(box.x + box.width * 0.85 - 2, box.y + box.height * 0.8 - 1); await p.waitForTimeout(260); const right = await read();
    n++;
    if (left === right) fails.push(`${target} A/tracking: the transform is identical at two pointer positions (${left.slice(0, 42)}…)`);
    if (!/matrix3d/.test(left)) fails.push(`${target} A/tracking: no 3d transform at hover (${left.slice(0, 42)}…) — perspective is missing`);
    if (target === "mockup") {
      await p.mouse.move(0, 0); await p.waitForTimeout(700);
      const cb = await card.boundingBox();
      const probe = await p.evaluate(({ cb }) => { const at = (x, y) => { const e = document.elementFromPoint(x, y); if (!e) return "none"; if (e.closest(".heart") || e.closest(".jcard__actions")) return "ACTIONS"; if (e.closest(".jcard__link")) return "LINK"; return (typeof e.className === "string" && e.className) || e.tagName; };
        return { padTopLeft: at(cb.x + 12, cb.y + 8), rightOfMeta: at(cb.x + cb.width - 30, cb.y + cb.height * 0.5), lowerRight: at(cb.x + cb.width - 30, cb.y + cb.height - 90) }; }, { cb });
      n++;
      for (const [where, got] of Object.entries(probe)) if (got !== "LINK") fails.push(`mockup C/stretched: ${where} hits "${got}", not the link — the stretched link is not covering the card`);
      const hb = await card.locator(".heart").first().boundingBox();
      const onHeart = await p.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el && el.closest(".heart") ? "heart" : (el ? (typeof el.className === "string" && el.className) || el.tagName : "none"); }, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
      if (onHeart !== "heart") fails.push(`mockup C/stretched: the heart is covered by "${onHeart}" — the overlay is above the actions`);
    }
    await ctx.close(); }
  /* B */
  { const { p, ctx, card } = await open(target, true);
    await card.scrollIntoViewIfNeeded(); await card.hover(); await p.waitForTimeout(300);
    const t = await card.evaluate(el => getComputedStyle(el).transform); n++;
    if (t !== "none") fails.push(`${target} B/reduced: hovering under prefers-reduced-motion still transforms (${t.slice(0, 48)}…)`);
    await ctx.close(); }
  /* D */
  { const { p, ctx, all, title } = await open(target, false);
    /* the site's list begins below the fold; a card can only arrive once it is in view */
    await p.locator(all).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
    const states = await p.evaluate(sel => [...document.querySelectorAll(sel)].map(c => c.getAttribute("data-arrive")), all);
    n++;
    if (!states.includes("in")) fails.push(`${target} D/arrival: no card reached data-arrive="in" (${[...new Set(states)].join(",")}) — the observer never fired`);
    await p.evaluate(async () => { const s = ms => new Promise(r => setTimeout(r, ms)); for (let y = 0; y < Math.min(document.body.scrollHeight, 6000); y += 300) { scrollTo(0, y); await s(60); }
      for (const el of document.querySelectorAll("*")) { const o = getComputedStyle(el).overflowY; if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight) for (let y = 0; y < Math.min(el.scrollHeight, 4000); y += 250) { el.scrollTop = y; await s(50); } } });
    await p.waitForTimeout(1800);
    /* a card that is still less than 8% inside the viewport at the final
       scroll position is legitimately pending; everything passed or in view
       must have arrived */
    const op = await p.evaluate(([sel, t]) => [...document.querySelectorAll(sel)].slice(0, 40).map(c => { const el = c.querySelector(t), r = c.getBoundingClientRect(); const due = r.top < innerHeight * 0.92 - r.height * 0.08; return el && due ? +getComputedStyle(el).opacity : 1; }), [all, title]);
    const stuck = op.filter(o => o < 0.95).length;
    if (stuck) fails.push(`${target} D/arrival: ${stuck} title(s) still below opacity 1 after scrolling past — cards are stranded pending`);
    await ctx.close(); }
}
await b.close();
console.log(`check_parallax: ${n} assertions on the mockup and the site`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); fails.forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ tilt tracks, reduced motion is flat, the stretched link covers the mockup card, every card arrives");
