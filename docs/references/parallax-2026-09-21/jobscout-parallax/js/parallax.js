/* ===========================================================================
   parallax.js — pointer tracking and arrival for the card's parallax.

   Two jobs, both cheap:
     1. set --mx/--my on the hovered card, from the pointer's offset from its
        centre, normalised to -1..1
     2. flip data-arrive on cards as they enter the viewport

   COST CONTROL, because this runs on a list that can be 300 rows long:
     · ONE delegated pointermove on the container, not one per card
     · at most one card is tracked at a time
     · writes are rAF-throttled, so N moves per frame become 1
     · getBoundingClientRect is cached per hover, not read per move
     · IntersectionObserver unobserves each card after it arrives

   GUARDS, all of them load-bearing:
     · a device that does not hover never tracks
     · prefers-reduced-motion never tracks and never staggers
     · no JS at all leaves --mx/--my at 0, which is a correct, flat card
   =========================================================================== */

const CAN_HOVER = matchMedia('(hover: hover) and (pointer: fine)');
const REDUCED   = matchMedia('(prefers-reduced-motion: reduce)');

/* --------------------------------------------------------------------------
   1. POINTER
   -------------------------------------------------------------------------- */
function trackPointer(scope) {
  let card = null;          /* the card under the pointer */
  let box = null;           /* its rect, cached for the duration of the hover */
  let queued = false;
  let mx = 0, my = 0;

  const write = () => {
    queued = false;
    if (!card) return;
    card.style.setProperty('--mx', mx.toFixed(4));
    card.style.setProperty('--my', my.toFixed(4));
  };

  const release = () => {
    if (!card) return;
    /* Restoring the transform transition is what makes the card SETTLE back
       rather than snap. The follow is instant; the return is --t-settle. */
    card.classList.remove('is-tracking');
    card.style.removeProperty('--mx');
    card.style.removeProperty('--my');
    card = null; box = null;
  };

  scope.addEventListener('pointermove', e => {
    if (!CAN_HOVER.matches || REDUCED.matches) return;
    const hit = e.target.closest?.('.jcard');
    if (hit !== card) {
      release();
      if (!hit) return;
      card = hit;
      box = card.getBoundingClientRect();
      card.classList.add('is-tracking');
    }
    if (!box) return;
    /* -1..1 from the centre, clamped so a pointer at the very edge of a tall
       card does not exceed the tilt the CSS was tuned for. */
    mx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width  / 2)) / (box.width  / 2)));
    my = Math.max(-1, Math.min(1, (e.clientY - (box.top  + box.height / 2)) / (box.height / 2)));
    if (!queued) { queued = true; requestAnimationFrame(write); }
  }, { passive: true });

  scope.addEventListener('pointerleave', release, { passive: true });
  /* A scroll under a stationary pointer invalidates the cached rect. */
  addEventListener('scroll', release, { passive: true });
}

/* --------------------------------------------------------------------------
   2. ARRIVAL
   -------------------------------------------------------------------------- */
function arrive(scope) {
  const cards = [...scope.querySelectorAll('.jcard')];

  if (REDUCED.matches) {
    /* Same information, no motion: everything is simply present. */
    cards.forEach(c => c.removeAttribute('data-arrive'));
    return;
  }

  cards.forEach(c => c.setAttribute('data-arrive', 'pending'));

  /* The observer's ROOT must be the element that actually scrolls these
     cards, not the viewport. A list inside an overflow container — the menu
     sheet, a phone frame in a mockup, any modal with its own scroller —
     clips against that container, and cards below its fold never intersect
     the viewport at all. They stay pending at opacity 0 forever: present in
     the DOM, invisible on screen, and invisible in a screenshot too.
     check_parallax.mjs assertion D caught exactly this. */
  const scrollParent = el => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    }
    return null;
  };

  const io = new IntersectionObserver(entries => {
    /* Sort by position so the stagger reads top-to-bottom even when several
       cards cross the threshold in the same frame. */
    const hits = entries.filter(en => en.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    hits.forEach((en, i) => {
      const el = en.target;
      /* Cap the index: past ~12 the last card feels forgotten, which is the
         same cap the row stagger uses elsewhere. */
      el.style.setProperty('--card-i', Math.min(i, 12));
      el.setAttribute('data-arrive', 'in');
      io.unobserve(el);
    });
  }, { root: scrollParent(cards[0] ?? scope), rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  cards.forEach(c => io.observe(c));
}

/* --------------------------------------------------------------------------
   Public entry. Call once per list container; safe to call again after the
   list re-renders.
   -------------------------------------------------------------------------- */
export function mountParallax(scope = document) {
  const scopes = scope === document
    ? document.querySelectorAll('.stack, .prep__list, .feed')
    : [scope];
  scopes.forEach(s => { trackPointer(s); arrive(s); });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => mountParallax());
  else mountParallax();
}
