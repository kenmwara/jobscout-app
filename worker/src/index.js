/**
 * JobScout App — API Worker.
 * Public AI endpoint with two non-negotiable guards:
 *   1. per-IP sliding-window rate limit (D1)
 *   2. global daily budget breaker (D1) → cached showcase results when spent
 * Model: Haiku-class only. Prompts live server-side. Pasted resumes are
 * processed in-memory and never stored or logged.
 */

import { extractText, getDocumentProxy } from "unpdf";
import { unzipSync } from "fflate";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_SCORE_TOKENS = 400;
const EXTRACT_MAX_BYTES = 2_000_000;
const EXTRACT_MAX_CHARS = 6000;
const FAILED = { fit: 0, verdict: "scoring failed (upstream)", strongest: "", weakest: "",
                 usage: { input_tokens: 0, output_tokens: 0 }, cost: 0 };
// 6/hour was throttling the author's own use of his own demo. The per-IP window
// is anti-abuse pacing, NOT the spend guard - DAILY_BUDGET_USD is, and it is
// unchanged, so 24/hour cannot cost a cent more than 6/hour could. At ~1c a run
// the $3/day breaker still stops everything at ~300 runs across all visitors.
const IP_RUNS_PER_HOUR = 24;
const FIT_FLOOR = 55;   // the page's "unsure" band; letter/tailor refuse below it
const DAILY_BUDGET_USD = 3.0;
// Haiku pricing (USD per MTok) — used for the live cost counter + breaker math.
const PRICE_IN = 1.0, PRICE_OUT = 5.0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-filename",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    // no-store: the feed changes on every publish and the page must never run a
    // stale pool (a browser kept the pre-Workday feed for hours on 2026-09-16)
    headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS },
  });

async function ipKey(request) {
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "js-app-salt"));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function rateLimited(env, key) {
  const hourAgo = Date.now() - 3600_000;
  const { results } = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM demo_runs WHERE ip_hash = ? AND ts_ms > ?"
  ).bind(key, hourAgo).all();
  return (results?.[0]?.n ?? 0) >= IP_RUNS_PER_HOUR;
}

async function todaySpendUsd(env) {
  const day = new Date().toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    "SELECT SUM(cost_usd) AS c FROM demo_runs WHERE day = ?"
  ).bind(day).all();
  return results?.[0]?.c ?? 0;
}

/* ── counted events ──────────────────────────────────────────────────────────────────────
 * The page was redesigned three times on taste alone because nothing was measured. These are
 * the only names that can be written, so a typo on the page is a dropped event rather than a
 * new column in the funnel, and an event that is not on this list cannot be invented by anyone
 * POSTing to the endpoint.
 */
const EV_NAMES = new Set([
  "open",       // a tab opened the page
  "sample",     // picked a sample candidate            detail: persona id
  "upload",     // uploaded a resume file               detail: ok | fail
  "paste",      // pasted resume text
  "where",      // set the location filter              detail: province code | any
  "remote",     // toggled remote-only                  detail: on | off
  "run",        // ran the pipeline                     detail: sector
  "scored",     // the run came back                    detail: band of the top match
  "letter",     // asked for a cover letter
  "tailor",     // asked for a tailored resume
  // Distinct from "apply": this is opening OUR application page, which is now
  // the step the funnel turns on, and "apply" is still leaving for the
  // employer's own form. The page has fired this since the 09-19 redesign and
  // every one was dropped here until the name was added (2026-09-19).
  "apply_open", // opened the application page          detail: band
  "apply",      // opened a posting at the source       detail: band
  "save",       // kept a posting on the shortlist
  "outcome",    // marked what happened                 detail: one of OUTCOMES below
]);
const EV_SURFACES = new Set(["web", "android", "ios"]);
// The apps' stage ids (Tracker.kt / TrackerView.swift), which the web page now shares.
const OUTCOMES = ["applied", "pending", "responded", "interviewed", "callback", "declined"];

async function recordRun(env, key, tokensIn, tokensOut, costUsd) {
  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    "INSERT INTO demo_runs (ip_hash, ts_ms, day, tokens_in, tokens_out, cost_usd) VALUES (?,?,?,?,?,?)"
  ).bind(key, Date.now(), day, tokensIn, tokensOut, costUsd).run();
}

// Markets: the same guarded pipeline, a different sweep and rubric. "ca" is the
// operator's own hunt; "ke" is the Kenya market (2026-09-15).
const MARKETS = new Set(["ca", "ke"]);
const market = m => (MARKETS.has(String(m || "").toLowerCase()) ? String(m).toLowerCase() : "ca");

// What changes in the rubric for a Kenya-based candidate: eligibility to be
// hired from Kenya comes first, graduates are scored against entry-level
// expectations, and training counts as evidence. Nothing else is softened.
const RUBRIC_KE =
  "MARKET: Kenya. The candidate is based in Kenya (East Africa Time, UTC+3, a full working-day overlap with Europe). " +
  "First question: can this employer hire someone based in Kenya (worldwide, EMEA, Africa, or contractor-friendly)? " +
  "A US-only, EU-only or single-country lock elsewhere is a hard no however strong the profile — say so plainly. " +
  "Score a graduate or entry-level candidate against entry-level expectations, not senior ones; certificates, " +
  "bootcamps and programme training (e.g. Ajira Digital) count as evidence of skill. The EMEA timezone overlap is an asset. ";

