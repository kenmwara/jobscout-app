/* ===========================================================================
   rose.js — the score device. Law 9's geometry, generated, never pasted.

   Every hand-copied rose in a repo is a chance for one of these numbers to
   drift by a decimal, and check_rose.mjs asserts them to 0.01. One generator,
   one truth.

   The two largest dots touch at bearings 270 and 315 ON PURPOSE. Do not
   "fix" them.
   =========================================================================== */
import { LIT } from './band.js';

export const RING = 11, BOX = 12, R0 = 2.275, DR = 0.2944, COUNT = 8;

/* The DISPLAY CUT. Computed from the true bounding box (x −3.041…25.864,
   y −1.275…26.453) plus 1.2 clear space, squared. `0 0 24 24` clips every
   outer dot, at every size — so the cut is used at 44 as well as 64. */
export const VIEWBOX = '-4.2416 -3.0639 31.3054 31.3054';

const NS = 'http://www.w3.org/2000/svg';

/** One bearing. i = 0..7, clockwise from 000 (straight up). */
export function bearing(i) {
  const a = (i * Math.PI) / 4 - Math.PI / 2;
  return {
    cx: +(BOX + RING * Math.cos(a)).toFixed(3),
    cy: +(BOX + RING * Math.sin(a)).toFixed(3),
    r:  +(R0 + DR * i).toFixed(3),
  };
}

/** Server-render form. */
export function roseMarkup(size) {
  const dots = Array.from({ length: COUNT }, (_, i) => {
    const { cx, cy, r } = bearing(i);
    return `<circle class="dot" data-i="${i}" style="--dot-i:${i}" ` +
           `cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${r.toFixed(3)}"/>`;
  }).join('');
  /* aria-hidden: the numeral beside it is the accessible voice of the score.
     Two voices saying the same number is worse than one. */
  return `<svg class="rose" viewBox="${VIEWBOX}" width="${size}" height="${size}" ` +
         `aria-hidden="true" focusable="false">${dots}</svg>`;
}

export function createRose(size) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rose');
  svg.setAttribute('viewBox', VIEWBOX);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (let i = 0; i < COUNT; i++) {
    const { cx, cy, r } = bearing(i);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('class', 'dot');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('data-i', i);
    c.style.setProperty('--dot-i', i);
    svg.appendChild(c);
  }
  return svg;
}

/**
 * Light a host's rose to its band. Idempotent.
 * The host's data-band is the source of truth — never a class, because
 * check_rose.mjs counts lit dots against that attribute and a class would
 * let the declaration and the drawing drift apart.
 */
export function lightRose(host, { band, score } = {}) {
  if (band !== undefined) {
    if (band === null) host.removeAttribute('data-band');
    else host.dataset.band = band;
  }
  const svg = host.querySelector('svg.rose');
  if (!svg) return;
  const dots = svg.querySelectorAll('circle.dot');
  const b = host.dataset.band;

  /* No band = the swept card: eight empty bearings saying there is a score to
     be had here, without a word. When a resume arrives they fill IN PLACE. */
  if (!b) { dots.forEach(d => d.classList.remove('is-lit', 'is-next')); return; }

  const lit = LIT[b];
  if (lit === undefined) {
    /* Fail loudly rather than draw a plausible wrong number. A rose that lies
       about the band is worse than no rose at all. */
    throw new Error(`lightRose: unknown band "${b}" — expected ${Object.keys(LIT).join(', ')}`);
  }
  dots.forEach((d, i) => {
    d.classList.toggle('is-lit', i < lit);
    d.classList.toggle('is-next', i === lit);   /* the hover tell */
  });

  if (score !== undefined) {
    const num = host.querySelector('.score__num');
    if (num) {
      num.textContent = String(score);
      num.classList.remove('score__num--empty');
      num.setAttribute('aria-label', `Score ${score} out of 100, ${b}`);
      num.setAttribute('role', 'img');
    }
  }
}

/**
 * Stage 2's arrival. The numeral counts on the SAME clock as the dots, so the
 * two cannot drift: the last dot lands as the numeral seats.
 */
export function arrive(host, score, band) {
  const svg = host.querySelector('svg.rose');
  const num = host.querySelector('.score__num');
  const lit = LIT[band];
  if (!svg || lit === undefined) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { lightRose(host, { band, score }); host.classList.add('rose--settled'); return; }

  svg.classList.add('rose--arriving');
  lightRose(host, { band });

  const stagger = parseFloat(getComputedStyle(document.documentElement)
                    .getPropertyValue('--stagger-dot')) || 46;
  const total = lit * stagger;
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min(1, (now - t0) / total);
    if (num) num.textContent = String(Math.round(score * p));
    if (p < 1) requestAnimationFrame(tick);
    else {
      lightRose(host, { band, score });
      svg.classList.remove('rose--arriving');
      svg.classList.add('rose--settled');
    }
  };
  requestAnimationFrame(tick);
}

export function hydrate(root = document) {
  root.querySelectorAll('[data-rose]').forEach(slot => {
    if (!slot.querySelector('svg.rose')) {
      slot.prepend(createRose(parseInt(slot.dataset.rose, 10) || 52));
    }
    lightRose(slot.closest('[data-band]') || slot);
  });
}
