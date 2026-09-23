/**
 * sweeps.js — a scored run, kept and named by the résumé that earned it.
 *
 * Ken, 2026-09-23: "There's still no way to save a matched sweep, but I can
 * save individual jobs through the heart" and, naming the hard part himself:
 * "Name the sweep by the resume that earned it as one name could have
 * different resumes, thus different sweeps e.g. I've got three resumes!"
 *
 * WHY THE NAME CANNOT BE READ OFF THE RÉSUMÉ. The résumé text is never written
 * to storage — that is the promise check_resume_privacy exists to hold — so
 * there is nothing on disk to name a sweep from. And the obvious derivation
 * would not work anyway: the first line of all three of his résumés says
 * "Ken Kariuki". What distinguishes them is what they are AIMED at, which is a
 * judgement only he can make.
 *
 * So the reader names it once, and the FINGERPRINT does the remembering. Every
 * run already carries `fp` — a hash of the résumé, not the résumé — so the
 * second sweep scored from the same résumé arrives already named, and a sweep
 * from a different one asks. Three résumés, three names, typed three times in
 * total.
 *
 * The name is the reader's own words and is kept in this browser. It is capped
 * at NAME_MAX because a text box beside a résumé is a text box someone will
 * paste a résumé into, and this one must never become the place the résumé
 * ends up after everywhere else stopped keeping it.
 */
const JSSweeps = (() => {
  const KEY = "jobscout.sweeps";
  const NAMES = "jobscout.sweepnames";
  const CAP = 12;            // sweeps kept; the oldest falls off
  const NAME_MAX = 60;

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

  const all = () => (read(KEY)?.items || []).filter(s => s && s.id);
  const names = () => read(NAMES)?.items || {};

  /** The name this résumé's sweeps were given last time, or "". */
  const nameFor = (fp) => (fp && names()[fp]) || "";

  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

  const remember = (fp, name) => {
    const n = clean(name);
    if (!fp || !n) return n;
    const m = names(); m[fp] = n;
    write(NAMES, { v: 1, items: m });
    return n;
  };

  /**
   * Keep this run. `run` is the record index.html already writes to
   * jobscout.run — same shape, so nothing has to be rebuilt to save one.
   * Saving twice from the same résumé on the same day REPLACES rather than
   * stacks: two identical rows an hour apart is a list nobody can read.
   */
  const save = (run, name) => {
    if (!run?.scored?.length) return null;
    const n = remember(run.fp, name) || clean(name) || "Unnamed résumé";
    const rec = {
      id: `${run.fp || "x"}-${run.day || ""}-${run.market || ""}`,
      name: n, fp: run.fp || "", day: run.day || "", market: run.market || "",
      note: run.note || "", at: new Date().toISOString().slice(0, 10),
      scored: run.scored,
    };
    const rest = all().filter(s => s.id !== rec.id);
    write(KEY, { v: 1, items: [rec, ...rest].slice(0, CAP) });
    return rec;
  };

  /** Rename every sweep from this résumé at once — they are one résumé's runs. */
  const rename = (fp, name) => {
    const n = remember(fp, name);
    if (!n) return;
    write(KEY, { v: 1, items: all().map(s => (s.fp === fp ? { ...s, name: n } : s)) });
  };

  const remove = (id) => write(KEY, { v: 1, items: all().filter(s => s.id !== id) });

  /** Is this exact run already kept? Drives the control's word. */
  const saved = (run) => !!run?.scored?.length
    && all().some(s => s.id === `${run.fp || "x"}-${run.day || ""}-${run.market || ""}`);

  return { all, nameFor, save, rename, remove, saved, NAME_MAX, CAP };
})();
if (typeof window !== "undefined") window.JSSweeps = JSSweeps;
