/**
 * JobScout App — API Worker.
 * Public AI endpoint with two non-negotiable guards:
 *   1. per-IP sliding-window rate limit (D1)
 *   2. global daily budget breaker (D1) → cached showcase results when spent
 * Model: Haiku-class only. Prompts live server-side. Pasted resumes are
 * processed in-memory and never stored or logged.
 */

const MODEL = "claude-haiku-4-5-20251001";
const MAX_SCORE_TOKENS = 400;
const IP_RUNS_PER_HOUR = 6;
const DAILY_BUDGET_USD = 3.0;
// Haiku pricing (USD per MTok) — used for the live cost counter + breaker math.
const PRICE_IN = 1.0, PRICE_OUT = 5.0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
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

async function scoreOne(env, profile, posting) {
  const system = [
    "You are JobScout's scoring rubric. Score fit 0-100 for THIS candidate profile",
    "against THIS posting. Anchors: clean title+seniority+remote-eligibility match",
    "baselines ~70; niche alignment is a +5..15 bonus, never a requirement;",
    "unspecified salary is neutral. Be honest — most postings are a poor fit and",
    "should score low, with the reason stated plainly.",
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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json(200, { ok: true, model: MODEL, budget_usd: DAILY_BUDGET_USD });
    }

    if (url.pathname === "/api/feed") {
      const { results } = await env.DB.prepare(
        "SELECT payload FROM feed ORDER BY day DESC LIMIT 1"
      ).all();
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
      const postings = Array.isArray(body.postings) ? body.postings.slice(0, 5) : [];
      if (!profile || !postings.length)
        return json(400, { error: "bad_request", detail: "profile + postings[] required" });

      const out = [];
      let tIn = 0, tOut = 0, cost = 0;
      for (const p of postings) {
        const s = await scoreOne(env, profile, p);
        tIn += s.usage.input_tokens; tOut += s.usage.output_tokens; cost += s.cost;
        out.push({ id: p.id, fit: s.fit, verdict: s.verdict, strongest: s.strongest, weakest: s.weakest });
      }
      await recordRun(env, key, tIn, tOut, cost);
      return json(200, {
        scores: out,
        meta: { model: MODEL, tokens_in: tIn, tokens_out: tOut, cost_usd: +cost.toFixed(5),
                day_spend_usd: +(spent + cost).toFixed(4), day_budget_usd: DAILY_BUDGET_USD },
      });
    }

    if (url.pathname === "/ingest/feed" && request.method === "POST") {
      // droplet-side publisher (tools/publish_feed.py) — shared-secret gated
      if (request.headers.get("x-feed-secret") !== env.FEED_SECRET)
        return json(401, { error: "unauthorized" });
      const payload = await request.text();
      const day = new Date().toISOString().slice(0, 10);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO feed (day, payload) VALUES (?,?)"
      ).bind(day, payload).run();
      return json(200, { ok: true, day });
    }

    return json(404, { error: "not_found" });
  },
};
