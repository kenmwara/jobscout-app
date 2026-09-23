/**
 * check_preview — the link-preview card is right for the market it is shared from.
 *
 *   node tools/check_preview.mjs
 *   node tools/check_preview.mjs --mutate no-failsafe | all-hosts | no-url | all-paths | bare-title
 *                                         | not-html | no-kenya
 *   SITE=https://nairobi.jobscout.page node tools/check_preview.mjs --live
 *
 * Both markets are ONE Pages project and one index.html: the market is decided
 * in the browser from the hostname. An unfurler never runs that JavaScript, so
 * nairobi.jobscout.page previewed as the Canadian site — right down to an
 * `og:url` pointing at jobscout.page — with nothing in the card to say Kenya.
 * site/_worker.js rewrites four tags on the way out.
 *
 * THE ASSERTION THAT MATTERS IS NOT THE COPY. It is that the worker cannot
 * break the site. It sits in the request path of every page load on a live
 * product for a cosmetic reason, which is only defensible while it is
 * fail-safe: an unknown host returns the asset untouched, a non-HTML response
 * returns untouched, and any throw at all returns untouched. Those three are
 * mutation-tested below and the copy is not.
 *
 * SOURCE, plus a --live mode. The deploy gate runs before the deploy, so CI
 * cannot fetch the thing it is about to publish; the source check is what runs
 * there. `--live` is the real proof and is run by hand against the host after
 * a deploy, the same way the field check is.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const MUTATE = args.indexOf("--mutate") < 0 ? null : args[args.indexOf("--mutate") + 1];
const LIVE = args.includes("--live");

let fails = 0, checks = 0;
const say = (s) => { try { console.log(s); } catch { /* stdout is gone */ } };
const ok = (cond, what, saw = "") => {
  checks++;
  if (cond) { say(`  ok    ${what}`); return; }
  fails++;
  say(`  FAIL  ${what}${saw ? `\n        ${saw}` : ""}`);
};

let w = "";
try { w = readFileSync(join(ROOT, "site/_worker.js"), "utf8"); } catch { w = ""; }

