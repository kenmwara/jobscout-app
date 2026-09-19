/* Every link on every page, fetched for real.
 *
 * The static auditor checks that a link RESOLVES TO A FILE we ship. That is
 * not the same as the link working: an extensionless route has to be mapped by
 * Pages, an external URL has to still exist, and a "#name" has to match an id
 * on the page it lands on. A link to a renamed GitHub release, or to a doc
 * that moved, passes every local check and 404s for the visitor.
 *
 *   node tools/link_sweep.mjs            # live, both markets
 *   node tools/link_sweep.mjs --local    # against a local server on :8902
 *
 * External hosts are fetched once each and cached, so a footer link repeated
 * on five pages costs one request.
 */
const LOCAL = process.argv.includes("--local");
const ORIGINS = LOCAL
  ? ["http://127.0.0.1:8902"]
  : ["https://jobscout.page", "https://nairobi.jobscout.page"];
const PAGES = ["", "browse", "saved", "privacy", "stats", "apply"];

const UA = { "user-agent": "Mozilla/5.0 (link-sweep; jobscout)" };
const seen = new Map();          // url -> status, so an external host is hit once
let fail = 0, checked = 0;
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`); };

async function status(url) {
  if (seen.has(url)) return seen.get(url);
  let s;
  try {
    // HEAD first; a few hosts refuse it, so fall back to a ranged GET.
    let r = await fetch(url, { method: "HEAD", headers: UA, redirect: "follow" });
    if (r.status === 405 || r.status === 403 || r.status === 501)
      r = await fetch(url, { headers: { ...UA, range: "bytes=0-2048" }, redirect: "follow" });
    s = r.status;
  } catch (e) { s = "ERR " + (e.cause?.code || e.message).toString().slice(0, 40); }
  seen.set(url, s);
  return s;
}

const idsOf = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

for (const origin of ORIGINS) {
  console.log(`\n${origin}`);
  const bodies = {};
  for (const p of PAGES) {
    const url = `${origin}/${p}`;
    let html = "";
    try {
      const r = await fetch(url, { headers: UA });
      html = await r.text();
      if (r.status !== 200) { bad(`${url} → ${r.status}`); continue; }
    } catch (e) { bad(`${url} → ${e.message.slice(0, 40)}`); continue; }
    bodies[p] = html;
    console.log(`  ok    /${p || ""} → 200 (${(html.length / 1024).toFixed(0)} KB)`);
  }

  // every href on every page
  for (const [p, html] of Object.entries(bodies)) {
    const hrefs = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]))];
    for (const h of hrefs) {
      if (h.startsWith("mailto:") || h.startsWith("data:")) continue;
      // Cloudflare rewrites every mailto into /cdn-cgi/l/email-protection and
      // restores it in the browser. Fetching that path directly is a 404 by
      // design; on the live page the link reads mailto:ken@tbot.trade.
      if (h.includes("/cdn-cgi/l/email-protection")) continue;
      if (h === "#" || h.startsWith("${")) continue;          // JS-driven or templated
      if (h.startsWith("#")) {                                 // in-page anchor
        const frag = h.slice(1);
        if (frag === "top") continue;
        checked++;
        if (!idsOf(html).has(frag)) bad(`/${p} → "${h}" — no element with that id on the page`);
        continue;
      }
      const abs = h.startsWith("http") ? h : new URL(h.replace(/^\.\//, ""), origin + "/").href;
      if (abs.includes("#")) {
        // a fragment on ANOTHER page of ours: fetch it and check the id is there
        const [base, frag] = abs.split("#");
        checked++;
        const s = await status(base);
        if (!(typeof s === "number" && s >= 200 && s < 400)) { bad(`/${p} → ${abs} → ${s}`); continue; }
        if (base.startsWith(origin)) {
          const target = await (await fetch(base, { headers: UA })).text();
          if (!idsOf(target).has(frag)) bad(`/${p} → ${abs} — ${base} has no id "${frag}"`);
        }
        continue;
      }
      checked++;
      const s = await status(abs);
      // 2xx and 3xx are all "the link works"; ReliefWeb answers 202.
      if (!(typeof s === "number" && s >= 200 && s < 400)) bad(`/${p} → ${abs} → ${s}`);
    }
  }
}

console.log("");
console.log(`${checked} links fetched, ${seen.size} distinct URLs`);
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
