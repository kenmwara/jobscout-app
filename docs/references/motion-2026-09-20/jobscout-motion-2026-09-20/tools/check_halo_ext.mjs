#!/usr/bin/env node
/**
 * check_halo_ext.mjs — the three ground rules, measured.
 *
 * Fold these into check_halo.mjs, or run standalone. They exist because the
 * 2026-09-20 still audit found all three failing at once:
 *
 *   A. ONE GROUND (law 7). "How JobScout works" paints its own background.
 *      Hard seam at y=364: #f3efeb -> #fffdf9, step 1.126:1 — larger than the
 *      light halo's own 1.105:1 ceiling. The accident beat the design.
 *
 *   B. THE GROUND MUST STAY WARM. The decorative circles SUBTRACT chroma:
 *      plain cream 0.019 @ 37deg, inside a circle 0.007 @ 30deg, at an overlap
 *      0.006 @ 348deg — off the warm family entirely. This is the retired
 *      --blob failure ("a blob that darkens instead of a halo that adds
 *      light"), returned as geometry.
 *
 *   C. THE HALO MUST ACTUALLY BE THERE. Corner-sampling every route found
 *      /browse lit (light 1.051, dark 1.174) and /saved at 1.000 in all six
 *      corners, both themes. body::before is one rule on one element; if it
 *      reaches one route and not another it is mounted per page.
 *
 *   node tools/check_halo_ext.mjs
 *   node tools/check_halo_ext.mjs --url <url>
 *   node tools/check_halo_ext.mjs --mutate section-bg   # must FAIL rule A
 *   node tools/check_halo_ext.mjs --mutate grey-blob    # must FAIL rule B
 *   node tools/check_halo_ext.mjs --mutate kill-halo    # must FAIL rule C
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail (the check is asleep).
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const BASE = opt('--url', 'https://jobscout.page');
const MUTATE = opt('--mutate', null);

const ROUTES = ['/', '/#browse', '/saved.html', '/privacy.html'];
const THEMES = ['light', 'dark'];
const MARKETS = ['ca', 'ke'];

/* Law 7's own numbers. */
const LIGHT_CEIL = 1.105;   // white on cream tops out here — the axis is HUE
const DARK_PEAK  = 1.26;    // the dark axis is BRIGHTNESS
const TOL        = 0.06;
/* Rule B is about LOSING warmth, not about hitting an exact hue.
   At very low chroma the hue angle is numerically unstable — a near-white
   can report any value — so hue is only asserted where chroma is meaningful,
   and the real test is that no point drops far below the ground's own chroma.
   The measured failure: cream 0.019 @ 37deg -> a circle overlap 0.006 @ 348deg. */
const CHROMA_FLOOR_RATIO = 0.55;  // no sample below 55% of the ground's median
const HUE_MEANINGFUL     = 0.010; // below this, hue is noise; do not assert it
const HUE_WARM           = [15, 110]; // cream 37 and a pale warm white ~85 both pass;
                                      // 348 (the overlap) and 250 (indigo) do not

const fails = [];
let sampled = 0;

/* ---- colour maths, inline so this file has no dependency ---- */
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const Y = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [x, y] = [Y(a), Y(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function oklch([r, g, b]) {
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  let l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  let m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  let s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, Bb), H: (Math.atan2(Bb, A) * 180 / Math.PI + 360) % 360 };
}
const px = (buf, w, x, y) => { const i = (y * w + x) * 4; return [buf[i], buf[i + 1], buf[i + 2]]; };