async function scoreOne(env, profile, posting, m = "ca") {
  const system = [
    "You are JobScout's scoring rubric. Score fit 0-100 for THIS candidate profile",
    "against THIS posting. Anchors: clean title+seniority+remote-eligibility match",
    "baselines ~70; niche alignment is a +5..15 bonus, never a requirement;",
    "unspecified salary is neutral. Be honest — most postings are a poor fit and",
    "should score low, with the reason stated plainly.",
    /* The score is read by the person it is about. A low one is a statement
       about the DISTANCE between a posting and a profile, and it stays that:
       no judgements of the candidate's character, temperament, ambition or
       preferences, and no advice about what sort of person they are. "Ken
       thrives alone" was a real verdict this produced, and it is not something
       a scoring rubric is in any position to say. */
    "Write about the fit, never about the candidate as a person: no claims about",
    "their temperament, motivation, ambition or preferences, and no advice about",
    "what kind of work suits them. Distance between a posting and a profile is",
    "the only subject.",
    m === "ke" ? RUBRIC_KE : "",
    'Reply ONLY with JSON: {"fit": <int>, "verdict": "<one sentence>",',
    '"strongest": "<the single best alignment>",',
    /* `weakest` is read by a candidate who is deciding what to rewrite, so it is
       asked for as the thing to ADDRESS rather than as a list of what they are
       missing. Same information, and the difference between a to-do and a
       dressing-down is entirely in how it is phrased. */
    '"weakest": "<the one thing this posting most wants to see that the profile',
    'does not yet evidence, written as what the candidate should put in front of',
    'it — never as a list of what they lack, and never a judgement of them>"}',
  ].join(" ");
  const user = `PROFILE:\n${profile}\n\nPOSTING:\n${posting.title} — ${posting.company}\n${posting.location} · ${posting.remote_policy}\n${posting.summary || ""}`;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_SCORE_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const data = await r.json();
  const text = data.content?.[0]?.text ?? "{}";
  const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
  let parsed;
  try {
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    parsed = { fit: 0, verdict: "score parse failed", strongest: "", weakest: "" };
  }
  const cost =
    (usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT) / 1_000_000;
  return { ...parsed, usage, cost };
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function extractKind(contentType, filename) {
  const ct = String(contentType || "").split(";")[0].trim().toLowerCase();
  const ext = String(filename || "").toLowerCase().match(/\.(pdf|docx|txt|md)$/)?.[1];
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (ct === DOCX_MIME || ext === "docx") return "docx";
  if (ct === "text/plain" || ct === "text/markdown" || ext === "txt" || ext === "md") return "txt";
  return null;
}

const normalise = s => String(s || "").replace(/\r\n?/g, "\n").replace(/[ \t\f\v]+/g, " ")
  .replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

async function extractResume(kind, buf) {
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (kind === "docx") {
    const xml = unzipSync(new Uint8Array(buf))["word/document.xml"];
    if (!xml) return "";
    return new TextDecoder().decode(xml)
      .replace(/<\/w:p>/g, "\n").replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }
  return new TextDecoder().decode(buf);
}


// ── shared by the drafting routes (letter, tailor) ───────────────────────────
// Both guards, then the body: {key, spent, profile, p} or the Response to return.
async function guarded(request, env, breakerNote) {
  const key = await ipKey(request);
  if (await rateLimited(env, key))
    return json(429, { error: "rate_limited", detail: `Demo cap: ${IP_RUNS_PER_HOUR} runs/hour.` });
  const spent = await todaySpendUsd(env);
  if (spent >= DAILY_BUDGET_USD)
    return json(200, { breaker: true, detail: `Today's live-demo budget is spent — ${breakerNote}.` });
  const body = await request.json().catch(() => ({}));
  const profile = String(body.profile || "").slice(0, 6000);
  const p = body.posting || {};
  if (!profile || !p.title)
    return json(400, { error: "bad_request", detail: "profile + posting required" });
  // 2026-09-16: no drafting below the "unsure" band. The page only offers the buttons
  // from FIT_FLOOR up; this is the same rule enforced where the money is spent, so the
  // API cannot be used to write a letter for a job the profile does not fit.
  const fit = Number(body.fit);
  /* Below the floor nothing drafts BY DEFAULT. `stretch` is the candidate
     saying, deliberately, that they want to apply anyway — and it does not buy
     a flattering letter, it buys a candid one (see the letter endpoint). The
     flag must be explicit, so nothing below the floor can be drafted by
     accident or by a caller that simply omitted the fit. */
  const stretch = body.stretch === true;
  if (!Number.isFinite(fit))
    return json(400, { error: "bad_request", detail: "fit required" });
  if (fit < FIT_FLOOR && !stretch)
    return json(400, { error: "below_floor",
      detail: `Drafting is only offered for a fit of ${FIT_FLOOR} or better; this posting scored ${fit}.` });
  return { key, spent, profile, p, fit, stretch };
}

const postingText = p =>
  `${p.title} — ${p.company}\n${p.location || ""} · ${p.remote_policy || ""}\n${p.summary || ""}`;

// One Haiku call: {text, usage, cost} or the 502 Response.
async function draft(env, max_tokens, system, content) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens, temperature: 0.3, system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) return json(502, { error: "upstream", detail: `anthropic ${r.status}` });
  const data = await r.json();
  const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
  return { text: data.content?.[0]?.text ?? "", usage,
           cost: (usage.input_tokens * PRICE_IN + usage.output_tokens * PRICE_OUT) / 1_000_000 };
}

