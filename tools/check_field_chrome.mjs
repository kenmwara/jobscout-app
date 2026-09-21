#!/usr/bin/env node
/**
 * check_field_chrome.mjs — no control in JobScout ever shows its UA defaults.
 * (field-and-bar pack, bound to the site's surfaces and the mockup's screens)
 *
 *   A  every <textarea> computes resize: none                 (the grip)
 *   B  no control inside .field draws its own outline on focus (the ring)
 *   C  a control outside .field DOES draw one                  (the guard on B)
 *   D  an empty control is not scrolled by its own placeholder (the clipping)
 *   E  every résumé control lives inside a .field              (no ad-hoc inputs)
 *   F  every .field offers both doors: a paste area and a file input
 *   G  the placeholder fits across too
 *
 *   node tools/check_field_chrome.mjs
 *   node tools/check_field_chrome.mjs --mutate resize-grip | ring-inside | no-ring-outside | long-placeholder
 */
import { chromium } from "playwright";
import { openRoute, openMockup } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const fails = []; let cells = 0;
const note = (t, msg) => fails.push(`${t}: ${msg}`);
const b = await chromium.launch();
const TARGETS = [["landing", "site"], ["apply", "site"], ["browse", "site"], ["home", "mockup"], ["matches", "mockup"], ["draft", "mockup"]];
for (const [route, kind] of TARGETS) for (const theme of ["light", "dark"]) {
  const { page, ctx } = kind === "site" ? await openRoute(b, route, theme) : await openMockup(b, route, theme);
  if (MUTATE === "resize-grip") await page.addStyleTag({ content: "textarea{resize:vertical !important}" });
  if (MUTATE === "ring-inside") await page.addStyleTag({ content: ".field textarea:focus-visible,.field textarea:focus{outline:2px solid red !important}" });
  if (MUTATE === "no-ring-outside") await page.addStyleTag({ content: "input:focus-visible,input:focus,button:focus-visible,button:focus{outline:none !important;box-shadow:none !important}" });
  if (MUTATE === "long-placeholder") await page.evaluate(() => document.querySelectorAll(".field--bar .field__area").forEach(t => t.placeholder = "Paste your résumé here, or drop a PDF, Word or text file anywhere on this bar to attach it"));
  const r = await page.evaluate(() => {
    const out = { textareas: [], focus: [], clipped: [], orphans: [], fields: [] };
    const vis = el => { const r = el.getBoundingClientRect(); return (r.width > 0 || r.height > 0) && !el.closest("[hidden]"); };
    const scope = document.querySelector(".screen") || document.body;
    for (const ta of scope.querySelectorAll("textarea")) if (vis(ta)) out.textareas.push({ id: ta.id || ta.name || ta.className, resize: getComputedStyle(ta).resize });
    for (const el of scope.querySelectorAll("input:not([type=file]), textarea, select, button")) {
      if (el.disabled || !vis(el)) continue;
      try { el.focus({ focusVisible: true, preventScroll: true }); } catch { el.focus({ preventScroll: true }); }
      if (document.activeElement !== el) continue;
      const cs = getComputedStyle(el), w = parseFloat(cs.outlineWidth) || 0;
      out.focus.push({ id: el.id || (typeof el.className === "string" && el.className) || el.tagName, inField: !!el.closest(".field"), drawn: (cs.outlineStyle !== "none" && w > 0) || (cs.boxShadow !== "none" && el.matches(":focus-visible") && !el.closest(".field") && /\d/.test(cs.boxShadow)) });
      el.blur();
    }
    for (const el of scope.querySelectorAll("textarea, input[type=text]")) {
      if (el.value || !vis(el)) continue;
      const overY = el.scrollHeight - el.clientHeight, overX = el.scrollWidth - el.clientWidth;
      if (overY > 1) out.clipped.push({ axis: "vertical", id: el.id || el.className, over: overY });
      if (overX > 1) out.clipped.push({ axis: "horizontal", id: el.id || el.className, over: overX });
    }
    for (const el of scope.querySelectorAll("textarea, input[type=file]")) { if (!vis(el) && el.type !== "file") continue; if (el.closest("#browseQ, .searchrow")) continue; if (!el.closest(".field")) out.orphans.push(el.id || el.className || el.tagName); }
    for (const f of scope.querySelectorAll(".field")) if (vis(f)) out.fields.push({ id: f.id || f.className, area: !!f.querySelector(".field__area"), file: !!f.querySelector("input[type=file]") });
    return out;
  });
  cells++;
  const tag = `${route}/${theme}`;
  for (const ta of r.textareas) if (ta.resize !== "none") note("A resize grip", `${tag}: <textarea ${ta.id}> computes resize:${ta.resize}`);
  for (const f of r.focus) { if (f.inField && f.drawn) note("B focus ring", `${tag}: ${f.id} is inside .field but draws its own outline`); if (!f.inField && !f.drawn) note("C no focus at all", `${tag}: ${f.id} is outside .field and draws no outline on focus`); }
  for (const c of r.clipped) note(c.axis === "vertical" ? "D clipped placeholder" : "G clipped placeholder (across)", `${tag}: ${c.id} overflows ${c.axis}ly by ${c.over}px when empty`);
  for (const o of r.orphans) note("E ad-hoc control", `${tag}: ${o} is a résumé control outside any .field`);
  for (const f of r.fields) { if (!f.area) note("F missing paste", `${tag}: .field ${f.id} has no .field__area`); if (!f.file) note("F missing upload", `${tag}: .field ${f.id} has no file input`); }
  if (["landing", "apply", "home", "draft"].includes(route) && !r.fields.length && route !== "draft") note("F no field", `${tag}: this screen asks for a résumé and has no .field`);
  await ctx.close();
}
await b.close();
console.log(`check_field_chrome: ${cells} cells`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 24).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ no control shows its UA defaults; every résumé input is the field, with both doors");
