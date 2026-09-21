#!/usr/bin/env node
/**
 * check_one_primary.mjs — one primary action per screen, and per card.
 *
 * The prepare screen shipped three identical filled buttons — Write the
 * letter, Rebuild my resume, Get their questions — so the screen asked the
 * reader to rank three things it could have ranked for them. The detail
 * screen shipped "Prepare application" twice, once inside a card and once as
 * a stacked button below it.
 *
 * A filled button is a recommendation. Three of them is none.
 *
 * ASSERTIONS
 *   A. at most ONE filled primary per screen region (a card, or the screen
 *      outside any card).
 *   B. the same PRIMARY action does not appear twice where one instance
 *      contains the other — a card offering "Prepare application" inside a
 *      page that offers it again, which is what the detail screen shipped.
 *
 *      Two earlier versions of B were wrong and the check said so on its
 *      first run: "no label twice on a screen" flags a feed where every card
 *      legitimately offers the same action, and flags a market chip that
 *      displays state next to a control that sets it. Restricting B to
 *      FILLED buttons in a containing relationship catches the real bug and
 *      neither false positive.
 *
 *   node tools/check_one_primary.mjs --mutate three-primaries  # must FAIL A
 *   node tools/check_one_primary.mjs --mutate repeat-action    # must FAIL B
 */
import { chromium } from 'playwright';
const args=process.argv.slice(2), opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const BASE=opt('--url','http://localhost:8761/markup/browse.html');
const MUTATE=opt('--mutate',null);
const ROUTES=(opt('--routes','browse,detail,prepare,saved,sheet,states')).split(',');
const fails=[]; let scanned=0;

const b = await chromium.launch();
for (const route of ROUTES) {
  const p = await b.newPage({ viewport:{width:390,height:844} });
  await p.goto(BASE.replace(/[^/]+\.html$/, `${route}.html`), {waitUntil:'networkidle'});
  await p.waitForTimeout(220);
  /* Two filled buttons in the SAME region — the prepare screen's shape.
     An earlier mutation promoted every .btn--secondary instead, which is a
     less direct way of saying the same thing and did not fire on every
     route, so it could not prove the assertion awake. */
  if (MUTATE==='three-primaries')
    await p.evaluate(()=>{
      const prim = document.querySelector('.jcard .btn--primary, .match .btn--primary, .prep__card .btn--primary, .btn--primary');
      if (!prim) return;
      const row = prim.parentElement;
      for (let i = 0; i < 2; i++) { const c = prim.cloneNode(true); c.textContent = 'Another action ' + i; row.appendChild(c); }
    });
  /* The detail screen's real shape: a card offering the primary, and the page
     offering the same primary around it. */
  if (MUTATE==='repeat-action')
    await p.evaluate(()=>{ const b2=document.querySelector('.jcard .btn--primary, .match .btn--primary, .prep__card .btn--primary');
      if(b2){const c=b2.cloneNode(true);document.body.appendChild(c);} });

  const r = await p.evaluate(() => {
    /* "Primary" is measured, not named: a button whose background matches the
       computed --action. A class could be renamed; the fill is the signal the
       reader actually sees. */
    const root = getComputedStyle(document.documentElement);
    const action = root.getPropertyValue('--action').trim();
    const probe = document.createElement('span');
    probe.style.color = action; document.body.appendChild(probe);
    const actionRGB = getComputedStyle(probe).color; probe.remove();

    const filled = [...document.querySelectorAll('button, a.btn, [role="button"]')]
      .filter(el => getComputedStyle(el).backgroundColor === actionRGB);

    /* Group by region: each card is its own region; everything else is the
       screen. A list of cards may legitimately show one primary per card. */
    const byRegion = new Map();
    for (const el of filled) {
      const region = el.closest('.jcard, .prep__card, .match, .sheet') || document.body;
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region).push((el.textContent || '').trim().replace(/\s+/g,' ').slice(0,40));
    }
    const over = [];
    for (const [region, labels] of byRegion)
      if (labels.length > 1)
        over.push(`${region.className || region.tagName}: ${labels.length} filled — ${labels.join(' | ')}`);

    /* B — the same FILLED action offered twice, where one offer contains the
       other. Sibling cards each offering it is a list, not a bug. */
    const byLabel = new Map();
    for (const el of filled) {
      const t = (el.textContent||'').trim().replace(/\s+/g,' ');
      if (t.length < 4) continue;
      if (!byLabel.has(t)) byLabel.set(t, []);
      byLabel.get(t).push(el.closest('.jcard, .prep__card, .match, .sheet') || document.body);
    }
    const dupes = [];
    for (const [t, regions] of byLabel) {
      for (let i = 0; i < regions.length; i++)
        for (let j = i + 1; j < regions.length; j++)
          if (regions[i] !== regions[j] &&
              (regions[i].contains(regions[j]) || regions[j].contains(regions[i]))) {
            dupes.push(`"${t.slice(0,44)}" offered both inside <${(regions[j].className||regions[j].tagName).toString().slice(0,26)}> and around it`);
            i = regions.length; break;
          }
    }
    return { over, dupes };
  });

  scanned++;
  for (const x of r.over)  fails.push(`${route} A/primary: ${x} — a filled button is a recommendation; more than one is none`);
  for (const x of r.dupes) fails.push(`${route} B/repeat: ${x} — the page already says it`);
  await p.close();
}
await b.close();
console.log(`check_one_primary: ${scanned} routes`);
if (MUTATE) { if (fails.length){console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`);process.exit(0);}
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`);process.exit(2); }
if (fails.length){console.error(`\n${fails.length} failure(s):`);fails.forEach(f=>console.error('  ✗ '+f));process.exit(1);}
console.log('  ✓ one filled primary per region, no action repeated on a screen');
