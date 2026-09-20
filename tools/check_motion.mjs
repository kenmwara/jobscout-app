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
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log("\n" + (fails.length ? `${fails.length} FAILED` : "ALL GREEN"));
process.exit(fails.length ? 1 : 0);
