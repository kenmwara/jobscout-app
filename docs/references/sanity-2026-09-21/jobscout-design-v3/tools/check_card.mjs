#!/usr/bin/env node
/**
 * check_card.mjs — Stage 1's two card assertions, measured.
 *
 * check_rose.mjs covers the score device. These are the other two things
 * Stage 1 changes, and both were real failures in the 2026-09-20 audit:
 *
 *   A. THE TITLE IS NEWSREADER.  The phone shipped its card titles in
 *      sans-bold while the desktop card used Newsreader — so the densest
 *      surface in the product was the one breaking law 13. Asserted on every
 *      surface INCLUDING 390pt, because 390pt is where it broke.
 *
 *   B. THREE TIERS, THREE TREATMENTS.  A verdict and a fact rendered
 *      identically: same height, same radius, same type size. Container
 *      weight is supposed to BE importance —
 *        tier 1 the band pill   filled with the band's -bg
 *        tier 2 the location    --sunken, and no hue (law 5)
 *        tier 3 the date        no container at all
 *      Asserted as three DISTINCT computed background-colors, not as three
 *      class names. A check that only asserts presence is rejected.
 *
 *   node tools/check_card.mjs
 *   node tools/check_card.mjs --url <url>
 *   node tools/check_card.mjs --mutate sans-title        # must FAIL rule A
 *   node tools/check_card.mjs --mutate chip-equals-band  # must FAIL rule B
 *   node tools/check_card.mjs --mutate flat-date         # must FAIL rule B
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail (the check is asleep).
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const BASE = opt('--url', 'https://jobscout.page');
const MUTATE = opt('--mutate', null);

const ROUTES = ['/#browse', '/saved.html'];
const THEMES = ['light', 'dark'];
const MARKETS = ['ca', 'ke'];
/* 390 is the iPhone logical width where the title broke. 1280 is desktop.
   Both are asserted, because "on every surface" is the whole point. */
const WIDTHS = [1280, 390];

const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent']);

const fails = [];
let examined = 0;

