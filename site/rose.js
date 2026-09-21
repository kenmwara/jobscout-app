/* THE BEARING ROSE - one builder for index, saved and the phone mockup.
   Three copies drifted (104-box ring on the web, a bare numeral on the
   phone); this is the only place the glyph is written.

   Law 9's geometry: ring r=11 in a 24 box, eight bearings 45deg apart from
   000, radii 2.275 + 0.2944*i clockwise. The two largest dots touch at
   270/315 on purpose. At >=48px the DISPLAY CUT is required: the viewBox is
   the true bbox (x -3.041..25.864, y -1.275..26.453) plus 1.2 clear space,
   squared - `0 0 24 24` clips every outer dot.

   The lit count IS the band (motion v2, stage 1): AUTO 8, PING 6, UNSURE 5,
   NEAR-MISS 3. Unlit dots stay visible at 14% of --rose-empty (the ink, never
   a band colour - NEAR-MISS's band is the neutral, so a track in that colour
   left lit and unlit identical but for opacity), scaled .55, so a 32 looks
   like a 32. A posting nobody has scored gets the whole ring unlit and an
   en-dash: eight empty bearings say "there is a score to be had here". */
(function () {
  /* design system v3, stage 3: band.js is the ONE place score -> band lives
     (lit table + the generated thresholds); a rose never re-derives it. The
     lit bearings take the band SOLID (--auto), the numeral the label rung
     (--auto-label): the site's own rule, which this glyph had drifted from. */
  const LIT = JSBand.LIT, TOK = JSBand.TOKEN, band = JSBand.bandFor;
  const DOTS = Array.from({ length: 8 }, (_, i) => {
    const th = (-90 + 45 * i) * Math.PI / 180;
    return [12 + 11 * Math.cos(th), 12 + 11 * Math.sin(th), 2.275 + 0.2944 * i];
  });
  function roseSVG(fit, size) {
    const scored = fit !== null && fit !== undefined && fit !== "";
    const f = scored ? Math.max(0, Math.min(100, +fit || 0)) : null;
    const b = scored ? band(f) : null;
    const lit = scored ? LIT[b] : 0;
    /* fail loudly rather than draw a plausible wrong number: a rose that lies
       about the band is worse than no rose */
    if (scored && lit === undefined) throw new Error(`roseSVG: unknown band "${b}" for fit ${f}`);
    const col = scored ? `var(--${TOK[b]})` : "var(--rose-empty)";
    const num = scored ? `var(--${TOK[b]}-label)` : "var(--rose-empty)";
    const dots = DOTS.map(([x, y, r], i) =>
      /* the band colour rides inline STYLE, not the fill attribute: base.css
         sets .rose .d{fill:var(--rose-empty)} and a stylesheet beats a
         presentation attribute, which left lit dots in the empty colour */
      `<circle class="d${i < lit ? " lit" : ""}${scored && i === lit ? " next" : ""}" style="--i:${i}${i < lit ? `;fill:${col}` : ""}" cx="${x.toFixed(3)}" cy="${y.toFixed(3)}" r="${r.toFixed(3)}"/>`).join("");
    const w = size ? ` width="${size}" height="${size}"` : "";
    return `<svg class="rose${scored ? "" : " unlit"}" viewBox="-4.2416 -3.0639 31.3054 31.3054"${w} role="img"` +
      ` aria-label="${scored ? `fit ${f} of 100` : "not scored yet"}"${scored ? ` data-band="${b}"` : ""}>` +
      `${dots}<text class="fitnum" x="12" y="12"${scored ? ` style="fill:${num}"` : ""}>${scored ? f : "–"}</text></svg>`;
  }
  window.roseSVG = roseSVG;
  window.roseBand = band;
  window.ROSE_LIT = LIT;
})();
