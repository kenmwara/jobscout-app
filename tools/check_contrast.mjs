#!/usr/bin/env node
/**
 * check_contrast.mjs — every foreground/background pair (GAPS.md #1).
 *
 * The hero's ink was --canvas, which inverts to near-black on the fixed
 * market wash in dark and loses the headline. Nothing would have caught it.
 *
 * For every element that renders text: the text colour against the first
 * ancestor that PAINTS. A painted colour is read as computed style; a painted
 * gradient (the hero) is SAMPLED from pixels beside the text, never from a
 * glyph edge - an antialiasing edge is not the text colour. Fail under 4.5:1
 * for text below 18.66px and 3:1 above (or bold at 14px+). The scrim is
 * exempt: it is meant to fail.
 *
 *   node tools/check_contrast.mjs
 *   node tools/check_contrast.mjs --mutate hero-ink   # must FAIL (dark hero)
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { openRoute } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const Y = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [Y(a), Y(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = s => { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null; };
const over = (fg, bg) => fg[3] >= 1 ? fg : fg.slice(0, 3).map((c, i) => Math.round(c * fg[3] + bg[i] * (1 - fg[3])));
const fails = []; let pairs = 0;
const b = await chromium.launch();
for (const route of ["landing", "browse", "apply", "saved", "sheet"]) for (const theme of ["light", "dark"]) {
  const { page, ctx } = await openRoute(b, route, theme);
  if (MUTATE === "hero-ink") await page.addStyleTag({ content: ":root{--hero-ink: var(--canvas) !important}" });
  /* 1. gather: for every text element, its colour, size, weight, and the
        painting ancestor (colour, or a gradient box to sample) */
  const items = await page.evaluate(() => {
    const out = [], seen = new Set();
    const paints = el => { const s = getComputedStyle(el); return (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") || s.backgroundImage !== "none"; };
    for (const el of document.querySelectorAll("body *")) {
      if (!el.childNodes || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest("script, style, [hidden], svg, .hs-scrim, .scrim, [aria-hidden='true']")) continue;
      const s = getComputedStyle(el); if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0) continue;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight * 3) continue;
      /* the first ancestor that paints; the hero's gradient sits on a child
         (.bg) behind the text, so a .hero ancestor counts as the painter */
      let a = el, painter = null; while (a && a !== document.documentElement) { if (paints(a) || a.classList.contains("hero")) { painter = a; break; } a = a.parentElement; }
      const ps = painter ? getComputedStyle(painter) : getComputedStyle(document.documentElement);
      const solid = painter && painter.classList.contains("hero") ? null : ps.backgroundColor;
      const key = `${s.color}|${solid}|${painter ? painter.className : "html"}|${s.fontSize}|${s.fontWeight}`;
      if (seen.has(key)) continue; seen.add(key);
      const pr = painter ? painter.getBoundingClientRect() : null;
      const hero = el.closest(".hero"); const hr = hero ? hero.getBoundingClientRect() : null;
      out.push({ inHero: !!hero, heroBox: hr ? { x: hr.left, y: hr.top + scrollY, w: hr.width, h: hr.height } : null, name: ((typeof el.className === "string" && el.className) || el.tagName).toString().slice(0, 40), color: s.color, size: parseFloat(s.fontSize), weight: +s.fontWeight || 400,
                 solid: solid && solid !== "rgba(0, 0, 0, 0)" && solid !== "transparent" ? solid : null, gradient: !!painter && (!solid || solid === "rgba(0, 0, 0, 0)" || painter.classList.contains("hero")),
                 box: pr ? { x: pr.left, y: pr.top + scrollY, w: pr.width, h: pr.height } : null, textBox: { x: r.left, y: r.top + scrollY, w: r.width, h: r.height },
                 canvas: getComputedStyle(document.documentElement).backgroundColor });
    }
    return out;
  });
  /* 2. sample gradient painters once each, from a strip just outside the text box */
  const samples = new Map();
  for (const it of items) {
    if (!it.gradient || !it.box) continue;
    const k = JSON.stringify(it.box); if (samples.has(k)) continue;
    const x = Math.max(0, Math.round(it.box.x + 6)), y = Math.round(it.textBox.y + it.textBox.h + 4);
    const clipY = Math.min(y, it.box.y + it.box.h - 8);
    const png = PNG.sync.read(await page.screenshot({ clip: { x, y: clipY, width: 8, height: 4 }, fullPage: true }));
    const px = [0, 1, 2].map(i => png.data[i]); samples.set(k, px);
    it.sample = px;
  }
  for (const it of items) if (it.gradient && it.box) it.sample = samples.get(JSON.stringify(it.box));
  /* the hero's wash, sampled once, for anything translucent sitting on it */
  const heroBoxes = new Map();
  for (const it of items) if (it.inHero && it.heroBox) {
    const k = JSON.stringify(it.heroBox);
    if (!heroBoxes.has(k)) { const png = PNG.sync.read(await page.screenshot({ clip: { x: Math.round(it.heroBox.x + 8), y: Math.round(it.heroBox.y + it.heroBox.h - 12), width: 8, height: 4 }, fullPage: true })); heroBoxes.set(k, [0, 1, 2].map(i => png.data[i])); }
    it.heroSample = heroBoxes.get(k);
  }
  /* 3. judge */
  for (const it of items) {
    const fg = rgb(it.color); if (!fg) continue;
    let bg = it.gradient && it.sample ? it.sample : rgb(it.solid || it.canvas); if (!bg) continue;
    /* a translucent painter composites over what is BEHIND it: the hero's
       gradient sample when the element sits in the hero, else the canvas */
    const behind = it.inHero && it.heroSample ? it.heroSample : rgb(it.canvas).slice(0, 3);
    bg = bg.length === 4 && bg[3] < 1 ? over(bg, behind) : bg.slice(0, 3);
    const f = over(fg, bg), r = ratio(f, bg);
    const large = it.size >= 18.66 || (it.size >= 14 && it.weight >= 700);
    const need = large ? 3 : 4.5;
    pairs++;
    if (r < need) fails.push(`${route}/${theme}: ${it.name} ${it.color} on ${it.gradient ? "sampled " + JSON.stringify(bg) : it.solid || it.canvas} = ${r.toFixed(2)}:1 (${it.size}px needs ${need})`);
  }
  await ctx.close();
}
await b.close();
console.log(`check_contrast: ${pairs} distinct text/background pairs`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 30).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ every text/background pair clears AA");