async function run() {
  const browser = await chromium.launch();

  for (const route of ROUTES) {
    for (const theme of THEMES) {
      for (const market of MARKETS) {
        for (const width of WIDTHS) {
          const page = await browser.newPage({
            viewport: { width, height: 1000 },
            colorScheme: theme,
          });
          const host = market === 'ke' ? BASE.replace('//', '//nairobi.') : BASE;
          await page.goto(host + route, { waitUntil: 'networkidle' });
          await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
          await page.waitForTimeout(300);

          if (MUTATE === 'sans-title') {
            await page.addStyleTag({ content:
              `.jcard__title, .card h3, article h3 { font-family: Inter, system-ui, sans-serif !important; font-weight: 700 !important; }` });
          }
          if (MUTATE === 'chip-equals-band') {
            /* The exact regression Stage 1 exists to prevent: a fact wearing
               the verdict's container. */
            await page.evaluate(() => {
              document.querySelectorAll('.jcard').forEach(c => {
                const band = c.querySelector('.jcard__band');
                const chip = c.querySelector('.jcard__chip');
                if (band && chip) chip.style.background = getComputedStyle(band).backgroundColor;
              });
            });
          }
          if (MUTATE === 'flat-date') {
            await page.addStyleTag({ content:
              `.jcard__when { background: var(--sunken) !important; padding: 5px 10px !important; }` });
          }

          const where = `${route} ${theme}/${market} @${width}`;

          const report = await page.evaluate(() => {
            const out = { titles: [], cards: [], fontsReady: null };

            /* --- A: every card title, wherever it lives ------------------ */
            document.querySelectorAll('.jcard__title, .jcard__title a').forEach(el => {
              const s = getComputedStyle(el);
              out.titles.push({
                text: (el.textContent || '').trim().slice(0, 34),
                family: s.fontFamily,
                weight: s.fontWeight,
                size: s.fontSize,
              });
            });

            /* getComputedStyle returns the DECLARED stack, not the font that
               was actually used, so the assertion above proves the rule
               reached the element — which is exactly what failed. Whether
               the face actually downloaded is a separate question, and
               `document.fonts.check()` does NOT answer it: it returns true
               for a declared-but-unloaded face. The only honest test is to
               measure. Render the same string twice — once asking for
               Newsreader, once asking for its own fallback chain with
               Newsreader removed — and compare. Identical widths mean the
               fallback is what is on screen. This answers "does the family
               render", not "did the webfont download" — a locally installed
               Newsreader passes, which is the right answer. */
            try {
              const probe = t => {
                const s = document.createElement('span');
                s.textContent = 'Senior Product Designer Hamburgefonstiv';
                s.style.cssText = `position:absolute;left:-9999px;top:0;white-space:pre;` +
                                  `font:400 48px ${t}`;
                document.body.appendChild(s);
                const w = s.getBoundingClientRect().width;
                s.remove();
                return w;
              };
              const withFace = probe('Newsreader, Georgia, serif');
              const without  = probe('Georgia, serif');
              out.fontsReady = Math.abs(withFace - without) > 0.5;
            } catch { out.fontsReady = null; }

            /* --- B: the three tiers, per card --------------------------- */
            document.querySelectorAll('.jcard').forEach((c, idx) => {
              const pick = sel => {
                const el = c.querySelector(sel);
                if (!el) return null;
                const s = getComputedStyle(el);
                return {
                  bg: s.backgroundColor,
                  pad: s.padding,
                  radius: s.borderTopLeftRadius,
                  size: s.fontSize,
                };
              };
              out.cards.push({
                idx,
                swept: c.classList.contains('jcard--swept'),
                band: c.dataset.band ?? null,
                tier1: pick('.jcard__band'),
                tier2: pick('.jcard__chip'),
                tier3: pick('.jcard__when'),
              });
            });
            return out;
          });

          /* ---------- RULE A ---------- */
          if (!report.titles.length) {
            fails.push(`${where}: no card titles found — the selector or the markup moved`);
          }
          for (const t of report.titles) {
            examined++;
            const first = t.family.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
            if (first !== 'newsreader') {
              fails.push(`${where}: title "${t.text}" resolves to ${t.family} — law 13 assigns the serif to display`);
            }
            /* Newsreader is a 400-only face here; a synthesised bold is the
               sans-bold bug wearing the right family name. */
            if (+t.weight > 500) {
              fails.push(`${where}: title "${t.text}" is weight ${t.weight} — Newsreader ships at 400 on the card`);
            }
          }

          /* ---------- RULE B ---------- */
          for (const c of report.cards) {
            const tag = `${where} #${c.idx} [${c.band ?? 'swept'}]`;

            if (!c.tier2) { fails.push(`${tag}: no location chip — tier 2 is missing`); continue; }
            if (!c.tier3) { fails.push(`${tag}: no posted date — tier 3 is missing`); continue; }

            /* tier 3 has NO container. Not a subtle one — none. */
            if (!TRANSPARENT.has(c.tier3.bg)) {
              fails.push(`${tag}: the date paints ${c.tier3.bg} — tier 3 has no container at all`);
            }
            /* tier 2 is a container, and it is the SUNKEN one. */
            if (TRANSPARENT.has(c.tier2.bg)) {
              fails.push(`${tag}: the location chip has no background — tier 2 is a fact in a --sunken container`);
            }

            if (c.swept) {
              /* A swept card has no verdict; that absence IS the information.
                 A band pill here would be claiming a score it does not have. */
              if (c.tier1) {
                fails.push(`${tag}: a swept card is showing a band pill — it has no verdict yet (law 12)`);
              }
              continue;
            }

            if (!c.tier1) { fails.push(`${tag}: no band pill — tier 1 is missing on a scored card`); continue; }
            if (TRANSPARENT.has(c.tier1.bg)) {
              fails.push(`${tag}: the band pill is transparent — tier 1 is filled`);
            }

            /* The assertion that matters: THREE distinct computed values. */
            const bgs = [c.tier1.bg, c.tier2.bg, c.tier3.bg];
            if (new Set(bgs).size < 3) {
              fails.push(`${tag}: only ${new Set(bgs).size} distinct backgrounds across the three tiers (${bgs.join(' | ')}) — a verdict and a fact are rendering identically`);
            }
          }

          if (report.fontsReady === false) {
            /* Not a failure: the rule is correct and the network is not the
               card's problem. Said out loud so it is never mistaken for a
               pass on the rendered face. */
            console.log(`  note ${where}: Newsreader declared but not loaded in this run — the stack is asserted, the rendered face is not`);
          }

          await page.close();
        }
      }
    }
  }
  await browser.close();

  console.log(`check_card: examined ${examined} card titles across ${ROUTES.length * 8} surface cells`);
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
  console.log('  ✓ titles are Newsreader at 400 everywhere, three tiers three treatments');
}

run().catch(e => { console.error(e); process.exit(1); });
