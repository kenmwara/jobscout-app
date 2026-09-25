#!/usr/bin/env python3
"""
ev_quarantine.py - find the counted sessions that were machines, and move them out of `ev`.

Written 2026-09-25. From 09-20 the dashboard showed ~2,000 "people" a day. They were our
own checks: site/index.html posts to the LIVE worker from wherever it is served, and every
Playwright page is a fresh tab with a fresh sid, so each deploy gate (~200 pages), each
nightly --mutations run (~300-800) and each local sanity run landed as that many visitors.
The Android emulator harness did the same on the phone surface.

`ev` stores no user agent, no referrer and no address (privacy.html), so a session can only
be judged by WHEN and HOW FAST it did things. A session is a machine when any of:

  burst  5+ sessions started on the same surface within 3 minutes of it
  twin   another session on the same surface started within 3 seconds of it
  fast   it pasted/uploaded within 5 s of its first event, or ran within 10 s
  ci     it started inside a GitHub Actions run of this repo that opens the site

That is conservative toward calling things machines: a real person who happened to arrive
inside a CI window is dropped too, so the human numbers it leaves are a floor-ish estimate,
not an exact count. Rows are MOVED to `ev_machine` (same columns + the rule), never deleted,
so any call it gets wrong can be moved back:

  INSERT INTO ev (id,ts_ms,day,market,surface,name,detail,sid)
    SELECT id,ts_ms,day,market,surface,name,detail,sid FROM ev_machine WHERE sid = '...';

  python worker/tools/ev_quarantine.py            # report only
  python worker/tools/ev_quarantine.py --apply    # move the rows (remote D1)
"""
import bisect, collections, datetime as dt, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.dirname(HERE)
CI_WORKFLOWS = {"deploy site", "checks nightly"}   # the two that drive a browser at the site


def d1(sql=None, file=None):
    cmd = ["npx", "--yes", "wrangler@4.95.0", "d1", "execute", "jobscout-app", "--remote", "--json"]
    cmd += ["--file", file] if file else ["--command", sql]
    out = subprocess.run(cmd, cwd=WORKER, capture_output=True, text=True, shell=os.name == "nt", encoding="utf-8")
    if out.returncode:
        sys.exit(f"wrangler failed: {out.stderr[-800:]}")
    return None if file else json.loads(out.stdout)   # a --file run prints progress, not JSON; the counts are the proof


def ci_windows():
    out = subprocess.run(["gh", "run", "list", "--limit", "500", "--json", "workflowName,createdAt,updatedAt"],
                         cwd=WORKER, capture_output=True, text=True, encoding="utf-8")
    ms = lambda s: dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000
    return [(ms(r["createdAt"]) - 60e3, ms(r["updatedAt"]) + 60e3)
            for r in json.loads(out.stdout) if r["workflowName"] in CI_WORKFLOWS]


def classify(rows, windows):
    """rows: ev rows ordered by ts_ms. Returns {sid: rule} for the machine sessions."""
    by = collections.defaultdict(list)
    for r in rows:
        by[r["sid"]].append(r)
    starts = collections.defaultdict(list)          # surface -> sorted session start times
    for v in by.values():
        starts[v[0]["surface"]].append(v[0]["ts_ms"])
    for t in starts.values():
        t.sort()
    near = lambda ts, t, w: bisect.bisect_right(ts, t + w) - bisect.bisect_left(ts, t - w)
    out = {}
    for sid, v in by.items():
        t0, ts = v[0]["ts_ms"], starts[v[0]["surface"]]
        first = lambda *names: next((r["ts_ms"] - t0 for r in v if r["name"] in names), None)
        paste, run = first("paste", "upload"), first("run")
        if near(ts, t0, 180e3) >= 5:
            out[sid] = "burst"
        elif near(ts, t0, 3e3) >= 2:
            out[sid] = "twin"
        elif (paste is not None and paste <= 5e3) or (run is not None and run <= 10e3):
            out[sid] = "fast"
        elif any(a <= t0 <= b for a, b in windows):
            out[sid] = "ci"
    return out


