#!/usr/bin/env python3
"""Publish a curated, sanitized slice of JobScout's real daily sweep to the demo app.
Runs on the droplet after the 15:00Z sweep (cron 15:20Z). Reads the private
ledger READ-ONLY.

Curation: ~14 gate-passers (status discovered/scored/queued_apply) + ~8
instructive rejects (rejected_prefilter WITH a stated reason) so the demo can
show the eligibility gates working in plain language. Ships only public-safe
fields — never scores, notes, resume routing, or the model's reasoning.

Env: JSAPP_FEED_URL, JSAPP_FEED_SECRET (from tbot shared.env via cron wrapper).
"""
import json
import os
import time
import urllib.request

LEDGER = "/home/tbot/jobscout/data/jobs_ledger.json"
MAX_PASS, MAX_REJECT = 14, 8

def clean(j, jid, gate):
    return {
        "id": jid[:24],
        "title": (j.get("title") or "")[:120],
        "company": (j.get("company") or "")[:80],
        "location": (j.get("location") or "unspecified")[:80],
        "remote_policy": ("remote-listed" if not j.get("flags") else
                          ", ".join(str(f) for f in j["flags"][:2])[:60]) or "remote-listed",
        "salary": (j.get("salary") or "")[:60],
        "url": (j.get("url") or "")[:300],
        "summary": (j.get("description") or "")[:300],
        "source": (j.get("source") or "")[:40],
        "gate": gate,
    }

def main():
    url = os.environ["JSAPP_FEED_URL"]
    secret = os.environ["JSAPP_FEED_SECRET"]
    with open(LEDGER, encoding="utf-8") as f:
        ledger = json.load(f)
    jobs = ledger.get("jobs", ledger) if isinstance(ledger, dict) else {}

    passers, rejects = [], []
    per_co = {}
    for jid, j in sorted(jobs.items(), key=lambda kv: str(kv[1].get("last_seen", "")), reverse=True):
        if not isinstance(j, dict) or not j.get("title"):
            continue
        st = j.get("status", "")
        co = (j.get("company") or "?").lower()
        if per_co.get(co, 0) >= 3:
            continue
        per_co[co] = per_co.get(co, 0) + 1
        if st in ("discovered", "scored", "queued_apply", "applied") and len(passers) < MAX_PASS:
            passers.append(clean(j, jid, {"verdict": "pass",
                "reason": "cleared eligibility: remote-listed, region-eligible, title in scope"}))
        elif st == "rejected_prefilter" and j.get("prefilter_reason") and len(rejects) < MAX_REJECT:
            rejects.append(clean(j, jid, {"verdict": "reject",
                "reason": str(j["prefilter_reason"])[:160]}))
        if len(passers) >= MAX_PASS and len(rejects) >= MAX_REJECT:
            break

    payload = {
        "day": time.strftime("%Y-%m-%d", time.gmtime()),
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "postings": passers + rejects,
        "counts": {"pass": len(passers), "reject": len(rejects)},
        "note": ("Real postings from JobScout's daily sweep, sanitized. Gate verdicts are the "
                 "pipeline's own deterministic prefilter reasons. Source links go to the original boards."),
    }
    req = urllib.request.Request(
        url, json.dumps(payload).encode(), method="POST",
        headers={"content-type": "application/json", "x-feed-secret": secret,
                 "User-Agent": "jobscout-feed/1.0 (+https://tbot.trade)"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        print("publish:", r.status, r.read().decode()[:100],
              f"(pass={len(passers)} reject={len(rejects)})")

if __name__ == "__main__":
    main()
