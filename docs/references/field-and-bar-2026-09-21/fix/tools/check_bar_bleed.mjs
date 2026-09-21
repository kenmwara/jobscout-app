/* ===========================================================================
   check_bar_bleed — a bar that paints, bleeds.

   The defect this exists for: `.phdr` was given `background: var(--canvas)`
   while sitting inside the screen's 20px horizontal padding, so it painted a
   flat rectangle over the market wash with two visible vertical seams and a
   hard bottom edge. Measured from the shipped screenshot:

       screen  x 722..1180      rectangle  x 742..1161      fill rgb(10,5,36)
       --canvas dark = #0a0524 = rgb(10,5,36)   <- exact match

   THE ASSERTION
   For every bar-like element: if it paints a non-transparent background, its
   border box must reach both edges of its scroll container. A bar that paints
   and is inset is the defect, in one rule, whatever produced it.

   This is a GEOMETRY check, not a class-name check, so it catches the next
   one too — a sticky filter row, a toolbar, anything that grows a fill later.

   Run:  node tools/check_bar_bleed.mjs <url-or-file> [...]
   =========================================================================== */

import { chromium } from 'playwright';
import { resolve } from 'node:path';

const EXEC = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: node tools/check_bar_bleed.mjs <url|file> [...]');
  process.exit(3);
}

const TOL = 1.0;   // px. Sub-pixel layout is fine; 20px of visible ground is not.
const fails = [];
const browser = await chromium.launch({ executablePath: EXEC });

for (const t of targets) {
  const url = t.startsWith('http') || t.startsWith('file:') ? t : 'file://' + resolve(t);
  const page = await browser.newPage({ colorScheme: 'dark' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const bad = await page.evaluate((TOL) => {
    const out = [];
    const bars = document.querySelectorAll(
      'header, .phdr, .toolbar, .sheet__bar, [data-bar], [style*="position: sticky"], .bar--solid'
    );
    for (const el of bars) {
      const cs = getComputedStyle(el);

      // does it paint? a background-color with any alpha, or a background-image
      const bg = cs.backgroundColor || '';
      const m  = bg.match(/rgba?\(([^)]+)\)/);
      const alpha = m ? (m[1].split(',')[3] !== undefined ? parseFloat(m[1].split(',')[3]) : 1) : 0;
      const paintsColor = alpha > 0.01;
      const paintsImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (!paintsColor && !paintsImage) continue;

      // what must it span? the nearest ancestor that clips or scrolls it,
      // falling back to the viewport.
      let host = el.parentElement, hostBox = null;
      while (host && host !== document.documentElement) {
        const hs = getComputedStyle(host);
        if (hs.overflow !== 'visible' || hs.position === 'relative' || hs.contain !== 'none') {
          hostBox = host.getBoundingClientRect(); break;
        }
        host = host.parentElement;
      }
      const r = el.getBoundingClientRect();
      const L = hostBox ? hostBox.left  : 0;
      const R = hostBox ? hostBox.right : window.innerWidth;

      const gapL = r.left - L;
      const gapR = R - r.right;
      if (gapL > TOL || gapR > TOL) {
        out.push({
          sel: el.className || el.tagName,
          bg, gapL: Math.round(gapL), gapR: Math.round(gapR),
          host: host ? (host.className || host.tagName) : 'viewport'
        });
      }
    }
    return out;
  }, TOL);

  const tag = t.split('/').pop();
  for (const b of bad) {
    fails.push(
      `${tag}: <${b.sel}> paints ${b.bg} but is inset ${b.gapL}px / ${b.gapR}px ` +
      `inside ${b.host}\n      -> the ground shows beside it as a vertical seam. ` +
      `Either drop the background, or give it .bar--solid (bleed.css) which ` +
      `negative-margins out to the edge and fades its bottom.`
    );
  }
  await page.close();
}

await browser.close();

if (fails.length) {
  console.log(`check_bar_bleed  FAIL  (${fails.length})`);
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('check_bar_bleed  pass');