const squash = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* A cover letter is plain text on every surface that shows it — the web page, the
   Android screen and the iOS sheet all render it as a string, so a markdown heading
   arrives as literal asterisks. Found on a real phone 2026-09-19: every letter opened
   with "**Cover Letter**". The prompt now forbids markdown, and this is the belt to
   that pair of braces, because a prompt is a request and this is a guarantee. */
function plainText(t) {
  return String(t || "")
    .replace(/^﻿/, "")
    // a heading line of its own: "# Cover Letter", "**Cover Letter**", "COVER LETTER"
    .replace(/^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*cover letter\s*(?:\*\*|__)?\s*:?\s*\n+/i, "")
    .replace(/^\s*#{1,6}\s+/gm, "")          // any other heading marker
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")     // bold
    .replace(/__([^_\n]+)__/g, "$1")         // bold, the other spelling
    // Single-asterisk emphasis only when it wraps a word — a lone * is more likely a
    // bullet the model meant literally than an unclosed italic.
    .replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, "$1$2")
    .trim();
}
// Every Greenhouse posting in the feed is one of these two hosts, and all 63
// parse: /<board token>/jobs/<id>. The board API below it needs no key.
const GH_URL = /^https?:\/\/(?:job-boards|boards)\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/;
const UA = "Mozilla/5.0 (compatible; JobScout/1.0; +https://jobscout.page)";
const hostOf = u => { try { return new URL(u).host; } catch { return ""; } };
// Ashby publishes its forms too — I reported otherwise on 2026-09-19 and was
// wrong: the selection is fieldEntries, not fields, and `field` is a JSON
// scalar with no subfields. Between the two boards that is 113 of Canada's 309
// and 83 of Kenya's 323. Workday is the remaining third and needs a candidate
// account per employer, so it stays unreadable.
const ASHBY_URL = /^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)\/([0-9a-f-]{36})/;
// A file field is an attachment the candidate adds themselves; the rest we can read.
const ANSWERABLE = new Set(["input_text", "textarea", "multi_value_single_select"]);
const ASHBY_ANSWERABLE = new Set(["String", "LongText", "ValueSelect", "Number", "Boolean"]);

/* One shape out of two boards: {source, fields:[{label, required, type, options}]},
   or null when the form is not published anywhere we can reach. */
