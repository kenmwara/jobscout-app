#!/usr/bin/env node
/**
 * check_honesty.mjs — design system v3, stage 4. Law 12, enforced.
 *
 *   PLACEMENT  a browse card carries STRONGEST only; a saved row no prose;
 *              the apply page (detail + prepare in one) both.
 *   CONTENT    no line persuades, none claims something about the reader the
 *              scorer cannot know, and screen copy never leads with a lack.
 *   EMBER      the ember rule marks the reader's next move and nothing else.
 *
 * site/evidence.js is the rule; this reads the rendered surfaces through it.
 *
 *   node tools/check_honesty.mjs
 *   node tools/check_honesty.mjs --mutate gap-on-browse | persuasion | ember-quote | lede-lack
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { ROUTES, openRoute } from "./lib/routes.mjs";
const { validate, validateLede, allowedOn } = createRequire(import.meta.url)("../site/evidence.js");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const fails = []; let n = 0;

const b = await chromium.launch();
for (const route of ["browse", "apply", "saved", "states"]) {
  const { page, ctx, surface } = await openRoute(b, route, "light");
  if (MUTATE === "gap-on-browse" && route === "browse")
    await page.evaluate(() => { const c = document.querySelector(".job"); if (!c) return; const d = document.createElement("div"); d.className = "ev ev--answer";
      d.innerHTML = '<p class="ev__k">↓ What to answer</p><p class="ev__b">The posting asks for scale you have not shown.</p>'; c.appendChild(d); });
  if (MUTATE === "persuasion")
    await page.evaluate(() => { const e = document.querySelector(".ev--strongest .ev__b, .ev--answer .ev__b"); if (e) e.textContent = "Your experience makes you a perfect match for this role — a no-brainer."; });
  if (MUTATE === "lede-lack")
    await page.evaluate(() => { const e = document.querySelector(".prep__lede, .feed__count"); if (e) e.textContent = "At 28, the resume is the gap — not the letter."; });
  /* the site carries no quoted block today, so the mutation plants one (an
     attributed quotation, the pack's markup) and then re-tags it as the
     reader's move - the ember rule meaning two opposite things */
  if (MUTATE === "ember-quote")
    await page.evaluate(() => {
      if (!document.querySelector(".ev--quoted")) { const c = document.querySelector(".job, .step, main"); if (c) { const d = document.createElement("div"); d.className = "ev ev--quoted";
        d.innerHTML = '<p class="ev__k">They are asking for</p><p class="ev__b">"Five years of production Kubernetes and an on-call rotation." - the posting</p>'; c.appendChild(d); } }
      document.querySelectorAll(".ev--quoted").forEach(e => { e.classList.remove("ev--quoted"); e.classList.add("ev--answer"); }); });

  const blocks = await page.evaluate(() => [...document.querySelectorAll(".ev")].filter(e => e.getBoundingClientRect().height || e.closest("[hidden]") === null).map(e => ({
    kind: e.classList.contains("ev--strongest") ? "strongest" : e.classList.contains("ev--answer") ? "answer" : e.classList.contains("ev--quoted") ? "quoted" : "unknown",
    text: (e.querySelector(".ev__b")?.textContent || "").trim() })));
  for (const blk of blocks) {
    n++;
    const w = `${route} [${blk.kind}]`;
    if (blk.kind === "unknown") { fails.push(`${w}: an evidence block with no kind — it cannot be checked`); continue; }
    if (!allowedOn(blk.kind, surface)) fails.push(`${w}: not allowed on "${surface}" — placement law`);
    const v = validate(blk.kind, blk.text);
    if (!v.ok) fails.push(`${w}: ${v.reasons.join("; ")}`);
  }
  const copy = await page.evaluate(() => [
    ...[...document.querySelectorAll(".prep__lede, .feed__count")].map(e => ({ kind: "lede", text: (e.textContent || "").trim() })),
    ...[...document.querySelectorAll(".state__b, .refusal .ev__b")].map(e => ({ kind: "explanation", text: (e.textContent || "").trim() })),
  ].filter(x => x.text));
  for (const { kind, text } of copy) {
    n++;
    const v = validateLede(text, kind);
    if (!v.ok) fails.push(`${route} ${kind}: ${v.reasons.join("; ")} — "${text.slice(0, 60)}…"`);
  }
  await ctx.close();
}
await b.close();
console.log(`check_honesty: ${n} evidence blocks`);
if (!n && !MUTATE) { console.error("  ✗ no evidence blocks or screen copy found — the selectors or the markup moved"); process.exit(1); }
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); }
  console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 20).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ no gap leads a browse card, no line persuades, ember means one thing");
