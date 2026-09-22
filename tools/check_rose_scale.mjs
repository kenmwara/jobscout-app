#!/usr/bin/env node
/**
 * check_rose_scale.mjs — the fit numeral scales with the ring it sits in.
 *
 * Ken, 2026-09-21: "There seems to be a bug in the rose number on the
 * applications page - it always appears small." It was two bugs on one line.
 * site/base.css declared `.rose` width TWICE (52px, then 64px again in the
 * shared-components block) so the later one silently won everywhere; and the
 * numeral sat on a fixed --t0 that never moved when the ring grew. The mockup
 * had the same shape: .jcard__score grows 44 -> 52 on the application screens
 * while .jcard__num stayed on --t3.
 *
 * check_rose passed throughout, because it checks the DOTS and the band, which
 * were never the broken part.
 *
 *   A  the numeral/ring ratio is the same wherever the rose is drawn
 *   B  `.rose` has ONE width declaration in the stylesheet   (the cause)
 *
 *   node tools/check_rose_scale.mjs
 *   node tools/check_rose_scale.mjs --mutate fixed-numeral | duplicate-width
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const SITE = process.env.SITE || "http://localhost:8765/site";
const MOCK = SITE.replace(/\/site$/, "/mockups");
const args = process.argv.slice(2);
const MUTATE = args.indexOf("--mutate") < 0 ? null : args[args.indexOf("--mutate") + 1];
const fails = []; let cells = 0;
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };

// B. the cause: one size declaration, not two fighting each other.
const css = readFileSync(new URL("../site/base.css", import.meta.url), "utf8");
const widths = [...css.matchAll(/^\.rose\{[^}]*width:\s*(\d+)px/gm)].map(m => m[1]);
cells++;
if (MUTATE !== "duplicate-width" && widths.length > 1)
  fails.push(`site/base.css declares .rose width ${widths.length} times (${widths.join(", ")}px) — the later one wins silently`);
if (MUTATE === "duplicate-width" && widths.length <= 1)
  fails.push("mutation check: expected a duplicate .rose width and found none");

const READ = () => [...document.querySelectorAll("svg.rose, .jcard__score")].map(el => {
  const ring = Math.round(el.getBoundingClientRect().width);
  const host = el.closest(".jcard__score") || el.parentElement;
  const num = el.querySelector(".fitnum, text") ||
              (host && host.querySelector(".jcard__num, .fitnum"));
  if (!num || !ring) return null;
  /* An SVG numeral's box IS its glyphs, so measure it. An HTML one is
     position:absolute;inset:0 and its box is the whole ring - measuring that
     returns 1.0 for every rose and the check passes saying nothing. Its font
     size is already in px, so use it directly. */
  const drawn = num.ownerSVGElement
    ? Math.round(num.getBoundingClientRect().height)
    : Math.round(parseFloat(getComputedStyle(num).fontSize));
  if (!drawn) return null;
  return { ring, drawn, ratio: +(drawn / ring).toFixed(3) };
}).filter(Boolean);

const b = await chromium.launch();
const seen = [];
for (const [url, tag] of [[`${SITE}/index.html`, "site landing"], [`${SITE}/saved.html`, "site saved"],
                          [`${MOCK}/mobile.html`, "mockup home"]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  if (MUTATE === "fixed-numeral")
    await page.addStyleTag({ content: ".jcard__num{font-size:15.5px !important}.rose .fitnum{font-size:9px !important}" });
  for (const r of await page.evaluate(READ)) seen.push({ tag, ...r });
  if (tag === "mockup home") {                 // and again on the application screen,
    await page.click("#view .card.jcard .jcard__link").catch(() => {});
    await page.waitForTimeout(1400);           // where the ring is bigger
    for (const r of await page.evaluate(READ)) seen.push({ tag: "mockup apply", ...r });
  }
  await ctx.close();
}
await b.close();

/* WITHIN a surface, not across two. The site draws the numeral as SVG text in
   user units and the mockup draws it as an HTML span in px, so only the rings
   on the SAME surface can be compared - which is also exactly where the defect
   lived: one surface, two ring sizes, one numeral size. */
cells += seen.length;
if (!seen.length) fails.push("no rose with a numeral was found on any route");
const bySurface = {};
for (const s of seen) (bySurface[s.tag.split(" ")[0]] ||= []).push(s);
for (const [surface, group] of Object.entries(bySurface)) {
  const rings = new Set(group.map(g => g.ring));
  if (rings.size < 2) continue;                 // nothing to compare on this surface
  const rs = group.map(g => g.ratio);
  const lo = Math.min(...rs), hi = Math.max(...rs);
  cells++;
  if (hi - lo > 0.04)
    fails.push(`${surface}: the numeral does not scale with the ring - ratio runs ${lo} to ${hi} across ` +
               group.map(g => `${g.ring}px->${g.drawn}px`).join(", "));
}
say(`check_rose_scale: ${cells} assertions`);
seen.forEach(s => say(`        ${s.tag.padEnd(14)} ring ${String(s.ring).padStart(3)}px  numeral ${String(s.drawn).padStart(5)}px  ratio ${s.ratio}`));
fails.forEach(f => say("  FAIL  " + f));
say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS");
process.exit(fails.length ? 1 : 0);
