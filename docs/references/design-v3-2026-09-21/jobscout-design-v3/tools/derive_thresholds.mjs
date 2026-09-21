#!/usr/bin/env node
/**
 * derive_thresholds.mjs — stop guessing the band boundaries; measure them.
 *
 * The scorer emits `fit` ONLY — every client derives the band itself — so
 * these numbers are load-bearing on five clients at once. The confirmed table
 * lives in tokens/tokens.json and generates into CSS, Kotlin and Swift.
 *
 * This tool exists to CHECK that table against real data, and to answer the
 * question behind it: is the band a pure function of the score at all?
 *
 *   node tools/derive_thresholds.mjs mockups/feed-sample.json
 *   node tools/derive_thresholds.mjs data/*.json --key score --band band
 *
 * Accepts: a JSON array of rows, or an object with any array property whose
 * items carry a score and a band. Field names are sniffed, or given with
 * --key / --band.
 *
 * Exit 0 every boundary pinned · 1 bands overlap (so no table can be right)
 * · 2 the data only BOUNDS the boundaries and a value would be a guess.
 *
 * It refuses to print a paste-ready table unless the observations pin it.
 * An earlier draft printed a midpoint, which is how `ping` shipped as 69
 * when the code says 70.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const files = args.filter(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--key'
                            && args[args.indexOf(a) - 1] !== '--band');
const SCORE_KEY = opt('--key', null);
const BAND_KEY  = opt('--band', null);

if (!files.length) {
  console.error('usage: node tools/derive_thresholds.mjs <feed.json> [more.json] [--key score] [--band band]');
  process.exit(64);
}

const ORDER = ['auto', 'ping', 'unsure', 'nearmiss'];

function* walk(node) {
  if (Array.isArray(node)) { for (const v of node) yield* walk(v); return; }
  if (node && typeof node === 'object') {
    yield node;
    for (const v of Object.values(node)) yield* walk(v);
  }
}

const rows = [];
for (const f of files) {
  let data;
  try { data = JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { console.error(`  ✗ ${f}: ${e.message}`); process.exit(1); }

  for (const o of walk(data)) {
    const sk = SCORE_KEY || ['score', 'fit', 'value', 'points'].find(k => typeof o[k] === 'number');
    const bk = BAND_KEY  || ['band', 'tier', 'verdict', 'bucket'].find(k => typeof o[k] === 'string');
    if (!sk || !bk) continue;
    const band = String(o[bk]).toLowerCase().replace(/[\s_-]/g, '');
    if (!ORDER.includes(band)) continue;
    rows.push({ score: o[sk], band, src: f });
  }
}

if (!rows.length) {
  console.error('  ✗ no rows carrying both a numeric score and a known band were found.');
  console.error('    Bands must be one of: ' + ORDER.join(', ') + '. Try --key / --band.');
  process.exit(1);
}

const by = Object.fromEntries(ORDER.map(b => [b, []]));
for (const r of rows) by[r.band].push(r.score);
for (const b of ORDER) by[b].sort((x, y) => x - y);

console.log(`derive_thresholds: ${rows.length} scored rows from ${files.length} file(s)\n`);
console.log('  band       n      min    max');
for (const b of ORDER) {
  const v = by[b];
  console.log(`  ${b.padEnd(9)} ${String(v.length).padStart(4)}   ${v.length ? `${v[0]}   ${v[v.length-1]}` : '   —      —'}`);
}

/* Overlap is the finding that matters. */
const present = ORDER.filter(b => by[b].length);
const overlaps = [];
for (let i = 0; i < present.length - 1; i++) {
  const hi = present[i], lo = present[i + 1];
  const hiMin = by[hi][0], loMax = by[lo][by[lo].length - 1];
  if (loMax >= hiMin) overlaps.push({ hi, lo, hiMin, loMax });
}

if (overlaps.length) {
  console.log('\n  ⚠ THE BAND IS NOT A PURE FUNCTION OF THE SCORE.\n');
  for (const o of overlaps) {
    console.log(`    ${o.lo} reaches ${o.loMax} while ${o.hi} starts at ${o.hiMin} — they overlap.`);
  }
  console.log('\n  This is worth knowing and is not a bug: something other than the');
  console.log('  number decides the band — a location rule, a floor, a refusal. No');
  console.log('  threshold table can be correct, so leave the generated table as an');
  console.log('  approximation, and move the decision to the server: js/band.js has');
  console.log('  reconcile() ready for the day the worker emits a band of its own.');
  process.exit(1);
}

console.log('\n  The band IS a pure function of the score in this sample.\n');
console.log('  Observations BOUND each boundary; they do not pin it. A midpoint is a');
console.log('  working classifier, not the boundary — this is exactly how an earlier');
console.log('  draft got ping wrong: 68 UNSURE and 70 PING bound it to 68 < x <= 70,');
console.log('  the midpoint said 69, and the code says 70.\n');

let pinned = 0, total = 0;
const derived = {};
for (let i = 0; i < present.length - 1; i++) {
  const hi = present[i], lo = present[i + 1];
  const hiMin = by[hi][0], loMax = by[lo][by[lo].length - 1];
  total++;
  const lowest = loMax + 1, highest = hiMin;
  if (lowest === highest) {
    pinned++; derived[hi] = lowest;
    console.log(`    ${hi.padEnd(8)} = ${lowest}   PINNED (${lo} ${loMax} and ${hi} ${hiMin} are adjacent)`);
  } else {
    console.log(`    ${hi.padEnd(8)} in [${lowest}..${highest}]   ${highest - lowest + 1} candidates — NOT pinned`);
  }
}

console.log(`\n  ${pinned}/${total} boundaries pinned by the data.`);
if (pinned === total) {
  console.log('\n  Every boundary is pinned. Safe to paste into tokens.json:\n');
  console.log('  "threshold": { ' + ORDER.slice(0, 3)
    .map(b => `"${b}": ${derived[b]}`).join(', ') + ' }');
} else {
  console.log('\n  DO NOT paste a guess. Read the boundary out of the scorer, or feed');
  console.log('  this tool a denser sample until the runs are adjacent. The confirmed');
  console.log('  table lives in tokens/tokens.json and generates to all three');
  console.log('  platforms; a guess there becomes a guess in five places.');
  process.exit(2);
}
