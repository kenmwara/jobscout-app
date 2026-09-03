# JobScout App

**AI job-search copilot — live interactive demo.** Real postings from a real daily
sweep, scored live by an LLM against your profile, with the reasoning shown and
the costs on the screen.

Built from [the private JobScout pipeline](https://tbot.trade/portfolio) that has
run the author's own job search in production since July 2026.

- `worker/` — Cloudflare Worker API: Haiku-class scoring behind a per-IP rate
  limit and a global daily budget breaker (over budget → cached showcase run,
  honestly labeled). D1-backed.
- `site/` — the demo UI (Cloudflare Pages).
- `tools/publish_feed.py` — droplet cron publishing a sanitized slice of the
  real daily sweep. No scraped bodies, no private data.
- `docs/ARCHITECTURE.md` — the design decisions.

**Principles inherited from the parent pipeline:** honest scoring (most postings
are a poor fit and the model says so), eligibility gates explained in plain
language, and no auto-submission anywhere — a human clicks every Submit.

*Status: foundation (API live, feed live). UI in progress.*
