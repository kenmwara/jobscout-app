/**
 * security — JobScout's half of the SOAR (2026-09-25).
 *
 * Until today the worker defended itself silently: the per-IP cap answered 429, the daily budget
 * breaker served a cached run, the feed secret refused a publisher, and nobody ever heard about any
 * of it. These events go to the same SIEM as the rest of the estate (the ops event store behind
 * ops.tbot.trade/soar) through a service binding to ingest-worker; "warning" pages the ops Telegram.
 *
 * What an event carries: a title, a few fields named below, and the requester's IP and country.
 * The IP is there because a response (a ban) needs it, and it is ONLY ever in a security event,
 * never in the counted-events table (privacy.html says so). A submitted résumé is never in an
 * event: a prompt-injection hit records WHICH patterns matched, not the text.
 *
 * Its own module, like counted.js and retention.js, so worker/tools/check_security.mjs tests the
 * rules that ship.
 */

const INGEST_URL = "https://ingest-worker.kenmwara.workers.dev/ingest";

// How long the SIEM keeps a JobScout security event (they carry an IP). ENFORCED in the ops read-api
// (Operations Dashboard workers/read-api, the sec_logs trim); privacy.html#security-events states it.
export const SECURITY_EVENT_KEEP_DAYS = 90;

// Instructions aimed at the model rather than at an employer. A CV has no reason to talk to an
// AI about its own instructions; each pattern is phrased so an honest CV cannot trip it by
// accident ("ignore" alone, "system administrator", "prompt delivery" all pass).
export const INJECTION = [
  ["ignore-instructions", /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your|the)\b[^.\n]{0,25}\b(instructions?|prompts?|rules|directions)\b/i],
  ["new-instructions",    /\b(new|updated|real|actual)\s+(system\s+)?instructions?\s*[:\-]/i],
  ["role-override",       /\byou are (now|no longer)\b|\bact as (an?|the)\s+(ai|assistant|model|system)\b|\bfrom now on,? you\b/i],
  ["system-prompt",       /\b(system|developer)\s+(prompt|message|instructions?)\b|<\/?\s*(system|assistant|instructions?)\s*>/i],
  ["score-demand",        /\b(score|rate|grade|mark)\b[^.\n]{0,30}\b(100|10\s*\/\s*10|100\s*\/\s*100|perfect|maximum|highest)\b[^.\n]{0,40}\b(regardless|no matter|whatever|always|must|required)\b/i],
  ["model-address",       /\b(dear|attention|note to|message (for|to))\s+(the\s+)?(ai|llm|model|claude|chatgpt|gpt|assistant|language model|screening (bot|system|ai))\b/i],
  ["hidden-marker",       /\[(inst|\/inst|system)\]|<\|im_start\|>|<\|(system|assistant|user)\|>|###\s*(system|instruction)/i],
];

export function injectionMarkers(text) {
  const t = String(text || "");
  return INJECTION.filter(([, re]) => re.test(t)).map(([name]) => name);
}

/** One event per key: the first caller claims it, the rest are told to stay quiet. The key
 *  carries its own time bucket (hour or day), so "once" means once per bucket. */
export async function once(env, key) {
  try {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO sec_seen (k, ts_ms) VALUES (?, ?)").bind(key, Date.now()).run();
    return (r.meta?.changes ?? 0) > 0;
  } catch { return true; }          // a dedupe failure should never silence an event
}

export const hourBucket = () => new Date().toISOString().slice(0, 13);   // 2026-09-25T07
export const dayBucket = () => new Date().toISOString().slice(0, 10);

/** Send a security event. Never throws and never blocks the answer for long: the ingest worker is
 *  reached over the service binding (a worker cannot fetch another worker's workers.dev URL). */
export async function audit(env, request, severity, title, details = {}) {
  if (!env.INGEST_SECRET) return false;
  const ua = request?.headers.get("user-agent") || "";
  if (ua.includes("redteam.py")) return false;           // the nightly red team is expected, not an incident
  const body = JSON.stringify({
    event_type: "system",
    title: `🔐 jobscout: ${title}`.slice(0, 500),
    payload_json: {
      silent_telegram: severity === "info", bot_event_type: "security", surface: "jobscout", severity,
      details: request
        ? { ...details, ip: request.headers.get("cf-connecting-ip"), country: request.headers.get("cf-ipcountry") }
        : details,
      ts: new Date().toISOString(),
    },
  });
  const send = env.INGEST ? (u, i) => env.INGEST.fetch(u, i) : fetch;
  try {
    const r = await send(INGEST_URL, { method: "POST", body, headers: {
      "content-type": "application/json", "x-ingest-secret": env.INGEST_SECRET, "user-agent": "jobscout-app-api/1.0" } });
    return r.ok;
  } catch { return false; }
}

/** The operator's switch (SOAR playbook pause-scoring / resume-scoring). Paused = every paid model
 *  call answers the way the spent budget does, so pausing adds no new failure mode. */
export async function paused(env) {
  try {
    const r = await env.DB.prepare("SELECT v FROM control WHERE k = 'scoring_paused'").first();
    return r?.v === "1";
  } catch { return false; }
}

/** Constant-time-ish comparison for the shared secrets (length leak only). */
export function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
