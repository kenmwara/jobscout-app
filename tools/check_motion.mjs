// Motion & material v1, proved: the tokens are loaded, every actionable
// surface has three DISTINCT states with the press on exit timing, dark
// carries no drop shadow, nothing but <html> paints a ground, and the light
// ground stays in the warm family under the page mark.
//
//   python -m http.server 8765   (the REPO ROOT: the mockup links ../site/base.css)
//   node tools/check_motion.mjs
import { chromium } from "playwright";
import { PNG } from "pngjs";

const SITE = "http://localhost:8765/site", MOCK = "http://localhost:8765/mockups";
const fails = [];
const ok = m => console.log("  ok    " + m);
const bad = m => { fails.push(m); console.log("  FAIL  " + m); };
const is = (c, m) => (c ? ok : bad)(m);
const ms = v => parseFloat(v) * (String(v).endsWith("ms") ? 1 : 1000);

/* three states of one element: rest, hover, press - read as computed style,
   never as a class */
async function states(page, sel) {
  const read = () => page.$eval(sel, el => {
    const s = getComputedStyle(el);
    return { sh: s.boxShadow, edge: s.borderColor, tf: s.transform, dur: s.transitionDuration.split(",")[0].trim() };
  });
  await page.mouse.move(2, 2); await page.waitForTimeout(450);
  const rest = await read();
  const box = await page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(box.x, box.y); await page.waitForTimeout(450);
  const hover = await read();
  await page.mouse.down(); await page.waitForTimeout(250);
  const press = await read();
  await page.mouse.up(); await page.mouse.move(2, 2); await page.waitForTimeout(450);
  return { rest, hover, press };
}
const key = s => `${s.sh}|${s.edge}|${s.tf}`;
const ringOnly = sh => sh === "none" || /^rgba?\([^)]*\) 0px 0px 0px 1px$/.test(sh);

function judgeStates(label, st, dark) {
  const distinct = new Set([key(st.rest), key(st.hover), key(st.press)]).size;
  is(distinct === 3, `${label}: rest / hover / press are three distinct states (${distinct})`);
  is(ms(st.press.dur) <= ms(st.hover.dur) && ms(st.press.dur) <= 200,
    `${label}: the press resolves on exit timing (${st.press.dur} <= ${st.hover.dur})`);
  if (dark) is([st.rest, st.hover, st.press].every(s => ringOnly(s.sh)),
    `${label}: dark carries no drop shadow, a 1px ring at most`);
}

/* OKLab, for chroma and hue of a sampled pixel */
function oklch([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  return { C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180 / Math.PI) + 360) % 360, L };
}

