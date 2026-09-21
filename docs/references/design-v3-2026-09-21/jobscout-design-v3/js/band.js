/* ===========================================================================
   band.js — score → band, and what a band earns.

   ---------------------------------------------------------------------------
   TWO CORRECTIONS THIS FILE CARRIES, BOTH OF THEM MINE.

   1. THE THRESHOLDS WERE WRONG. An earlier draft inferred `ping 69` and
      `unsure 45` from four observed scores. Confirmed from the code
      2026-09-21: they are 70 and 55. `auto 80` was right. The inference
      method was sound for `ping` (the evidence bounded it to 68 < x ≤ 70 and
      I took the midpoint, which is a classifier, not a boundary) and was a
      pure guess for `unsure`, where no observation existed between 28 and 68.
      A guess should have been labelled as one.

   2. I SAID THE SCORER EMITS A BAND. IT DOES NOT. It emits `fit` only, and
      every client — web, worker, mockup, Android, iOS — derives the band
      itself. So the previous version of this file, which took the scorer's
      band as authoritative and logged disagreement, described a system that
      does not exist. It was a proposal wearing a description's clothes.

   What follows from (2) is the useful part:
   ---------------------------------------------------------------------------
   There are FIVE copies of the threshold table in the product today, and
   nothing holds them together. That is the same failure the band COLOURS had
   before v3, and it takes the same fix: the numbers live in tokens.json and
   are generated into tokens.css, Tokens.kt and Tokens.swift. Five copies
   become one source with five readers, and `generate.mjs --check` fails the
   build if any of them is edited by hand.

   This module reads the generated CSS custom properties at runtime, so the
   web client cannot hold a stale copy either.

   THE LAW THE UI DEPENDS ON: the number of lit dots IS the band, not the
   score. A 79 and a 70 are both PING and both light six. The score is the
   numeral; the band is the shape. Two readings of one thing.
   =========================================================================== */

/** Lit dots per band. Mirrors tokens.json → band.litByBand. */
export const LIT = Object.freeze({ auto: 8, ping: 6, unsure: 5, nearmiss: 3 });

/** NEAR-MISS reads with a space; the key never changes. */
export const LABEL = Object.freeze({
  auto: 'AUTO', ping: 'PING', unsure: 'UNSURE', nearmiss: 'NEAR MISS',
});

/* CONFIRMED from the code 2026-09-21, identical on all five clients. These
   literals are the fallback for a non-browser context (tests, SSR); in a
   browser the generated custom properties win, so this file cannot drift
   from tokens.json even if someone edits it. */
const FALLBACK = { auto: 80, ping: 70, unsure: 55 };

function fromCss() {
  if (typeof document === 'undefined') return null;
  const s = getComputedStyle(document.documentElement);
  const n = k => {
    const v = parseFloat(s.getPropertyValue(`--threshold-${k}`));
    return Number.isFinite(v) ? v : null;
  };
  const t = { auto: n('auto'), ping: n('ping'), unsure: n('unsure') };
  return (t.auto && t.ping && t.unsure) ? t : null;
}

let _t = null;
export function thresholds() { return (_t ??= fromCss() ?? FALLBACK); }

/**
 * score → band. The ONE derivation on the web client.
 *
 * Note this is a REAL derivation, not a display of something the scorer sent.
 * If the worker ever starts emitting a band, this becomes a check rather than
 * a source — see `reconcile()` below, which is written for that day and is
 * deliberately not wired up yet.
 */
export function bandFor(fit) {
  if (typeof fit !== 'number' || Number.isNaN(fit)) return null;
  const t = thresholds();
  if (fit >= t.auto)   return 'auto';
  if (fit >= t.ping)   return 'ping';
  if (fit >= t.unsure) return 'unsure';
  return 'nearmiss';
}

/**
 * For the day the worker emits a band of its own.
 *
 * NOT WIRED UP. It is here so that the move is a one-line change at the call
 * site rather than a redesign, and so the intent is recorded: when the server
 * has an opinion, the server wins and the client's derivation becomes a
 * tripwire that reports drift instead of silently overruling it.
 *
 * This matters more than it looks. A band may not stay a pure function of
 * `fit` — the product's own evidence lines talk about a location rule
 * passing, and the moment any such rule can demote a posting, a client that
 * re-derives from the number alone will silently contradict the server.
 */
export function reconcile(row, report = (m, d) => console.warn(`[band] ${m}`, d)) {
  const given = typeof row?.band === 'string' ? row.band.toLowerCase() : null;
  const fit = typeof row?.fit === 'number' ? row.fit
            : typeof row?.score === 'number' ? row.score : null;
  if (given && !(given in LIT)) { report('unknown band from server', { given, fit }); return bandFor(fit); }
  if (given) {
    const implied = bandFor(fit);
    if (fit !== null && implied !== given) report('server/client disagreement — server wins', { fit, server: given, implied });
    return given;
  }
  return bandFor(fit);
}

/**
 * The action a band earns — the honesty law expressed as a verb. A NEAR-MISS
 * is never offered "Prepare application" as though it were a match, and an
 * AUTO is never hedged.
 */
export function actionFor(band) {
  switch (band) {
    case 'auto':
    case 'ping':     return { primary: 'Prepare application', tone: 'go' };
    case 'unsure':   return { primary: 'Prepare application', tone: 'qualified' };
    case 'nearmiss': return { primary: 'Apply anyway',        tone: 'stretch' };
    default:         return { primary: 'Score this against me', tone: 'unscored' };
  }
}

/**
 * Which prepare step leads. PROPOSAL — see docs/DECISIONS.md D4.
 *
 * The three cards keep a FIXED order; only the single filled button moves.
 */
export function leadStep(band) {
  return (band === 'nearmiss' || band === 'unsure') ? 'resume' : 'letter';
}

/** Relative age. Nothing when the posting has no date: an invented "today"
 *  is a claim, and law 12 forbids claims. */
export function whenOf(postedAt, now = new Date()) {
  if (!postedAt) return null;
  const d = new Date(postedAt);
  if (Number.isNaN(+d)) return null;
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7)  return `${days} days ago`;
  if (days < 14) return 'last week';
  return `${Math.floor(days / 7)} weeks ago`;
}
