/**
 * counted — which counted events are machines, at the door and after the fact (2026-09-25).
 *
 * From 09-20 the stats page read ~2,000 visits a day. They were our own checks: the page
 * posts to this worker from wherever it is served, and every Playwright page is a fresh tab
 * with a fresh sid, so each deploy gate and nightly run landed as hundreds of visitors
 * (worker/tools/ev_quarantine.py moved them to ev_machine). The page now stays silent under
 * automation (navigator.webdriver); this is the worker's half. The user agent is READ here to
 * refuse the request and never stored, so a counted event still carries only what
 * privacy.html lists.
 *
 * Its own module, like retention.js, so worker/tools/check_ev_shape.mjs can import the rules
 * that ship.
 */

// Crawlers, link unfurlers, headless browsers and scripts. Word-ish "bot" so a phone model
// like "CUBOT" in a real Android Chrome UA is not refused. OkHttp (the Android app) and
// CFNetwork (the iOS app) are real clients and are deliberately not here.
const BOT_UA = /(?<!cu)bot(?:[\/\-_ ;),]|$)|crawl|spider|slurp|headless|facebookexternalhit|whatsapp|preview|lighthouse|playwright|puppeteer|curl\/|wget|python|node-fetch|undici|axios|go-http|java\//i;

export function isBotUA(ua) {
  return !ua || BOT_UA.test(ua);
}

/**
 * A day that looks like machines rather than people. Reasons, empty when it looks human.
 * Built from what the real 09-20..09-24 days looked like: ~2,000 one-event visits, a
 * hundred pastes and single-digit runs, and forty new visits inside one ten minutes.
 *   { people, pastes, runs, peak10 }  (peak10 = most new visits in any ten-minute bucket)
 */
export const SHAPE = { peak10: 15, pastesMin: 10, pastesPerRun: 4, peopleMin: 50, peoplePerRun: 50 };
export function botShaped(d) {
  const why = [];
  const runs = d.runs || 0;
  if ((d.peak10 || 0) >= SHAPE.peak10) why.push(`${d.peak10} new visits inside ten minutes`);
  if ((d.pastes || 0) >= SHAPE.pastesMin && runs * SHAPE.pastesPerRun < d.pastes) why.push(`${d.pastes} pastes but ${runs} runs`);
  if ((d.people || 0) >= SHAPE.peopleMin && runs * SHAPE.peoplePerRun < d.people) why.push(`${d.people} visits but ${runs} runs`);
  return why;
}
