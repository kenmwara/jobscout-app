#!/usr/bin/env python3
"""Publish a sanitized slice of JobScout's real daily sweep to the demo app.
Runs on the droplet after the 15:00Z sweep (cron 15:20Z). Reads the private
ledger READ-ONLY; ships only public-safe fields (title/company/location/
remote-policy/source URL + a one-line summary). Never ships scores, notes,
or anything profile-derived.
Env: JSAPP_FEED_URL, JSAPP_FEED_SECRET (from tbot shared.env via cron wrapper).
"""
import json
import os
import time
import urllib.request

LEDGER = "/home/tbot/jobscout/data/jobs_ledger.json"
MAX_POSTINGS = 40

def main():
    url = os.environ["JSAPP_FEED_URL"]
    secret = os.environ["JSAPP_FEED_SECRET"]
    with open(LEDGER, encoding="utf-8") as f:
        ledger = json.load(f)
    jobs = ledger.get("jobs", ledger) if isinstance(ledger, dict) else {}
    day_ago = time.time() - 86400 * 2
    rows = []
    for jid, j in jobs.items():
        if not isinstance(j, dict):
            continue
        ts = j.get("discovered_ts") or j.get("first_seen") or 0
        if isinstance(ts, str):
            ts = 0  # date-strings: keep (recent ledger is fresh post-rebuild)
        if ts and ts < day_ago:
            continue
        rows.append({
            "id": jid[:24],
            "title": (j.get("title") or "")[:120],
            "company": (j.get("company") or "")[:80],
            "location": (j.get("location") or j.get("loc") or "unspecified")[:80],
            "remote_policy": (j.get("remote") or j.get("remote_policy") or "remote-listed")[:60]
                if not isinstance(j.get("remote"), bool)
                else ("remote" if j.get("remote") else "on-site"),
            "url": (j.get("url") or "")[:300],
            "summary": (j.get("summary") or j.get("description") or "")[:280],
            "source": (j.get("source") or "")[:40],
        })
        if len(rows) >= MAX_POSTINGS:
            break
    payload = {
        "day": time.strftime("%Y-%m-%d", time.gmtime()),
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "postings": rows,
        "note": "Real postings from JobScout's daily sweep, sanitized. Source links go to the original boards.",
    }
    req = urllib.request.Request(
        url, json.dumps(payload).encode(), method="POST",
        headers={"content-type": "application/json", "x-feed-secret": secret,
                 "User-Agent": "jobscout-feed/1.0 (+https://tbot.trade)"},  # CF fronts 403 python-urllib default UA
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        print("publish:", r.status, r.read().decode()[:120], f"({len(rows)} postings)")

if __name__ == "__main__":
    main()
