# JobScout App — Architecture

**Purpose:** portfolio showcase of AI-app craft. A hiring manager lands on a URL and, inside 90 seconds, watches a real LLM score real job postings against a real profile — with the reasoning visible, the eligibility gates explained, and the costs controlled. Everything demonstrated is genuinely how the private pipeline has run in production since July 2026.

**Non-goals:** revenue, accounts-at-scale, auto-apply (the private pipeline's hard rule — a human clicks every Submit — is a design principle here too, and part of the story).

## System shape

```
                     visitor
                        │
        Cloudflare Pages (site/) — the demo UI
                        │  POST /api/score  · GET /api/feed
        Cloudflare Worker (worker/) — the AI edge
          ├─ guard 1: per-IP rate limit (D1 sliding window)
          ├─ guard 2: global daily budget breaker (D1 counter;
          │            over cap → serve cached showcase results)
          ├─ Claude (Haiku-class) — scoring w/ the honest rubric
          └─ D1 — demo telemetry, cached results, daily feed
                        ▲
        droplet cron (tools/publish_feed.py) — sanitizes the
        pipeline's real daily sweep into feed.json (title/company/
        location/remote-policy/source link; no scraped bodies)
```

## The demo flow (the 90 seconds)

1. Land: one sentence of what this is + a live counter of today's real sweep (n postings, n sources) — proof it's alive, not a mock.
2. Pick a demo profile (three personas: Canada-based platform engineer, US new-grad, EU data scientist) **or paste your own resume text** (processed in-memory, never stored — stated inline).
3. Watch postings stream through the gates: eligibility verdicts first (deterministic, instant, explained — "US-only remote: rejected for a Canada-based candidate"), then LLM scoring on the survivors with the rubric's reasoning rendered per posting.
4. Top match: one-click grounded cover-letter draft (Claude, streaming).
5. Footer tells the truth: what model, what it cost (live cents counter), what's cached, link to the code.

## Cost + abuse model (public AI endpoint, no auth)

- Haiku-class model only; max_tokens tight; prompts server-side (never client-editable).
- Per-IP: N scoring runs per hour (D1 sliding window on hashed IP).
- Global: daily spend cap in D1; breaker flips the demo to cached precomputed results with an honest "live budget spent for today" banner — the breaker itself is a showcase feature (screenshot-worthy).
- Pasted resumes: in-memory only, size-capped, stripped to text, never logged, never stored — privacy note inline.

## Repo conventions

- `site/` — Pages app, single self-contained build (design pass: Impeccable, JobScout purple-compass brand).
- `worker/` — the API Worker (wrangler), D1-backed guards.
- `tools/` — droplet-side feed publisher (Python, runs beside the private pipeline; publishes sanitized JSON only).
- This repo goes **public** at polish time — code quality is part of the exhibit.

## Honesty rules (inherited from the fleet)

Numbers shown are measured or labeled. The demo scores REAL postings from the real daily sweep. Nothing in the UI claims capabilities the private pipeline doesn't have.
