import { chromium } from "playwright";
// Stills for a design handover: the LIVE site per market host (the market is
// the hostname, so a local server can only ever show Canada), the phone
// mockup driven through its own rail, and nothing that the page did not do
// itself. node tools/handover_shots.mjs  (mockup needs: python -m http.server 8766 --directory mockups)
const HOST = { ca: "https://jobscout.page/", ke: "https://nairobi.jobscout.page/" };
const OUT = "docs/handover/2026-09-20/";
const b = await chromium.launch();
const shots = [];
for (const [w, h, tag] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
  for (const theme of ["light", "dark"]) {
    for (const market of ["ca", "ke"]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.addInitScript(([t, m]) => { localStorage.setItem("theme", t); localStorage.setItem("market", m); }, [theme, market]);
      for (const [route, name] of [["index.html", "landing"], ["index.html#browse", "browse"], ["saved.html", "saved"]]) {
        await p.goto(HOST[market] + route, { waitUntil: "networkidle" }).catch(() => {});
        await p.evaluate(([t, m]) => {
          document.documentElement.setAttribute("data-theme", t);
          if (location.hash === "#browse" && typeof setView === "function") setView("browse");
        }, [theme, market]);
        // the sector tiles come from the feed; shoot nothing until they exist.
        // Viewport frames only: fullPage stretches the fixed ground into bands.
        await p.waitForFunction(() => /\d+ open/.test(document.body.innerText), null, { timeout: 10000 }).catch(() => {});
        await p.waitForTimeout(800);
        const f = `${OUT}web-${name}-${market}-${theme}-${tag}.png`;
        await p.screenshot({ path: f });
        shots.push(f);
        if (name === "landing") {
          await p.evaluate(() => window.scrollBy(0, innerHeight * 0.9));
          await p.waitForTimeout(500);
          const f2 = f.replace("landing-", "landing-2-");
          await p.screenshot({ path: f2 });
          shots.push(f2);
        }
      }
      await ctx.close();
    }
  }
}
// the phone mockup, both markets and themes
for (const theme of ["light", "dark"]) for (const market of ["ca", "ke"]) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:8766/mobile.html", { waitUntil: "networkidle" }).catch(() => {});
  await p.evaluate(([t, m]) => {
    const press = word => { const b = [...document.querySelectorAll("button")].find(x => x.textContent.toLowerCase().includes(word)); if (b) b.click(); return !!b; };
    press(m === "ke" ? "kenya" : "canada"); press(t);
  }, [theme, market]);
  await p.waitForTimeout(1200);
  const f = `${OUT}mockup-${market}-${theme}.png`;
  await p.screenshot({ path: f });
  shots.push(f);
  await ctx.close();
}
await b.close();
console.log(shots.length + " shots");
