/**
 * The link-preview card, per market.
 *
 * Both markets are ONE Pages project and one index.html — the market is decided
 * in the browser from the hostname (MARKET in index.html). That works for the
 * page and not at all for a link preview: WhatsApp, Slack and every other
 * unfurler reads the static <meta> tags and never runs the page's JavaScript.
 * So nairobi.jobscout.page was previewing as the Canadian site, down to an
 * `og:url` pointing at jobscout.page, with nothing in the card to say Kenya.
 *
 * Found the day it mattered: a Kenyan link was about to be the first thing a
 * reader saw of this product.
 *
 * WHY A WORKER RATHER THAN A SECOND BUILD. The alternative is a separate page
 * or a separate project per market, which is a second copy of the whole site to
 * keep in step — the exact duplication the one-engine design exists to avoid.
 * This rewrites four tags on the way out and touches nothing else.
 *
 * WHY _worker.js AND NOT functions/. This is a DIRECT-UPLOAD Pages project;
 * `wrangler pages deploy site` has no --functions-directory flag (checked on
 * 4.95.0) and looks for `functions/` relative to the working directory, not
 * inside the deployed one. `_worker.js` inside the deployed directory is the
 * mechanism that is actually picked up here.
 *
 * FAIL-SAFE BY CONSTRUCTION. Everything after the asset fetch is wrapped: any
 * error at all returns the untouched response. The worst case this can produce
 * is a preview card that did not change. It cannot take the site down, which is
 * the only reason a cosmetic fix belongs in the request path at all.
 */

/** Hosts that are not the default market. Anything absent is served untouched. */
const MARKETS = {
  "nairobi.jobscout.page": {
    url: "https://nairobi.jobscout.page/",
    title: "JobScout Kenya — an LLM reads the job market honestly",
    // The <meta name="description">, which is the long one.
    description:
      "Live: Claude scores this morning's real Kenyan postings against a real CV — honest verdicts, the reasoning shown, and the question most “remote” listings never answer: can this employer hire from Kenya at all?",
    // og: and twitter: descriptions, which are read in a card and must be short.
    card: "This morning's real Kenyan postings, scored against your CV. Every reason shown, including the ones that say no.",
  },
};

class Tags {
  constructor(market) {
    this.m = market;
  }
  element(el) {
    const key = el.getAttribute("property") || el.getAttribute("name");
    if (!key) return;
    if (key === "og:url") el.setAttribute("content", this.m.url);
    else if (key === "og:title" || key === "twitter:title") el.setAttribute("content", this.m.title);
    else if (key === "description") el.setAttribute("content", this.m.description);
    else if (key === "og:description" || key === "twitter:description")
      el.setAttribute("content", this.m.card);
  }
}

class Title {
  constructor(market) {
    this.m = market;
  }
  element(el) {
    el.setInnerContent(this.m.title);
  }
}

export default {
  async fetch(request, env) {
    // Whatever Pages would have served, headers and _headers rules included.
    const res = await env.ASSETS.fetch(request);
    try {
      const market = MARKETS[new URL(request.url).hostname];
      if (!market) return res;
      if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
      return new HTMLRewriter()
        .on("title", new Title(market))
        .on("meta", new Tags(market))
        .transform(res);
    } catch {
      return res;
    }
  },
};
