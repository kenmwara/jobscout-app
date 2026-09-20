/* Every visible control label on the web, listed with the code that runs when
 * it is used — so "does the label say what it does" can be answered by reading
 * one screen instead of chasing handlers through three files.
 *
 * Not a pass/fail check: a label being honest is a judgement, and a script that
 * pretended otherwise would be the kind of check that cannot fire. This just
 * puts the claim and the behaviour next to each other.
 *
 *   node tools/labels_audit.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pages = readdirSync(join(root, "site")).filter((f) => f.endsWith(".html"));

for (const page of pages) {
  const html = readFileSync(join(root, "site", page), "utf8");
  const seen = new Map();

  // Button and anchor text, whether authored in markup or in a template literal.
  for (const m of html.matchAll(/<(button|a)\b[^>]*>([\s\S]{0,120}?)<\/\1>/g)) {
    const raw = m[2].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 60) continue;
    // A label built entirely out of interpolation tells the reader nothing here.
    const label = raw.replace(/\$\{[^}]*\}/g, "…");
    if (label === "…" || !/[A-Za-z]/.test(label)) continue;
    const id = (m[0].match(/\bid="([^"]+)"/) || [])[1];
    const cls = (m[0].match(/\bclass="([^"]+)"/) || [])[1];
    const key = label + "|" + (id || cls || "");
    if (!seen.has(key)) seen.set(key, { label, id, cls, tag: m[1] });
  }
  // Select options, which carry their own claims.
  for (const m of html.matchAll(/<option\b[^>]*>([\s\S]{0,80}?)<\/option>/g)) {
    const label = m[1].replace(/\$\{[^}]*\}/g, "…").replace(/\s+/g, " ").trim();
    if (label && /[A-Za-z]/.test(label) && !seen.has(label + "|option"))
      seen.set(label + "|option", { label, tag: "option" });
  }

  console.log(`\n── ${page} ── ${seen.size} labels`);
  for (const { label, id, cls, tag } of [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))) {
    const where = id ? "#" + id : cls ? "." + cls.split(" ")[0] : tag;
    console.log(`  ${label.padEnd(34)} ${where}`);
  }
}
