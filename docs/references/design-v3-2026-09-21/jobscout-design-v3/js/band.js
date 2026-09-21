/* ===========================================================================
   band.js — the ONE place score→band lives, on every platform.

   The design never re-derives a band. The scorer emits one; this module is
   the shared contract so the web, Android and iOS cannot disagree about what
   a 69 is.

   THE LAW THE UI DEPENDS ON: the number of lit dots IS the band, not the
   score. A 79 and a 65 are both PING and both light six. The score is the
   numeral; the band is the shape. They are two readings of one thing and they
   must never be computed separately.
   =========================================================================== */

/** Lit dots per band. Mirrors tokens.json → rose.litByBand. */
export const LIT = Object.freeze({ auto: 8, ping: 6, unsure: 5, nearmiss: 3 });

/** Human labels. NEAR-MISS reads with a space; the key never changes. */
export const LABEL = Object.freeze({
  auto: 'AUTO', ping: 'PING', unsure: 'UNSURE', nearmiss: 'NEAR MISS',
});

/**
 * THRESHOLDS — needs Ken's confirmation against the scorer.
 *
 * Derived from the observed mockup data, which is the only evidence available
 * from outside the scorer: 87 → AUTO, 70 → PING, 68 → UNSURE, 28 → NEAR-MISS.
 * That fixes one boundary exactly (PING/UNSURE lies between 68 and 70) and
 * leaves the other two inferred. If the scorer disagrees, change it HERE and
 * nowhere else.
 */
export const THRESHOLD = Object.freeze({ auto: 80, ping: 69, unsure: 45 });

export function bandFor(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  if (score >= THRESHOLD.auto)   return 'auto';
  if (score >= THRESHOLD.ping)   return 'ping';
  if (score >= THRESHOLD.unsure) return 'unsure';
  return 'nearmiss';
}

/**
 * The action a band earns. This is the honesty law expressed as a verb:
 * a NEAR-MISS is never offered "Prepare application" as though it were a
 * match, and an AUTO is never hedged.
 */
export function actionFor(band) {
  switch (band) {
    case 'auto':   return { primary: 'Prepare application', tone: 'go' };
    case 'ping':   return { primary: 'Prepare application', tone: 'go' };
    case 'unsure': return { primary: 'Prepare application', tone: 'qualified' };
    case 'nearmiss': return { primary: 'Apply anyway',      tone: 'stretch' };
    default:       return { primary: 'Score this against me', tone: 'unscored' };
  }
}

/**
 * Which prepare step leads, given the band.
 *
 * PROPOSAL, not a shipped rule — see docs/DECISIONS.md D4. At NEAR-MISS or
 * UNSURE the resume is the gap, so aiming it is the higher-value move and the
 * letter waits. At PING or AUTO the resume is already close enough. The three
 * cards keep a FIXED order either way: a list that reorders itself is
 * disorienting. Only the single filled button moves.
 */
export function leadStep(band) {
  return (band === 'nearmiss' || band === 'unsure') ? 'resume' : 'letter';
}

/** Relative age. Nothing is returned when the posting has no date — an
 *  invented "today" is a claim, and law 12 forbids claims. */
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
