#!/usr/bin/env node
/**
 * check_apply_details.mjs — your details fill the questions, one tap prepares everything.
 *
 * Ken, 2026-09-30, after a session with Shyro: "You re-create docs, then you have to download
 * them onto your phone ... As for those screening questions, they only auto-fill one or two
 * lines and then you have to fill in everything else ... All this double work makes the
 * application actually harder and more time consuming!"
 *
 *   A  the application page asks for the details once, keeps them in THIS browser, clears them
 *   B  the details travel with /api/answers and with nothing else (letter, résumé)
 *   C  "Prepare everything" runs all three steps from one tap
 *   D  the résumé + letter download unlocks once there is something to download
 *   E  an answer filled from the details says so ("from your details")
 *
 * The API is mocked: this measures the page, not the model.
 *   node tools/check_apply_details.mjs
 *   node tools/check_apply_details.mjs --mutate details-everywhere | details-nowhere | no-kit | no-persist | kit-popups
 */
import { chromium } from "playwright";
const SITE = process.env.SITE || "http://localhost:8765/site";
const args = process.argv.slice(2);
const MUTATE = args.indexOf("--mutate") < 0 ? null : args[args.indexOf("--mutate") + 1];
const fails = [];
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };
const check = (ok, what) => { say(`  ${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) fails.push(what); };

const SESSION = {
  posting: { id: "chk1", title: "Operations Coordinator", company: "Example Org", url: "https://example.org/jobs/1",
             location: "Nairobi, Kenya", remote_policy: "onsite", summary: "Coordinate logistics." },
  fit: 68,
  profile: "Operations professional in Nairobi with six years of procurement and logistics coordination experience.",
};
const sent = {};   // endpoint -> parsed request body
const MOCK = {
  "/api/letter": { letter: "Dear hiring team,\n\nI coordinate logistics.\n\nKind regards" },
  "/api/resume": { name: "Test Person", contact: "", headline: "Operations", gaps: [],
                   sections: [{ heading: "Experience", items: [{ title: "Coordinator", meta: "2019-2025", bullets: ["Ran logistics"] }] }] },
  "/api/answers": { source: "example.org", url: "https://example.org/jobs/1", generic: true, drafted: 0, from_details: 1,
                    questions: [{ label: "Where are you currently located?", required: true, type: "text", options: [],
                                  answer: "Nairobi, Kenya", from: "your details", src: "details", why: "" }] },
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    try { sent[path] = JSON.parse(route.request().postData() || "{}"); } catch { sent[path] = {}; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK[path] || {}) });
  });
  await page.goto(`${SITE}/privacy.html`);
  await page.evaluate(s => { sessionStorage.setItem("jobscout.apply", JSON.stringify(s)); localStorage.removeItem("jobscout.details"); }, SESSION);
  await page.goto(`${SITE}/apply.html`);
  await page.waitForSelector("#steps:not([hidden])");

  /* Mutations are re-applied after every load: the check reloads the page, and a reload drops anything injected. */
  const mutate = async () => {
    if (MUTATE === "details-everywhere" || MUTATE === "details-nowhere" || MUTATE === "no-persist")
      await page.addScriptTag({ content: `
        ${MUTATE === "details-everywhere" ? `
        const _f = window.fetch; window.fetch = (u, o) => { if (o && o.body) { const b = JSON.parse(o.body); b.details = readDetails(); o = { ...o, body: JSON.stringify(b) }; } return _f(u, o); };` : ""}
        ${MUTATE === "details-nowhere" ? `readDetails = () => ({});` : ""}
        ${MUTATE === "no-persist" ? `const _s = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (k === "jobscout.details") return; return _s.call(this, k, v); };` : ""}` });
    if (MUTATE === "no-kit") await page.evaluate(() => { document.querySelector("#do-all").onclick = () => {}; });
    if (MUTATE === "kit-popups") await page.addScriptTag({ content: "setInterval(() => { KIT = false; }, 5);" });   // the kit no longer holds the windows shut
  };
  await mutate();

  // A — asked once, kept here, cleared here
  check(await page.locator(".det input").count() === 11, "A  eleven detail fields on the page");
  await page.fill("#d-location", "Nairobi, Kenya");
  await page.fill("#d-notice", "Two weeks");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jobscout.details") || "{}"));
  check(stored.location === "Nairobi, Kenya" && stored.notice === "Two weeks", "A  typed details are kept in this browser");
  await page.reload(); await page.waitForSelector("#steps:not([hidden])");
  await mutate();
  check(await page.inputValue("#d-location") === "Nairobi, Kenya", "A  they survive a reload");

  // C + B — one tap, and only the answers call carries the details
  await page.click("#do-all");
  await page.waitForFunction(() => document.querySelector("#do-all").textContent === "Prepared", null, { timeout: 15000 }).catch(() => {});
  check(!!sent["/api/letter"] && !!sent["/api/resume"] && !!sent["/api/answers"], "C  Prepare everything ran the letter, the résumé and the questions");
  check(sent["/api/answers"]?.details?.location === "Nairobi, Kenya", "B  the details went with the questions");
  check(!sent["/api/letter"]?.details && !sent["/api/resume"]?.details, "B  and with nothing else");

  // F — one tap, no window left sitting over the page
  check(!(await page.evaluate(() => document.querySelector("#docModal").open)), "F  no document window is left open over the page");

  // D — both documents in one move
  check(await page.locator("#dl-files").isEnabled(), "D  résumé + letter download is offered");

  // E — the answer names its source
  check(/from your details/.test(await page.locator("#out-answers").innerText().catch(() => "")), "E  a detail-filled answer says so");

  await page.click("#d-clear");
  check(await page.evaluate(() => localStorage.getItem("jobscout.details")) === null && await page.inputValue("#d-location") === "",
        "A  Clear removes them from the browser and the page");
} finally { await browser.close(); }

say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS — details asked once, kept on the device, sent only to fill the questions; one tap prepares everything");
process.exit(fails.length ? 1 : 0);
