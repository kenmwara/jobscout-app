#!/usr/bin/env node
/**
 * check_honesty.mjs — law 12, enforced instead of intended.
 *
 * Two rules, both of which have been broken in shipped builds:
 *
 *   PLACEMENT  a browse card carries STRONGEST only. What-to-answer stays
 *              behind the tap, because a card that leads with a gap leads
 *              with what the reader LACKS.
 *   CONTENT    no line persuades, and no line claims something about the
 *              reader that the scorer cannot know. "You have led teams" is a
 *              claim; "the resume shows team leadership" is an observation
 *              about a document.
 *
 * Also asserts the ember rule means ONE thing: it marks the reader's next
 * move and nothing else. A quotation from the posting is their demand, not
 * the reader's move, and a rule colour that carries both carries neither.
 *
 *   node tools/check_honesty.mjs --url <base>
 *   node tools/check_honesty.mjs --mutate gap-on-browse   # must FAIL
 *   node tools/check_honesty.mjs --mutate persuasion      # must FAIL
 *   node tools/check_honesty.mjs --mutate ember-quote     # must FAIL
 *   node tools/check_honesty.mjs --mutate lede-lack       # must FAIL
 */
import { chromium } from 'playwright';
import { validate, validateLede, KIND, allowedOn } from '../js/evidence.js';

const args=process.argv.slice(2);
const opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const BASE=opt('--url','http://localhost:8761/markup/browse.html');
const MUTATE=opt('--mutate',null);
const SURFACES={browse:'browse', detail:'detail', prepare:'prepare', saved:'saved', states:'matches'};
const fails=[]; let n=0;

const b=await chromium.launch();
for (const [route,surface] of Object.entries(SURFACES)) {
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.goto(BASE.replace(/[^/]+\.html$/, `${route}.html`),{waitUntil:'networkidle'});
  await p.waitForTimeout(150);

  if (MUTATE==='gap-on-browse' && route==='browse')
    await p.evaluate(()=>{ const c=document.querySelector('.jcard'); if(!c) return;
      const d=document.createElement('div'); d.className='ev ev--answer';
      d.innerHTML='<p class="ev__k">↓ What to answer</p><p class="ev__b">The posting asks for scale you have not shown.</p>';
      c.appendChild(d); });
  if (MUTATE==='persuasion')
    await p.evaluate(()=>{ const e=document.querySelector('.ev--strongest .ev__b');
      if(e) e.textContent='Your experience makes you a perfect match for this role — a no-brainer.'; });
  if (MUTATE==='lede-lack')
    await p.evaluate(()=>{ const e=document.querySelector('.prep__lede');
      if(e) e.textContent='At 28, the resume is the gap — not the letter.'; });
  if (MUTATE==='ember-quote')
    await p.evaluate(()=>{ document.querySelectorAll('.ev--quoted').forEach(e=>{
      e.classList.remove('ev--quoted'); e.classList.add('ev--answer'); }); });

  const blocks=await p.evaluate(()=>[...document.querySelectorAll('.ev')].map(e=>({
    kind: e.classList.contains('ev--strongest')?'strongest'
        : e.classList.contains('ev--answer')?'answer'
        : e.classList.contains('ev--quoted')?'quoted':'unknown',
    rule: getComputedStyle(e).borderLeftColor,
    text: (e.querySelector('.ev__b')?.textContent||'').trim(),
  })));
  for (const blk of blocks) {
    n++;
    const w=`${route} [${blk.kind}]`;
    if (blk.kind==='unknown') { fails.push(`${w}: an evidence block with no kind — it cannot be checked`); continue; }
    if (!allowedOn(blk.kind, surface))
      fails.push(`${w}: not allowed on "${surface}" — placement law`);
    const v=validate(blk.kind, blk.text);
    if (!v.ok) fails.push(`${w}: ${v.reasons.join('; ')}`);
  }
  /* Screen-level copy is held to the same law. A rule that only polices the
     evidence blocks is not a rule — the prepare lede led with a lack for a
     whole draft before anyone noticed, because nothing looked at it. */
  const copy = await p.evaluate(()=>[
    ...[...document.querySelectorAll('.prep__lede, .feed__count')].map(e=>({kind:'lede', text:(e.textContent||'').trim()})),
    ...[...document.querySelectorAll('.state__b, .refusal .ev__b')].map(e=>({kind:'explanation', text:(e.textContent||'').trim()})),
  ].filter(x=>x.text));
  for (const { kind, text } of copy) {
    n++;
    const v = validateLede(text, kind);
    if (!v.ok) fails.push(`${route} ${kind}: ${v.reasons.join('; ')} — "${text.slice(0,60)}…"`);
  }

  /* The ember rule marks the reader's move only. A quotation re-tagged as an
     answer is caught by the placement rule above: allowedOn('answer','matches')
     is false, because their demand is not your move. */
  await p.close();
}
await b.close();
console.log(`check_honesty: ${n} evidence blocks`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); }
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0,20).forEach(f=>console.error('  ✗ '+f)); process.exit(1); }
console.log('  ✓ no gap leads a browse card, no line persuades, ember means one thing');
