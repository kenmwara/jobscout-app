#!/usr/bin/env node
/**
 * check_rose.mjs — the needle-is-the-score law, measured.
 *
 * The rose is the product's only proprietary visual device and it was absent
 * from every list surface: sampling the score region of the first card in
 * mockup-ca-dark.png returned #1c1544 and #a4bbff and no rose geometry.
 *
 * This asserts three things that cannot be faked:
 *   1. the lit-dot count EQUALS the band (the law itself),
 *   2. the geometry is canonical and the display cut is not clipping,
 *   3. the lit dots carry the band's colour and the unlit ones do not.
 *
 *   node tools/check_rose.mjs
 *   node tools/check_rose.mjs --url <url>
 *   node tools/check_rose.mjs --reduced            # information must be identical
 *   node tools/check_rose.mjs --mutate wrong-band  # must FAIL
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail (the check is asleep).
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const has = k => args.includes(k);
const BASE = opt('--url', 'https://jobscout.page');
const MUTATE = opt('--mutate', null);
const REDUCED = has('--reduced');

/* Law: the number of lit dots IS the band. */
const BAND_DOTS = { auto: 8, ping: 6, unsure: 5, near: 3, 'near-miss': 3 };

/* Law 9, canonical. r = 2.275 + 0.2944 * i, clockwise from bearing 000. */
const RING = 11, BOX = 12, R0 = 2.275, DR = 0.2944;
const DISPLAY_CUT = '-4.2416 -3.0639 31.3054 31.3054';
const EPS = 0.01;

const ROUTES = ['/#browse', '/saved.html'];
const THEMES = ['light', 'dark'];
const MARKETS = ['ca', 'ke'];

const fails = [];
let examined = 0;

async function run() {
  const browser = await chromium.launch();

  for (const route of ROUTES) {
    for (const theme of THEMES) {
      for (const market of MARKETS) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 1000 },
          colorScheme: theme,
          reducedMotion: REDUCED ? 'reduce' : 'no-preference',
        });
        const host = market === 'ke' ? BASE.replace('//', '//nairobi.') : BASE;
        await page.goto(host + route, { waitUntil: 'networkidle' });
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(REDUCED ? 200 : 1800);   // let every rose settle

        if (MUTATE === 'wrong-band') {
          await page.evaluate(() => {
            const el = document.querySelector('[data-band]');
            if (el) el.setAttribute('data-band', el.dataset.band === 'auto' ? 'near' : 'auto');
          });
        }
        if (MUTATE === 'cropped-viewbox') {
          await page.evaluate(() => {
            document.querySelectorAll('svg.rose').forEach(s => s.setAttribute('viewBox', '0 0 24 24'));
          });
        }

        const report = await page.evaluate(({ RING, BOX, R0, DR, EPS }) => {
          const out = [];
          document.querySelectorAll('[data-band]').forEach((host, idx) => {
            const svg = host.querySelector('svg.rose');
            if (!svg) { out.push({ idx, band: host.dataset.band, missing: true }); return; }

            const dots = [...svg.querySelectorAll('circle')];
            const box = svg.getBoundingClientRect();

            /* geometry, straight off the attributes */
            const geo = dots.map((c, i) => {
              const a = i * Math.PI / 4 - Math.PI / 2;
              return {
                dcx: Math.abs(+c.getAttribute('cx') - (BOX + RING * Math.cos(a))),
                dcy: Math.abs(+c.getAttribute('cy') - (BOX + RING * Math.sin(a))),
                dr:  Math.abs(+c.getAttribute('r')  - (R0 + DR * i)),
              };
            });

            /* clipping: does any dot's painted box escape the svg's box? */
            let escapes = 0;
            dots.forEach(c => {
              const b = c.getBoundingClientRect();
              if (b.left < box.left - 0.5 || b.right > box.right + 0.5 ||
                  b.top < box.top - 0.5 || b.bottom > box.bottom + 0.5) escapes++;
            });

            /* lit vs unlit, by rendered opacity — never by class name */
            const states = dots.map(c => {
              const s = getComputedStyle(c);
              return { op: parseFloat(s.opacity), fill: s.fill };
            });
            const lit = states.filter(s => s.op > 0.6);
            const unlit = states.filter(s => s.op <= 0.6);

            out.push({
              idx,
              band: host.dataset.band,
              dotCount: dots.length,
              viewBox: svg.getAttribute('viewBox'),
              px: box.width,
              maxGeoErr: Math.max(0, ...geo.flatMap(g => [g.dcx, g.dcy, g.dr])),
              escapes,
              lit: lit.length,
              litFills: [...new Set(lit.map(s => s.fill))],
              unlitFills: [...new Set(unlit.map(s => s.fill))],
              numeral: host.querySelector('.pnum, .rnum, .num')?.textContent?.trim() ?? null,
            });
          });
          return out;
        }, { RING, BOX, R0, DR, EPS });

        for (const r of report) {
          examined++;
          const where = `${route} ${theme}/${market} #${r.idx} [${r.band}]`;

          if (r.missing) { fails.push(`${where}: no rose — the score is a bare numeral`); continue; }

          /* 1. THE LAW. */
          const want = BAND_DOTS[r.band];
          if (want === undefined) { fails.push(`${where}: unknown band`); continue; }
          if (r.lit !== want) {
            fails.push(`${where}: ${r.lit} lit dots, band says ${want}`);
          }

          /* 2. Geometry and the display cut. */
          if (r.dotCount !== 8) fails.push(`${where}: ${r.dotCount} dots, law 9 says 8`);
          if (r.maxGeoErr > EPS) {
            fails.push(`${where}: geometry off canonical by ${r.maxGeoErr.toFixed(4)} (>${EPS})`);
          }
          if (r.px >= 48 && r.viewBox !== DISPLAY_CUT) {
            fails.push(`${where}: ${r.px.toFixed(0)}px needs the display cut "${DISPLAY_CUT}", got "${r.viewBox}"`);
          }
          if (r.escapes) {
            fails.push(`${where}: ${r.escapes} dot(s) painted outside the svg box — the viewBox is clipping`);
          }

          /* 3. Lit dots carry the band's colour; unlit ones must not.
                This is what stops a "lit" state being opacity alone. */
          if (r.litFills.length > 1) {
            fails.push(`${where}: lit dots have ${r.litFills.length} different fills`);
          }
          if (r.lit && r.unlitFills.length && r.litFills[0] === r.unlitFills[0]) {
            fails.push(`${where}: lit and unlit share a fill (${r.litFills[0]}) — nothing distinguishes them but opacity`);
          }

          /* 4. The numeral must have arrived, not be mid-count. */
          if (r.numeral !== null && !/^\d{1,3}$/.test(r.numeral)) {
            fails.push(`${where}: numeral is "${r.numeral}"`);
          }
          if (r.numeral === '0' && r.lit > 0) {
            fails.push(`${where}: rose lit but numeral still 0 — the two clocks have drifted`);
          }
        }
        await page.close();
      }
    }
  }
  await browser.close();

  const mode = REDUCED ? ' (reduced motion)' : '';
  console.log(`check_rose: examined ${examined} roses${mode}`);
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
    fails.forEach(f => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('  ✓ lit count equals band, geometry canonical, nothing clipped');
}

run().catch(e => { console.error(e); process.exit(1); });
