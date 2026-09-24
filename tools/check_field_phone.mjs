#!/usr/bin/env node
/**
 * check_field_phone.mjs — the hero field at PHONE width, once it has content.
 *
 * Ken, 2026-09-20, on the mobile mockup: "the design language is off - both
 * the oval text box, and the clip", and again on 09-22 about the shipped app:
 * "Landing page upload bar is still the same old oval one". At 390px the bar
 * is `1fr auto` and column 2 holds the clip, the go and the nowrap hint, so
 * the résumé got a ten-character column inside a five-row-tall pill with the
 * clip floating up its side. A bar with content takes the well's geometry.
 *
 *   A  the text column keeps most of the field's width          (phone only)
 *   B  the radius is the card, not the pill, once there is content
 *   C  the controls sit on ONE row beneath the text, clip first  (phone only)
 *   D  the EMPTY bar is ALSO a rounded rectangle, and stays one line
 *
 * D USED TO ASSERT THE OPPOSITE, and that is why this shipped twice. The rule
 * read "the empty bar is untouched: one line, still a pill", so every run was
 * green while the landing page loaded an oval. Ken said it on 09-22 - "still
 * the same old oval one" - and again on 09-23: "The web landing page upload
 * box is oval in shape as opposed to being rectangular with rounded corners."
 * He is describing the bar AT REST, which is the one state the check defended.
 * A guard written from my reading of a comment outranked the operator twice.
 *
 * It also only ever ran at phone widths, because that is where the FIRST
 * report happened to land. 1280 is in the list now; he reads the site on a
 * laptop.
 *
 *   node tools/check_field_phone.mjs
 *   node tools/check_field_phone.mjs --mutate oval | crushed | clip-adrift | empty-oval
 */
import { chromium } from "playwright";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
// http, not file://, and NOT an absolute path from the machine it was written
// on. The first CI run of this check died on
// `file:///C:/Workspaces/...` — it had only ever been green because it was
// only ever run here. Same origin as every other check in the suite.
const SITE = process.env.SITE || "http://localhost:8765/site";
const RESUME = "Ken Kariuki\nCybersecurity - Vulnerability Management, Threat Hunting, OT/ICS Security\n" +
  "Vancouver BC Canada | kenmwara@gmail.com\n\nEXPERIENCE\nT BOT Platform - founder. Built and operated five " +
  "autonomous trading surfaces on Cloudflare Workers, D1 and DigitalOcean with 14-layer risk guards.\n";
const fails = []; let cells = 0;
const note = (t, m) => fails.push(`${t}: ${m}`);
const b = await chromium.launch();

for (const { width, phone } of [{ width: 360, phone: true }, { width: 390, phone: true },
                                 { width: 430, phone: true }, { width: 1280, phone: false }]) {
  const ctx = await b.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: phone });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/index.html`);
  await page.waitForTimeout(2200);
  // The mutations reinstate, one at a time, the exact geometry that was shipped.
  if (MUTATE === "oval")        await page.addStyleTag({ content: '.field--bar[data-state="typing"]{border-radius:1600px !important}' });
  if (MUTATE === "crushed")     await page.addStyleTag({ content: '.field--bar[data-state="typing"]{grid-template-columns:1fr auto !important}.field--bar[data-state="typing"] .field__foot{grid-column:2 !important;grid-row:1 !important}' });
  if (MUTATE === "clip-adrift") await page.addStyleTag({ content: '.field--bar[data-state="typing"] .field__attach{order:0 !important}' });
  // The shape that was shipped, reinstated: a pill on the bar at rest.
  if (MUTATE === "empty-oval")  await page.addStyleTag({ content: '.field--bar{border-radius:1600px !important}' });

  const at = async sel => await page.locator(sel).first().boundingBox();
  const rad = async sel => await page.locator(sel).first().evaluate(e => getComputedStyle(e).borderRadius);
  const t = `${width}px`;

  await page.fill("#ownText", RESUME);
  await page.waitForTimeout(800);
  const box = await at(".box"), area = await at("#ownText");
  // B. a block of text is a card, not an oval. Every width.
  const r = await rad(".box");
  cells += 1;
  if (parseFloat(r) > 40) note(t, `a field with content still draws a ${r} pill`);

  // A and C are about the two-row restack, which is a PHONE remedy: a laptop
  // has room for `1fr auto` and the columns there are right. Asserting them at
  // 1280 would demand the phone layout on a desktop.
  if (phone) {
    const clip = await at(".field__attach"), go = await at(".field__go");
    cells += 4;
    // A. the résumé gets the field, not a gutter beside the controls.
    if (area.width < box.width - 60) note(t, `the text column is ${Math.round(area.width)}px inside a ${Math.round(box.width)}px field — crushed beside the controls`);
    // C. one controls row, clip at its head, go at its tail.
    if (Math.abs(clip.y - go.y) > 6) note(t, `the clip (y ${Math.round(clip.y)}) and the go (y ${Math.round(go.y)}) are on different rows`);
    // Not "clip before go" — the hint sits between them in the DOM, so that
    // stayed true with the clip adrift in mid-row. The clip LEADS: it is flush
    // with the text column's own left edge.
    if (clip.x > area.x + 4) note(t, `the clip starts at ${Math.round(clip.x)} against a text edge of ${Math.round(area.x)} — it is adrift in the row, not leading it`);
    if (clip.y < area.y + area.height - 8) note(t, "the clip is floating beside the text rather than beneath it");
  }

  // D. THE BAR AT REST. This is the state the landing page loads in, and the
  // one the operator has now described twice. Rounded rectangle, one line.
  await page.fill("#ownText", "");
  await page.waitForTimeout(600);
  const empty = await at(".box"), er = await rad(".box");
  cells += 2;
  if (parseFloat(er) > 40) note(t, `the bar at rest draws a ${er} pill — that is the oval on the landing page`);
  if (empty.height > 80) note(t, `the EMPTY bar is ${Math.round(empty.height)}px tall — it must stay one line`);
  await ctx.close();
}
await b.close();

// Guard the report itself: a console that cannot print an em dash must not
// exit 1 with nothing said, which reads exactly like a finding.
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };
say(`check_field_phone: ${cells} assertions over 3 phone widths and a laptop`);
fails.forEach(f => say("  FAIL  " + f));
if (MUTATE) {   // sanity.mjs --mutations reads exit 0 as caught, anything else as ASLEEP
  say(fails.length ? `VERDICT: the "${MUTATE}" mutation was caught (${fails.length} failure(s)) - awake`
                   : `VERDICT: ASLEEP - the "${MUTATE}" mutation did not fail this check`);
  process.exit(fails.length ? 0 : 1);
}
say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS");
process.exit(fails.length ? 1 : 0);
