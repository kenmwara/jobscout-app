#!/usr/bin/env node
/**
 * check_lightdark.mjs — STATIC. light-dark() takes exactly two arguments;
 * a multi-part value (two shadows, a border shorthand) has a top-level comma
 * inside an argument, which makes it a three-argument call and the whole
 * declaration is silently dropped. --shadow-sheet went that way once and
 * four demos followed. No browser needed; run it before a commit.
 *
 *   node tools/check_lightdark.mjs
 *   node tools/check_lightdark.mjs --mutate three-args   # must FAIL
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
const MUTATE = process.argv.includes("--mutate") ? process.argv[process.argv.indexOf("--mutate") + 1] : null;
const files = [...globSync("site/*.css"), ...globSync("site/*.html"), ...globSync("mockups/*.css"), ...globSync("mockups/*.html")];
const fails = []; let seen = 0;
for (const f of files) {
  /* comments and prose mention light-dark() by name; only real calls count */
  let s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
  if (MUTATE === "three-args" && f.endsWith("base.css")) s += "\n:root{--mutant: light-dark(0 1px 2px #000, 0 2px 4px #000, none);}";
  let i = 0;
  while ((i = s.indexOf("light-dark(", i)) >= 0) {
    let j = i + "light-dark(".length, depth = 1, commas = 0;
    for (; j < s.length && depth; j++) { const c = s[j]; if (c === "(") depth++; else if (c === ")") depth--; else if (c === "," && depth === 1) commas++; }
    seen++;
    if (commas !== 1) fails.push(`${f}:${s.slice(0, i).split("\n").length}: light-dark( with ${commas + 1} top-level arguments — the declaration is silently dropped: ${s.slice(i, j).slice(0, 70)}`);
    i = j;
  }
}
console.log(`check_lightdark: ${seen} light-dark() calls in ${files.length} files`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); fails.forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ every light-dark() carries exactly two arguments");
