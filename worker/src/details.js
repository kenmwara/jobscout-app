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
export function detailFor(label, d) {
  if (DEMOGRAPHIC.test(label)) return null;
  for (const [k, rx] of DETAIL_RULES) {
    if (!rx.test(label)) continue;
    if (k === "first_name") return d.name ? d.name.split(" ")[0] : null;
    if (k === "last_name") return d.name && d.name.includes(" ") ? d.name.split(" ").slice(1).join(" ") : null;
    return d[k] || null;
  }
  return null;
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
export const MOTIVATION = /\bwhy\b|interest|motivat|tell us about yourself|about you\b|what (excites|attracts|draws)/i;
