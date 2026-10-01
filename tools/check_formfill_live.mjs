#!/usr/bin/env node
/**
 * check_formfill_live.mjs — the phone's in-app form filler (Kit.kt FILL_JS) on a REAL
 * employer form, run in a phone-sized browser. Never presses Submit.
 *
 * Ken, 2026-10-01: "Let's do a thorough test using Shyro's cv and the MKOPA job that has
 * no paywall - how does JobScout help her application process??"
 *
 *   node tools/check_formfill_live.mjs <form-url> <pairs.json>
 * pairs.json = [[label, value], ...] exactly as Kit.kt fillPairs() builds them.
 * Reports which boxes filled, whether React kept them, and which file box the résumé goes to.
 */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
const [url, pairsFile] = process.argv.slice(2);
const pairs = JSON.parse(readFileSync(pairsFile, "utf8"));
const kt = readFileSync(new URL("../android/app/src/main/java/trade/tbot/jobscout/Kit.kt", import.meta.url), "utf8");
const FILL_JS = kt.slice(kt.indexOf('FILL_JS = """') + 13, kt.indexOf('"""', kt.indexOf('FILL_JS = """') + 13));
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ ...devices["Pixel 7"] });
  await page.addInitScript(() => { window.JobScoutKit = { tapped: s => { window.__tapped = s; } }; });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // the app runs it at load, +1.5 s and +4 s; three passes here too
  let n = 0;
  for (let i = 0; i < 3; i++) { n = Math.max(n, await page.evaluate(`(${FILL_JS})(${JSON.stringify(pairs)})`)); await page.waitForTimeout(800); }
  // React must KEEP the values: type into nothing, blur everything, re-render, then read back
  await page.mouse.click(5, 5); await page.waitForTimeout(500);
  const fields = await page.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]):not([type=file]),textarea")]
    .map(el => {
      let t = ""; if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) t = l.textContent; }
      if (!t) t = el.closest("label")?.textContent || el.getAttribute("aria-label") || el.placeholder || el.name || el.type;
      return { label: t.trim().slice(0, 70), type: el.type, value: (el.type === "radio" || el.type === "checkbox") ? (el.checked ? "checked" : "") : el.value };
    }));
  say(`filled by the script: ${n}`);
  for (const f of fields) say(`  ${f.value ? "FILLED" : "  -   "}  [${f.type}] ${f.label}${f.value && f.type !== "radio" ? "  =  " + f.value.slice(0, 50) : ""}`);
  // the résumé box: what label does the tap report, and would Kit.kt pick the résumé (not the letter)?
  const up = page.getByRole("button", { name: /upload file/i }).last();
  page.on("filechooser", fc => {});           // the app's onShowFileChooser answers this; here it is just swallowed
  await up.click().catch(() => {});
  const tapped = await page.evaluate(() => window.__tapped || "");
  say(`file box tapped reports: "${tapped.slice(0, 60)}" -> Kit.kt attaches the ${/cover/i.test(tapped) ? "LETTER" : "RÉSUMÉ"}`);
} finally { await browser.close(); }
