/* YOUR DETAILS (2026-09-30, Ken: "those screening questions, they only auto-fill one or two
   lines and then you have to fill in everything else"). A résumé almost never says whether you
   may work somewhere, your notice period or your LinkedIn, so the grounded drafter rightly left
   those blank on every form. These are the candidate's OWN answers, typed once and kept on their
   device; the worker reuses them, it never invents them, and it stores none of them.
   Demographics are not on the list and never will be: they stay "yours alone". */
export const DEMOGRAPHIC = /gender|pronoun|race|ethnic|veteran|disab|self.?identif|demograph|birth|\bage\b|criminal|conviction|sexual|religio/i;
export const DETAIL_RULES = [            // first match wins, so the narrow ones go first
  ["sponsorship", /sponsor/i],
  ["work_auth",   /authori[sz]|eligib|right to work|work permit|visa|citizen|legally/i],
  ["notice",      /notice|start date|earliest|available to start|availability|when can you start/i],
  ["years",       /years? of (relevant |professional )?experience|how many years/i],
  ["salary",      /salary|compensation|pay expectation|expected (pay|rate)|desired pay/i],
  ["linkedin",    /linkedin/i],
  ["portfolio",   /portfolio|github|website|personal site/i],
  ["email",       /e-?mail/i],
  ["phone",       /phone|mobile/i],
  ["first_name",  /first name|given name/i],
  ["last_name",   /last name|surname|family name/i],
  ["name",        /full name|^\s*name\s*\*?\s*$/i],
  ["location",    /where .*(located|based|live)|current(ly)? (location|city)|^\s*(location|city)\b|country of residence|based in/i],
];
export const DETAIL_KEYS = ["name", "email", "phone", "location", "work_auth", "sponsorship", "notice", "years", "linkedin", "portfolio", "salary"];
export function cleanDetails(raw) {
  const d = {};
  if (raw && typeof raw === "object")
    for (const k of DETAIL_KEYS) {
      const v = String(raw[k] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (v) d[k] = v;
    }
  return d;
}
/* A question about SOMEONE ELSE, or an earlier tie to the employer, is not the candidate's own
   detail even when it names one: "If you were previously employed by Remote, please share the
   email" was answered with the candidate's own email on the live worker (2026-10-01). */
export const NOT_YOURS = /previous(ly)?|former(ly)?|prior employ|referr|referee|\breferences?\b|recruiter|manager|supervisor|emergency|if you were|alumn/i;
export function detailFor(label, d) {
  if (DEMOGRAPHIC.test(label) || NOT_YOURS.test(label)) return null;
  for (const [k, rx] of DETAIL_RULES) {
    if (!rx.test(label)) continue;
    if (k === "first_name") return d.name ? d.name.split(" ")[0] : null;
    if (k === "last_name") return d.name && d.name.includes(" ") ? d.name.split(" ").slice(1).join(" ") : null;
    return d[k] || null;
  }
  return null;
}
/* Which of your details a question asks for, or null. The page keeps what the candidate types
   into that question's box under this key, so the next form that asks it is already answered:
   asked once, where it comes up, never up front (Ken, 2026-10-01: "having her fill in all that
   info is pointless"). */
export function detailKey(label) {
  if (DEMOGRAPHIC.test(label) || NOT_YOURS.test(label)) return null;
  const hit = DETAIL_RULES.find(([, rx]) => rx.test(label));
  return hit ? (hit[0] === "first_name" || hit[0] === "last_name" ? "name" : hit[0]) : null;
}
/* What the CV itself says, copied character for character: no model, so nothing invented.
   Ken, 2026-10-01: "tapping Upload File doesn't require her to fill in JobScout's many forms" -
   M-KOPA's own form lifts name, email and phone from a résumé, so JobScout must too. */
const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const PHONE = /(?:\+|\b0)\d[\d ()-]{7,16}\d/;
const LINKEDIN = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?/i;
const SITE = /(?:https?:\/\/)?(?:www\.)?(?:github\.com\/[\w-]+|[\w-]+\.(?:dev|io|me|site|page|com)(?:\/[\w-]*)?)(?=[\s|,;)]|$)/i;
export function fromProfile(profile) {
  const t = String(profile || ""), d = {};
  const first = t.split("\n").map(s => s.trim()).find(Boolean) || "";
  // a name line: two to four words of letters, nothing else on it
  const nm = /^([\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){1,3})\s*$/u.exec(first.replace(/\s*[|·•,].*$/, ""));
  if (nm && !/curriculum|resume|résumé|cv\b/i.test(nm[1])) d.name = nm[1];
  const e = EMAIL.exec(t); if (e) d.email = e[0];
  const p = PHONE.exec(t); if (p) d.phone = p[0].trim();
  const li = LINKEDIN.exec(t); if (li) d.linkedin = li[0];
  const s = SITE.exec(t.replace(EMAIL, " ").replace(LINKEDIN, " ")); if (s) d.portfolio = s[0];
  return d;
}
/* A choice question takes one of ITS options, never free text. Yes/No collapse to their
   first word ("Yes, I am authorised" answers a "Yes" option); otherwise an option that the
   detail contains, or that contains the detail, wins. No match: left for the candidate, with
   their own words shown so they can pick. */
export function fitOption(value, options) {
  if (!options.length) return value;
  const v = value.toLowerCase().trim();
  const yn = /^(yes|no)\b/.exec(v)?.[1];
  const hit = options.find(o => o.toLowerCase().trim() === v)
    || (yn && options.find(o => o.toLowerCase().trim().startsWith(yn)))
    || options.find(o => o.length > 2 && (v.includes(o.toLowerCase()) || o.toLowerCase().includes(v)));
  return hit || "";
}
export const MOTIVATION = /\bwhy\b|interest|motivat|tell us about yourself|about you\b|what (excites|attracts|draws)|mission|values|resonat/i;

/* Grounding helpers, here (pure, no imports) so the checks can load them without the worker's
   own dependencies (unpdf): importing index.js from a check broke the CI gate on 1 Oct. */
export const squash = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const inProfile = (profile, phrase) => phrase.trim().length >= 8 && squash(profile).includes(squash(phrase));
/* A drafted answer may lean on more than one line of the résumé. The model cites them joined
   with "; ", and a joined citation is not one contiguous run of the profile, so a correct,
   grounded mission answer was thrown away on every run (Shyro x M-KOPA, 2026-10-01). Each
   part must still be in the profile, verbatim: the guard is no looser, only able to read a list. */
export const AUTH_EVIDENCE = /citizen|nationality|authori[sz]ed|right to work|work permit|permit|visa|resident|sponsorship/i;
export const citesProfile = (profile, from) => {
  const parts = String(from || "").split(/\s*;\s*/).filter(p => p.trim());
  return parts.length > 0 && parts.every(p => inProfile(profile, p));
};
