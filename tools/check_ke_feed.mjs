#!/usr/bin/env node
/**
 * check_ke_feed.mjs — the LIVE Kenya feed is not thin, and carries no tenders.
 *
 * Ken, 2026-09-30, after a session with Shyro: "The Kenyan market seems quite thin".
 * It was capped, not thin: 1,099 eligible, 376 published, 24 a sector. The caps were
 * raised for Kenya (jobscout/tools/publish_feed.py MARKET_CAPS) and procurement
 * notices are rejected (check_ke_gate.py there). This reads what visitors get.
 *
 *   node tools/check_ke_feed.mjs
 *   node tools/check_ke_feed.mjs --mutate thin      (the feed as it was: 24 a sector)
 */
const API = process.env.API || "https://jobscout-app-api.kenmwara.workers.dev";
const MUTATE = process.argv.includes("--mutate") ? process.argv[process.argv.indexOf("--mutate") + 1] : null;
const say = s => { try { process.stdout.write(s + "\n"); } catch { process.stdout.write(s.replace(/[^\x00-\x7F]/g, "-") + "\n"); } };
const r = await fetch(`${API}/api/feed?market=ke`, { headers: { "user-agent": "Mozilla/5.0" } });
const feed = await r.json();
let pass = (feed.postings || []).filter(p => (p.gate || {}).verdict !== "reject");
if (MUTATE === "thin") {                      // the old curate(): 24 a sector
  const n = {}; pass = pass.filter(p => (n[p.sector] = (n[p.sector] || 0) + 1) <= 24);
}
const by = {}; for (const p of pass) by[p.sector] = (by[p.sector] || 0) + 1;
const TENDER = /call for (expressions? of interest|proposals?)|request for (offer|proposal|quotation)|\brf[opq]\s*[-:#(]|tender (notice|for)|expressions? of interest|supplier pre-?qualification/i;
const tenders = pass.filter(p => TENDER.test(p.title || "") && !/\bindividual\b|\bconsultant\b/i.test(p.title || ""));   // a consultancy one person applies for is a job
const ageH = (Date.now() - Date.parse(feed.generated_utc || 0)) / 36e5;
const fails = [];
const check = (ok, what) => { say(`  ${ok ? "ok  " : "FAIL"}  ${what}`); if (!ok) fails.push(what); };
check(pass.length >= 500, `${pass.length} jobs a Kenyan visitor can apply to (was 376 when Ken called it thin)`);
check(Math.max(...Object.values(by)) > 24, `a sector can hold more than the old 24 (largest: ${Math.max(...Object.values(by))})`);
check((by.operations_support || 0) > 24, `operations_support: ${by.operations_support || 0} (the sector Shyro searched showed 24)`);
check(!tenders.length, `no supplier tenders passed as jobs${tenders.length ? ": " + tenders.slice(0, 2).map(p => p.title).join(" | ") : ""}`);
check(ageH < 50, `published ${ageH.toFixed(1)} h ago (the droplet republishes daily at 15:22 UTC)`);
say(fails.length ? `VERDICT: FAIL (${fails.length})` : `VERDICT: PASS — ${pass.length} Kenya jobs live, no sector capped at 24, no tenders`);
process.exitCode = fails.length ? 1 : 0;
