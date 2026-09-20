/* The halo, measured in pixels rather than argued from tokens.
 *
 *     node tools/check_halo.mjs            (local, python -m http.server 8787)
 *     node tools/check_halo.mjs --live
 *
 * Every previous halo claim in this repo was made from computed styles, and
 * computed styles were true about a layer that was not on screen: once because
 * a nested `html body` rule outranked it, once because `overflow-x:clip` on an
 * ancestor clipped the fixed pseudo-element, and once because two routes
 * painted an opaque body ground on top of it. A token that resolves is not a
 * pixel that paints. This reads the pixels.
 *
 * WHAT IS MEASURED: the ground only. Page content is hidden before the shot,
 * so a region's median is the halo over the canvas and nothing else - with
 * content in frame, a card or a heading lands in the sample and the number
 * stops being about the halo. The layer is `background-attachment: fixed`, so
 * the viewport is the whole of it and a full-page shot would be wrong.
 *
 * 1.000 means nothing is reaching that corner.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";

const LIVE = process.argv.includes("--live");
const BASE = LIVE ? "https://jobscout.page" : "http://localhost:8787";
const ROUTES = LIVE
  ? ["/", "/saved", "/apply", "/privacy"]
  : ["/index.html", "/saved.html", "/apply.html", "/privacy.html"];

/* The flat canvas each theme is measured against. */
const CANVAS = { light: [248, 243, 235], dark: [10, 5, 36] };
/* From THEME.md section 14. The peak is the top-right bloom. Dark is
   asserted on contrast; light is asserted on dE, because a ten percent
   luminance ceiling is all white-on-cream can ever offer and the spec
   number sits at the just-noticeable step. */
const SPEC_PEAK = { light: 1.053, dark: 1.258 };
const SPEC_DE = { light: 5.0, dark: 0 };

const W = 1280, H = 900, BOX = 150;
const REGIONS = [
  ["top-L", 0, 0], ["top-R", 1, 0],
  ["mid-L", 0, 1], ["mid-R", 1, 1],
  ["bot-L", 0, 2], ["bot-R", 1, 2],
];

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

/* TWO METRICS, BECAUSE THE TWO THEMES USE TWO AXES. Contrast is right for
   dark, where the halo is brightness. It is the WRONG metric for light: a
   warm bloom at the canvas's own lightness is plainly visible and scores
   about 1.000, so this tool called an invisible white halo "on spec" twice
   and would have called a working warm one "flat". dE76 sees both. */
const lab = ([r, g, b]) => {
  const X = (0.4124 * lin(r) + 0.3576 * lin(g) + 0.1805 * lin(b)) / 0.95047;
  const Y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const Z = (0.0193 * lin(r) + 0.1192 * lin(g) + 0.9505 * lin(b)) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
/* THE HUE, because amplitude alone let the dark halo turn navy. The canvas
   is 250deg and the spec's peak bloom was 227deg; at the alpha 1.258 needs,
   23deg toward blue stopped reading as a glow. Section 14's rule is that a
   bloom lives in the canvas's own hue family, so the corner's composite is
   held within 12deg of the canvas. Light is exempt: it carries a WARM hue
   on purpose, and that is the whole reason it is visible. */
const hueOf = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m;
  if (!d) return 0;
  let h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const hueGap = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)); return Math.min(d, 360 - d); };

const dE = (a, b) => {
  const x = lab(a), y = lab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };

/* The median of each channel independently. A mean would smear a gradient
   toward the canvas; the median names the colour the region actually is. */
function sample(png, x0, y0) {
  const R = [], G = [], B = [];
  for (let y = y0; y < y0 + BOX; y += 2) {
    for (let x = x0; x < x0 + BOX; x += 2) {
      const i = (png.width * y + x) << 2;
      R.push(png.data[i]); G.push(png.data[i + 1]); B.push(png.data[i + 2]);
    }
  }
  return [median(R), median(G), median(B)];
}

const hex = (c) => "#" + c.map((n) => n.toString(16).padStart(2, "0")).join("");