async function run() {
  const browser = await chromium.launch();

  for (const route of ROUTES) {
    for (const theme of THEMES) {
      for (const market of MARKETS) {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
          colorScheme: theme,
        });
        const host = market === 'ke' ? BASE.replace('//', '//nairobi.') : BASE;
        await page.goto(host + route, { waitUntil: 'networkidle' });
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(500);

        if (MUTATE === 'section-bg') {
          /* Reproduce the real bug: a big container paints its own ground.
             Targets the largest block in the page rather than a selector,
             so the mutation tests the RULE and not the markup. */
          await page.evaluate(() => {
            let best = null, area = 0;
            document.querySelectorAll('body *').forEach(el => {
              const r = el.getBoundingClientRect();
              const a = r.width * r.height;
              if (a > area) { area = a; best = el; }
            });
            if (best) { best.style.background = '#fffdf9'; best.style.minHeight = '70vh'; }
          });
        }
        if (MUTATE === 'grey-blob') {
          await page.evaluate(() => {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;' +
              'background:radial-gradient(40% 40% at 20% 30%, rgba(72,101,255,.05) 0, transparent 70%)';
            document.body.appendChild(d);
          });
        }
        if (MUTATE === 'kill-halo') {
          await page.addStyleTag({ content: 'body::before{background:none !important}' });
        }

        const where = `${route} ${theme}/${market}`;

        /* ---------- RULE A: one ground ---------- */
        const offenders = await page.evaluate(() => {
          const vw = innerWidth, vh = innerHeight, area = vw * vh;
          const out = [];
          document.querySelectorAll('body *').forEach(el => {
            const s = getComputedStyle(el);
            const painted = (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent')
                         || s.backgroundImage !== 'none';
            if (!painted) return;
            const r = el.getBoundingClientRect();
            const w = Math.min(r.right, vw) - Math.max(r.left, 0);
            const h = Math.min(r.bottom, vh) - Math.max(r.top, 0);
            if (w <= 0 || h <= 0) return;
            const share = (w * h) / area;
            if (share > 0.5) {
              out.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className || '').toString().slice(0, 40),
                share: +share.toFixed(2),
                bg: s.backgroundColor,
                img: s.backgroundImage.slice(0, 48),
              });
            }
          });
          return out;
        });
        for (const o of offenders) {
          fails.push(`${where}: <${o.tag} class="${o.cls}"> paints ${Math.round(o.share * 100)}% of the viewport (${o.bg} / ${o.img}) — law 7 says only html paints a ground`);
        }

        /* ---------- RULES B & C: sample the real pixels ---------- */
        const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1440, height: 900 } });
        const { createCanvas, loadImage } = await import('@napi-rs/canvas').catch(() => ({}));
        let data = null, W = 1440;
        if (loadImage) {
          const img = await loadImage(shot);
          const c = createCanvas(1440, 900); const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          data = ctx.getImageData(0, 0, 1440, 900).data;
        }

        if (data) {
          /* Find the ground, do not assume where it is. Fixed coordinates
             land on cards the moment a layout changes; ask the page which
             points are actually bare ground. */
          const pts = await page.evaluate(() => {
            const out = [];
            for (let x = 24; x < innerWidth; x += 56) {
              for (let y = 24; y < innerHeight; y += 56) {
                const el = document.elementFromPoint(x, y);
                if (!el) continue;
                if (el === document.body || el === document.documentElement) out.push({ x, y });
              }
            }
            return out;
          });
          if (pts.length < 6) {
            fails.push(`${where}: only ${pts.length} bare-ground points in the viewport — something is covering the ground`);
          }
          /* thin to a manageable, well-spread set */
          const step = Math.max(1, Math.floor(pts.length / 12));
          const samples = pts.filter((_, i) => i % step === 0).slice(0, 12)
                             .map(p => ({ ...p, rgb: px(data, W, p.x, p.y) }));
          sampled += samples.length;

          if (theme === 'light') {
            /* RULE B — the light ground's axis is HUE, so it must stay warm.
               A bloom that is lighter but cool still turns the cream grey. */
            const chromas = samples.map(s => oklch(s.rgb).C).sort((a, b) => a - b);
            const median = chromas[Math.floor(chromas.length / 2)];
            const floor = median * CHROMA_FLOOR_RATIO;
            for (const s of samples) {
              const { C, H } = oklch(s.rgb);
              if (C < floor) {
                fails.push(`${where} @${s.x},${s.y}: chroma ${C.toFixed(3)} is ${Math.round((1 - C / median) * 100)}% below the ground's ${median.toFixed(3)} — something is subtracting warmth`);
              }
              if (C >= HUE_MEANINGFUL && (H < HUE_WARM[0] || H > HUE_WARM[1])) {
                fails.push(`${where} @${s.x},${s.y}: hue ${H.toFixed(0)}deg outside the warm band ${HUE_WARM[0]}-${HUE_WARM[1]} (chroma ${C.toFixed(3)})`);
              }
            }
          }

          /* RULE C — the halo must reach this route. Compare the brightest
             corner to the dimmest; a flat page reads 1.000 everywhere. */
          const lums = samples.map(s => s.rgb);
          const best = lums.reduce((a, b) => (Y(b) > Y(a) ? b : a));
          const worst = lums.reduce((a, b) => (Y(b) < Y(a) ? b : a));
          const lift = ratio(best, worst);
          const want = theme === 'dark' ? DARK_PEAK : LIGHT_CEIL;
          if (lift < 1.02) {
            fails.push(`${where}: no halo — brightest/dimmest ground sample is ${lift.toFixed(3)}:1. This route is not getting body::before.`);
          } else if (lift > want + TOL) {
            fails.push(`${where}: ground lift ${lift.toFixed(3)}:1 exceeds the ${want}:1 ceiling — a seam or a second ground`);
          }
        }
        await page.close();
      }
    }
  }
  await browser.close();

  console.log(`check_halo_ext: ${ROUTES.length * 4} route/theme/market cells, ${sampled} ground samples`);
  if (MUTATE) {
    if (fails.length) {
      console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`);
      process.exit(0);
    }
    console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`);
    process.exit(2);
  }
  if (fails.length) {
    console.error(`\n${fails.length} failure(s):`);
    [...new Set(fails)].slice(0, 40).forEach(f => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('  ✓ one ground, warm on light, halo present on every route');
}

run().catch(e => { console.error(e); process.exit(1); });
