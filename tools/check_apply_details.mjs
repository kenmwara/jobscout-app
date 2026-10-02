#!/usr/bin/env node
/**
 * check_apply_details.mjs — your details fill the questions, one tap prepares everything.
 *
 * Ken, 2026-09-30, after a session with Shyro: "You re-create docs, then you have to download
 * them onto your phone ... As for those screening questions, they only auto-fill one or two
 * lines and then you have to fill in everything else ... All this double work makes the
 * application actually harder and more time consuming!"
 *
 * Ken, 2026-10-01, on Shyro x M-KOPA: "Filling in forms on JobScout should amount to something,
 * not just an exercise in futility!" and "one session's details need to carry through the entire
 * session until successful application".
 *
 *   A  nothing is asked up front; what is typed into an employer's question is kept in THIS
 *      browser under the detail it is, survives a reload, and Clear removes it
 *   B  kept answers travel with /api/answers and with nothing else (letter, résumé)
 *   C  "Prepare everything" runs all three steps from one tap
 *   D  the résumé + letter download unlocks once there is something to download
 *   E  an answer lifted from the résumé says so ("from your résumé")
 *   F  no document window is left open by the kit
 *   G  refused calls are never reported as "Prepared"
 *   H  saved answers belong to the résumé's owner: another person's set, saved in the same
 *      browser, is never shown, sent or filled (Ken, 2026-10-02: his test showed Shyro's details)
 *
 * The API is mocked: this measures the page, not the model.
 *   node tools/check_apply_details.mjs
 *   node tools/check_apply_details.mjs --mutate details-everywhere | details-nowhere | no-kit | no-persist | kit-popups | kit-lies | no-remember | shared-details
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
  "/api/answers": { source: "example.org", url: "https://example.org/jobs/1", generic: false, drafted: 0, from_details: 1,
                    questions: [{ label: "Where are you currently located?", required: true, type: "text", options: [], key: "location",
                                  answer: "Nairobi, Kenya", from: "your CV", src: "cv", why: "" },
                                { label: "What is your notice period?", required: true, type: "text", options: [], key: "notice",
                                  answer: "", from: "", src: "", why: "yours to answer" }] },
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
  if (MUTATE === "no-remember") await page.route("**/apply.html", async r => {
    const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("const k = qs[i].key,", "const k = null,") });
  });
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

  // A — nothing up front
  check(await page.locator("#s-details").isHidden(), "A  nothing is asked up front: no details panel on a first visit");

  // C — one tap
  await page.click("#do-all");
  await page.waitForFunction(() => document.querySelector("#do-all").textContent === "Prepared", null, { timeout: 15000 }).catch(() => {});
  check(!!sent["/api/letter"] && !!sent["/api/resume"] && !!sent["/api/answers"], "C  Prepare everything ran the letter, the résumé and the questions");
  check(!(await page.evaluate(() => document.querySelector("#docModal").open)), "F  no document window is left open over the page");
  check(await page.locator("#dl-files").isEnabled(), "D  résumé + letter download is offered");
  check(/from your résumé/.test(await page.locator("#out-answers").innerText().catch(() => "")), "E  an answer lifted from the résumé says so");

  // A — typed once, into THEIR question, kept under the detail it is
  await page.click('.ans[data-q="1"]', { timeout: 5000 }).catch(() => {});
  await page.keyboard.type("Two weeks");
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("jobscout.details") || "{}").by || {})[0] || {});
  check(stored.notice === "Two weeks", `A  an answer typed into their question is kept in this browser (notice: ${JSON.stringify(stored.notice)})`);
  await page.reload(); await page.waitForSelector("#steps:not([hidden])");
  await mutate();
  check(await page.locator("#s-details").isVisible() && await page.inputValue("#d-notice") === "Two weeks", "A  it survives a reload and is shown as a saved answer");

  // B — and it rides with the next form's questions, and with nothing else
  for (const k of Object.keys(sent)) delete sent[k];
  await page.click("#do-all");
  await page.waitForFunction(() => document.querySelector("#do-all").textContent === "Prepared", null, { timeout: 15000 }).catch(() => {});
  check(sent["/api/answers"]?.details?.notice === "Two weeks", "B  the saved answer went with the questions");
  check(!sent["/api/letter"]?.details && !sent["/api/resume"]?.details, "B  and with nothing else");

  await page.click("#d-clear", { timeout: 5000 }).catch(() => {});   // a window left open blocks it: a finding (F), not a crash
  check(await page.evaluate(() => localStorage.getItem("jobscout.details")) === null && await page.locator("#s-details").isHidden(),
        "A  Clear removes them from the browser and the page");

  // H — another person's saved answers (the pre-2026-10-02 flat shape, same browser) stay theirs
  const p3 = await browser.newPage();
  const sent3 = {};
  await p3.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    try { sent3[path] = JSON.parse(route.request().postData() || "{}"); } catch { sent3[path] = {}; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK[path] || {}) });
  });
  if (MUTATE === "shared-details") await p3.route("**/apply.html", async r => {
    const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("const ownerOf = profile => {", "const ownerOf = profile => { return 'everyone';") });
  });
  await p3.goto(`${SITE}/privacy.html`);
  await p3.evaluate(s => {
    sessionStorage.setItem("jobscout.apply", JSON.stringify(s));
    localStorage.setItem("jobscout.details", JSON.stringify({ name: "Other Person", email: "other@example.org", location: "Mombasa", salary: "90000" }));
  }, SESSION);
  if (MUTATE === "shared-details") await p3.evaluate(() => localStorage.setItem("jobscout.details", JSON.stringify({ by: { everyone: { name: "Other Person", location: "Mombasa" } } })));
  await p3.goto(`${SITE}/apply.html`);
  await p3.waitForSelector("#steps:not([hidden])");
  check(await p3.inputValue("#d-name") === "" && await p3.locator("#s-details").isHidden(), "H  another person's saved answers are not shown for this résumé");
  await p3.click("#do-all");
  await p3.waitForFunction(() => document.querySelector("#do-all").textContent === "Prepared", null, { timeout: 15000 }).catch(() => {});
  check(!sent3["/api/answers"]?.details?.name && !sent3["/api/answers"]?.details?.location, "H  nor sent with this résumé's questions");
  const kept = await p3.evaluate(() => JSON.parse(localStorage.getItem("jobscout.details") || "{}"));
  check(MUTATE === "shared-details" || kept.by?.["other@example.org"]?.location === "Mombasa", "H  and their set is kept for them, under their own email");
  await p3.close();

  // G — refused calls are not "Prepared" (Shyro x M-KOPA, 1 Oct: the hourly cap refused all three
  //     and the button still said Prepared two seconds later)
  const p2 = await browser.newPage();
  await p2.route("**/api/**", r => r.fulfill({ status: 429, contentType: "application/json",
    body: JSON.stringify({ error: "rate_limited", detail: "Demo cap: 24 runs/hour." }) }));
  if (MUTATE === "kit-lies") await p2.route("**/apply.html", async r => {
    const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("if (got === 3){", "if (true){") });
  });
  await p2.goto(`${SITE}/privacy.html`);
  await p2.evaluate(s => sessionStorage.setItem("jobscout.apply", JSON.stringify(s)), SESSION);
  await p2.goto(`${SITE}/apply.html`);
  await p2.waitForSelector("#steps:not([hidden])");
  await p2.click("#do-all");
  await p2.waitForFunction(() => !/Preparing/.test(document.querySelector("#do-all").textContent), null, { timeout: 15000 }).catch(() => {});
  const label = await p2.locator("#do-all").innerText();
  check(label !== "Prepared" && await p2.locator("#do-all").isEnabled(), `G  every call refused: the button says "${label}" and can be pressed again`);
} finally { await browser.close(); }

say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS — nothing asked up front; what she types into a question is kept and carried to the next form; one tap prepares everything");
process.exit(fails.length ? 1 : 0);
