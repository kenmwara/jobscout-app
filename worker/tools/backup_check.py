# -*- coding: utf-8 -*-
"""
backup_check — take a backup, then RESTORE it and prove it came back.

    python tools/backup_check.py <d1-database-name> [--out DIR]

    python tools/backup_check.py jobscout-app --out ../backups

WHY THIS EXISTS. An export nobody has restored is not a backup. Every part of
this that matters is after the export: the dump is loaded into a scratch
database and read back, and the row counts are compared table by table against
the source. A dump that will not load, or that loads short, fails here rather
than on the day it is needed.

WHAT IT DOES
  1. `wrangler d1 export --remote` the whole database to a timestamped .sql
  2. count every table's rows in the LIVE database, over the API
  3. load the dump into an empty throwaway database, with sqlite3
  4. count every table's rows there
  5. compare, table by table, and fail on the first difference

The restore goes into a throwaway file and is read back with sqlite3, so
nothing is written to production and no second database is needed. It starts
EMPTY, so a dump that restores short cannot hide behind rows that were already
there.

It does NOT restore through `wrangler d1 execute --file`. That path has a hard
per-statement size limit, and a single wide row will refuse to load with
`statement too long: SQLITE_TOOBIG` even though the dump itself is perfectly
valid. sqlite3 has no such limit. This database holds the sweep feed as one
JSON payload per day, which is exactly the shape that trips it.

It exits non-zero on any difference, so a scheduled run that goes quiet is a
failure rather than a silence.
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import sqlite3
import tempfile

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []


def say(s):
    try:
        sys.stdout.write(s + "\n")
    except Exception:
        sys.stdout.write("".join(c if ord(c) < 128 else "-" for c in s) + "\n")
    sys.stdout.flush()


def wr(*args, timeout=900):
    """wrangler, from the app directory, with its output captured."""
    cmd = ["npx", "wrangler", *args]
    r = subprocess.run(cmd, cwd=APP, capture_output=True, timeout=timeout,
                       shell=(os.name == "nt"))
    return r.returncode, r.stdout.decode("utf-8", "replace"), r.stderr.decode("utf-8", "replace")


def rows(db, sql, local):
    """Run one query and return the parsed results, or None."""
    code, out, err = wr("d1", "execute", db, "--local" if local else "--remote",
                        "--json", "--command", sql)
    if code != 0:
        return None
    try:
        # wrangler prints a banner before the JSON on some versions
        i = out.index("[")
        return json.loads(out[i:])[0]["results"]
    except Exception:
        return None


def counts(db, local):
    """{table: row count} for every user table."""
    t = rows(db, "SELECT name FROM sqlite_master WHERE type='table' "
                 "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name", local)
    if t is None:
        return None
    out = {}
    for r in t:
        name = r["name"]
        # [brackets], not "quotes": this goes through cmd.exe on Windows, which
        # eats the inner double quotes and leaves an unparseable statement.
        c = rows(db, f"SELECT COUNT(*) AS n FROM [{name}]", local)
        if c is None:
            return None
        out[name] = c[0]["n"]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("database")
    ap.add_argument("--out", default=os.path.join(APP, "..", "backups"))
    ap.add_argument("--verify", metavar="FILE",
                    help="check an EXISTING dump instead of taking a new one — "
                         "so last week's backup can be proven without waiting for the day it is needed")
    a = ap.parse_args()

    outdir = os.path.abspath(a.out)
    os.makedirs(outdir, exist_ok=True)

    # 1. the live counts, BEFORE the export, so a dump that misses a table is caught
    say("reading the live database …")
    live = counts(a.database, local=False)
    if live is None:
        say("  FAIL  could not read the live database — is CLOUDFLARE_API_TOKEN set?")
        raise SystemExit(1)
    say(f"  live: {sum(live.values())} rows across {len(live)} table(s)")

    # 2. export
    stamp = subprocess.run(["git", "log", "-1", "--format=%cd", "--date=format:%Y%m%d-%H%M%S"],
                           cwd=APP, capture_output=True, shell=(os.name == "nt")
                           ).stdout.decode().strip() or "export"
    if a.verify:
        dump = os.path.abspath(a.verify)
        say(f"verifying the existing {os.path.basename(dump)} …")
        if not os.path.exists(dump):
            say("  FAIL  no such file")
            raise SystemExit(1)
    else:
        dump = os.path.join(outdir, f"{a.database}-{stamp}.sql")
        say(f"exporting to {os.path.basename(dump)} …")
        code, out, err = wr("d1", "export", a.database, "--remote", "--output", dump)
        if code != 0 or not os.path.exists(dump):
            say("  FAIL  export failed: " + (err or out)[-300:])
            raise SystemExit(1)
    size = os.path.getsize(dump)
    say(f"  {size} bytes")
    if size == 0:
        fails.append("the export is empty")

    # 3. RESTORE, into a throwaway SQLite file, with Python's own driver.
    #
    # Not `wrangler d1 execute --file`. That path has a hard per-statement size
    # limit: a single wide row refuses to load with `statement too long:
    # SQLITE_TOOBIG` even when the dump is perfectly valid. This database keeps
    # a whole day's sweep as one JSON payload, which is that shape. Measured on
    # the sibling S-Ryder database, where a 138KB row failed on its own.
    #
    # The dump itself is valid, which is what this step proves. sqlite3 has no
    # such limit, so it loads the file into an empty database and reads it back.
    say("restoring the dump into an empty database …")
    tmp = tempfile.mkdtemp(prefix="sr-restore-")
    try:
        con = sqlite3.connect(os.path.join(tmp, "restored.sqlite"))
        con.executescript(io.open(dump, encoding="utf-8").read())
        con.commit()
        back = {}
        for (name,) in con.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"):
            back[name] = con.execute(f"SELECT COUNT(*) FROM [{name}]").fetchone()[0]
        # the photographs are the reason the dump is large; prove the bytes survived
        try:
            biggest = con.execute("SELECT MAX(LENGTH(payload)) FROM feed").fetchone()[0] or 0
        except sqlite3.Error:
            biggest = 0
        con.close()
    except sqlite3.Error as e:
        # CLAMPED. sqlite quotes the offending token back at you, and in this
        # database the offending token is a base64 photograph — the first run
        # of this printed 77KB of it. A failure nobody can read is a failure
        # twice.
        msg = " ".join(str(e).split())
        say(f"  FAIL  the dump would not load: {msg[:160]}" + (" …" if len(msg) > 160 else ""))
        raise SystemExit(1)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    say(f"  restored: {sum(back.values())} rows across {len(back)} table(s)"
        + (f", largest single row {biggest} bytes" if biggest else ""))

    # 5. compare, table by table
    say("")
    say(f"  {'table':<20} {'live':>8} {'restored':>10}")
    for t in sorted(set(live) | set(back)):
        l, b = live.get(t), back.get(t)
        mark = "ok " if l == b else "DIFF"
        say(f"  {mark} {t:<16} {str(l):>8} {str(b):>10}")
        if l != b:
            fails.append(f"{t}: {l} rows live, {b} restored")

    say("")
    say(f"backup_check: {os.path.basename(dump)} ({size} bytes), {len(live)} table(s) compared")
    for f in fails:
        say("  FAIL  " + f)
    say("VERDICT: " + ("PASS — the backup restores" if not fails else f"FAIL ({len(fails)})"))
    raise SystemExit(1 if fails else 0)


if __name__ == "__main__":
    main()
