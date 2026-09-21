#!/usr/bin/env node
/**
 * check_dead_ends.mjs — a blocked action carries its own unblock.
 *
 * The prepare screen shipped "profile + posting required" in ember under a
 * button that could not run. That line names a precondition and offers no way
 * to meet it: the honesty law's failure mode from the other direction —
 * leading with what the reader LACKS and then stopping.
 *
 * TWO ASSERTIONS
 *   A. no text states a requirement, error or block unless its container
 *      DECLARES the block with data-blocked and carries a control that
 *      resolves it (.btn--unblock, or an input).
 *
 *      "a control is present in the same container" was the first version of
 *      this test and it was too weak: a prepare card already has buttons, so
 *      appending a bare "profile required" to one passed. The declaration is
 *      what makes it checkable — it forces the author to say WHICH block, and
 *      a block nobody declared is the bug.
 *   B. nothing asks the reader to supply something only the SYSTEM can. A
 *      missing posting is a refusal, not a requirement.
 *
 *   node tools/check_dead_ends.mjs --url <base>/browse.html
 *   node tools/check_dead_ends.mjs --mutate dead-end     # must FAIL A
 *   node tools/check_dead_ends.mjs --mutate system-blame # must FAIL B
 */
import { chromium } from 'playwright';
const args=process.argv.slice(2), opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const BASE=opt('--url','http://localhost:8761/markup/browse.html');
const MUTATE=opt('--mutate',null);
const ROUTES=(opt('--routes','browse,detail,prepare,saved,sheet,states')).split(',');
const fails=[]; let scanned=0;

/* Language that states a block. */
const BLOCK = /\b(required|needed|missing|unavailable|not available|must (?:have|add|provide)|please (?:add|provide|upload)|cannot|can't|unable to|failed|error)\b/i;
/* Things only the system can supply. Asking the reader for one is blaming
   them for the product's own state. */
const SYSTEM_OWNED = /\b(posting|listing|feed|sweep|scorer|server|worker|api)\b/i;

const b = await chromium.launch();
for (const route of ROUTES) {
  const p = await b.newPage({ viewport:{width:390,height:844} });
  await p.goto(BASE.replace(/[^/]+\.html$/, `${route}.html`), {waitUntil:'networkidle'});
  await p.waitForTimeout(220);

  if (MUTATE==='dead-end')
    await p.evaluate(()=>{ const c=document.querySelector('.prep__card, .jcard');
      if(c){const n=document.createElement('p');n.textContent='profile required';c.appendChild(n);} });
  if (MUTATE==='system-blame')
    await p.evaluate(()=>{ const c=document.querySelector('.prep__card, .jcard');
      if(c){const n=document.createElement('p');n.textContent='posting required';
        const btn=document.createElement('button');btn.className='btn btn--primary';btn.textContent='Retry';
        c.appendChild(n);c.appendChild(btn);} });

  const r = await p.evaluate(({blockSrc, blockFlags, sysSrc, sysFlags}) => {
    const BLOCK = new RegExp(blockSrc, blockFlags);
    const SYS   = new RegExp(sysSrc, sysFlags);
    const out = { dead: [], blame: [] };
    const CONTAINER = '.jcard, .prep__card, .state, .refusal, .ev, .sheet, .match';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      if (!t || t.length < 4) continue;
      const el = n.parentElement;
      /* A block stated ON a control is the control offering the remedy. */
      if (el.closest('button, a[href]')) continue;
      if (!BLOCK.test(t)) continue;
      const box = el.closest(CONTAINER) || document.body;
      /* A .refusal is the surface FOR a block and carries its own action, so
         it is exempt: it is the declared form. */
      if (box.closest('.refusal')) continue;
      const declared = box.closest('[data-blocked]');
      if (!declared) {
        out.dead.push(`${(el.className||el.tagName)}: "${t.slice(0,58)}" (container declares no data-blocked)`);
      } else if (!declared.querySelector('.btn--unblock, input, [data-unblock]')) {
        out.dead.push(`${(el.className||el.tagName)}: "${t.slice(0,58)}" (data-blocked but no unblock control)`);
      }
      if (SYS.test(t))
        out.blame.push(`${(el.className||el.tagName)}: "${t.slice(0,58)}"`);
    }
    return out;
  }, { blockSrc: BLOCK.source, blockFlags: BLOCK.flags, sysSrc: SYSTEM_OWNED.source, sysFlags: SYSTEM_OWNED.flags });

  scanned++;
  for (const x of [...new Set(r.dead)])
    fails.push(`${route} A/dead-end: ${x} — states a block with no control in the same container that resolves it`);
  for (const x of [...new Set(r.blame)])
    fails.push(`${route} B/blame: ${x} — asks the reader for something only the system can supply; that is a refusal, not a requirement`);
  await p.close();
}
await b.close();
console.log(`check_dead_ends: ${scanned} routes`);
if (MUTATE) { if (fails.length){console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`);process.exit(0);}
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`);process.exit(2); }
if (fails.length){console.error(`\n${fails.length} failure(s):`);fails.forEach(f=>console.error('  ✗ '+f));process.exit(1);}
console.log('  ✓ every stated block has a control beside it; none blames the reader for the system');
