#!/usr/bin/env node
/**
 * sanity.mjs — run every check against the SITE, print one verdict.
 * (Chat's suite of 2026-09-21, bound to this repo's tools; every check here
 * reads a computed value off the rendered product, and every one is proven
 * awake by a mutation that must break it.)
 *
 *   python -m http.server 8765        (the REPO ROOT, in another shell)
 *   node tools/sanity.mjs             # every check
 *   node tools/sanity.mjs --mutations # and prove each one is awake
 *   node tools/sanity.mjs --only score,tiers
 *   SITE=https://jobscout.page node tools/sanity.mjs   # the live host
 *
 * Exit 0 all green · 1 a check failed · 2 a check is ASLEEP · 3 not present.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, "..");
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean);
const WITH = args.includes("--mutations");

const CHECKS = [
  { id: "tokens",    file: "tokens/generate.mjs", argv: ["--check"], guards: "the generated CSS/Kotlin/Swift still match tokens.json" },
  { id: "lightdark", file: "tools/check_lightdark.mjs", mutations: ["three-args"], guards: "every light-dark() carries exactly two arguments (static)" },
  { id: "scale",     file: "tools/check_scale.mjs", mutations: ["off-scale-type", "off-grid-space", "band-wash", "second-hero"], guards: "type on the scale, space on the grid, no coloured surface outside the neutral family" },
  { id: "tiers",     file: "tools/check_tiers.mjs", mutations: ["fat-fact", "boxed-date", "pill-fact"], guards: "verdict taller, wider and differently shaped than fact; context bare" },
  { id: "honesty",   file: "tools/check_honesty.mjs", mutations: ["gap-on-browse", "persuasion", "ember-quote", "lede-lack"], guards: "no gap leads a card, no line persuades or claims, ember means one thing" },
  { id: "score",     file: "tools/check_score_device.mjs", mutations: ["bare-score"], guards: "every score is a rose; none is written as prose" },
  { id: "deadends",  file: "tools/check_dead_ends.mjs", mutations: ["dead-end", "system-blame"], guards: "every stated block has a declared unblock beside it" },
  { id: "primary",   file: "tools/check_one_primary.mjs", mutations: ["three-primaries", "repeat-action"], guards: "one filled primary per region; no action offered twice around itself" },
  { id: "rose",      file: "tools/check_rose.mjs", mutations: ["wrong-band", "cropped-viewbox"], guards: "lit count equals the band, geometry canonical, nothing clipped" },
  { id: "motion",    file: "tools/check_motion.mjs", mutations: ["press-equals-hover", "slow-press", "selected-as-action"], guards: "three material states, exits faster than entries, selected is not primary" },
  { id: "parallax",  file: "tools/check_parallax.mjs", mutations: ["flat", "ignore-motion", "shrink-link", "bury-actions"], guards: "tilt tracks, reduced motion is flat, the stretched link covers the card" },
  { id: "ground",    file: "tools/check_halo_ext.mjs", mutations: ["section-bg", "grey-blob", "kill-halo"], guards: "one ground, warm on light, the halo reaches every route" },
  { id: "contrast",  file: "tools/check_contrast.mjs", mutations: ["hero-ink"], guards: "every text/background pair clears AA, gradients sampled" },
  { id: "gaps",      file: "tools/check_gaps.mjs", mutations: ["split-title", "repeat-org", "double-code", "push-below", "tiny-target", "no-focus", "keep-resume"], guards: "headings are prefixes, nothing said twice, one code on the chip, the list above the fold, 44px targets with visible focus" },
  { id: "field",     file: "tools/check_field_chrome.mjs", mutations: ["resize-grip", "ring-inside", "no-ring-outside", "long-placeholder"], guards: "no control shows its UA defaults; every résumé input is the one field, both doors" },
  { id: "bar",       file: "tools/check_bar_bleed.mjs", mutations: ["inset-bar"], guards: "a bar that paints reaches both edges of its container" },
  { id: "theme",     file: "tools/check_theme.mjs", guards: "the three-state theme truth table" },
  { id: "palette",   file: "tools/check_palette.py", py: true, guards: "the colour law, and the three clients held to tokens.json" },
  /* 2026-09-22. Three that were written the day a green suite sat beside four
     real defects, because each one measured what it was written for and was
     blind to what broke. They are in the suite so that cannot happen twice. */
  { id: "footer",    file: "tools/check_footer.mjs", mutations: ["squashed", "short-target"], guards: "no two footer links share a line, and every one is still a 44px target" },
  { id: "rosescale", file: "tools/check_rose_scale.mjs", mutations: ["fixed-numeral", "duplicate-width"], guards: "the fit numeral scales with its ring, and .rose has ONE width declaration" },
  { id: "fieldphone",file: "tools/check_field_phone.mjs", mutations: ["oval", "crushed", "clip-adrift", "empty-grew"], guards: "a hero field with content is a well, not a stretched oval; the empty bar is untouched" },
];
const run = (file, argv, py) => new Promise(res => {
  const c = spawn(py ? "python" : process.execPath, [join(ROOT, file), ...argv], { cwd: ROOT, env: process.env });
  let out = ""; c.stdout.on("data", d => out += d); c.stderr.on("data", d => out += d);
  c.on("close", code => res({ code, out })); c.on("error", () => res({ code: -1, out: "could not spawn" }));
});
const pad = (s, n) => String(s).padEnd(n);
let failed = 0, asleep = 0, missing = 0, ok = 0; const detail = [];
console.log(`\nJobScout sanity  ·  ${process.env.SITE || "http://localhost:8765/site"}\n${"─".repeat(72)}`);
for (const c of CHECKS) {
  if (ONLY.length && !ONLY.includes(c.id)) continue;
  if (!existsSync(join(ROOT, c.file))) { console.log(`  ${pad(c.id, 10)} ${pad("NOT PRESENT", 12)} ${c.file}`); missing++; continue; }
  const r = await run(c.file, c.argv || [], c.py);
  if (r.code === 0) { console.log(`  ${pad(c.id, 10)} ${pad("pass", 12)} ${c.guards}`); ok++; }
  else { console.log(`  ${pad(c.id, 10)} ${pad("FAIL", 12)} ${c.guards}`); failed++; detail.push([c.id, r.out]); }
  if (WITH && r.code === 0 && c.mutations) for (const m of c.mutations) {
    const mr = await run(c.file, [...(c.argv || []), "--mutate", m], c.py);
    if (mr.code !== 0) { console.log(`  ${pad("", 10)} ${pad("ASLEEP", 12)} mutation "${m}" did not break it`); asleep++; detail.push([`${c.id}/${m}`, mr.out]); }
  }
}
console.log("─".repeat(72));
console.log(`  ${ok} passing · ${failed} failing · ${asleep} asleep · ${missing} not present\n`);
for (const [id, out] of detail) { console.log(`── ${id} ${"─".repeat(Math.max(0, 68 - id.length))}`); console.log(out.split("\n").filter(l => l.trim()).slice(-14).join("\n")); console.log(""); }
process.exit(failed ? 1 : asleep ? 2 : missing ? 3 : 0);
