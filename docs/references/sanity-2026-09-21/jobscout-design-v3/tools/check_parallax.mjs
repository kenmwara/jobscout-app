#!/usr/bin/env node
/**
 * check_parallax.mjs — the card's parallax, measured.
 *
 * Four assertions, all reading COMPUTED values off a rendered card. The third
 * is the reason this file exists: it tests a bug that cannot be seen in a
 * screenshot.
 *
 *   A. TRACKING   the transform differs between two pointer positions. A
 *                 static tilt would pass a presence check and fail this.
 *   B. REDUCED    with prefers-reduced-motion, hovering produces no transform.
 *   C. STRETCHED  the link really covers the WHOLE card, and the heart is
 *                 still reachable on top of it. Both halves matter and they
 *                 pull against each other.
 *
 *                 This assertion earned its place. A first draft put the
 *                 title's depth on .jcard__title — and a transform on any
 *                 ANCESTOR of the anchor becomes the containing block for its
 *                 absolutely-positioned ::after, so the stretched link
 *                 silently shrank from the whole card to the title's own box.
 *                 The card's padding and its entire lower half stopped being
 *                 clickable, and nothing about it was visible on screen or in
 *                 a screenshot. Measured, not guessed.
 *   D. ARRIVAL    cards start pending and resolve to in, and end at opacity 1.
 *
 *   node check_parallax.mjs --url http://localhost:8771/parallax-light.html
 *   node check_parallax.mjs --mutate flat            # must FAIL A
 *   node check_parallax.mjs --mutate ignore-motion   # must FAIL B
 *   node check_parallax.mjs --mutate bury-actions    # must FAIL C (heart)
 *   node check_parallax.mjs --mutate shrink-link     # must FAIL C (coverage)
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail (the check is asleep).
 */
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const opt = (k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const URL = opt('--url','http://localhost:8771/parallax-light.html');
const MUTATE = opt('--mutate',null);
const fails=[];

const mut = async p => {
  if (MUTATE==='flat')
    await p.addStyleTag({content:'.jcard:hover{transform:translateY(-2px) !important}'});
  if (MUTATE==='ignore-motion')
    await p.addStyleTag({content:'@media (prefers-reduced-motion: reduce){.jcard:hover{transform:perspective(900px) rotateY(6deg) !important}}'});
  /* The heart's reachability turns out to be OVER-DETERMINED: DOM order, the
     z-index on .jcard__actions, and its translateZ all point the same way, and
     .jcard__head flattens its own subtree so the link overlay cannot climb out
     of it. Two earlier versions of this mutation — zeroing translateZ, then
     zeroing the z-index — each failed to break anything, which is how you
     learn what is actually holding a thing up.
     So the mutation reproduces the regression that DOES happen in practice:
     someone 'makes the whole card clickable' with a fixed, high-z overlay. */
  /* The regression this file was written for: depth on an ANCESTOR of the
     anchor, which shrinks the stretched link to the title's own box. */
  if (MUTATE==='shrink-link')
    await p.addStyleTag({content:'.jcard__title{transform:translateZ(20px) !important}'});
  /* And the opposite failure: the overlay climbing above the actions. */
  if (MUTATE==='bury-actions')
    await p.addStyleTag({content:'.jcard__link::after{transform:translateZ(80px) !important}'});
};

const b = await chromium.launch();

/* ---- A + C : pointer ---- */
{
  const p = await b.newPage({ viewport:{width:1360,height:1000} });
  await p.goto(URL,{waitUntil:'networkidle'}); await mut(p); await p.waitForTimeout(400);
  const card = p.locator('.stack .jcard').first();
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  const read = () => card.evaluate(el => getComputedStyle(el).transform);

  await p.mouse.move(box.x + box.width*0.15, box.y + box.height*0.2);
  await p.waitForTimeout(220);
  const left = await read();
  await p.mouse.move(box.x + box.width*0.85, box.y + box.height*0.8);
  await p.waitForTimeout(220);
  const right = await read();

  if (left === right)
    fails.push(`A/tracking: the transform is identical at two pointer positions (${left.slice(0,42)}…) — the tilt is not tracking`);
  if (!/matrix3d/.test(left))
    fails.push(`A/tracking: no 3d transform at hover (${left.slice(0,42)}…) — perspective is missing, so the tilt is a flat skew`);

  /* C — the stretched link must cover the whole card, and the actions must
         still sit on top of it. */
  /* Longer than --t-settle (340ms). Sampling geometry mid-return measures a
     card that is still tilted, and the hit points land somewhere else. */
  await p.mouse.move(0, 0); await p.waitForTimeout(600);
  const cb = await card.boundingBox();
  const probe = await p.evaluate(({cb}) => {
    const at = (x, y) => {
      const e = document.elementFromPoint(x, y);
      if (!e) return 'none';
      if (e.closest('.heart') || e.closest('.jcard__actions')) return 'ACTIONS';
      if (e.closest('.jcard__link')) return 'LINK';
      return (typeof e.className === 'string' && e.className) || e.tagName;
    };
    return {
      padTopLeft:  at(cb.x + 12, cb.y + 8),
      rightOfMeta: at(cb.x + cb.width - 30, cb.y + cb.height * 0.55),
      lowerRight:  at(cb.x + cb.width - 30, cb.y + cb.height - 70),
    };
  }, { cb });
  for (const [where, got] of Object.entries(probe)) {
    if (got !== 'LINK')
      fails.push(`C/stretched: ${where} of the card hits "${got}", not the link — the stretched link is not covering the card`);
  }
  const heart = card.locator('.heart').first();
  const hb = await heart.boundingBox();
  const onHeart = await p.evaluate(({x,y}) => {
    const el = document.elementFromPoint(x,y);
    return el && el.closest('.heart') ? 'heart' : (el ? (typeof el.className === 'string' && el.className) || el.tagName : 'none');
  }, { x: hb.x + hb.width/2, y: hb.y + hb.height/2 });
  if (onHeart !== 'heart')
    fails.push(`C/stretched: the heart is covered by "${onHeart}" — the overlay is above the actions`);
  await p.close();
}

/* ---- B : reduced motion ---- */
{
  const p = await b.newPage({ viewport:{width:1360,height:1000}, reducedMotion:'reduce' });
  await p.goto(URL,{waitUntil:'networkidle'}); await mut(p); await p.waitForTimeout(300);
  const card = p.locator('.stack .jcard').first();
  await card.scrollIntoViewIfNeeded(); await card.hover(); await p.waitForTimeout(250);
  const t = await card.evaluate(el => getComputedStyle(el).transform);
  if (t !== 'none')
    fails.push(`B/reduced: hovering under prefers-reduced-motion still transforms (${t.slice(0,48)}…)`);
  await p.close();
}

/* ---- D : arrival ---- */
{
  const p = await b.newPage({ viewport:{width:1360,height:700} });
  await p.goto(URL,{waitUntil:'networkidle'}); await mut(p); await p.waitForTimeout(300);
  const states = await p.evaluate(() => [...document.querySelectorAll('.stack .jcard')]
    .map(c => c.getAttribute('data-arrive')));
  if (!states.includes('in'))
    fails.push(`D/arrival: no card reached data-arrive="in" (${states.join(',')}) — the observer never fired`);
  /* Scroll the window AND every inner scroll container — a card can only
     arrive if the thing that actually scrolls it has been scrolled. */
  await p.evaluate(async () => { const s = ms=>new Promise(r=>setTimeout(r,ms));
    for (let y=0;y<document.body.scrollHeight;y+=300){scrollTo(0,y);await s(80);}
    for (const el of document.querySelectorAll('*')) {
      const o = getComputedStyle(el).overflowY;
      if ((o==='auto'||o==='scroll') && el.scrollHeight > el.clientHeight) {
        for (let y=0;y<el.scrollHeight;y+=250){el.scrollTop=y;await s(70);}
      }
    } });
  await p.waitForTimeout(1200);
  const op = await p.evaluate(() => [...document.querySelectorAll('.stack .jcard .jcard__title')]
    .map(t => +getComputedStyle(t).opacity));
  const stuck = op.filter(o => o < 0.95).length;
  if (stuck) fails.push(`D/arrival: ${stuck} title(s) still below opacity 1 after scrolling past — cards are stranded pending`);
  await p.close();
}

await b.close();
console.log('check_parallax: 4 assertions');
if (MUTATE) {
  if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); }
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2);
}
if (fails.length) { console.error(`\n${fails.length} failure(s):`); fails.forEach(f=>console.error('  ✗ '+f)); process.exit(1); }
console.log('  ✓ tilt tracks, reduced motion is flat, the heart stays reachable, every card arrives');
