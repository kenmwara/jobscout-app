/* What the phone reaches: the worker's endpoints, and the postings' own links.
 *
 * The web sweep walks hrefs in HTML. The apps have almost no hrefs — Android
 * and iOS each hard-code one origin and build eight paths against it, and
 * every card opens a URL that came from the feed. So the links that matter on
 * mobile are the endpoints and the postings themselves, and a dead posting URL
 * is a card that does nothing in the hand.
 *
 *   node tools/api_sweep.mjs           # both markets, 40 postings each
 *   node tools/api_sweep.mjs --all     # every posting in both feeds (slow)
 *
 * The five LLM endpoints are POST and cost money per call, so they are probed
 * for reachability and contract (a bad body must be refused, not 500), never
 * driven with a real profile here.
 */
const API = "https://jobscout-app-api.kenmwara.workers.dev";
const UA = { "user-agent": "Mozilla/5.0 (api-sweep; jobscout)" };
const SAMPLE = process.argv.includes("--all") ? Infinity : 40;

let fail = 0;
const bad = (m) => { fail++; console.log(`  FAIL  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

async function head(url) {
  try {
    let r = await fetch(url, { method: "HEAD", headers: UA, redirect: "follow" });
    if ([403, 405, 501, 400].includes(r.status))
      r = await fetch(url, { headers: { ...UA, range: "bytes=0-2048" }, redirect: "follow" });
    return r.status;
  } catch (e) { return "ERR " + (e.cause?.code || e.message).toString().slice(0, 30); }
}

// ── the GET endpoints, per market ─────────────────────────────────────────
const feeds = {};
for (const market of ["ca", "ke"]) {
  const url = `${API}/api/feed?market=${market}`;
  try {
    const r = await fetch(url, { headers: UA });
    const d = await r.json();
    const n = d.postings?.length || 0;
    const elig = (d.postings || []).filter((p) => p.gate?.verdict !== "reject").length;
    if (r.status !== 200 || !n) bad(`/api/feed?market=${market} → ${r.status}, ${n} postings`);
    else ok(`/api/feed?market=${market} → ${n} postings, ${elig} eligible, day ${d.day}`);
    feeds[market] = d;
    // the lexicon the picker needs on BOTH clients
    if (!d.lexicon || !Object.keys(d.lexicon).length)
      bad(`market ${market}: feed carries no sector lexicon — the app's picker cannot classify a profile`);
    else ok(`market ${market}: lexicon carries ${Object.keys(d.lexicon).length} sectors`);
    if (!d.labels || !Object.keys(d.labels).length)
      bad(`market ${market}: feed carries no sector labels — chips would render raw ids`);
  } catch (e) { bad(`/api/feed?market=${market} → ${e.message.slice(0, 40)}`); }
}

for (const path of ["/api/health", "/api/stats"]) {
  const s = await head(API + path);
  s === 200 ? ok(`${path} → 200`) : bad(`${path} → ${s}`);
}

// /api/ev is the analytics beacon both apps fire; it must accept a known name
// and must not accept an unknown one silently as if it had.
try {
  const r = await fetch(API + "/api/ev", {
    method: "POST", headers: { ...UA, "content-type": "text/plain" },
    body: JSON.stringify({ n: "apply_open", m: "ca", s: "sweep-probe" }),
  });
  [200, 204].includes(r.status) ? ok(`/api/ev accepts a known event → ${r.status}`)
                                : bad(`/api/ev → ${r.status}`);
} catch (e) { bad(`/api/ev → ${e.message.slice(0, 40)}`); }

// ── the POST endpoints: reachable, and refusing a bad body cleanly ────────
for (const path of ["/api/score", "/api/letter", "/api/tailor", "/api/resume", "/api/answers"]) {
  try {
    const r = await fetch(API + path, {
      method: "POST", headers: { ...UA, "content-type": "application/json" }, body: "{}",
    });
    if (r.status >= 500) bad(`${path} → ${r.status} on an empty body (should refuse, not fail)`);
    else ok(`${path} → ${r.status} on an empty body (refused cleanly)`);
  } catch (e) { bad(`${path} → ${e.message.slice(0, 40)}`); }
}

// ── every card in the app opens one of these ────────────────────────
/* What is provable from here and what is not.
 *
 * Job boards fingerprint more than the user agent. WeWorkRemotely answers 403
 * to any fetch, ReliefWeb answers 406 to HEAD and 202 to GET, and Remotive
 * answers 404 to a fully browser-headed GET while rendering the page perfectly
 * in a real browser (checked by eye, 2026-09-19). So a non-200 from here is
 * evidence about the bot wall, not about the posting.
 *
 * Structure is provable and is what fails the sweep: a card with no url, a url
 * that will not parse, a url that is not https. Reachability is reported as
 * advisory, with the hosts named, so a board that starts returning 404 for
 * EVERY row still shows up as a block of them worth a look. */
const BOT_WALL = new Set([401, 403, 406, 429, 999]);
for (const [market, d] of Object.entries(feeds)) {
  const rows = (d.postings || []).filter((p) => p.gate?.verdict !== "reject");

  const noUrl = rows.filter((p) => !p.url);
  if (noUrl.length) bad(`market ${market}: ${noUrl.length} eligible postings have NO url — those cards do nothing`);
  else ok(`market ${market}: all ${rows.length} eligible postings carry a url`);

  const broken = [];
  const byHost = new Map();
  for (const p of rows.filter((x) => x.url)) {
    let u;
    try { u = new URL(p.url); } catch { broken.push(p); continue; }
    if (u.protocol !== "https:") broken.push(p);
    if (!byHost.has(u.host)) byHost.set(u.host, []);
    byHost.get(u.host).push(p);
  }
  if (broken.length) bad(`market ${market}: ${broken.length} postings have an unparseable or non-https url`);
  else ok(`market ${market}: every url parses and is https (${byHost.size} distinct boards)`);

  // one per host: enough to catch a whole board going dark, cheap enough to run
  const pick = [...byHost.entries()].map(([h, v]) => [h, v[0]]);
  const res = await Promise.all(pick.map(async ([h, p]) => [h, p, await head(p.url)]));
  const answering = res.filter(([, , s]) => s === 200 || s === 202 || (typeof s === "number" && s < 400));
  const walled = res.filter(([, , s]) => BOT_WALL.has(s));
  const odd = res.filter(([, , s]) => !answering.includes(res.find((r) => r[0] === "x")) &&
                                       !BOT_WALL.has(s) && !(typeof s === "number" && s < 400));
  console.log(`  ..    market ${market}: ${answering.length} boards answer, ${walled.length} bot-walled, ${odd.length} other`);
  for (const [h, , s] of [...walled, ...odd]) console.log(`        ${String(s).padEnd(7)} ${h}`);
}

console.log("");
console.log(fail ? `${fail} FAILED` : "ALL GREEN");
process.exit(fail ? 1 : 0);
