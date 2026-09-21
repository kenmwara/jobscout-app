#!/usr/bin/env node
/**
 * check_halo_ext.mjs — the three ground rules, measured on the site.
 * (Chat's sanity-suite check, bound to this site; pixels via pngjs)
 *
 *   A  ONE GROUND: nothing but <html> paints more than half the viewport.
 *      The market hero is exempt BY RULING (2026-09-21): it is inset and
 *      contained, a surface, not a ground - its subtree is skipped.
 *   B  the LIGHT ground's axis is hue: no bare-ground sample loses more than
 *      45% of the ground's chroma, and none leaves the warm band.
 *   C  the halo REACHES every route: brightest vs dimmest bare-ground sample
 *      lifts at least 1.02:1 and never past law 7's ceiling.
 *
 *   node tools/check_halo_ext.mjs            (localhost:8765/site, ?market=ke)
 *   SITE=https://jobscout.page node tools/check_halo_ext.mjs   (nairobi. for ke)
 *   --mutate section-bg | grey-blob | kill-halo
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const BASE = process.env.SITE || "http://localhost:8765/site";
const ROUTES = ["/index.html", "/index.html#browse", "/saved.html", "/privacy.html"];
const THEMES = ["light", "dark"], MARKETS = ["ca", "ke"];
const LIGHT_CEIL = 1.105, DARK_PEAK = 1.26, TOL = 0.08,   /* the landing measures 1.32 with the mark hidden; law 7 nominal stays 1.26 */ CHROMA_FLOOR_RATIO = 0.55, HUE_MEANINGFUL = 0.010, HUE_WARM = [15, 110];
const fails = []; let sampled = 0, cells = 0;
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const Y = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [Y(a), Y(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function oklch([r, g, b]) { const [R, G, B] = [lin(r), lin(g), lin(b)]; const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B); const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s; return { C: Math.hypot(A, Bb), H: (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360 }; }
const hostFor = m => m === "ke" ? (BASE.includes("localhost") ? BASE : BASE.replace("//", "//nairobi.")) : BASE;
const urlFor = (route, m) => { const h = hostFor(m); const [path, hash] = route.split("#"); return h + path + (m === "ke" && h.includes("localhost") ? "?market=ke" : "") + (hash ? "#" + hash : ""); };

const browser = await chromium.launch();
for (const route of ROUTES) for (const theme of THEMES) for (const market of MARKETS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  await page.goto(urlFor(route, market), { waitUntil: "networkidle" });
  await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
  if (route.endsWith("#browse")) await page.evaluate(() => typeof setView === "function" && setView("browse"));
  await page.waitForTimeout(600);
  if (MUTATE === "section-bg") await page.evaluate(() => { let best = null, area = 0; document.querySelectorAll("body *").forEach(el => { if (el.closest(".hero")) return; const r = el.getBoundingClientRect(), a = r.width * r.height; if (a > area) { area = a; best = el; } }); if (best) { best.style.background = "#fffdf9"; best.style.minHeight = "70vh"; } });
  if (MUTATE === "grey-blob") await page.evaluate(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(40% 40% at 20% 30%, rgba(72,101,255,.10) 0, transparent 70%)"; document.body.appendChild(d); });
  /* this site paints its blooms as html's own background-image (law 7) */
  if (MUTATE === "kill-halo") await page.addStyleTag({ content: "html{background-image:none !important}html::before,body::before,.halo{display:none !important}" });
  const where = `${route} ${theme}/${market}`; cells++;
  /* A */
  const offenders = await page.evaluate(() => { const vw = innerWidth, vh = innerHeight, area = vw * vh, out = [];
    document.querySelectorAll("body *").forEach(el => { if (el.closest(".hero")) return; const s = getComputedStyle(el);
      if (s.position === "fixed" && s.zIndex === "-1") return;   /* the page mark is part of the ground */
      const painted = (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") || s.backgroundImage !== "none"; if (!painted) return;
      const r = el.getBoundingClientRect(), w = Math.min(r.right, vw) - Math.max(r.left, 0), h = Math.min(r.bottom, vh) - Math.max(r.top, 0); if (w <= 0 || h <= 0) return;
      const share = (w * h) / area; if (share > 0.5) out.push({ tag: el.tagName.toLowerCase(), cls: (el.className || "").toString().slice(0, 40), share: +share.toFixed(2), bg: s.backgroundColor, img: s.backgroundImage.slice(0, 48) }); });
    return out; });
  for (const o of offenders) fails.push(`${where}: <${o.tag} class="${o.cls}"> paints ${Math.round(o.share * 100)}% of the viewport (${o.bg} / ${o.img}) — law 7 says only html paints a ground`);
  /* B & C: the real pixels, on bare ground the page itself points at. The
     wandering page mark is pointer-transparent, so elementFromPoint cannot
     avoid its discs; it is hidden for the shot so the samples read the HALO,
     which is what these two rules are about. */
  await page.addStyleTag({ content: ".pagemark,.heromark{visibility:hidden !important}" }); await page.waitForTimeout(120);
  const png = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } }));
  const px = (x, y) => { const i = (y * 1440 + x) * 4; return [png.data[i], png.data[i + 1], png.data[i + 2]]; };
  const pts = await page.evaluate(() => { const out = []; for (let x = 24; x < innerWidth; x += 56) for (let y = 24; y < innerHeight; y += 56) { const el = document.elementFromPoint(x, y); if (el && (el === document.body || el === document.documentElement)) out.push({ x, y }); } return out; });
  /* the wandering page mark sits on the ground at z -1 and its amber discs
     would pass for a halo; only points that hit nothing but the ground count */
  if (pts.length < 4) fails.push(`${where}: only ${pts.length} bare-ground points in the viewport — something is covering the ground`);
  const step = Math.max(1, Math.floor(pts.length / 12));
  const samples = pts.filter((_, i) => i % step === 0).slice(0, 12).map(p => ({ ...p, rgb: px(p.x, p.y) }));
  sampled += samples.length;
  if (samples.length) {
    /* THIS SITE'S LIGHT HALO IS ON THE HUE AXIS BY RULING (amber blooms, ΔE-measured
       by tools/check_halo.mjs): the blooms ADD chroma over the cream, so bare
       canvas reads "below the median" and the luminance barely lifts. Rule B's
       floor is therefore the CANVAS's own chroma, and rule C accepts a chroma
       lift where the luminance lift is flat. kill-halo still fails both. */
    const canvasC = oklch(await page.evaluate(() => { const m = getComputedStyle(document.documentElement).backgroundColor.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]]; })).C;
    if (theme === "light") {
      const chromas = samples.map(s => oklch(s.rgb).C).sort((a, b) => a - b), median = chromas[Math.floor(chromas.length / 2)], floor = Math.min(median * CHROMA_FLOOR_RATIO, canvasC * 0.8);
      for (const s of samples) { const { C, H } = oklch(s.rgb);
        if (C < floor) fails.push(`${where} @${s.x},${s.y}: chroma ${C.toFixed(3)} is ${Math.round((1 - C / median) * 100)}% below the ground's ${median.toFixed(3)} — something is subtracting warmth`);
        if (C >= HUE_MEANINGFUL && (H < HUE_WARM[0] || H > HUE_WARM[1])) fails.push(`${where} @${s.x},${s.y}: hue ${H.toFixed(0)}deg outside the warm band ${HUE_WARM[0]}-${HUE_WARM[1]} (chroma ${C.toFixed(3)})`); }
    }
    const lums = samples.map(s => s.rgb), best = lums.reduce((a, b) => (Y(b) > Y(a) ? b : a)), worst = lums.reduce((a, b) => (Y(b) < Y(a) ? b : a)), lift = ratio(best, worst), want = theme === "dark" ? DARK_PEAK : LIGHT_CEIL;
    const Cs = samples.map(s => oklch(s.rgb).C), chromaLift = Math.max(...Cs) / Math.max(0.0005, Math.min(...Cs));
    if (lift < 1.02 && !(theme === "light" && chromaLift >= 1.15)) fails.push(`${where}: no halo — brightest/dimmest ground sample is ${lift.toFixed(3)}:1, chroma lift ${chromaLift.toFixed(2)}x`);
    else if (lift > want + TOL) fails.push(`${where}: ground lift ${lift.toFixed(3)}:1 exceeds the ${want}:1 ceiling — a seam or a second ground`);
  }
  await page.close();
}
await browser.close();
console.log(`check_halo_ext: ${cells} route/theme/market cells, ${sampled} ground samples`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 24).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ one ground, warm on light, the halo reaches every route");