// Each mutation removes one of the three guarantees that make a cosmetic
// worker acceptable in a live request path.
if (MUTATE === "no-failsafe") w = w.replace(/\n\s*} catch \{\n\s*return res;\n\s*\}/, "");
if (MUTATE === "all-hosts") w = w.replace(/if \(!market\) return res;/, "");
if (MUTATE === "not-html") w = w.replace(/if \(!\(res\.headers\.get\("content-type"\).*\n/, "");
if (MUTATE === "no-url") w = w.replace(/if \(key === "og:url"\).*\n/, "");
if (MUTATE === "no-kenya") w = w.replace(/title: "JobScout Kenya/, 'title: "JobScout');
if (MUTATE === "all-paths") w = w.replace(/if \(url\.pathname !== "\/".*\n/, "");
if (MUTATE === "bare-title") w = w.replace(/"head > title"/, '"title"');

if (!LIVE) {
  ok(!!w, "site/_worker.js was found",
     "without it both hosts serve the Canadian card and this check is measuring nothing");

  // ---- the three guarantees -------------------------------------------------
  ok(/const res = await env\.ASSETS\.fetch\(request\);/.test(w),
     "it serves whatever Pages would have served, then transforms",
     "a worker that builds its own response re-implements routing, _headers and the 404");
  ok(/if \(!market\) return res;/.test(w),
     "an unknown host is returned untouched",
     "every other host on this project would be rewritten with Kenya's card");
  ok(/content-type.*text\/html.*return res;/.test(w.replace(/\n/g, " ")),
     "a non-HTML response is returned untouched",
     "HTMLRewriter over an image or a stylesheet is wasted work at best");
  ok(/\} catch \{[\s\S]{0,40}return res;/.test(w),
     "any throw returns the untouched response",
     "this is the whole reason a cosmetic rewrite is allowed in a live request path");
  /* The regression this check exists to have caught: the first version rewrote
     every HTML response on the host, so /privacy came back titled with the
     landing page's card. */
  ok(/url\.pathname !== "\/" && url\.pathname !== "\/index\.html"/.test(w),
     "only the root document is rewritten",
     "/apply, /saved and /privacy would all be re-titled with the landing page's card");
  ok(/\.on\("head > title"/.test(w),
     "the title selector is scoped to the head",
     "a bare `title` selector also matches an inline SVG's <title>, which is its accessibility label");

  // ---- and it actually covers the tags an unfurler reads --------------------
  for (const k of ["og:url", "og:title", "twitter:title", "description", "og:description", "twitter:description"]) {
    ok(w.includes(`"${k}"`), `the ${k} tag is rewritten`);
  }
  ok(/"nairobi\.jobscout\.page": \{/.test(w) && /url: "https:\/\/nairobi\.jobscout\.page\/"/.test(w),
     "the Kenyan host maps to its own origin, not the Canadian one");
  /* ANCHORED TO THE MAPPING, not to the words. The first version tested for
     /JobScout Kenya/ anywhere in the file, and a comment in the worker
     quotes that same string - so the mutation changed the title the host
     actually serves and the check went on passing against the prose
     describing it. It reported ASLEEP, which is the only reason this is
     not a green line guarding nothing. */
  ok(/title: "JobScout Kenya/.test(w),
     "and the title it maps to says Kenya",
     "the card is the entire point: a generic title is the state this fixed");
} else {
  // ---- the real proof, after a deploy ---------------------------------------
  const grab = async (host) => {
    const r = await fetch(host, { headers: { "user-agent": "check_preview" } });
    const html = await r.text();
    const tag = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]*)"`)) || [])[1] || "";
    return { status: r.status, title: (html.match(/<title>([^<]*)</) || [])[1] || "", tag };
  };
  const ke = await grab("https://nairobi.jobscout.page/");
  const ca = await grab("https://jobscout.page/");
  ok(ke.status === 200 && ca.status === 200, "both hosts answered", `ke ${ke.status}, ca ${ca.status}`);
  ok(/Kenya/.test(ke.tag("og:title")), "live: the Kenyan card says Kenya", `saw "${ke.tag("og:title")}"`);
  ok(ke.tag("og:url") === "https://nairobi.jobscout.page/",
     "live: the Kenyan card points at its own origin", `saw "${ke.tag("og:url")}"`);
  ok(/Kenya/.test(ke.title), "live: so does the document title", `saw "${ke.title}"`);
  ok(!/Kenya/.test(ca.tag("og:title")) && ca.tag("og:url") === "https://jobscout.page/",
     "live: the Canadian card is untouched",
     `saw "${ca.tag("og:title")}" / "${ca.tag("og:url")}"`);
  ok(ke.tag("og:image") === ca.tag("og:image") && !!ke.tag("og:image"),
     "live: both still carry the same reachable card image");

  /* PAGE FOR PAGE. The root's card was right and every other page on the
     Kenyan host had been given the root's title - which a check that only ever
     looked at the root could not see. */
  for (const path of ["apply", "saved", "privacy"]) {
    const k = await grab(`https://nairobi.jobscout.page/${path}`);
    const c = await grab(`https://jobscout.page/${path}`);
    ok(k.title === c.title && !!c.title,
       `live: /${path} keeps its own title on both hosts`,
       `ke "${k.title}" vs ca "${c.title}"`);
  }
}

say(`\ncheck_preview: ${checks} assertion(s)${LIVE ? " against the live hosts" : ""}`);
if (MUTATE) {
  if (!fails) {
    say(`VERDICT: ASLEEP — the "${MUTATE}" mutation did not fail this check`);
    process.exitCode = 1;
  } else {
    say(`VERDICT: the "${MUTATE}" mutation was caught (${fails} failure(s)) — awake`);
    process.exitCode = 0;
  }
} else {
  say(fails ? `VERDICT: FAIL (${fails})`
            : "VERDICT: PASS — the Kenyan host previews as Kenya, and the worker cannot break the site");
  process.exitCode = fails ? 1 : 0;
}