let fails = 0;
const bad = (m) => { fails++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

const run = async () => {
  const browser = await chromium.launch();
  console.log(`halo, in pixels  (${BASE})  ${BOX}x${BOX} regions, content hidden\n`);
  console.log("  route                theme   top-L  top-R  mid-L  mid-R  bot-L  bot-R   peak    dE");

  const peaks = {};
  for (const route of ROUTES) {
    for (const theme of ["light", "dark"]) {
      const ctx = await browser.newContext({ colorScheme: theme, viewport: { width: W, height: H } });
      const page = await ctx.newPage();
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      /* SET THE THEME, DO NOT ASK FOR IT. Light is the default on all four
         surfaces, so the head script stamps data-theme="light" when nothing
         is stored and a dark OS never reaches the page. Running this with
         only `colorScheme: "dark"` measured a LIGHT page against the dark
         canvas constant, got ~18:1 everywhere, and called it green. */
      await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
        const s = document.createElement("style");
        /* Hide what the page draws, keep what the page IS: <html>'s own
           background layers are not affected by visibility on its children. */
        s.textContent = `*,*::before,*::after{transition:none!important;animation:none!important}
          body>*{visibility:hidden!important}`;
        document.head.appendChild(s);
      }, theme);

      /* And prove it took, before believing a single number below. */
      const ground = await page.evaluate(() =>
        getComputedStyle(document.documentElement).backgroundColor.match(/\d+/g).slice(0, 3).map(Number));
      if (ratio(ground, CANVAS[theme]) > 1.02) {
        bad(`${route} ${theme}: the page is not in ${theme} - ground reads ${hex(ground)}, ` +
            `expected ${hex(CANVAS[theme])}. Every number in this row would be about the wrong page.`);
        await ctx.close();
        continue;
      }
      const png = PNG.sync.read(await page.screenshot({ type: "png" }));

      const row = [], des = [], canvas = CANVAS[theme];
      for (const [, sx, sy] of REGIONS) {
        const x0 = sx === 0 ? 0 : W - BOX;
        const y0 = sy === 0 ? 0 : sy === 1 ? ((H - BOX) >> 1) : H - BOX;
        const px = sample(png, x0, y0);
        row.push(ratio(px, canvas));
        des.push(dE(px, canvas));
      }
      const peak = Math.max(...row), peakDE = Math.max(...des);
      const topR = sample(png, W - BOX, 0);
      peaks[`${route} ${theme}`] = { peak, peakDE, hueGap: hueGap(topR, canvas) };
      console.log(`  ${route.padEnd(20)} ${theme.padEnd(6)} ` +
        row.map((r) => r.toFixed(3)).join("  ") +
        `   ${peak.toFixed(3)}   ${peakDE.toFixed(1)}`);
      await ctx.close();
    }
  }

  console.log("");
  for (const [k, { peak, peakDE, hueGap: gap }] of Object.entries(peaks)) {
    const theme = k.endsWith("dark") ? "dark" : "light";
    if (peak < 1.004 && peakDE < 1) {
      bad(`${k}: flat on both axes - the halo is not reaching this route at all`);
      continue;
    }
    if (theme === "dark") {
      const want = SPEC_PEAK.dark;
      /* 0.97, not 0.9. At 0.9 the dark layer sat at 1.202 against a 1.258
         spec and reported green for two rounds. A tolerance wide enough to
         pass the thing you are trying to fix is not a tolerance. */
      if (peak < want * 0.97)
        bad(`${k}: peak ${peak.toFixed(3)} against a ${want} spec (${Math.round(peak / want * 100)}%)`);
      else if (gap > 12)
        bad(`${k}: the peak bloom sits ${gap.toFixed(0)}deg off the canvas hue - that is navy, not a glow`);
      else ok(`${k}: peak ${peak.toFixed(3)} against a ${want} spec, ${gap.toFixed(0)}deg off the canvas hue`);
    } else {
      /* Light is judged on dE. 5 is where a difference stops needing to be
         looked for. The white-on-cream version scored 2.9 at its PEAK and
         was reported twice as no halo at all. */
      if (peakDE < SPEC_DE.light)
        bad(`${k}: dE ${peakDE.toFixed(1)} - below ${SPEC_DE.light}, which is where a reader stops having to look for it`);
      else ok(`${k}: dE ${peakDE.toFixed(1)} (contrast ${peak.toFixed(3)}, which is not the axis light uses)`);
    }
  }

  await browser.close();
  console.log("");
  console.log(fails ? `${fails} FAILED` : "ALL GREEN");
  process.exit(fails ? 1 : 0);
};

run();
