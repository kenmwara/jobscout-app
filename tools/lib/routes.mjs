// The site's six surfaces, opened the way a reader reaches them, for the v3
// checks (check_scale, check_tiers, check_honesty). One place, so the three
// checks cannot disagree about what "browse" or "states" means.
//
//   python -m http.server 8765   (the REPO ROOT)
//
// browse  index.html on the sweep view      saved   saved.html with a seeded shortlist
// apply   apply.html with a seeded posting  sheet   index.html with the phone sheet open
// landing index.html as a first visit       states  the empty shortlist + the rate limit
/* SITE=https://jobscout.page node tools/check_scale.mjs runs the same check on the live host */
export const SITE = process.env.SITE || "http://localhost:8765/site";

const SEED = {
  a: { id: "a", title: "Staff Engineer", company: "Shopify", url: "", fit: 84, saved: "2026-09-20", status: "applied" },
  b: { id: "b", title: "External Wholesaler", company: "Manulife", url: "", fit: 79, saved: "2026-09-20" },
  c: { id: "c", title: "Analytics Engineer", company: "Linear", url: "", fit: 61, saved: "2026-09-20" },
  d: { id: "d", title: "Business Systems Analyst", company: "TD", url: "", fit: 32, saved: "2026-09-20" },
};
const APPLY = {
  posting: { id: "chk", title: "Threat Detection Analyst", company: "Fastly", url: "", location: "Anywhere",
             remote_policy: "remote", sector: "cybersecurity", posted_at: "2026-09-18" },
  profile: "", fit: 72, stretch: false,
  strongest: "The resume shows four years of detection engineering and the same SIEM the posting names.",
  weakest: "The posting asks for incident command experience the resume does not mention; say who ran your last incident.",
};

export const ROUTES = {
  landing: { url: "/index.html", surface: "browse" },
  browse:  { url: "/index.html", surface: "browse", after: async p => { await p.evaluate(() => typeof setView === "function" && setView("browse")); await p.waitForTimeout(500); } },
  apply:   { url: "/apply.html", surface: "detail",
             init: () => sessionStorage.setItem("jobscout.apply", JSON.stringify(APPLY)),
             after: async p => { await p.waitForSelector("#fit svg.rose", { timeout: 10000 }).catch(() => {}); } },
  saved:   { url: "/saved.html", surface: "saved",
             init: seed => localStorage.setItem("jobscout.tracker", JSON.stringify({ v: 2, items: seed })) },
  sheet:   { url: "/index.html", surface: "browse",
             after: async p => { await p.evaluate(() => { if (typeof setView === "function") setView("browse"); window.__hsheet && window.__hsheet.open(); }); await p.waitForTimeout(500); } },
  states:  { url: "/saved.html", surface: "saved" },
};

/** Open a route in a fresh page at phone width, theme applied. */
export async function openRoute(browser, name, theme, { width = 390, height = 844 } = {}) {
  const r = ROUTES[name];
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
  await ctx.addInitScript(([t, seed, hasInit, name]) => {
    localStorage.setItem("jobscout.theme", t);
    if (name === "saved") localStorage.setItem("jobscout.tracker", JSON.stringify({ v: 2, items: seed }));
    if (name === "apply") sessionStorage.setItem("jobscout.apply", JSON.stringify(seed));
  }, [theme, name === "apply" ? APPLY : SEED, !!r.init, name]);
  const page = await ctx.newPage();
  await page.goto(SITE + r.url, { waitUntil: "networkidle" });
  await page.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
  if (r.after) await r.after(page);
  await page.waitForTimeout(300);
  return { page, ctx, surface: r.surface };
}
