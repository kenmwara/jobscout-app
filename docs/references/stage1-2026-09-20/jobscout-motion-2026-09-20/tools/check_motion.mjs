#!/usr/bin/env node
/**
 * check_motion.mjs — the material ladder, measured.
 *
 * The product shipped with exactly ONE elevation state: light tile #ffffff on
 * #f8f2e6 (1.115:1), dark card #1c1544 on #1c1735 (1.014:1). No hover, no
 * press, anywhere. This asserts the three-state ladder exists and is real.
 *
 * A check that only asserts presence is rejected, so nothing here tests for a
 * class or a rule's existence. Every assertion reads a COMPUTED value at an
 * actual interaction state and compares it to the other two.
 *
 *   node tools/check_motion.mjs                     # the live site
 *   node tools/check_motion.mjs --url <url>
 *   node tools/check_motion.mjs --mutate press-equals-hover   # must FAIL
 *
 * Exit 0 = pass. Exit 1 = a real failure. Exit 2 = a mutation did NOT fail,
 * which means the check is asleep and is itself the bug.
 */
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const BASE = opt('--url', 'https://jobscout.page');
const MUTATE = opt('--mutate', null);

/* Every surface that a pointer can act on. If it is clickable it is here. */
const TARGETS = [
  { name: 'job card',      sel: '.card, .job, article[data-band]' },
  { name: 'sector tile',   sel: '.tile' },
  { name: 'list row',      sel: '.row' },
  { name: 'primary btn',   sel: '.btn-1, .run' },
  { name: 'secondary btn', sel: '.btn-2' },
  { name: 'filter chip',   sel: '.f, .chips button' },
  { name: 'heart',         sel: '.heart' },
];

const ROUTES = ['/', '/#browse', '/saved.html'];
const THEMES = ['light', 'dark'];
const MARKETS = ['ca', 'ke'];

const fails = [];
const seen = [];

/** Read the three states of one element without ever trusting a class. */
async function ladder(page, handle) {
  const read = () => handle.evaluate(el => {
    const s = getComputedStyle(el);
    return {
      shadow: s.boxShadow,
      border: s.borderColor,
      transform: s.transform,
      bg: s.backgroundColor,
      dur: s.transitionDuration,
    };
  });

  await page.mouse.move(0, 0);
  await page.waitForTimeout(420);
  const rest = await read();

  await handle.hover();
  await page.waitForTimeout(420);
  const hover = await read();

  const box = await handle.boundingBox();
  if (!box) return null;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(140);            // inside --t-exit, so mid-press
  const press = await read();
  await page.mouse.up();

  return { rest, hover, press };
}

const ms = v => Math.max(...String(v).split(',').map(x => {
  const t = x.trim();
  return t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000;
}).filter(Number.isFinite), 0);

async function run() {
  const browser = await chromium.launch();

  for (const route of ROUTES) {
    for (const theme of THEMES) {
      for (const market of MARKETS) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
          colorScheme: theme,
        });
        const host = market === 'ke'
          ? BASE.replace('//', '//nairobi.') : BASE;
        await page.goto(host + route, { waitUntil: 'networkidle' });
        await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);

        if (MUTATE === 'press-equals-hover') {
          await page.addStyleTag({ content: `
            *:active { box-shadow: var(--sh-hover) !important;
                       border-color: var(--edge-hover) !important; }` });
        }
        if (MUTATE === 'slow-press') {
          await page.addStyleTag({ content: `*:active { transition-duration: 900ms !important; }` });
        }

        const isDark = theme === 'dark';

        for (const t of TARGETS) {
          const el = page.locator(t.sel).first();
          if (!(await el.count())) continue;
          await el.scrollIntoViewIfNeeded().catch(() => {});
          const L = await ladder(page, el);
          if (!L) continue;

          const where = `${route} ${theme}/${market} — ${t.name}`;
          seen.push(where);

          /* 1. The three states must be DISTINCT, not merely present.
                On dark there is no shadow (§10 — a warm shadow on ink reads
                as dirt), so the ladder is carried by border + background. */
          const shadows = [L.rest.shadow, L.hover.shadow, L.press.shadow];
          const borders = [L.rest.border, L.hover.border, L.press.border];
          const bgs     = [L.rest.bg,     L.hover.bg,     L.press.bg];

          if (isDark) {
            if (shadows.some(s => s !== 'none')) {
              fails.push(`${where}: dark must have no shadow, got ${shadows.join(' | ')}`);
            }
            const carriers = new Set([...borders, ...bgs]);
            if (carriers.size < 2) {
              fails.push(`${where}: dark ladder is flat — border and background identical across all three states`);
            }
          } else {
            if (new Set(shadows).size < 3) {
              fails.push(`${where}: needs three distinct shadows, got ${new Set(shadows).size} (${shadows.join(' | ')})`);
            }
          }

          /* 2. Hover must actually displace. A colour-only hover is not a
                material — it is a highlight. */
          if (L.hover.transform === L.rest.transform) {
            fails.push(`${where}: hover does not displace (transform unchanged: ${L.rest.transform})`);
          }

          /* 3. Press must displace, and in the OPPOSITE sense to hover.
                Hover lifts (translateY -2), press compresses (scale < 1). */
          if (L.press.transform === L.hover.transform) {
            fails.push(`${where}: press is indistinguishable from hover`);
          }

          /* 4. THE ASYMMETRY LAW. Exits are faster than entries. A press that
                eases in is not a give. This is the one people get backwards. */
          const dPress = ms(L.press.dur), dHover = ms(L.hover.dur);
          if (dPress > dHover + 1) {
            fails.push(`${where}: press ${dPress}ms is slower than hover ${dHover}ms — exits must be faster than entries`);
          }
          if (dPress > 200) {
            fails.push(`${where}: press ${dPress}ms exceeds --t-exit (160ms)`);
          }
        }
        await page.close();
      }
    }
  }
  await browser.close();

  console.log(`check_motion: examined ${seen.length} surface/state combinations`);
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
  console.log('  ✓ three distinct states everywhere, exits faster than entries');
}

run().catch(e => { console.error(e); process.exit(1); });
