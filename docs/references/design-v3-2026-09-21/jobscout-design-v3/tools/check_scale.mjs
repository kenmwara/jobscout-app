#!/usr/bin/env node
/**
 * check_scale.mjs — the three hand-tuned systems, now measured.
 *
 * The product shipped with 20 distinct type sizes between 8 and 31px, 17
 * distinct spacing values and no elevation constant. Colour, motion and the
 * rose were already generative; these three were not. This check is what
 * stops them drifting again.
 *
 * It asserts BEHAVIOUR, not presence: every assertion reads a COMPUTED value
 * off a rendered element and compares it to the generated scale.
 *
 *   A. TYPE      every rendered font-size is on the 8-step scale.
 *   B. SPACE     every rendered padding/gap is on the 4px grid.
 *   C. SURFACE   no element above 4,000pt² carries chroma > 0.03 at a hue
 *                OUTSIDE the neutral family (265-295) — with the market hero
 *                exempt by ruling. Hue MEMBERSHIP is the test, not chroma
 *                magnitude: the ink hero passes at C 0.087, a green panel
 *                fails at C 0.077.
 *
 *   node tools/check_scale.mjs --url http://localhost:8761/markup/browse.html
 *   node tools/check_scale.mjs --mutate off-scale-type   # must FAIL A
 *   node tools/check_scale.mjs --mutate off-grid-space   # must FAIL B
 *   node tools/check_scale.mjs --mutate band-wash        # must FAIL C
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail (the check is asleep).
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const BASE = opt('--url', 'http://localhost:8761/markup/browse.html');
const MUTATE = opt('--mutate', null);
const T = JSON.parse(readFileSync(new URL('../tokens/tokens.json', import.meta.url), 'utf8'));

const TYPE = Array.from({ length: T.type.steps }, (_, n) =>
  Math.round((T.type.base * T.type.ratio ** n) / T.type.round) * T.type.round);
const SPACE = new Set([0, ...T.space.steps]);
const [HUE_LO, HUE_HI] = T.colour.$neutralFamily.hueRange;
const CHROMA_MAX = T.colour.$neutralFamily.achromaticBelow;
const BIG = 4000;

const ROUTES = ['browse', 'detail', 'prepare', 'saved', 'sheet', 'states'];
const THEMES = ['light', 'dark'];
const fails = [];
let seen = 0;

async function run() {
  const browser = await chromium.launch();
  for (const route of ROUTES) {
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: theme });
      const url = BASE.replace(/[^/]+\.html$/, `${route}.html`);
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(250);

      if (MUTATE === 'off-scale-type')
        await page.addStyleTag({ content: `.jcard__org, .match__org, .prep__d { font-size: 12.7px !important; }` });
      if (MUTATE === 'off-grid-space')
        await page.addStyleTag({ content: `.meta, .jcard__actions, .prep__a { gap: 7px !important; }` });
      if (MUTATE === 'band-wash')
        await page.evaluate(() => {
          const d = document.createElement('div');
          d.setAttribute('data-mutant', '1');
          d.style.cssText = 'position:fixed;left:0;top:0;width:340px;height:300px;background:#103c19;z-index:5';
          document.body.appendChild(d);
        });

      const where = `${route}/${theme}`;
      const report = await page.evaluate(({ TYPE, SPACE, HUE_LO, HUE_HI, CHROMA_MAX, BIG }) => {
        const badType = [], badSpace = [], badSurface = [];
        const px = v => parseFloat(v) || 0;
        const near = (v, list) => list.some(x => Math.abs(x - v) < 0.26);

        const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        function oklch(str) {
          const m = str.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
          if (!m) return null;
          if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
          const [r, g, b] = [lin(+m[1]), lin(+m[2]), lin(+m[3])];
          const f = v => Math.cbrt(v);
          const l = f(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
          const mm= f(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
          const s = f(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
          const A = 1.9779984951*l - 2.4285922050*mm + 0.4505937099*s;
          const B = 0.0259040371*l + 0.7827717662*mm - 0.8086757660*s;
          return { C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
        }

        for (const el of document.querySelectorAll('body *')) {
          const s = getComputedStyle(el);
          if (!el.firstChild) { /* still check box props below */ }

          /* A — type, only where the element actually renders text */
          const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (hasText) {
            const fs = px(s.fontSize);
            if (fs && !near(fs, TYPE)) badType.push(`${el.className || el.tagName} ${fs}px`);
          }
          /* B — space */
          for (const prop of ['paddingTop','paddingLeft','marginTop','rowGap','columnGap']) {
            const v = px(s[prop]);
            if (v && !SPACE.includes(v)) badSpace.push(`${el.className || el.tagName} ${prop} ${v}px`);
          }
          /* C — large painted surfaces */
          const r = el.getBoundingClientRect();
          const area = r.width * r.height;
          if (area > BIG && el.dataset.hero === undefined && !el.classList.contains('hero')) {
            const c = oklch(s.backgroundColor);
            if (c && c.C > CHROMA_MAX) {
              const inside = c.H >= HUE_LO && c.H <= HUE_HI;
              if (!inside) badSurface.push(
                `${el.className || el.tagName} ${Math.round(area)}px2 C${c.C.toFixed(3)} H${Math.round(c.H)}`);
            }
          }
        }
        return { badType: [...new Set(badType)], badSpace: [...new Set(badSpace)], badSurface: [...new Set(badSurface)] };
      }, { TYPE, SPACE: [...SPACE], HUE_LO, HUE_HI, CHROMA_MAX, BIG });

      seen++;
      for (const b of report.badType.slice(0, 6))    fails.push(`${where} A/type:  ${b} is not on the ${TYPE.join('/')} scale`);
      for (const b of report.badSpace.slice(0, 6))   fails.push(`${where} B/space: ${b} is off the ${T.space.grid}px grid`);
      for (const b of report.badSurface.slice(0, 6)) fails.push(`${where} C/surface: ${b} — coloured hue outside the neutral family ${HUE_LO}-${HUE_HI}`);
      await page.close();
    }
  }
  await browser.close();

  console.log(`check_scale: ${seen} route/theme cells`);
  if (MUTATE) {
    if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); }
    console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2);
  }
  if (fails.length) {
    console.error(`\n${fails.length} failure(s):`);
    [...new Set(fails)].slice(0, 30).forEach(f => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('  ✓ type on the scale, space on the grid, no coloured surface outside the neutral family');
}
run().catch(e => { console.error(e); process.exit(1); });
