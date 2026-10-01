#!/usr/bin/env node
/**
 * check_bookmark.mjs — the "Fill with JobScout" bookmark fills the employer's own form on a
 * computer, from the JobScout tab that opened it, and from nowhere else.
 *
 * Ken, 2026-10-01: "Yes, build the bookmark button too", after "Her details need to transfer to
 * the MKOPA application automatically" and "It should even upload the same resume she was asked
 * for directly into MKOPA!!".
 *
 *   A  the bookmark, run on the form JobScout opened, fills its boxes (text, type-ahead, radio,
 *      the mission answer) and attaches the résumé and the letter to their own upload boxes
 *   B  "Autofill from resume" and demographic questions are left alone
 *   C  the kit goes ONLY to the window JobScout opened: a second window it opened gets nothing
 *   D  a form JobScout did not open is told how to get one, and nothing is filled
 *
 * The employer is a stand-in (tools/fixtures/employer-form.html) on another origin, so nothing
 * reaches a real employer's storage. The API is mocked.
 *   node tools/check_bookmark.mjs [--mutate any-window | noopener | no-attach]
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const SITE = process.env.SITE || "http://localhost:8765/site";
const MUTATE = process.argv.includes("--mutate") ? process.argv[process.argv.indexOf("--mutate") + 1] : null;
const FORM = "https://employer.test/jobs/1";
const fixture = readFileSync(new URL("./fixtures/employer-form.html", import.meta.url), "utf8");
const fails = [];
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };
const check = (ok, what) => { say(`  ${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) fails.push(what); };

const SESSION = {
  posting: { id: "bm1", title: "Demand Planning Lead", company: "Example Org", url: FORM, location: "Nairobi, Kenya",
             remote_policy: "onsite", summary: "Plan demand." },
  fit: 64, profile: "Test Candidate\nNairobi | t@example.com | +254 700 000 000\nOperations manager, six years.",
};
const MOCK = {
  "/api/letter": { letter: "Dear hiring team,\n\nI plan operations.\n\nTest Candidate" },
  "/api/resume": { name: "Test Candidate", contact: "t@example.com", headline: "Operations", gaps: [],
                   sections: [{ heading: "Experience", items: [{ title: "Operations Manager", meta: "2019-2025", bullets: ["Ran planning"] }] }] },
  "/api/answers": { source: "ashby", url: FORM, generic: false, drafted: 3, from_details: 3, questions: [
    { label: "Full Name", answer: "Test Candidate", src: "cv", key: "name", options: [], required: true, type: "String" },
    { label: "Email", answer: "t@example.com", src: "cv", key: "email", options: [], required: true, type: "Email" },
    { label: "Phone Number", answer: "+254 700 000 000", src: "cv", key: "phone", options: [], required: true, type: "Phone" },
    { label: "Where are you located?", answer: "Kenya", src: "resume", key: "location", options: ["Kenya", "Uganda"], required: true, type: "ValueSelect" },
    { label: "Do you have the legal right to work in the country you are applying to work in?", answer: "Yes", src: "resume", key: "work_auth", options: ["Yes", "No"], required: true, type: "ValueSelect" },
    { label: "What experience do you have that resonates with our mission?", answer: "Six years running operations.", src: "draft", from: "Operations manager", key: "", options: [], required: true, type: "LongText" },
    { label: "Please confirm your gender?", answer: "", why: "yours alone", key: "", options: ["Female", "Male"], required: true, type: "ValueSelect" },
  ] },
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  await ctx.route("https://employer.test/**", r => r.fulfill({ status: 200, contentType: "text/html", body: fixture }));
  await ctx.route("**/api/**", r => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(MOCK[new URL(r.request().url()).pathname] || {}) }));
  const MUT = { "any-window": ["e.source !== FORMWIN", "false"],
                "noopener": ['FORMWIN = window.open(formUrl(p.url), "_blank");', 'FORMWIN = window.open(formUrl(p.url), "_blank", "noopener");'],
                "no-attach": [",ATTACH=", ",ATTACH=function(){return \"\"},_X="] }[MUTATE];
  if (MUT && MUTATE !== "no-attach") await ctx.route("**/apply.html", async r => { const res = await r.fetch();
    r.fulfill({ response: res, body: (await res.text()).replace(MUT[0], MUT[1]) }); });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/privacy.html`);
  await page.evaluate(s => { sessionStorage.setItem("jobscout.apply", JSON.stringify(s)); localStorage.removeItem("jobscout.details"); }, SESSION);
  await page.goto(`${SITE}/apply.html`);
  await page.waitForSelector("#steps:not([hidden])");
  await page.click("#do-all");
  await page.waitForFunction(() => document.querySelector("#do-all").textContent === "Prepared", null, { timeout: 15000 }).catch(() => {});
  const href = await page.getAttribute("#kitmark", "href");
  check(/^javascript:/.test(href || ""), "the bookmark exists on the page, ready to drag");
  let code = decodeURIComponent((href || "").slice(11));
  if (MUTATE === "no-attach") code = code.replace(MUT[0], MUT[1]);
  const run = async pg => { await pg.evaluate(code); await pg.waitForTimeout(3200); };

  // A + B — on the form JobScout opened
  const [form] = await Promise.all([ctx.waitForEvent("page"), page.click("#do-send")]);
  await form.waitForLoadState();
  await run(form);
  const got = await form.evaluate(() => ({
    n: n.value, e: e.value, t: t.value, loc: loc.dataset.picked || "", rtw: document.querySelector("input[name=rtw]:checked")?.value || "",
    m: m.value, cv: cv.files[0]?.name || "", cl: cl.files[0]?.name || "", auto: auto.files.length, g: !!document.querySelector("input[name=g]:checked"),
    toast: [...document.body.querySelectorAll("div")].map(d => d.textContent).find(t => /^JobScout/.test(t)) || "" }));
  check(got.n === "Test Candidate" && got.e === "t@example.com" && got.t === "+254 700 000 000", "A  name, email and phone filled on their form");
  check(got.loc === "Kenya", `A  the type-ahead location is a real pick ("${got.loc}")`);
  check(got.rtw === "y", "A  the right-to-work radio is ticked Yes");
  check(got.m === "Six years running operations.", "A  the mission answer is in their box");
  check(/^resume-.*\.docx$/.test(got.cv), `A  the résumé is in their Resume box (${got.cv || "empty"})`);
  check(/^cover-letter-.*\.docx$/.test(got.cl), `A  the letter is in their Cover letter box (${got.cl || "empty"})`);
  check(got.auto === 0 && !got.g, "B  'Autofill from resume' and gender are left alone");
  check(/press Submit yourself/.test(got.toast), "A  the form says what was done and that Submit is hers");

  // C — a second window JobScout opened is not the form: it gets nothing
  const [other] = await Promise.all([ctx.waitForEvent("page"), page.evaluate(() => { window.open("https://employer.test/other", "_blank"); })]);
  await other.waitForLoadState(); await run(other);
  check(await other.evaluate(() => n.value === "" && cv.files.length === 0), "C  a window JobScout did not open the form in is handed nothing");

  // E — no rebuilt résumé: the very file she uploaded on the first page goes in
  const p3 = await ctx.newPage();
  await p3.route("**/api/resume", r => r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await p3.goto(`${SITE}/privacy.html`);
  await p3.evaluate(s => { sessionStorage.setItem("jobscout.apply", JSON.stringify(s));
    sessionStorage.setItem("jobscout.applyfile", JSON.stringify({ name: "Test Candidate - CV.pdf", type: "application/pdf", b64: btoa("%PDF-1.4 stand-in") })); }, SESSION);
  await p3.goto(`${SITE}/apply.html`);
  await p3.waitForSelector("#steps:not([hidden])");
  await p3.click("#do-all");
  await p3.waitForFunction(() => !/Preparing/.test(document.querySelector("#do-all").textContent), null, { timeout: 15000 }).catch(() => {});
  const [form3] = await Promise.all([ctx.waitForEvent("page"), p3.click("#do-send")]);
  await form3.waitForLoadState(); await run(form3);
  const cv3 = await form3.evaluate(() => cv.files[0]?.name || "");
  check(cv3 === "Test Candidate - CV.pdf", `E  with no rebuilt résumé, the file she uploaded goes in (${cv3 || "empty"})`);

  // D — a form JobScout did not open at all
  const lone = await ctx.newPage(); await lone.goto(FORM); await run(lone);
  const loneToast = await lone.evaluate(() => [...document.body.querySelectorAll("div")].map(d => d.textContent).find(t => /^JobScout/.test(t)) || "");
  check(/Open-their-form button/.test(loneToast) && await lone.evaluate(() => n.value === ""), "D  a form opened elsewhere is told how, and nothing is filled");
} finally { await browser.close(); }

say(fails.length ? `VERDICT: FAIL (${fails.length})` : "VERDICT: PASS — one click on their form fills it and attaches the résumé and letter, for the form JobScout opened and no other");
process.exitCode = fails.length ? 1 : 0;
