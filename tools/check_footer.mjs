#!/usr/bin/env node
/**
 * check_footer.mjs — the footer's links are a COLUMN, one per line.
 *
 * Ken, 2026-09-20: "when you actually go to the privacy page bottom end, then
 * everything's squashed up." It was one rule. `footer.site a{display:inline-flex}`
 * was added 210 lines below `.fgrid a{display:block}` to satisfy the 44px target
 * law, and silently won — so adjacent links shared a line with nothing between
 * them: "CanadaKenya", "PrivacyWhat we count", "Browse today's sweepRemote only".
 *
 * check_gaps stayed green the whole time because it measured the target's
 * HEIGHT, which was never the broken part. This check measures the thing that
 * broke: whether two links can be found on the same baseline.
 *
 *   A  no two footer links in one group share a line
 *   B  every footer link still clears the 44px target   (the rule that caused it)
 *
 *   node tools/check_footer.mjs
 *   node tools/check_footer.mjs --mutate squashed | short-target
 */
import { chromium } from "playwright";
const SITE = process.env.SITE || "http://localhost:8765/site";
const args = process.argv.slice(2);
const MUTATE = args.indexOf("--mutate") < 0 ? null : args[args.indexOf("--mutate") + 1];
const fails = []; let cells = 0;
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };

const READ = () => {
  const out = [];
  document.querySelectorAll(".fgrid > *").forEach(col => {
    const h = col.querySelector("h4"); if (!h) return;
    const rows = {};
    col.querySelectorAll("a").forEach(a => {
      const r = a.getBoundingClientRect();
      const y = Math.round(r.top);
      // offsetHeight, NOT the rect: the footer is below the fold and still on
      // its reveal spring, so a 44px target measures 42 by rect. The rect is
      // right for "do these share a line" and wrong for "is this 44 tall".
      (rows[y] = rows[y] || []).push({ t: a.textContent.trim(), h: a.offsetHeight });
    });
    out.push({ group: h.textContent.trim(), rows: Object.values(rows) });
  });
  return out;
};

const b = await chromium.launch();
for (const route of ["index.html", "privacy.html", "saved.html"]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  if (MUTATE === "squashed")     await page.addStyleTag({ content: ".fgrid a{display:inline-flex !important}" });
  if (MUTATE === "short-target") await page.addStyleTag({ content: ".fgrid a{min-height:0 !important;height:18px !important}" });
  await page.waitForTimeout(400);

  const cols = (await page.evaluate(READ)) || [];
  if (!cols.length) fails.push(`${route}: no footer groups found at all`);
  for (const c of cols) {
    for (const row of c.rows) {
      cells++;
      if (row.length > 1)
        fails.push(`${route} · ${c.group}: ${row.map(x => `"${x.t}"`).join(" + ")} share one line`);
      for (const l of row) {
        cells++;
        if (l.h < 44) fails.push(`${route} · ${c.group}: "${l.t}" is ${l.h}px tall, under the 44px target`);
      }
    }
  }
  await ctx.close();
}
await b.close();
say(`check_footer: ${cells} assertions over 3 routes`);
fails.forEach(f => say("  FAIL  " + f));
say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS");
process.exit(fails.length ? 1 : 0);
