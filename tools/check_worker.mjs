/* Self-check for the worker's pure text helpers. No wrangler, no network, no key —
 * it reads the source and evaluates the function, so it runs anywhere node does.
 *
 *   node tools/check_worker.mjs
 *
 * plainText exists because every cover letter shipped with a literal "**Cover Letter**"
 * at the top, on all three clients at once, and nobody noticed until one was read on a
 * phone. The prompt now forbids markdown; this is the guarantee behind that request.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "worker/src/index.js"), "utf8");

const lifted = src.match(/function plainText\(t\) \{[\s\S]*?\n\}/);
if (!lifted) {
  console.error("plainText not found in worker/src/index.js — was it renamed?");
  process.exit(1);
}
const plainText = new Function(`${lifted[0]}; return plainText;`)();

const cases = [
  // the actual defect, seen on a Galaxy S24
  ["**Cover Letter**\n\nI am a platform engineer.", "I am a platform engineer."],
  ["# Cover Letter\nI build systems.", "I build systems."],
  ["COVER LETTER:\n\nEight years of Python.", "Eight years of Python."],
  // emphasis anywhere in the body
  ["I have **8 years** of experience.", "I have 8 years of experience."],
  ["My __strongest__ match.", "My strongest match."],
  ["I use *Python* daily.", "I use Python daily."],
  // and the things that must survive untouched
  ["Plain letter, nothing to strip.", "Plain letter, nothing to strip."],
  ["Rates are 5 * 3 and no italics.", "Rates are 5 * 3 and no italics."],
  ["A letter about C**, a language.", "A letter about C**, a language."],
  ["", ""],
];

let failed = 0;
for (const [input, want] of cases) {
  const got = plainText(input);
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${JSON.stringify(input).slice(0, 46).padEnd(48)} -> ${JSON.stringify(got)}`);
}
console.log(failed ? `\n${failed} FAILED` : "\nALL GREEN");
process.exit(failed ? 1 : 0);
