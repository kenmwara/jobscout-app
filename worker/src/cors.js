/**
 * cors — who this API answers, and nobody else.
 *
 * Its own file with NO imports, deliberately. It lived in index.js first, and
 * check_cors.mjs imported it from there: on a laptop that worked, and in CI it
 * died with ERR_MODULE_NOT_FOUND on unpdf, because importing the worker pulls
 * the worker's whole dependency tree into a test that needs none of it. A
 * decision this small should not drag a PDF parser behind it.
 */
// The site is served from jobscout.page and calls this worker on workers.dev,
// so every browser request here is cross-origin and CORS is what decides
// whether the answer is readable.
//
// WHAT THIS DOES, AND WHAT IT DOES NOT, so nobody reads more into it later.
// It stops a third-party WEB PAGE from using this demo as its own free
// backend, which is the cheap drive-by abuse. It stops nothing else: curl and
// any server-side script send no Origin at all and never have to. The things
// that actually bound the bill are the hourly per-address cap and the $3 daily
// breaker, and that has not changed.
//
// NO ORIGIN MEANS NO HEADER, NOT A REFUSAL. The Android app calls this from a
// native HTTP client, which sends no Origin and ignores CORS entirely.
// Answering it without the header is correct; refusing it would break the app
// on every phone. That is the trap the July audit of the tbot dashboard warned
// about, where a naive https-only allowlist would have killed the Capacitor
// app, and it is the reason this is an allowlist and not a lockout.
// The last two are the hostnames index.html redirects away from. They are
// still listed because apply.html does NOT redirect: it calls the API from
// whatever host served it, so leaving them out would have quietly broken
// https://jobscout.tbot.trade/apply.html while every check stayed green.
const ALLOWED_ORIGINS = new Set([
  "https://jobscout.page",
  "https://nairobi.jobscout.page",
  "https://www.jobscout.page",
  "https://jobscout.tbot.trade",
]);
const ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)?jobscout-app\.pages\.dev$/,   // Pages, incl. previews
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,            // local development
];
export const allowOrigin = (request) => {
  const o = request.headers.get("origin");
  if (!o) return null;                                       // native app, curl, server
  if (ALLOWED_ORIGINS.has(o)) return o;
  return ORIGIN_PATTERNS.some((re) => re.test(o)) ? o : null;
};
// Vary, because the answer now differs by Origin and a cache that forgets that
// hands one caller another caller's headers.
export const CORS = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-filename",
  "Vary": "Origin",
};
