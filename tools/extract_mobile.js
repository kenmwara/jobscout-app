// Extract the mockup's Mobile spec as an ordered element list plus the resolved
// tokens each screen actually paints with. Derived from the rendered DOM, never
// hand-copied, so the reference cannot drift from the mockup it claims to describe.
const out = { markets: {} };

const skeleton = (root) => {
  const rows = [];
  const walk = (el, depth) => {
    for (const c of el.children) {
      const cls = (c.className && c.className.baseVal !== undefined)
        ? c.className.baseVal : String(c.className || "");
      const tag = c.tagName.toLowerCase();
      if (tag === "svg" || tag === "circle" || tag === "path") {
        if (tag === "svg") rows.push(`${"  ".repeat(depth)}svg.${cls || "-"}`);
        continue;
      }
      // own text only: what this node contributes, not its children's
      const own = [...c.childNodes]
        .filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim())
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      rows.push(`${"  ".repeat(depth)}${tag}.${cls || "-"}${own ? ` "${own}"` : ""}`);
      walk(c, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
};

const cs = (sel, props) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const s = getComputedStyle(el);
  return Object.fromEntries(props.map(p => [p, s[p]]));
};

for (const market of ["ca", "ke"]) {
  const mb = [...document.querySelectorAll("button[data-mkt]")].find(b => b.dataset.mkt === market)
        || [...document.querySelectorAll("button")].find(b => new RegExp(market === "ca" ? "Canada" : "Kenya").test(b.textContent));
  mb?.click();
  await new Promise(r => setTimeout(r, 500));

  const phones = [...document.querySelectorAll(".phone")];
  out.markets[market] = {
    screens: phones.map(p => ({
      label: p.querySelector(".label").textContent.trim(),
      elements: skeleton(p.querySelector(".body")),
    })),
    tokens: {
      canvas: getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim(),
      ink: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
      surface: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(),
      accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      live: getComputedStyle(document.documentElement).getPropertyValue("--live").trim(),
      text2: getComputedStyle(document.documentElement).getPropertyValue("--text2").trim(),
      text3: getComputedStyle(document.documentElement).getPropertyValue("--text3").trim(),
      chip: getComputedStyle(document.documentElement).getPropertyValue("--chip").trim(),
      hair: getComputedStyle(document.documentElement).getPropertyValue("--hair").trim(),
      heroImg: getComputedStyle(document.documentElement).getPropertyValue("--hero-img").trim(),
    },
    type: {
      heroH2: cs(".mhero h2", ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "color"]),
      title: cs(".mtitle", ["fontFamily", "fontSize", "fontWeight", "color"]),
      count: cs(".mcount", ["fontFamily", "fontSize", "fontWeight", "color"]),
      jobRole: cs(".mjob .r", ["fontFamily", "fontSize", "fontWeight", "color"]),
      jobCo: cs(".mjob .c", ["fontFamily", "fontSize", "color"]),
      policyPill: cs(".mjob .p", ["fontSize", "fontWeight", "borderRadius", "color"]),
      filterOn: cs(".mfilters i.on", ["backgroundColor", "color"]),
      filterOff: cs(".mfilters i", ["backgroundColor", "color"]),
      mktChip: cs(".mmkt", ["fontSize", "backgroundColor", "color", "borderRadius"]),
      box: cs(".mbox", ["backgroundColor", "borderRadius"]),
      go: cs(".mbox b", ["backgroundColor", "color", "width", "height"]),
      card: cs(".mjob", ["backgroundColor", "borderRadius", "padding", "gap"]),
    },
  };
}

// djb2 over the concatenated skeletons: one number per market that changes the
// moment the structure does.
const hash = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
};
for (const m of Object.keys(out.markets)) {
  const flat = out.markets[m].screens.map(s => s.label + "\n" + s.elements.join("\n")).join("\n--\n");
  out.markets[m].hash = hash(flat);
}
out;
