#!/usr/bin/env node
/**
 * check_gaps.mjs — the five things GAPS.md (2026-09-21) said nobody was
 * watching, as one file with one sub-check each, every one mutation-tested.
 * (site-bound via tools/lib/routes.mjs; --only picks sub-checks)
 *
 *   heading   a rendered heading is a PREFIX of its source title, never a
 *             suffix or an interior slice ("Management")
 *             mutation: split-title
 *   twice     the same fact is not stated twice on one screen where one
 *             region contains the other (the detail screen's org line,
 *             title and primary action each appeared twice)
 *             mutation: repeat-org
 *   pill      the market chip shows the country name or code, the code at
 *             most ONCE ("CA CA")           mutation: double-code
 *   fold      on a route whose heading names a collection, the first member
 *             begins above 60% of a 390×844 viewport
 *             mutation: push-below
 *   targets   every interactive element is a 44×44 target at 390pt and has a
 *             focus-visible style that differs from rest
 *             mutation: tiny-target | no-focus
 *
 *   node tools/check_gaps.mjs [--only heading,pill] [--mutate <name>]
 */
import { chromium } from "playwright";
import { openRoute, ROUTES } from "./lib/routes.mjs";
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const MUTATE = opt("--mutate", null);
const ONLY = (opt("--only", "") || "").split(",").filter(Boolean);
const want = id => !ONLY.length || ONLY.includes(id);
const fails = []; let n = 0;
const b = await chromium.launch();

/* ---- heading: prefix of the source ---- */
if (want("heading")) {
  for (const route of ["apply", "browse"]) {
    const { page, ctx } = await openRoute(b, route, "light");
    if (MUTATE === "split-title") await page.evaluate(() => { document.querySelectorAll("#role, .job h3.role").forEach(h => { const t = h.textContent.trim(); h.textContent = t.split("-").pop().trim(); }); });
    const r = await page.evaluate(() => {
      const out = [];
      const norm = s => s.replace(/\s+/g, " ").trim();
      const check = (rendered, source, where) => {
        const rd = norm(rendered).replace(/[……]$/, ""), sc = norm(source);
        if (!sc) return;
        if (!sc.startsWith(rd) || !rd) out.push(`${where}: "${rd.slice(0, 40)}" is not a prefix of "${sc.slice(0, 40)}"`);
      };
      const h1 = document.querySelector("#role");
      if (h1) { const s = JSON.parse(sessionStorage.getItem("jobscout.apply") || "{}"); check(h1.textContent, s.posting?.title || "", "apply h1"); }
      document.querySelectorAll(".job[data-title]").forEach((c, i) => { if (i < 40) { const h = c.querySelector("h3.role"); if (h) check(h.textContent, c.dataset.title, `card ${i}`); } });
      return out;
    });
    n++; r.slice(0, 6).forEach(x => fails.push(`heading/${route}: ${x}`));
    await ctx.close();
  }
}

/* ---- twice: the same text in two elements, one region around the other ---- */
if (want("twice")) {
  for (const route of ["apply", "saved", "browse"]) {
    const { page, ctx } = await openRoute(b, route, "light");
    /* the org line is several text nodes (name, a separator, the place); the
       clone keeps that shape so the duplicate is the same fact, node for node */
    if (MUTATE === "repeat-org") await page.evaluate(() => { const o = document.querySelector("#co, .job .co, .row .t"); if (o) { const c = o.cloneNode(true); c.removeAttribute("id"); document.body.prepend(c); } });
    const r = await page.evaluate(() => {
      const REGION = ".job, .step, .row, .hsheet, .jcard, .panel";
      const seen = new Map(), out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const s = t.textContent.replace(/\s+/g, " ").trim(); if (s.length <= 8) continue;
        const el = t.parentElement; if (!el || el.closest("script, style, [hidden], nav, .tabbar, select, option, .hsheet, footer")) continue;
        const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
        if (!seen.has(s)) seen.set(s, []); seen.get(s).push(el);
      }
      const regionOf = el => el.closest(REGION) || document.body;
      for (const [s, els] of seen) {
        if (els.length < 2) continue;
        for (let i = 0; i < els.length && out.length < 8; i++) for (let j = i + 1; j < els.length; j++) {
          const a = els[i], c = els[j]; if (a.contains(c) || c.contains(a)) continue;
          const ra = regionOf(a), rc = regionOf(c);
          if (ra !== rc && (ra.contains(rc) || rc.contains(ra))) { out.push(`"${s.slice(0, 44)}" stated twice, one region around the other`); break; }
        }
      }
      return out;
    });
    n++; r.forEach(x => fails.push(`twice/${route}: ${x}`));
    await ctx.close();
  }
}

