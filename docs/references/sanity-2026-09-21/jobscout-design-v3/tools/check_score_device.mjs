#!/usr/bin/env node
/**
 * check_score_device.mjs — the score is the ROSE, never a bare numeral.
 *
 * THE LAW (stage 1.2): the score is the most important value on any surface
 * that carries one, and it is drawn as the rose with the numeral inside it.
 * A number in a text line is the weakest form it can take.
 *
 * THIS HAS NOW SHIPPED TWICE. It was fixed on the card in stage 1, then
 * reappeared one screen later as "Sun Life · fit 28", and again as
 * "Sun Life · fit 70" after that was reported. Nothing was watching, so it
 * came back. This is what watches.
 *
 *   node tools/check_score_device.mjs --url <base>/browse.html
 *   node tools/check_score_device.mjs --mutate bare-score   # must FAIL
 *
 * Exit 0 pass · 1 failure · 2 a mutation did not fail.
 */
import { chromium } from 'playwright';
const args=process.argv.slice(2), opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const BASE=opt('--url','http://localhost:8761/markup/browse.html');
const MUTATE=opt('--mutate',null);
const ROUTES=(opt('--routes','browse,detail,prepare,saved,states')).split(',');
const fails=[]; let scanned=0;

/* A score written as prose. "fit 70", "score: 70", "70/100", "70 out of 100",
   "match 70" — every form seen or plausible. Deliberately broad: a false
   positive costs a glance, a false negative ships. */
const PROSE = [
  /\bfit\s+\d{1,3}\b/i,
  /\bscore[:\s]+\d{1,3}\b/i,
  /\bmatch(?:es)?[:\s]+\d{1,3}\b/i,
  /\b\d{1,3}\s*\/\s*100\b/,
  /\b\d{1,3}\s+out of\s+100\b/i,
  /\b(?:rated|rating)\s+\d{1,3}\b/i,
];

const b = await chromium.launch();
for (const route of ROUTES) {
  const p = await b.newPage({ viewport:{width:390,height:844} });
  await p.goto(BASE.replace(/[^/]+\.html$/, `${route}.html`), {waitUntil:'networkidle'});
  await p.waitForTimeout(250);
  if (MUTATE==='bare-score')
    await p.evaluate(()=>{ const o=document.querySelector('.jcard__org, .match__org');
      if(o) o.textContent = o.textContent + ' · fit 70'; });

  const r = await p.evaluate(sources => {
    const out = { prose: [], roseless: [] };
    /* 1. any text node that states a score in prose, excluding the numeral
          that legitimately sits inside a rose. */
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!t) continue;
      if (n.parentElement.closest('.score')) continue;      /* the real device */
      /* EXPLANATION SURFACES ARE EXEMPT, narrowly. "The nearest was 28 out of
         100 — the distance between what these postings ask for and what the
         resume currently says" is a number doing narrative work inside a
         sentence, not a score display standing in for the device. The rule is
         about SUBSTITUTION: a score in an identity or header position instead
         of the rose. Prose that explains is governed by check_honesty.mjs.
         The first run of this check flagged exactly that paragraph, which is
         the best writing in the product — the rule was too wide, not the
         copy. */
      if (n.parentElement.closest('.state__b, .ev__b, .refusal, .prep__lede')) continue;
      for (const src of sources) {
        const re = new RegExp(src.source, src.flags);
        if (re.test(t)) { out.prose.push(`${n.parentElement.className || n.parentElement.tagName}: "${t.slice(0,60)}"`); break; }
      }
    }
    /* 2. any element declaring a band must own a rose. A band without a rose
          is a verdict with no quantity behind it. */
    document.querySelectorAll('[data-band]').forEach(el => {
      if (!el.querySelector('svg.rose')) out.roseless.push(el.className || el.tagName);
    });
    return out;
  }, PROSE.map(r => ({ source: r.source, flags: r.flags })));

  scanned++;
  for (const x of [...new Set(r.prose)])
    fails.push(`${route}: the score is written as prose — ${x}. It is the rose, with the numeral inside it.`);
  for (const x of [...new Set(r.roseless)])
    fails.push(`${route}: <${x}> declares a band but carries no rose — a verdict with no quantity behind it`);
  await p.close();
}
await b.close();
console.log(`check_score_device: ${scanned} routes`);
if (MUTATE) { if (fails.length){console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`);process.exit(0);}
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`);process.exit(2); }
if (fails.length){console.error(`\n${fails.length} failure(s):`);fails.forEach(f=>console.error('  ✗ '+f));process.exit(1);}
console.log('  ✓ every score is a rose; no score is written as prose');
