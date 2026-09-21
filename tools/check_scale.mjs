#!/usr/bin/env node
/**
 * check_scale.mjs — design system v3, stage 1. Chat's check, bound to the
 * site's own six surfaces (tools/lib/routes.mjs).
 *
 *   A  every element that renders text sits on the type scale (tokens.json)
 *   B  every padding-top/left, margin-top and gap sits on the space grid
 *   C  no surface above 4,000px² carries chroma above 0.03 at a hue outside
 *      the neutral family; the market hero is exempt BY RULING, once per page
 *
 *   python -m http.server 8765   (the REPO ROOT)
 *   node tools/check_scale.mjs
 *   node tools/check_scale.mjs --mutate off-scale-type | off-grid-space | band-wash | second-hero
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail (the check is asleep).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { ROUTES, openRoute } from "./lib/routes.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const T = JSON.parse(readFileSync(new URL("../tokens/tokens.json", import.meta.url), "utf8"));

const TYPE = Array.from({ length: T.type.steps }, (_, n) => Math.round((T.type.base * T.type.ratio ** n) / T.type.round) * T.type.round);
const SPACE = [0, ...T.space.steps];
const [HUE_LO, HUE_HI] = T.colour.$neutralFamily.hueRange;
const CHROMA_MAX = T.colour.$neutralFamily.achromaticBelow;
const BIG = 4000;
const THEMES = ["light", "dark"];
const fails = []; let seen = 0;

const browser = await chromium.launch();
for (const route of Object.keys(ROUTES)) for (const theme of THEMES) {
  const { page, ctx } = await openRoute(browser, route, theme);
  if (MUTATE === "off-scale-type") await page.addStyleTag({ content: `.co, .c-id p, .lede, .row .m { font-size: 12.7px !important; }` });
  if (MUTATE === "off-grid-space") await page.addStyleTag({ content: `.c-meta, .meta, .act, .acts { gap: 7px !important; }` });
  if (MUTATE === "second-hero") await page.evaluate(() => { const d = document.createElement("div"); d.className = "hero"; d.style.cssText = "height:200px;background:#103c19"; document.body.appendChild(d); });
  if (MUTATE === "band-wash") await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;left:0;top:0;width:340px;height:300px;background:#103c19;z-index:5"; document.body.appendChild(d); });

  const where = `${route}/${theme}`;
  const report = await page.evaluate(({ TYPE, SPACE, HUE_LO, HUE_HI, CHROMA_MAX, BIG }) => {
    const badType = [], badSpace = [], badSurface = [], exempt = [];
    const px = v => parseFloat(v) || 0;
    const near = (v, list) => list.some(x => Math.abs(x - v) < 0.26);
    const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    function oklch(str) {
      const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (!m) return null;
      if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
      const [r, g, b] = [lin(+m[1]), lin(+m[2]), lin(+m[3])];
      const f = v => Math.cbrt(v);
      const l = f(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const mm = f(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = f(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const A = 1.9779984951 * l - 2.4285922050 * mm + 0.4505937099 * s;
      const B = 0.0259040371 * l + 0.7827717662 * mm - 0.8086757660 * s;
      return { C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
    }
    const name = el => (typeof el.className === "string" && el.className) || el.tagName;
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;   /* a hidden element renders nothing */
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (hasText) { const fs = px(s.fontSize); if (fs && !near(fs, TYPE)) badType.push(`${name(el)} ${fs}px`); }
      for (const prop of ["paddingTop", "paddingLeft", "marginTop", "rowGap", "columnGap"]) {
        const v = px(s[prop]);
        if (v && !SPACE.includes(v)) badSpace.push(`${name(el)} ${prop} ${v}px`);
      }
      if (el.classList.contains("hero")) { exempt.push(name(el)); continue; }
      const area = r.width * r.height;
      if (area > BIG) {
        const c = oklch(s.backgroundColor);
        if (c && c.C > CHROMA_MAX && !(c.H >= HUE_LO && c.H <= HUE_HI))
          badSurface.push(`${name(el)} ${Math.round(area)}px2 C${c.C.toFixed(3)} H${Math.round(c.H)}`);
      }
    }
    return { badType: [...new Set(badType)], badSpace: [...new Set(badSpace)], badSurface: [...new Set(badSurface)], exempt };
  }, { TYPE, SPACE, HUE_LO, HUE_HI, CHROMA_MAX, BIG });
  seen++;
  for (const b of report.badType.slice(0, 8)) fails.push(`${where} A/type:  ${b} is not on the ${TYPE.join("/")} scale`);
  for (const b of report.badSpace.slice(0, 8)) fails.push(`${where} B/space: ${b} is off the ${T.space.grid}px grid`);
  for (const b of report.badSurface.slice(0, 6)) fails.push(`${where} C/surface: ${b} — coloured hue outside the neutral family ${HUE_LO}-${HUE_HI}`);
  if (report.exempt.length > 1) fails.push(`${where} C/exempt: ${report.exempt.length} elements carry the .hero exemption (${report.exempt.join(", ")}) — exactly one is allowed`);
  await ctx.close();
}
await browser.close();

console.log(`check_scale: ${seen} route/theme cells`);
if (MUTATE) {
  if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); }
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2);
}
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 60).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ type on the scale, space on the grid, no coloured surface outside the neutral family");