/* ---- pill: the market chip ---- */
if (want("pill")) {
  for (const route of ["browse", "saved"]) {
    const { page, ctx } = await openRoute(b, route, "light");
    if (MUTATE === "double-code") await page.evaluate(() => { const c = document.querySelector(".hchip span"); if (c) c.insertAdjacentHTML("afterend", `<span>${c.textContent}</span>`); });
    const r = await page.evaluate(() => {
      const chip = document.querySelector(".hchip"); if (!chip) return "no .hchip rendered";
      const t = chip.textContent.replace(/\s+/g, " ").trim();
      const html = document.documentElement;
      const name = { ca: "Canada", ke: "Kenya" }[html.dataset.market || "ca"] || "";
      if (/\b([A-Z]{2})\b.*\b\1\b/.test(t)) return `the code appears twice: "${t}"`;
      if (!(/\b[A-Z]{2}\b/.test(t) || (name && t.includes(name)))) return `neither the country name nor the code: "${t}"`;
      return null;
    });
    n++; if (r) fails.push(`pill/${route}: ${r}`);
    await ctx.close();
  }
}

/* ---- fold: the first member of a collection above 60% of the viewport ---- */
if (want("fold")) {
  for (const [route, sel] of [["browse", "#browseJobs .job"], ["saved", ".rows .row"]]) {
    const { page, ctx } = await openRoute(b, route, "light");
    if (MUTATE === "push-below") await page.evaluate(sel => { const first = document.querySelector(sel); if (first) { const sp = document.createElement("div"); sp.style.height = "700px"; first.parentElement.insertBefore(sp, first); } }, sel);
    const r = await page.evaluate(sel => { const el = document.querySelector(sel); if (!el) return { top: null }; return { top: Math.round(el.getBoundingClientRect().top + scrollY), h: innerHeight }; }, sel);
    n++;
    if (r.top === null) fails.push(`fold/${route}: no collection member rendered (${sel})`);
    else if (r.top > r.h * 0.6) fails.push(`fold/${route}: the first member begins ${r.top}px down — below 60% of ${r.h}px`);
    await ctx.close();
  }
}

/* ---- targets: 44×44 and a visible focus ---- */
if (want("targets")) {
  for (const route of ["browse", "apply", "saved", "sheet"]) {
    const { page, ctx } = await openRoute(b, route, "light");
    if (MUTATE === "tiny-target") await page.addStyleTag({ content: ".act button, .row button, .btn, .btn2, .applybtn{min-height:0 !important;height:20px !important;padding:0 !important}" });
    if (MUTATE === "no-focus") await page.addStyleTag({ content: "*:focus-visible{outline:none !important;box-shadow:none !important}" });
    /* cards below the fold are legitimately pending (parallax arrival, at
       translateZ(-60px)); land them all and measure boxes at rest */
    await page.evaluate(() => document.querySelectorAll("[data-arrive]").forEach(c => c.setAttribute("data-arrive", "in")));
    await page.waitForTimeout(1600);
    const r = await page.evaluate(() => {
      const out = { small: [], focus: [] };
      /* an inline link inside running text is exempt (WCAG 2.5.8's inline
         exception); a visually-hidden 1px file input is not a target */
      const inline = el => el.tagName === "A" && getComputedStyle(el).display === "inline" && !!el.closest("p, li, h1, h2, h3, .t, .m, .co, .lede, .fnote, .sub, footer, .grounded, small");
      const els = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role='button']")].filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && +s.opacity > 0 && !el.closest("[hidden]") && !inline(el); }).slice(0, 80);
      const name = el => ((typeof el.className === "string" && el.className) || el.tagName).toString().slice(0, 40);
      for (const el of els) {
        /* LAYOUT size, not the rect: a card still on its reveal spring below
           the fold is scaled .96 for a moment, and that is not the target */
        const w = el.offsetWidth || el.getBoundingClientRect().width, h = el.offsetHeight || el.getBoundingClientRect().height;
        if (w < 44 - 0.5 || h < 44 - 0.5) out.small.push(`${name(el)} ${Math.round(w)}×${Math.round(h)}`);
        const rest = getComputedStyle(el); const restKey = rest.outlineStyle + rest.outlineWidth + rest.boxShadow;
        try { el.focus({ focusVisible: true, preventScroll: true }); } catch { el.focus({ preventScroll: true }); }
        const f = getComputedStyle(el); const fKey = f.outlineStyle + f.outlineWidth + f.boxShadow;
        if (document.activeElement === el && fKey === restKey) out.focus.push(name(el));
        el.blur();
      }
      return { small: [...new Set(out.small)], focus: [...new Set(out.focus)], n: els.length };
    });
    n++;
    r.small.slice(0, 8).forEach(x => fails.push(`targets/${route}: ${x} is under 44×44`));
    r.focus.slice(0, 8).forEach(x => fails.push(`targets/${route}: ${x} has no visible focus`));
    await ctx.close();
  }
}
await b.close();
console.log(`check_gaps: ${n} cells`);
if (MUTATE) { if (fails.length) { console.log(`  mutation "${MUTATE}" correctly broke ${fails.length} assertion(s) — check is awake`); process.exit(0); } console.error(`  MUTATION "${MUTATE}" DID NOT FAIL. The check is asleep.`); process.exit(2); }
if (fails.length) { console.error(`\n${fails.length} failure(s):`); [...new Set(fails)].slice(0, 40).forEach(f => console.error("  ✗ " + f)); process.exit(1); }
console.log("  ✓ headings are prefixes, nothing is said twice around itself, the chip is one code, the list is above the fold, targets are 44 with a visible focus");
