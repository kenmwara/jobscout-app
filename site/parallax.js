/* THE CARD'S PARALLAX (sanity pack, 2026-09-21) - pointer tracking and
   arrival. Replaces the title underline: a fourth signal for an event the
   card already reported by lifting, brightening its edge and lighting the
   rose's next dot.

   Two jobs, both cheap:
     1. set --mx/--my on the hovered card from the pointer's offset from its
        centre, normalised to -1..1 (the CSS turns them into rotateX/Y)
     2. flip data-arrive on cards as they enter the viewport

   COST CONTROL, because the list can be 300 rows long: ONE delegated
   pointermove per scope, one card tracked at a time, rAF-throttled writes,
   the rect cached per hover, the observer unobserves after arrival.
   GUARDS: a device that does not hover never tracks; reduced motion never
   tracks and never staggers; no JS at all leaves --mx/--my at 0 = a flat,
   correct card.

   The CARD selector is the site's `.job` and the mockup's `.jcard`; both are
   listed so one file serves both. window.__parallax.arrive(root) re-runs the
   arrival after a list re-renders. */
(function () {
  const CARD = ".job, .jcard";
  const CAN_HOVER = matchMedia("(hover: hover) and (pointer: fine)");
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

  function trackPointer(scope) {
    let card = null, box = null, queued = false, mx = 0, my = 0;
    const write = () => { queued = false; if (!card) return; card.style.setProperty("--mx", mx.toFixed(4)); card.style.setProperty("--my", my.toFixed(4)); };
    const release = () => { if (!card) return; card.classList.remove("is-tracking"); card.style.removeProperty("--mx"); card.style.removeProperty("--my"); card = null; box = null; };
    scope.addEventListener("pointermove", e => {
      if (!CAN_HOVER.matches || REDUCED.matches) return;
      const hit = e.target.closest ? e.target.closest(CARD) : null;
      if (hit !== card) { release(); if (!hit) return; card = hit; box = card.getBoundingClientRect(); card.classList.add("is-tracking"); }
      if (!box) return;
      mx = Math.max(-1, Math.min(1, (e.clientX - (box.left + box.width / 2)) / (box.width / 2)));
      my = Math.max(-1, Math.min(1, (e.clientY - (box.top + box.height / 2)) / (box.height / 2)));
      if (!queued) { queued = true; requestAnimationFrame(write); }
    }, { passive: true });
    scope.addEventListener("pointerleave", release, { passive: true });
    addEventListener("scroll", release, { passive: true });
  }

  /* the observer's ROOT is the element that actually scrolls these cards - a
     list inside an overflow container (the mockup's phone frame) never
     intersects the viewport, and its cards would stay pending forever */
  const scrollParent = el => { for (let n = el && el.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n; } return null; };
  function arrive(scope) {
    const cards = [...scope.querySelectorAll(CARD)].filter(c => !c.dataset.arrive);
    if (!cards.length) return;
    if (REDUCED.matches) { cards.forEach(c => c.setAttribute("data-arrive", "in")); return; }
    cards.forEach(c => c.setAttribute("data-arrive", "pending"));
    const io = new IntersectionObserver(entries => {
      /* a card ALREADY ABOVE the viewport when it is observed (a list that
         re-rendered while the reader was scrolled down) would never intersect
         and would stay pending - present in the DOM, invisible on screen. It
         has been passed, so it is simply in, with no stagger. */
      entries.filter(en => !en.isIntersecting && en.boundingClientRect.bottom < (en.rootBounds ? en.rootBounds.top : 0))
        .forEach(en => { en.target.setAttribute("data-arrive", "in"); io.unobserve(en.target); });
      const hits = entries.filter(en => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      hits.forEach((en, i) => { en.target.style.setProperty("--card-i", Math.min(i, 12)); en.target.setAttribute("data-arrive", "in"); io.unobserve(en.target); });
    }, { root: scrollParent(cards[0]), rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    cards.forEach(c => io.observe(c));
  }

  trackPointer(document);
  const boot = () => arrive(document);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  /* lists re-render; a card that appears later arrives too */
  new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches(CARD) || n.querySelector(CARD))) { arrive(n.parentElement || document); return; } })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.__parallax = { arrive };
})();
