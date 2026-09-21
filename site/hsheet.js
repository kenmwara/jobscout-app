/* THE PHONE HEADER (motion v2, stage 7). At 620px and under the header used
   to wrap to two rows (80px) before any content, the market pill dropped its
   labels to two flags, the nav was silently cut to "Browse", and a fourth
   market would not have fit at all.

   One row, 56px: [rose] JobScout ........ [flag CODE] [...]. The chip names
   the market; the ellipsis opens a sheet (THEME.md s15) holding the FULL
   three-state theme control (law 2 - still Light / Device / Dark, at a size
   that is easier to hit), the market switch, and every nav item. Nothing is
   truncated, and a fourth market costs the header nothing.

   The controls are MOVED into the sheet, not copied: their handlers stay
   attached, the page's own script still owns them, and they go back to the
   row when the sheet closes. Above 620px none of this renders (base.css). */
(function () {
  const row = document.querySelector("header.site .row");
  if (!row) return;
  const mkt = row.querySelector(".mkt"), thm = row.querySelector(".thm"), nav = row.querySelector("nav.main");
  /* navigation FIRST (v3 stage 6): a menu is opened to go somewhere; the
     settings follow */
  const sections = [["Go to", nav], ["Market", mkt], ["Theme", thm]].filter(([, el]) => el);
  if (!sections.length) return;
  const homes = new Map(sections.map(([, el]) => [el, { parent: el.parentNode, next: el.nextSibling }]));

  const chip = document.createElement("button");
  chip.type = "button"; chip.className = "hchip"; chip.setAttribute("aria-label", "Market");
  const more = document.createElement("button");
  more.type = "button"; more.className = "hmore"; more.setAttribute("aria-label", "Menu");
  more.setAttribute("aria-expanded", "false");
  /* three drawn dots, not the U+22EF glyph: a glyph centres on its baseline
     and sat high in the button; geometry centres */
  more.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
  const sheet = document.createElement("div");
  sheet.className = "hsheet"; sheet.hidden = true;
  sheet.innerHTML = `<div class="hs-scrim"></div><div class="hs-pane" role="dialog" aria-label="Menu">` +
    `<div class="hs-grab" aria-hidden="true"></div><button type="button" class="hs-close" aria-label="Close">&#215;</button>` +
    `<div class="hs-body"></div></div>`;
  document.body.appendChild(sheet);
  const body = sheet.querySelector(".hs-body");

  /* the routes without a market switch (saved, apply, privacy) still name
     the market: the chip reads html[data-market] and draws its own flag */
  const FLAG = {
    ca: '<svg class="flag" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#fff"/><rect width="6" height="16" fill="#d52b1e"/><rect x="18" width="6" height="16" fill="#d52b1e"/><path d="M12 4l1.1 2.6 2.4-1-1 2.4 1.4.6-2.2 1.3.3 1.5-1.6-.7-.4 1.9-.4-1.9-1.6.7.3-1.5L8.1 8.6l1.4-.6-1-2.4 2.4 1z" fill="#d52b1e"/></svg>',
    ke: '<svg class="flag" viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#fff"/><rect width="24" height="4.6" fill="#000"/><rect y="5.6" width="24" height="4.8" fill="#be0027"/><rect y="11.4" width="24" height="4.6" fill="#009a49"/><ellipse cx="12" cy="8" rx="2.3" ry="5" fill="#be0027" stroke="#fff" stroke-width=".7"/></svg>',
  };
  function paintChip() {
    const on = mkt && mkt.querySelector('[aria-pressed="true"]');
    const m = (document.documentElement.dataset.market || "ca").toLowerCase();
    const flag = on ? on.querySelector("svg.flag") : null;
    const code = (on ? (on.dataset.mkt || on.textContent.trim().slice(0, 2)) : m).toUpperCase();
    chip.hidden = false;
    chip.innerHTML = (flag ? flag.outerHTML : (FLAG[m] || "")) + `<span>${code}</span>`;
  }
  function open() {
    sections.forEach(([title, el]) => {
      const sec = document.createElement("section");
      sec.className = "hs-sec"; sec.innerHTML = `<h3>${title}</h3>`;
      sec.appendChild(el); body.appendChild(sec);
    });
    sheet.hidden = false;
    more.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("hs-open");
  }
  function close() {
    sections.forEach(([, el]) => { const h = homes.get(el); h.parent.insertBefore(el, h.next); });
    body.innerHTML = "";
    sheet.hidden = true;
    more.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("hs-open");
    paintChip();
  }
  const toggle = () => (sheet.hidden ? open() : close());
  more.onclick = toggle;
  chip.onclick = toggle;
  sheet.querySelector(".hs-scrim").onclick = close;
  sheet.querySelector(".hs-close").onclick = close;
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !sheet.hidden) close(); });
  body.addEventListener("click", e => { if (e.target.closest("nav.main a")) close(); });

  row.appendChild(chip); row.appendChild(more); paintChip();
  /* THE HEADER RULE (Ken, 09-21): the LANDING keeps the two slide tabs -
     market and the three-state theme - at every width; every other view and
     route gets the chip + menu at phone width. index.html's landing is a
     view, so this watches it; the other routes have no landing and stay in
     chip mode. */
  const landing = document.getElementById("v-landing");
  const full = () => document.documentElement.classList.toggle("hdr-full", !!landing && !landing.classList.contains("hide") && (!mkt || mkt.querySelectorAll("button").length <= 3));
  full();
  if (landing) new MutationObserver(full).observe(landing, { attributes: true, attributeFilter: ["class"] });
  /* PAST THREE MARKETS the pill of flags breaks at any width (US and UK are
     on the roadmap), so the chip + sheet take over on desktop too. Counted
     from the switch itself, so adding a market is one button and no CSS. */
  const many = () => document.documentElement.classList.toggle("mkt-many", !!mkt && mkt.querySelectorAll("button").length > 3);
  many();
  if (mkt) new MutationObserver(many).observe(mkt, { childList: true });
  if (mkt) new MutationObserver(paintChip).observe(mkt, { attributes: true, subtree: true, attributeFilter: ["aria-pressed"] });
  window.__hsheet = { open, close };   // the harness opens it without a tap
})();
