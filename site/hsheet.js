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
  const sections = [["Market", mkt], ["Theme", thm], ["Go to", nav]].filter(([, el]) => el);
  if (!sections.length) return;
  const homes = new Map(sections.map(([, el]) => [el, { parent: el.parentNode, next: el.nextSibling }]));

  const chip = document.createElement("button");
  chip.type = "button"; chip.className = "hchip"; chip.setAttribute("aria-label", "Market");
  const more = document.createElement("button");
  more.type = "button"; more.className = "hmore"; more.setAttribute("aria-label", "Menu");
  more.setAttribute("aria-expanded", "false"); more.innerHTML = "&#8943;";
  const sheet = document.createElement("div");
  sheet.className = "hsheet"; sheet.hidden = true;
  sheet.innerHTML = `<div class="hs-scrim"></div><div class="hs-pane" role="dialog" aria-label="Menu">` +
    `<div class="hs-grab" aria-hidden="true"></div><button type="button" class="hs-close" aria-label="Close">&#215;</button>` +
    `<div class="hs-body"></div></div>`;
  document.body.appendChild(sheet);
  const body = sheet.querySelector(".hs-body");

  function paintChip() {
    const on = mkt && mkt.querySelector('[aria-pressed="true"]');
    if (!on) { chip.hidden = true; return; }
    chip.hidden = false;
    const flag = on.querySelector("svg.flag");
    const code = (on.dataset.mkt || on.textContent.trim().slice(0, 2)).toUpperCase();
    chip.innerHTML = (flag ? flag.outerHTML : "") + `<span>${code}</span>`;
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
  if (mkt) new MutationObserver(paintChip).observe(mkt, { attributes: true, subtree: true, attributeFilter: ["aria-pressed"] });
  window.__hsheet = { open, close };   // the harness opens it without a tap
})();