async function readForm(rawUrl) {
  const u = String(rawUrl || "");
  const gh = GH_URL.exec(u);
  if (gh) {
    const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${gh[1]}/jobs/${gh[2]}?questions=true`,
      { headers: { "user-agent": UA, accept: "application/json" } });
    if (!r.ok) throw new Error("greenhouse " + r.status);
    const form = await r.json();
    return { source: "greenhouse", fields: (form.questions || [])
      .map(q => ({ q, f: q.fields?.[0] || {} }))
      .filter(({ f }) => ANSWERABLE.has(f.type))
      .map(({ q, f }) => ({ label: q.label, required: !!q.required, type: f.type,
                            options: (f.values || []).map(v => v.label) })) };
  }
  const ash = ASHBY_URL.exec(u);
  if (ash) {
    const r = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({
        operationName: "ApiJobPosting",
        variables: { organizationHostedJobsPageName: ash[1], jobPostingId: ash[2] },
        query: "query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {" +
               " jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId)" +
               " { applicationForm { sections { fieldEntries { isRequired field } } } } }",
      }),
    });
    if (!r.ok) throw new Error("ashby " + r.status);
    const d = await r.json();
    const secs = d?.data?.jobPosting?.applicationForm?.sections;
    if (!Array.isArray(secs)) return null;
    return { source: "ashby", fields: secs.flatMap(s => s.fieldEntries || [])
      .filter(fe => fe?.field && ASHBY_ANSWERABLE.has(fe.field.type))
      .map(fe => ({ label: fe.field.title || fe.field.humanReadablePath || "", required: !!fe.isRequired,
                    type: fe.field.type, options: (fe.field.selectableValues || []).map(v => v.label) })) };
  }
  return null;
}
// Never drafted, never stored, not even shown as a blank for us to fill: these
// are the candidate's own to declare, and a plausible guess would be a lie
// told in their name on a legal form.
// Passport, citizenship and nationality are NOT implied by where someone
// lives: reading Supabase's real form, "Passport Country" came back "Canada"
// from a resume that said only that the person is based in Vancouver. Plenty
// of people live and work somewhere on a permit with another country's
// passport, and this is a legal declaration, not a convenience field.
// Eligibility to work somewhere stays answerable — a resume can say that
// outright, and this one did.
const PERSONAL = /gender|pronoun|race|ethnic|veteran|disab|self.?identif|demograph|birth|age\b|salary|compensation|criminal|conviction|sexual|religio|passport|citizen|nationality|immigration|work permit|visa/i;
const IDENTITY = /first name|last name|full name|email|phone|address|linkedin|website|portfolio|github/i;

const inProfile = (profile, phrase) => phrase.trim().length >= 8 && squash(profile).includes(squash(phrase));

// What a rewrite fabricates, and what a plain capitalised word is not: numbers
// and dates, acronyms (AWS, KQL, SRE), CamelCase and dotted product names
// (GitLab, Node.js, Log(N)), versions. Sentence-initial capitals are skipped on
// purpose — flagging "Built" would make the guard cry wolf and get ignored.
const HARD_TOKEN = /\b\d[\d.,%/+-]*\b|\b[A-Za-z]+[A-Z][A-Za-z]*\b|\b[A-Z]{2,}\b|\b[A-Za-z]+\.[a-z]{2,}\b/g;

const meta = (d, spent) => ({ model: MODEL, cost_usd: +d.cost.toFixed(5),
  day_spend_usd: +(spent + d.cost).toFixed(4), day_budget_usd: DAILY_BUDGET_USD });

// The model is told "JSON only"; this forgives a code fence or a lead-in sentence.
function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json(200, { ok: true, model: MODEL, budget_usd: DAILY_BUDGET_USD });
    }

    if (url.pathname === "/api/feed") {
      // ponytail: markets share the `feed` table by suffixing the day key ("2026-09-15#ke");
      // a market column would need a new primary key. Upgrade path: (day, market) PK.
      const m = market(url.searchParams.get("market"));
      const { results } = await env.DB.prepare(
        m === "ca" ? "SELECT payload FROM feed WHERE day NOT LIKE '%#%' ORDER BY day DESC LIMIT 1"
                   : "SELECT payload FROM feed WHERE day LIKE ? ORDER BY day DESC LIMIT 1"
      ).bind(...(m === "ca" ? [] : [`%#${m}`])).all();
      if (!results?.length) return json(200, { day: null, postings: [] });
      return json(200, JSON.parse(results[0].payload));
    }

    if (url.pathname === "/api/score" && request.method === "POST") {
      const key = await ipKey(request);
      // The regression harness (tools/demo_eval.py) presents the feed secret and skips the
      // per-IP cap only; the daily budget breaker below still applies to it (2026-09-17).
      const trusted = !!env.FEED_SECRET && request.headers.get("x-feed-secret") === env.FEED_SECRET;
      if (!trusted && await rateLimited(env, key))
        return json(429, { error: "rate_limited", detail: `Demo cap: ${IP_RUNS_PER_HOUR} runs/hour.` });

      const spent = await todaySpendUsd(env);
      if (spent >= DAILY_BUDGET_USD) {
        const { results } = await env.DB.prepare(
          "SELECT payload FROM cached_showcase ORDER BY id DESC LIMIT 1"
        ).all();
        return json(200, {
          breaker: true,
          detail: "Today's live-demo budget is spent — serving a cached showcase run. The breaker is the feature.",
          cached: results?.length ? JSON.parse(results[0].payload) : null,
        });
      }

      const body = await request.json().catch(() => ({}));
      const profile = String(body.profile || "").slice(0, 6000);
      const postings = Array.isArray(body.postings) ? body.postings.slice(0, 8) : [];
      const m = market(body.market);
      if (!profile || !postings.length)
        return json(400, { error: "bad_request", detail: "profile + postings[] required" });

      // concurrent: 8 sequential Haiku calls were 16-40 s of silence → client read timeouts
      const results = await Promise.all(postings.map(p => scoreOne(env, profile, p, m).catch(() => FAILED)));
      // Honest degradation: a per-posting failure is a fit-0 row, but if EVERY call failed the run
      // did not happen — say so rather than returning eight confident zeroes.
      if (results.length && results.every(s => s === FAILED))
        return json(502, { error: "upstream", detail: "Scoring is unavailable right now — every model call failed. Nothing was charged." });
      const out = [];
      let tIn = 0, tOut = 0, cost = 0;
      results.forEach((s, i) => {
        tIn += s.usage.input_tokens; tOut += s.usage.output_tokens; cost += s.cost;
        out.push({ id: postings[i].id, fit: s.fit, verdict: s.verdict, strongest: s.strongest, weakest: s.weakest });
      });
      await recordRun(env, key, tIn, tOut, cost);
      return json(200, {
        scores: out,
        meta: { model: MODEL, tokens_in: tIn, tokens_out: tOut, cost_usd: +cost.toFixed(5),
                day_spend_usd: +(spent + cost).toFixed(4), day_budget_usd: DAILY_BUDGET_USD },
      });
    }

    if (url.pathname === "/api/letter" && request.method === "POST") {
      const g = await guarded(request, env, "letter drafting resumes tomorrow");
      if (g instanceof Response) return g;
      const { profile, p, stretch } = g;
      const common =
        "Draft a short, specific cover letter (150-200 words) grounded ONLY in the " +
        "candidate profile provided — never invent experience, credentials, or claims. " +
        "Plain professional voice, no flattery padding, no 'I am writing to express'. " +
        "Sign off as 'the candidate'. " +
        // It kept opening with a markdown heading, which every client renders as
        // literal asterisks because a letter is plain text everywhere it is shown.
        "Write PLAIN TEXT only: no markdown, no ** bold, no headings, and do not title it.";
      /* A stretch letter is the SAME letter, written harder.
         2026-09-19: it was not. It opened by naming the gap — "I lack the B2B
         SaaS analytics infrastructure experience this posting calls for" — and
         no recruiter reads past that. Honesty is a floor on what may be
         CLAIMED; it was never a licence to argue the candidate out of the job
         before the first paragraph ends. The letter's job is to get them read.
         So: never invent, never volunteer the deficit, and lead with what they
         have actually done. Below the floor the parallel is simply harder to
         find, which is an instruction to look harder, not to give up. */
      const d = await draft(env, 550,
        stretch
          ? common + " The overlap with this posting is not obvious on paper, so find the " +
            "strongest REAL parallel in the profile and lead with it — comparable scope, " +
            "comparable results, the nearest thing they have genuinely built or run — and " +
            "make the affirmative case for it in concrete terms. Where the posting names " +
            "something the profile does not contain, do not claim it, do not hint at it, and " +
            "do not announce its absence either: write about what they HAVE done instead. " +
            "No apology, no 'although', no 'I lack', no 'while I have not'. The recruiter " +
            "decides whether it is enough; this letter's job is to be read that far."
          : common + " Open with the single strongest genuine alignment.",
        `PROFILE:\n${profile}\n\nPOSTING:\n${postingText(p)}`);
      if (d instanceof Response) return d;
      await recordRun(env, g.key, d.usage.input_tokens, d.usage.output_tokens, d.cost);
      return json(200, { letter: plainText(d.text), stretch, meta: meta(d, g.spent) });
    }

    // Resume helper: the profile rephrased toward one posting, plus the honest
    // part — what the posting asks for that the profile never mentions. It
    // reorders and rewords; it never adds a skill. The gap list is the tailoring
    // the candidate does themselves, and only if it is true.
    if (url.pathname === "/api/tailor" && request.method === "POST") {
      const g = await guarded(request, env, "resume tailoring resumes tomorrow");
      if (g instanceof Response) return g;
      const { profile, p } = g;
      const d = await draft(env, 900,
        "You tailor a candidate's resume toward one job posting using ONLY what the profile contains. " +
        "Return JSON only, no prose, no code fence: " +
        '{"summary": string, "bullets": [{"text": string, "from": string}], "gaps": [{"asks": string, "note": string}]}. ' +
        "summary: two sentences a recruiter reads first, built from the profile's own facts and aimed at this posting. " +
        "bullets: 4-6 resume bullets, ordered by relevance to the posting. Each has `from`: a phrase copied VERBATIM from the profile, " +
        "and `text`: that phrase reworded toward the posting in at most 18 words, claiming nothing beyond `from` — no task, tool, " +
        "responsibility, employer, number or credential the phrase does not contain. If the profile names a skill without describing work, " +
        "the bullet names the skill and stops. " +
        "gaps: up to 5 things the posting asks for that the profile does not cover; asks = the requirement in the posting's words; " +
        "note = one sentence: what to add ONLY if it is true of them — or, where the profile says outright that they lack it, " +
        "say that plainly and do not suggest adding it. The posting summary may be cut short; a truncated description is never a gap. Empty arrays are fine.",
        `PROFILE:\n${profile}\n\nPOSTING:\n${postingText(p)}`);
      if (d instanceof Response) return d;
      const out = parseJson(d.text);
      if (!out || typeof out.summary !== "string")
        return json(502, { error: "upstream", detail: "The model did not return a usable draft. Nothing was charged to you." });
      await recordRun(env, g.key, d.usage.input_tokens, d.usage.output_tokens, d.cost);
      return json(200, {
        summary: out.summary,
        // The guard that prose could not enforce: a bullet survives only if its cited phrase really is in the profile.
        bullets: Array.isArray(out.bullets)
          ? out.bullets.filter(b => b && typeof b.text === "string" && typeof b.from === "string" && inProfile(profile, b.from))
              .map(b => b.text).slice(0, 6) : [],
        gaps: Array.isArray(out.gaps) ? out.gaps.filter(x => x && typeof x.asks === "string").slice(0, 5)
                .map(x => ({ asks: x.asks, note: typeof x.note === "string" ? x.note : "" })) : [],
        meta: meta(d, g.spent),
      });
    }

    // The whole resume, rebuilt for one posting — a document to attach, not a
    // summary to read. /api/tailor advises; this one produces the file. Every
    // section of the original survives: nothing is dropped for being off-topic,
    // because a resume with a hole in its dates is worse than one that rambles.
    if (url.pathname === "/api/resume" && request.method === "POST") {
      const g = await guarded(request, env, "resume rebuilding resumes tomorrow");
      if (g instanceof Response) return g;
      const { profile, p } = g;
      const SYS =
        "You rewrite a candidate's entire resume for one job posting. Return JSON only, no prose, no code fence: " +
        '{"name": string, "contact": string, "headline": string, ' +
        '"sections": [{"heading": string, "items": [{"title": string, "meta": string, "bullets": [string]}]}], ' +
        '"gaps": [{"asks": string, "note": string}]}. ' +
        "Reproduce the WHOLE resume, every role, school, certificate and skill the profile contains, in a sensible " +
        "order with the most relevant first. name and contact come verbatim from the profile; contact is one line. " +
        "headline: one line naming what they are, aimed at this posting. " +
        "Each item: title (role, qualification or skill group), meta (employer, dates, place — exactly as the profile " +
        "gives them, never invented or inferred), bullets (reworded toward this posting). " +
        "An item with no bullets in the profile keeps an empty bullets array. " +
        "ABSOLUTE RULE: every employer, job title, date, number, percentage, tool, product, certificate and " +
        "qualification in your output must already appear in the profile. Rewording is the job; adding is not. " +
        "If the posting asks for something the profile does not have, leave it out of the resume and put it in gaps: " +
        "asks = the requirement in the posting's words; note = one sentence on what the candidate could add here, " +
        "and only if it is true of them. Up to 5. These are the lines they add themselves before they send it.";
      const ASK = `PROFILE:\n${profile}\n\nPOSTING:\n${postingText(p)}`;

      // The guard prose cannot enforce. Acronyms, CamelCase names, versions and
      // every number are exactly what a rewrite invents — an employer that was
      // never there, a percentage nobody measured — so each one has to be in the
      // original. A resume is signed by the candidate, and one fabricated line
      // ruins the whole document, so the bar does not bend.
      //
      // It does get a second go. The first draft usually trips on one category
      // word in the headline ("DevOps" for a resume that never says DevOps),
      // and throwing the document away over that is brittle; naming the tokens
      // and asking again fixes it for the price of one more call. Twice is
      // enough — a model that invents again after being shown the list is not
      // going to stop, and the candidate gets the refusal instead.
      const flat = squash(profile);
      const ungrounded = out => {
        const hard = new Set();
        const scan = t => String(t || "").match(HARD_TOKEN)?.forEach(x => hard.add(x));
        scan(out.headline);
        for (const sec of out.sections) {
          scan(sec.heading);
          for (const it of sec.items || []) { scan(it.title); scan(it.meta); (it.bullets || []).forEach(scan); }
        }
        // A plural of something the resume names is not an invention. The real
        // run refused twice over "SDKs" for a resume that says "Anthropic SDK",
        // which is the guard crying wolf — and a guard nobody trusts is worse
        // than none. Singular and plural both count as present.
        const here = t => {
          const q = squash(t);
          return flat.includes(q) || (q.endsWith("s") && flat.includes(q.slice(0, -1)));
        };
        return [...hard].filter(t => !here(t));
      };

      let d = await draft(env, 2600, SYS, ASK);
      if (d instanceof Response) return d;
      let out = parseJson(d.text);
      let spentIn = d.usage.input_tokens, spentOut = d.usage.output_tokens, cost = d.cost;
      let invented = out && Array.isArray(out.sections) ? ungrounded(out) : null;

      if (invented?.length) {
        const d2 = await draft(env, 2600,
          SYS + " Your last attempt used these, which do NOT appear in the profile: " +
          invented.slice(0, 12).join(", ") +
          ". Rewrite without them — use only the words the profile itself uses.", ASK);
        if (!(d2 instanceof Response)) {
          const out2 = parseJson(d2.text);
          spentIn += d2.usage.input_tokens; spentOut += d2.usage.output_tokens; cost += d2.cost;
          if (out2 && Array.isArray(out2.sections)) {
            const inv2 = ungrounded(out2);
            if (!inv2.length) { out = out2; invented = []; }
            else invented = inv2;
          }
        }
      }

      if (!out || !Array.isArray(out.sections))
        return json(502, { error: "upstream", detail: "The model did not return a usable resume. Nothing was charged to you." });
      if (invented.length)
        return json(502, { error: "ungrounded", invented: invented.slice(0, 8),
          detail: `The draft used ${invented.length} thing${invented.length > 1 ? "s" : ""} your resume does not contain (${invented.slice(0, 3).join(", ")}), twice. It was refused rather than shown to you.` });

      await recordRun(env, g.key, spentIn, spentOut, cost);
      return json(200, {
        name: String(out.name || "").slice(0, 120),
        contact: String(out.contact || "").slice(0, 300),
        headline: String(out.headline || "").slice(0, 300),
        sections: out.sections.slice(0, 8).map(sec => ({
          heading: String(sec.heading || "").slice(0, 80),
          items: (sec.items || []).slice(0, 12).map(it => ({
            title: String(it.title || "").slice(0, 160),
            meta: String(it.meta || "").slice(0, 160),
            bullets: (it.bullets || []).slice(0, 8).map(b => String(b).slice(0, 400)),
          })),
        })),
        // The gaps deliberately sit OUTSIDE the document: they are what the
        // resume does not say, and the only hand that may put them in is theirs.
        gaps: Array.isArray(out.gaps)
          ? out.gaps.filter(x => x && typeof x.asks === "string").slice(0, 5)
              .map(x => ({ asks: x.asks, note: typeof x.note === "string" ? x.note : "" })) : [],
        // both calls, on the runs where the guard asked for a second
        meta: meta({ cost }, g.spent),
      });
    }

    // The screening questions, read from the employer's own form and answered
    // from the profile alone. See the block comment above GH_URL.
    if (url.pathname === "/api/answers" && request.method === "POST") {
      const g = await guarded(request, env, "answer drafting resumes tomorrow");
      if (g instanceof Response) return g;
      const { profile, p } = g;

      let asked, source;
      try {
        asked = await readForm(p.url);
        source = asked && asked.source;
      } catch (e) {
        return json(200, { unsupported: true, host: hostOf(p.url),
          detail: "The employer's form could not be read just now. Nothing was charged to you." });
      }
      if (!asked) return json(200, { unsupported: true, host: hostOf(p.url),
        detail: "This employer's form is not published, so the questions cannot be read before you open it." });
      asked = asked.fields;
      // Shown, never drafted. Seeing that a form asks at all is the point of
      // reading it early; answering on someone's behalf is a different thing.
      const never = l => PERSONAL.test(l) ? "yours alone — we never draft this"
                       : IDENTITY.test(l) ? "yours to type" : "";
      const drafting = asked.filter(q => !never(q.label || ""));
      const yours = asked.filter(q => never(q.label || ""))
        .map(q => ({ label: q.label, required: q.required, type: q.type,
                     options: q.options, answer: "", from: "", why: never(q.label || "") }));

      if (!drafting.length)
        return json(200, { source, url: p.url, questions: yours, drafted: 0 });

      const ask = drafting.map((q, i) =>
        `${i + 1}. ${q.label}${q.required ? " [required]" : ""} (${q.type})` +
        (q.options.length ? `\n   OPTIONS: ${q.options.join(" | ")}` : "")).join("\n");

      const d = await draft(env, 1100,
        "You answer a job application's screening questions using ONLY the candidate profile given. " +
        "Return JSON only, no prose, no code fence: " +
        '{"answers": [{"n": number, "answer": string, "from": string}]}. ' +
        "n: the question's number. answer: what the candidate would put, in their own register, at most 60 words; " +
        "for a question with OPTIONS the answer MUST be one option copied exactly, or \"\" if the profile supports none. " +
        "from: a phrase copied VERBATIM from the profile that establishes the answer. " +
        // Stated as "answer what the profile settles", not "omit what is sensitive":
        // the cautious reading of the earlier wording drafted nothing at all, even for
        // a profile that said outright where it lived and that it could work there.
        "Answer every question the profile settles, including where the candidate lives, whether they are legally " +
        "eligible to work somewhere, and their notice or availability — if the profile says it, use it. " +
        "Omit a question entirely — do not guess, do not hedge, do not answer in general terms — when the profile " +
        "does not settle it. Never answer these at all, whatever the profile says: how they heard about the company, " +
        "salary expectations, criminal history, and anything about race, gender, disability or veteran status.",
        `PROFILE:\n${profile}\n\nPOSTING:\n${postingText(p)}\n\nQUESTIONS:\n${ask}`);
      if (d instanceof Response) return d;

      const out = parseJson(d.text);
      const by = new Map();
      if (out && Array.isArray(out.answers))
        for (const a of out.answers)
          if (a && Number.isInteger(a.n) && typeof a.answer === "string" && typeof a.from === "string")
            by.set(a.n, a);

      const questions = drafting.map((q, i) => {
        const a = by.get(i + 1);
        // Two guards, both refusable: the cited phrase has to be in the profile,
        // and a choice has to be one the employer actually offers.
        const grounded = a && a.answer.trim() && inProfile(profile, a.from)
          && (!q.options.length || q.options.includes(a.answer.trim()));
        return {
          label: q.label, required: q.required, type: q.type, options: q.options,
          answer: grounded ? a.answer.trim() : "",
          from: grounded ? a.from : "",
          why: grounded ? "" : "yours to answer — your profile does not settle it",
        };
      });

      await recordRun(env, g.key, d.usage.input_tokens, d.usage.output_tokens, d.cost);
      return json(200, {
        source, url: p.url,
        questions: [...yours, ...questions],
        drafted: questions.filter(q => q.answer).length,
        meta: meta(d, g.spent),
      });
    }

    if (url.pathname === "/api/extract" && request.method === "POST") {
      // Resume file → text, in memory only. No D1 write, no Claude cost; the size cap is the guard.
      const len = +(request.headers.get("content-length") || 0);
      if (len > EXTRACT_MAX_BYTES) return json(413, { error: "too_large", detail: "Max 2 MB." });
      const buf = await request.arrayBuffer();
      if (buf.byteLength > EXTRACT_MAX_BYTES) return json(413, { error: "too_large", detail: "Max 2 MB." });
      const kind = extractKind(request.headers.get("content-type"), request.headers.get("x-filename"));
      if (!kind) return json(415, { error: "unsupported", detail: "PDF, DOCX, TXT or MD only." });
      let text = "";
      try {
        text = normalise(await extractResume(kind, buf));
      } catch {}
      if (!text) return json(422, { error: "unreadable", detail: "Couldn't read text from that file — paste the text instead." });
      return json(200, { text: text.slice(0, EXTRACT_MAX_CHARS), chars: text.length, kind });
    }

    if (url.pathname === "/api/ev" && request.method === "POST") {
      // Never fails loudly: a page must not break because a counter did.
      try{
        // Parsed from text, not request.json(): the page sends text/plain so that sendBeacon
        // stays a simple request and never needs a preflight it cannot perform.
        const b = JSON.parse(await request.text());
        const name = String(b.n || "");
        const sid = String(b.sid || "").slice(0, 24);
        if (!EV_NAMES.has(name) || !/^[a-z0-9]{6,24}$/.test(sid)) return new Response(null, { status: 204, headers: CORS });
        const surface = EV_SURFACES.has(String(b.s || "")) ? String(b.s) : "web";
        const detail = b.d == null ? null : String(b.d).slice(0, 48);
        await env.DB.prepare(
          "INSERT INTO ev (ts_ms, day, market, surface, name, detail, sid) VALUES (?,?,?,?,?,?,?)"
        ).bind(Date.now(), new Date().toISOString().slice(0, 10), market(b.m), surface, name, detail, sid).run();
      }catch(e){ /* counted events are never worth a 500 */ }
      return new Response(null, { status: 204, headers: CORS });
    }

    if (url.pathname === "/api/stats") {
      // Aggregates only — every row here is a COUNT, so the response cannot carry a person.
      const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get("days") || "14", 10)));
      const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const q = sql => env.DB.prepare(sql).bind(from).all().then(r => r.results || []);
      const [funnel, daily, outcomes, sectors, markets, runs] = await Promise.all([
        q("SELECT name, COUNT(*) n, COUNT(DISTINCT sid) people FROM ev WHERE day >= ? GROUP BY name"),
        q("SELECT day, COUNT(DISTINCT sid) people, SUM(name='run') runs, SUM(name='apply') applies FROM ev WHERE day >= ? GROUP BY day ORDER BY day"),
        q("SELECT detail, COUNT(*) n FROM ev WHERE day >= ? AND name='outcome' GROUP BY detail"),
        q("SELECT detail, COUNT(*) n FROM ev WHERE day >= ? AND name='run' AND detail IS NOT NULL GROUP BY detail ORDER BY n DESC LIMIT 12"),
        q("SELECT market, COUNT(DISTINCT sid) people, COUNT(*) n FROM ev WHERE day >= ? GROUP BY market"),
        // demo_runs predates the event table and is the only history of real usage there is
        q("SELECT day, COUNT(*) scored, COUNT(DISTINCT ip_hash) ips, ROUND(SUM(cost_usd),4) usd FROM demo_runs WHERE day >= ? GROUP BY day ORDER BY day"),
      ]);
      const by = rows => Object.fromEntries(rows.map(r => [r.name, r]));
      return json(200, {
        days, from, funnel: by(funnel),
        order: ["open", "sample", "upload", "paste", "where", "remote", "run", "scored", "letter", "tailor", "apply", "save", "outcome"],
        outcome_order: OUTCOMES,
        daily, outcomes, sectors, markets, runs,
      });
    }

    if (url.pathname === "/ingest/feed" && request.method === "POST") {
      // droplet-side publisher (tools/publish_feed.py) — shared-secret gated
      if (request.headers.get("x-feed-secret") !== env.FEED_SECRET)
        return json(401, { error: "unauthorized" });
      const payload = await request.text();
      const m = market(url.searchParams.get("market"));
      const day = new Date().toISOString().slice(0, 10) + (m === "ca" ? "" : `#${m}`);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO feed (day, payload) VALUES (?,?)"
      ).bind(day, payload).run();
      return json(200, { ok: true, day, market: m });
    }

    return json(404, { error: "not_found" });
  },
};