def selftest():
    T = 1_758_000_000_000
    ev = lambda t, sid, n="open", s="web": {"ts_ms": T + t, "sid": sid, "name": n, "surface": s}
    rows = [ev(i * 20e3, f"b{i}") for i in range(6)]                       # six tabs in 100 s
    rows += [ev(3_600e3, "t1"), ev(3_601e3, "t2")]                          # two tabs one second apart
    rows += [ev(7_200e3, "f"), ev(7_202e3, "f", "paste")]                   # pasted 2 s after opening
    rows += [ev(9_000e3, "h"), ev(9_090e3, "h", "paste"), ev(9_150e3, "h", "run")]  # a person
    rows += [ev(12_000e3, "c")]                                             # inside a CI run
    rows += [ev(15_000e3, "a", s="android")]                                # a phone, alone
    got = classify(sorted(rows, key=lambda r: r["ts_ms"]), [(T + 11_000e3, T + 13_000e3)])
    want = {**{f"b{i}": "burst" for i in range(6)}, "t1": "twin", "t2": "twin", "f": "fast", "c": "ci"}
    assert got == want, got
    print("selftest ok")


def main():
    if "--selftest" in sys.argv:
        return selftest()
    rows = d1("SELECT id,ts_ms,day,market,surface,name,detail,sid FROM ev ORDER BY ts_ms")[0]["results"]
    bad = classify(rows, ci_windows())
    days = collections.defaultdict(lambda: collections.Counter())
    for r in rows:
        k = "machine" if r["sid"] in bad else "human"
        days[r["day"]][(k, r["name"])] += 1
        days[r["day"]][(k, "sid:" + r["sid"])] = 1
    print(f"{len(rows)} rows, {len({r['sid'] for r in rows})} sessions; machine sessions {len(bad)} "
          f"({dict(collections.Counter(bad.values()))})\n")
    print("day         human: sessions open paste run scored apply_open | machine: sessions open paste")
    for day in sorted(days):
        c = days[day]
        n = lambda k, name: c[(k, name)]
        s = lambda k: sum(1 for (kk, x) in c if kk == k and x.startswith("sid:"))
        print(f"{day}  {s('human'):5} {n('human','open'):5} {n('human','paste'):5} {n('human','run'):4} "
              f"{n('human','scored'):5} {n('human','apply_open'):5}   | {s('machine'):6} {n('machine','open'):5} {n('machine','paste'):5}")
    if "--apply" not in sys.argv or not bad:
        print("\nnothing to move" if not bad else "\nreport only; --apply moves the machine rows to ev_machine")
        return
    by_rule = collections.defaultdict(list)
    for sid, rule in bad.items():
        by_rule[rule].append(sid)
    sql = []
    for rule, sids in by_rule.items():
        for i in range(0, len(sids), 200):
            inl = ",".join(f"'{s}'" for s in sids[i:i + 200])     # sids are [a-z0-9]{6,24}, checked at ingest
            sql.append(f"INSERT OR IGNORE INTO ev_machine (id,ts_ms,day,market,surface,name,detail,sid,rule) "
                       f"SELECT id,ts_ms,day,market,surface,name,detail,sid,'{rule}' FROM ev WHERE sid IN ({inl});")
            sql.append(f"DELETE FROM ev WHERE sid IN ({inl}) AND id IN (SELECT id FROM ev_machine);")
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(sql))
    count = lambda: d1("SELECT (SELECT COUNT(*) FROM ev) ev, (SELECT COUNT(*) FROM ev_machine) machine")[0]["results"][0]
    before, moving = count(), sum(1 for r in rows if r["sid"] in bad)
    d1(file=f.name)
    os.unlink(f.name)
    after = count()
    print(f"\nmoved {after['machine'] - before['machine']} rows (expected {moving}). "
          f"ev {before['ev']} -> {after['ev']}, ev_machine {before['machine']} -> {after['machine']}")
    assert after["machine"] - before["machine"] == moving, "the move does not reconcile"


if __name__ == "__main__":
    main()
