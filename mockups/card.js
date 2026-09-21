/* Copied from the stage-1 pack with the `export` keywords removed, so the
   mockup (a single classic-script page) can call it. Nothing else changed.
   ===========================================================================
   JobScout — the rose, and the card's Stage 1 behaviour.
   Stage 1 of docs/BUILD-ORDER.md. Drop into site/app.js (or import it).

   Stage 1 only LIGHTS the rose. Stage 2 makes it ARRIVE — the staggered
   fill, the counting numeral, the AUTO pulse. Nothing here schedules a
   frame; the CSS transitions in card.css do all the moving.

   WHY THE SVG IS GENERATED AND NOT PASTED
   Law 9 fixes the geometry: ring r=11 in a 24 box, eight bearings clockwise
   from 000, dot radius r = 2.275 + 0.2944 * i. Every hand-copied rose in the
   repo is a chance for one of those numbers to drift by a decimal, and
   check_rose.mjs asserts them to 0.01. One generator, one truth.

   THE TWO LAWS THIS FILE ENFORCES
   1. The lit count IS the band.  AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3.
   2. An unlit dot is NEVER a band colour. NEAR-MISS's band IS the neutral,
      so a band-coloured track leaves lit and unlit identical but for
      opacity. That is a --rose-empty job and it lives in card.css.
   =========================================================================== */

/* --- law 9, canonical. Do not "fix" the two largest dots touching at
       270/315 — they touch on purpose. ------------------------------------ */
const RING = 11;
const BOX = 12;
const R0 = 2.275;
const DR = 0.2944;

/* The DISPLAY CUT. Computed from the true bbox (x −3.041…25.864,
   y −1.275…26.453) plus 1.2 clear space, squared. `0 0 24 24` clips every
   outer dot — check_rose.mjs fails anything ≥48px that is not this string,
   verbatim. */
const ROSE_VIEWBOX = '-4.2416 -3.0639 31.3054 31.3054';

/* Law: the number of lit dots IS the band. */
const BAND_DOTS = Object.freeze({
  auto: 8,
  ping: 6,
  unsure: 5,
  near: 3,
});

const NS = 'http://www.w3.org/2000/svg';

/** One bearing's geometry. i = 0..7, clockwise from 000 (straight up). */
function bearing(i) {
  const a = (i * Math.PI) / 4 - Math.PI / 2;
  return {
    cx: +(BOX + RING * Math.cos(a)).toFixed(3),
    cy: +(BOX + RING * Math.sin(a)).toFixed(3),
    r: +(R0 + DR * i).toFixed(3),
  };
}

/**
 * Build a rose.
 * @param {number} size  rendered px. 52 desktop, 44 at 390pt. Both are ≥48
 *                       in the sense that matters — the display cut is used
 *                       at every size, because clipping at 44 is still
 *                       clipping.
 * @returns {SVGElement}
 */
function createRose(size = 52) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rose jcard__rose');
  svg.setAttribute('viewBox', ROSE_VIEWBOX);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  /* The numeral beside it carries the value for assistive tech; two voices
     saying the same number is worse than one. */
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (let i = 0; i < 8; i++) {
    const { cx, cy, r } = bearing(i);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'dot');
    c.setAttribute('cx', cx);
    c.setAttribute('cy', cy);
    c.setAttribute('r', r);
    c.setAttribute('data-i', i);
    /* --dot-i drives the swept card's hover sweep and Stage 2's stagger.
       Setting it here keeps the index in one place. */
    c.style.setProperty('--dot-i', i);
    svg.appendChild(c);
  }
  return svg;
}

/** The markup form, for templates rendered server-side. */
function roseMarkup(size = 52) {
  const dots = Array.from({ length: 8 }, (_, i) => {
    const { cx, cy, r } = bearing(i);
    return `<circle class="dot" data-i="${i}" style="--dot-i:${i}" ` +
           `cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r.toFixed(3)}"/>`;
  }).join('');
  return `<svg class="rose jcard__rose" viewBox="${ROSE_VIEWBOX}" ` +
         `width="${size}" height="${size}" aria-hidden="true" focusable="false">${dots}</svg>`;
}

/* ---------------------------------------------------------------------------
   LIGHTING
   --------------------------------------------------------------------------- */

/**
 * Light a card's rose to its band. Idempotent — safe to call on every render.
 *
 * @param {Element} card   the .jcard element. Its data-band is the source of
 *                         truth; pass `band` only when setting it for the
 *                         first time.
 * @param {{band?: string, score?: number}} [next]
 */
function lightRose(card, next = {}) {
  if (next.band !== undefined) card.dataset.band = next.band;

  const band = card.dataset.band;
  const svg = card.querySelector('svg.rose');
  if (!svg) return;

  const dots = svg.querySelectorAll('circle.dot');

  /* A swept card has no band: eight empty bearings saying "there is a score
     to be had here" without a word. That is the whole idea — when a resume
     arrives they fill in place and browse BECOMES matches. */
  if (!band) {
    dots.forEach(d => d.classList.remove('is-lit'));
    return;
  }

  const lit = BAND_DOTS[band];
  if (lit === undefined) {
    /* Fail loudly rather than render a plausible wrong number. A rose that
       lies about the band is worse than no rose (law 12). */
    throw new Error(`lightRose: unknown band "${band}" — expected one of ${Object.keys(BAND_DOTS).join(', ')}`);
  }

  dots.forEach((d, i) => d.classList.toggle('is-lit', i < lit));

  if (next.score !== undefined) {
    const num = card.querySelector('.jcard__num');
    if (num) {
      num.textContent = String(next.score);
      num.classList.remove('jcard__num--empty');
    }
  }
}

/**
 * The band a score falls in. The single place the thresholds live — if the
 * scorer changes them, they change here and nowhere else.
 */
function bandFor(score) {
  if (score >= 80) return 'auto';
  if (score >= 65) return 'ping';
  if (score >= 45) return 'unsure';
  return 'near';
}

/**
 * Turn a swept card into a scored one, in place. Stage 1 does it instantly;
 * Stage 2 wraps this in the staggered arrival. Keeping the state change and
 * the animation apart is what lets reduced motion show the same information.
 */
function scoreCard(card, score, band = bandFor(score)) {
  card.classList.remove('jcard--swept');
  lightRose(card, { band, score });

  const num = card.querySelector('.jcard__num');
  if (num) num.setAttribute('aria-label', `Score ${score} out of 100, ${band}`);
}

/* ---------------------------------------------------------------------------
   HYDRATION — makes server-rendered markup live, and fills in any card whose
   template shipped without a rose.
   --------------------------------------------------------------------------- */
function hydrate(root = document) {
  root.querySelectorAll('.jcard').forEach(card => {
    const slot = card.querySelector('.jcard__score');
    if (slot && !slot.querySelector('svg.rose')) {
      const size = card.matches('.jcard--sm') ? 44 : 52;
      slot.prepend(createRose(size));
    }
    lightRose(card);
  });

  /* The heart is the one control that acts without navigating, so it must
     stop the stretched link from firing underneath it. */
  root.querySelectorAll('.jcard__heart').forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const on = btn.getAttribute('aria-pressed') === 'true';
      btn.setAttribute('aria-pressed', String(!on));
      btn.setAttribute('aria-label', on ? 'Save' : 'Saved — tap to remove');
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrate());
  } else {
    hydrate();
  }
}
