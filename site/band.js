/* THE BAND CONTRACT (design system v3, stage 3) - the ONE place score -> band
   lives on the web. The scorer emits `fit` only; every client derives the
   band, so the threshold table had five copies (index, saved, apply, the
   mockup, rose.js) with nothing holding them together. Now tokens.json
   generates --threshold-* into tokens.css and this reads them at runtime,
   with the same table as the fallback for a page that has no stylesheet yet.

   THE LAW THE UI DEPENDS ON: the number of lit dots IS the band, not the
   score. A 79 and a 65 are both PING and both light six.

   The product's band KEY is "near-miss" (data-band, the palette check, both
   apps); the generated tokens spell the same band "nearmiss". TOKEN maps one
   to the other so no call site has to know.

   Classic script AND CommonJS: the pages load it with <script>, the checks
   require() it from Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JSBand = api;
})(typeof self !== "undefined" ? self : this, function () {
  const LIT = Object.freeze({ auto: 8, ping: 6, unsure: 5, "near-miss": 3 });
  const LABEL = Object.freeze({ auto: "AUTO", ping: "PING", unsure: "UNSURE", "near-miss": "NEAR MISS" });
  const TOKEN = Object.freeze({ auto: "auto", ping: "ping", unsure: "unsure", "near-miss": "nearmiss" });
  const FALLBACK = Object.freeze({ auto: 80, ping: 70, unsure: 55 });
  let _t = null;
  function fromCss() {
    if (typeof getComputedStyle !== "function" || typeof document === "undefined") return null;
    const s = getComputedStyle(document.documentElement), t = {};
    for (const k of Object.keys(FALLBACK)) {
      const v = parseFloat(s.getPropertyValue(`--threshold-${k}`));
      if (!Number.isFinite(v)) return null;
      t[k] = v;
    }
    return t;
  }
  function thresholds() { return _t || (_t = fromCss() || FALLBACK); }
  function bandFor(fit) {
    const f = typeof fit === "number" ? fit : parseFloat(fit);
    if (!Number.isFinite(f)) return null;
    const t = thresholds();
    return f >= t.auto ? "auto" : f >= t.ping ? "ping" : f >= t.unsure ? "unsure" : "near-miss";
  }
  /* The honesty law as a verb: a NEAR-MISS is never offered "Prepare
     application" as though it were a match, and an AUTO is never hedged. */
  function actionFor(band) {
    switch (band) {
      case "auto": case "ping": return { primary: "Prepare application", tone: "go" };
      case "unsure": return { primary: "Prepare application", tone: "qualified" };
      case "near-miss": return { primary: "Apply anyway", tone: "stretch" };
      default: return { primary: "Score against my resume", tone: "unscored" };
    }
  }
  /* D4 (Ken, 2026-09-21): at NEAR-MISS or UNSURE aiming the resume is the
     higher-value move, so it leads and the letter waits. The three steps keep
     a FIXED order; only the single filled button moves. */
  function leadStep(band) { return band === "near-miss" || band === "unsure" ? "resume" : "letter"; }
  /* Relative age; nothing when the source publishes no date - an invented
     "today" is a claim, and law 12 forbids claims. */
  function whenOf(postedAt, now) {
    if (!postedAt) return null;
    const d = new Date(postedAt); if (Number.isNaN(+d)) return null;
    const days = Math.floor(((now || new Date()) - d) / 864e5);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 14) return "last week";
    return `${Math.floor(days / 7)} weeks ago`;
  }
  return { LIT, LABEL, TOKEN, thresholds, bandFor, actionFor, leadStep, whenOf };
});
