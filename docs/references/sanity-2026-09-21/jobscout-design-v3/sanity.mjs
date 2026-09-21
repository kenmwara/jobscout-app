#!/usr/bin/env node
/**
 * sanity.mjs — run every check, print one verdict.
 *
 * The point of this file: nobody should have to go through the product with a
 * fine tooth comb to find what a measurement can find. Everything below was
 * a real defect at some point in this product's life, and every one of them
 * is now watched.
 *
 *   node sanity.mjs --url http://localhost:8761/markup/browse.html
 *   node sanity.mjs --mutations        # also prove every check is awake
 *   node sanity.mjs --only score,tiers
 *
 * Exit 0 all green · 1 a check failed · 2 a check is asleep · 3 a check did
 * not RUN (absent, or needs --site-url). Three is deliberately not zero: a
 * check that did not run is not a check that passed, and a suite that
 * silently skips is worse than no suite.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const URL = opt('--url','http://localhost:8761/markup/browse.html');
/* Some checks were written against the SITE's routes (/#browse, /saved.html)
   rather than this pack's files. They are not skipped quietly — without a
   --site-url they are reported as SKIPPED and the run exits non-zero, because
   a suite that silently skips is how a suite rots. */
const SITE = opt('--site-url', null);
const ONLY = (opt('--only',null)||'').split(',').filter(Boolean);
const WITH_MUTATIONS = args.includes('--mutations');

/* Each entry: the check, what it guards, and the mutations that must break
   it. `was` records the real defect that motivated it — the suite doubles as
   the register of what has actually gone wrong here. */
const CHECKS = [
  { id:'tokens',   file:'tokens/generate.mjs', argv:['--check'], noUrl:true,
    guards:'the generated CSS/Kotlin/Swift still match tokens.json',
    was:'five hand-maintained copies of the threshold table' },
  { id:'scale',    file:'tools/check_scale.mjs', mutations:['off-scale-type','off-grid-space','band-wash','second-hero'],
    guards:'type on the 8-step scale, space on the 4px grid, no coloured surface outside the neutral family',
    was:'20 type sizes, 17 spacing values, a green hero at AUTO\'s hue' },
  { id:'tiers',    file:'tools/check_tiers.mjs', mutations:['fat-fact','boxed-date','pill-fact'],
    guards:'verdict taller, wider and differently shaped than fact; context bare',
    was:'the fact chip outweighed the verdict pill — 1.253:1 against 1.141:1' },
  { id:'honesty',  file:'tools/check_honesty.mjs', mutations:['gap-on-browse','persuasion','ember-quote','lede-lack'],
    guards:'no gap leads a card, no line persuades or claims, ember means one thing',
    was:'"At 28, the resume is the gap" led a screen with a lack' },
  { id:'score',    file:'tools/check_score_device.mjs', mutations:['bare-score'],
    guards:'every score is a rose; none is written as prose',
    was:'"Sun Life · fit 28", then "fit 70" after that was reported' },
  { id:'deadends', file:'tools/check_dead_ends.mjs', mutations:['dead-end','system-blame'],
    guards:'every stated block has an unblock beside it; none blames the reader for the system',
    was:'"profile + posting required" under a button that could not run' },
  { id:'primary',  file:'tools/check_one_primary.mjs', mutations:['three-primaries','repeat-action'],
    guards:'one filled primary per region; no action offered twice around itself',
    was:'three identical filled buttons on prepare; "Prepare application" twice on detail' },
  { id:'rose', surface:'site',     file:'tools/check_rose.mjs', mutations:['wrong-band','cropped-viewbox'],
    guards:'lit count equals the band, geometry canonical, nothing clipped',
    was:'the rose was absent from every list surface' },
  { id:'motion', surface:'site',   file:'tools/check_motion.mjs', mutations:['press-equals-hover','slow-press'],
    guards:'three distinct material states, exits faster than entries',
    was:'one elevation state in the whole product' },
  { id:'card', surface:'site',     file:'tools/check_card.mjs', mutations:['sans-title','chip-equals-band','flat-date'],
    guards:'titles are Newsreader 400 everywhere, three tiers three treatments',
    was:'the phone shipped card titles in sans-bold' },
  { id:'parallax', file:'tools/check_parallax.mjs', mutations:['flat','ignore-motion','shrink-link','bury-actions'],
    guards:'tilt tracks, reduced motion is flat, the stretched link covers the card',
    was:'translateZ on the title shrank the card\'s click target to the title' },
  { id:'ground', surface:'site',   file:'tools/check_halo_ext.mjs', mutations:['section-bg','grey-blob','kill-halo'],
    guards:'one ground, warm on light, the halo reaches every route',
    was:'a section painted its own background; a 1.126:1 seam at y=364' },
];

const run = (file, argv) => new Promise(res => {
  const c = spawn(process.execPath, [join(HERE, file), ...argv], { cwd: HERE });
  let out = '';
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  c.on('close', code => res({ code, out }));
  c.on('error', () => res({ code: -1, out: 'could not spawn' }));
});

const pad = (s,n)=>String(s).padEnd(n);
let failed=0, asleep=0, missing=0, ok=0, skipped=0;
const detail = [];

console.log(`\nJobScout sanity  ·  ${URL}\n${'─'.repeat(72)}`);

for (const c of CHECKS) {
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  if (!existsSync(join(HERE, c.file))) {
    console.log(`  ${pad(c.id,10)} ${pad('NOT PRESENT',12)} ${c.file}`);
    missing++; continue;
  }
  if (c.surface === 'site' && !SITE) {
    console.log(`  ${pad(c.id,10)} ${pad('SKIPPED',12)} needs --site-url (written against the site's routes)`);
    skipped++; continue;
  }
  const argv = c.noUrl ? (c.argv||[]) : ['--url', c.surface === 'site' ? SITE : URL];
  const r = await run(c.file, argv);
  if (r.code === 0) { console.log(`  ${pad(c.id,10)} ${pad('pass',12)} ${c.guards}`); ok++; }
  else { console.log(`  ${pad(c.id,10)} ${pad('FAIL',12)} ${c.guards}`); failed++; detail.push([c.id, r.out]); }

  if (WITH_MUTATIONS && r.code === 0 && c.mutations) {
    for (const m of c.mutations) {
      const mr = await run(c.file, [...argv, '--mutate', m]);
      if (mr.code !== 0) { console.log(`  ${pad('',10)} ${pad('ASLEEP',12)} mutation "${m}" did not break it`); asleep++; detail.push([`${c.id}/${m}`, mr.out]); }
    }
  }
}

console.log('─'.repeat(72));
console.log(`  ${ok} passing · ${failed} failing · ${asleep} asleep · ${skipped} skipped · ${missing} not present\n`);

if (detail.length) {
  for (const [id, out] of detail) {
    console.log(`── ${id} ${'─'.repeat(Math.max(0, 68 - id.length))}`);
    console.log(out.split('\n').filter(l=>l.trim()).slice(-14).join('\n'));
    console.log('');
  }
}
if (missing) console.log(`  ${missing} check(s) are not present in this tree. A suite that silently skips\n  is worse than no suite — put them in place or delete them from CHECKS.\n`);

if (skipped) console.log(`  ${skipped} check(s) need --site-url to run. They are not passing; they did not run.\n`);
process.exit(failed ? 1 : asleep ? 2 : (missing || skipped) ? 3 : 0);
