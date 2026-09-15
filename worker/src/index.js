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
    headers: { "content-type": "application/json", ...CORS },
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
    m === "ke" ? RUBRIC_KE : "",
    'Reply ONLY with JSON: {"fit": <int>, "verdict": "<one sentence>",',
    '"strongest": "<the single best alignment>", "weakest": "<the single biggest gap>"}',
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
  return { key, spent, profile, p };
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
const inProfile = (profile, phrase) => phrase.trim().length >= 8 && squash(profile).includes(squash(phrase));

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
      if (await rateLimited(env, key))
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
      const { profile, p } = g;
      const d = await draft(env, 550,
        "Draft a short, specific cover letter (150-200 words) grounded ONLY in the " +
        "candidate profile provided — never invent experience, credentials, or claims. " +
        "Plain professional voice, no flattery padding, no 'I am writing to express'. " +
        "Open with the single strongest genuine alignment. Sign off as 'the candidate'.",
        `PROFILE:\n${profile}\n\nPOSTING:\n${postingText(p)}`);
      if (d instanceof Response) return d;
      await recordRun(env, g.key, d.usage.input_tokens, d.usage.output_tokens, d.cost);
      return json(200, { letter: d.text, meta: meta(d, g.spent) });
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