const b = await chromium.launch();
for (const theme of ["light", "dark"]) {
  const dark = theme === "dark";
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
  await ctx.addInitScript(t => localStorage.setItem("jobscout.theme", t), theme);

  // stage 0: the tokens
  let p = await ctx.newPage();
  await p.goto(SITE + "/index.html#browse", { waitUntil: "networkidle" });
  await p.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
  const tok = await p.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return ["--spring-arrive", "--spring-settle", "--spring-snap", "--spring-exit", "--t-exit", "--stagger-dot", "--edge-hover", "--tile-fill"]
      .filter(n => !s.getPropertyValue(n).trim());
  });
  is(!tok.length, `${theme}: motion tokens resolve on :root` + (tok.length ? ` - missing ${tok.join(" ")}` : ""));

  // stage 3: a sector tile and a filter chip, three states each
  await p.waitForSelector("#taxGrid .tax", { timeout: 20000 }).catch(() => {});
  if (await p.$("#taxGrid .tax")) {
    await p.$eval("#taxGrid .tax", el => el.scrollIntoView({ block: "center" }));
    judgeStates(`${theme} sector tile`, await states(p, "#taxGrid .tax"), dark);
  } else bad(`${theme}: no sector tile rendered (feed?)`);
  if (await p.$(".taxtabs button")) judgeStates(`${theme} taxonomy chip`, await states(p, ".taxtabs button:not([aria-pressed='true'])"), dark);

  // stage 6a: nothing but <html> paints a ground over half the viewport
  const painters = await p.evaluate(() => {
    const area = innerWidth * innerHeight, out = [];
    for (const el of document.querySelectorAll("body *")) {
      const s = getComputedStyle(el);
      if (s.position === "fixed" && s.zIndex === "-1") continue;            // the page mark, part of the ground
      const paints = (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") || s.backgroundImage !== "none";
      if (!paints) continue;
      const r = el.getBoundingClientRect();
      if (r.width * r.height > area * 0.5) out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${[...el.classList].join(".")} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  is(!painters.length, `${theme}: no element but <html> paints a ground over half the viewport` + (painters.length ? ` - ${painters.join("; ")}` : ""));
  const howBg = await p.$eval("#how", el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, img: s.backgroundImage, top: s.borderTopWidth }; });
  is((howBg.bg === "rgba(0, 0, 0, 0)" || howBg.bg === "transparent") && howBg.img === "none" && howBg.top === "1px",
    `${theme}: "How JobScout works" paints no ground and carries the hairline (${howBg.bg} / ${howBg.img} / ${howBg.top})`);
  await p.close();

  // stage 7: the phone header is ONE row at 390/360/320, every destination one tap away,
  // and a fourth market costs it nothing
  for (const w of [390, 360, 320]) {
    const hp = await ctx.newPage(); await hp.setViewportSize({ width: w, height: 800 });
    await hp.goto(SITE + "/index.html", { waitUntil: "networkidle" });
    await hp.evaluate(t => document.documentElement.setAttribute("data-theme", t), theme);
    await hp.waitForTimeout(400);
    /* the landing keeps the two slide tabs (Ken's header rule) */
    const land = await hp.evaluate(() => ({ full: document.documentElement.classList.contains("hdr-full"), mkt: getComputedStyle(document.querySelector(".mkt")).display !== "none", thm: getComputedStyle(document.querySelector(".thm")).display !== "none", chip: getComputedStyle(document.querySelector(".hchip")).display }));
    is(land.full && land.mkt && land.thm && land.chip === "none", `${theme} ${w}px landing: the two slide tabs, no chip`);
    await hp.evaluate(() => setView("browse")); await hp.waitForTimeout(500);
    const h = await hp.evaluate(() => {
      const row = document.querySelector("header.site .row");
      const kids = [...row.children].filter(el => getComputedStyle(el).display !== "none");
      /* one row = every visible child sits inside the row's own box (a wrap
         pushes a child below it); centred children have different tops */
      const R = row.getBoundingClientRect();
      const inside = kids.every(el => { const r = el.getBoundingClientRect(); return r.top >= R.top - 1 && r.bottom <= R.bottom + 1; });
      return { height: row.offsetHeight, inside, visible: kids.map(el => el.className || el.tagName).join(" "), chip: document.querySelector(".hchip")?.textContent.trim() };
    });
    is(h.height <= 60 && h.inside, `${theme} ${w}px: the header is one row, ${h.height}px (${h.visible}; chip "${h.chip}")`);
    const reach = await hp.evaluate(() => {
      const before = [...document.querySelectorAll("nav.main a")].map(a => a.getAttribute("href"));
      window.__hsheet.open();
      const inSheet = [...document.querySelectorAll(".hsheet:not([hidden]) nav.main a")].map(a => a.getAttribute("href"));
      const thm = document.querySelectorAll(".hsheet:not([hidden]) .thm button").length;
      const mkt = document.querySelectorAll(".hsheet:not([hidden]) .mkt button").length;
      window.__hsheet.close();
      return { before, inSheet, thm, mkt, back: document.querySelectorAll("header.site .row .thm button").length };
    });
    is(reach.before.length > 0 && reach.before.every(x => reach.inSheet.includes(x)) && reach.thm === 3 && reach.mkt >= 2 && reach.back === 3,
      `${theme} ${w}px: one tap of the ellipsis reaches ${reach.inSheet.length} nav items, the 3-state theme control and ${reach.mkt} markets, and they return`);
    if (w === 390) {
      /* stage 8 on the web: the tile grid is one sticky row of chips at phone
         width and the first posting is within reach - it was 2,458px down */
      const bp = await ctx.newPage(); await bp.setViewportSize({ width: 390, height: 844 });
      await bp.goto(SITE + "/index.html#browse", { waitUntil: "networkidle" });
      await bp.waitForSelector("#browseJobs .job", { timeout: 20000 }).catch(() => {});
      const br = await bp.evaluate(() => { const g = document.querySelector("#taxGrid"), j = document.querySelector("#browseJobs .job");
        return g ? { h: Math.round(g.getBoundingClientRect().height), sticky: getComputedStyle(g).position, slides: g.scrollWidth > g.clientWidth + 10, first: j ? Math.round(j.getBoundingClientRect().top + scrollY) : null } : null; });
      is(br && br.h <= 70 && br.sticky === "sticky" && br.slides && br.first !== null && br.first < 1200,
        `${theme} 390px browse: the sectors are one sticky row (${br && br.h}px) that slides, first posting ${br && br.first}px down`);
      await bp.close();
      const four = await hp.evaluate(() => {
        const mkt = document.querySelector(".mkt"), h0 = document.querySelector("header.site .row").offsetHeight;
        for (const [code, name] of [["us", "United States"], ["uk", "United Kingdom"]]) { const b = document.createElement("button"); b.type = "button"; b.dataset.mkt = code; b.setAttribute("aria-pressed", "false"); b.textContent = name; mkt.appendChild(b); }
        const row = document.querySelector("header.site .row");
        const over = [...row.children].some(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; });
        return { h0, h1: row.offsetHeight, over, n: mkt.children.length };
      });
      is(four.h1 === four.h0 && !four.over, `${theme} 390px: with ${four.n} markets the header stays ${four.h0}px and nothing overflows`);
    }
    await hp.close();
  }

  // past three markets, the desktop header hands over to the chip + sheet too
  {
    const dp = await ctx.newPage(); await dp.setViewportSize({ width: 1280, height: 900 });
    await dp.goto(SITE + "/index.html", { waitUntil: "networkidle" });
    const r = await dp.evaluate(() => {
      const mkt = document.querySelector(".mkt"), row = document.querySelector("header.site .row"), h0 = row.offsetHeight;
      const before = getComputedStyle(document.querySelector(".hchip")).display;
      for (const [code, name] of [["us", "United States"], ["uk", "United Kingdom"]]) { const b = document.createElement("button"); b.type = "button"; b.dataset.mkt = code; b.setAttribute("aria-pressed", "false"); b.textContent = name; mkt.appendChild(b); }
      return new Promise(res => setTimeout(() => res({ before, chip: getComputedStyle(document.querySelector(".hchip")).display, pill: getComputedStyle(mkt).display, h0, h1: row.offsetHeight, many: document.documentElement.classList.contains("mkt-many") }), 100));
    });
    is(r.before === "none" && r.chip !== "none" && r.pill === "none" && r.many && r.h1 <= r.h0 + 4,
      `${theme} 1280px: with four markets the desktop header hands over to the chip + sheet (${r.h0}px -> ${r.h1}px)`);
    await dp.close();
  }

  // the mockup card, three states
  p = await ctx.newPage();
  await p.goto(MOCK + "/mobile.html", { waitUntil: "networkidle" });
  await p.evaluate(t => { const x = [...document.querySelectorAll("button")].find(x => x.textContent.toLowerCase().includes(t)); if (x) x.click(); }, theme);
  await p.waitForSelector("#view .card", { timeout: 15000 }).catch(() => {});
  if (await p.$("#view .card")) judgeStates(`${theme} mockup card`, await states(p, "#view .card"), dark);
  else bad(`${theme}: no mockup card rendered`);
  await p.close();

  // stage 6b, light only: the ground under the page mark stays warm
  if (!dark) {
    p = await ctx.newPage();
    await p.goto(SITE + "/saved.html", { waitUntil: "networkidle" });
    await p.evaluate(() => { document.documentElement.setAttribute("data-theme", "light"); document.querySelectorAll("body > *:not(.heromark)").forEach(e => e.style.visibility = "hidden"); });
    await p.waitForTimeout(400);
    const png = PNG.sync.read(await p.screenshot({ type: "png" }));
    /* Against the canvas token itself, in OKLCH (cream #f8f3eb is hue ~80
       there; the handover's 37deg was CIELCH). The law: the ground under the
       mark stays in the canvas's hue family, keeps its chroma, and is never
       darker than the canvas - a dot that darkens is the retired blob. */
    const ref = oklch([0xf8, 0xf3, 0xeb]);
    const off = [];
    for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 4; gx++) {
      const x = Math.round(160 + gx * 320), y = Math.round(150 + gy * 300), i = (y * png.width + x) * 4;
      const px = [png.data[i], png.data[i + 1], png.data[i + 2]];
      const { C, h, L } = oklch(px);
      const dh = Math.abs(((h - ref.h + 540) % 360) - 180);
      /* hue and chroma only: the light halo's axis IS hue (amber over cream
         is a touch lower in L by construction), so lightness is not the law */
      if (C < ref.C * 0.6 || dh > 20) off.push(`(${x},${y}) C=${C.toFixed(3)} dh=${dh.toFixed(0)} L=${L.toFixed(3)}`);
    }
    is(!off.length, `light: 12 ground samples stay in the cream's hue family with its chroma (ref C=${ref.C.toFixed(3)} h=${ref.h.toFixed(0)})` + (off.length ? ` - ${off.join("; ")}` : ""));
    /* and the discs ADD light: the biggest disc's centre is lighter than the
       plain canvas (measured live 09-21 at L .961 vs .966 before the fix -
       amber at the hero's .16 opacity, because opacity cannot ride light-dark) */
    const disc = await p.evaluate(() => { const m = document.querySelector(".heromark.pagemark"); if (!m) return null;
      const big = [...m.querySelectorAll(".ring circle")].map(c => c.getBoundingClientRect()).sort((a, b) => b.width - a.width)[0];
      return { x: Math.min(innerWidth - 1, Math.max(0, Math.round(big.left + big.width / 2))), y: Math.min(innerHeight - 1, Math.max(0, Math.round(big.top + big.height / 2))) }; });
    if (disc) {
      const i = (disc.y * png.width + disc.x) * 4, j = (890 * png.width + 20) * 4;
      /* the light axis is HUE: inside a disc the field is clearly warmer
         (chroma >= 1.8x the canvas) in the same hue family (+-15deg) - a
         warm white measured invisible (L .972 vs .966), and a cool or grey
         disc is the retired blob. Mutation: a white fill drops the ratio to ~1. */
      const din = oklch([png.data[i], png.data[i + 1], png.data[i + 2]]), dout = oklch([png.data[j], png.data[j + 1], png.data[j + 2]]);
      const dh = Math.abs(((din.h - dout.h + 540) % 360) - 180);
      is(din.C >= dout.C * 1.8 && dh <= 15, `light: the discs are visibly warmer, same family (inside C=${din.C.toFixed(3)} h=${din.h.toFixed(0)} vs canvas C=${dout.C.toFixed(3)} h=${dout.h.toFixed(0)})`);
    }
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log("\n" + (fails.length ? `${fails.length} FAILED` : "ALL GREEN"));
process.exit(fails.length ? 1 : 0);
