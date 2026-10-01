// Your details fill the questions a résumé never settles (2026-09-30, Ken: "those screening
// questions, they only auto-fill one or two lines"). Real labels from the generic form and from
// Greenhouse/Ashby forms in the feed go in; the candidate's own words, or the matching option,
// must come out. Demographics must never be filled, whatever is passed.
//   node worker/tools/check_details.mjs
import { cleanDetails, detailFor, detailKey, fitOption, fromProfile } from "../src/details.js";
import { citesProfile, AUTH_EVIDENCE } from "../src/details.js";

const d = cleanDetails({
  name: "Wanjiru Kamau", email: "w@example.com", phone: "+254 700 000 000", location: "Nairobi, Kenya",
  work_auth: "Yes, Kenyan citizen", sponsorship: "No", notice: "Two weeks", years: "6",
  linkedin: "linkedin.com/in/example", portfolio: "", salary: "",
  gender: "Female", race: "Black",                     // not keys: must be dropped
});
const fill = (label, options = []) => { const v = detailFor(label, d); return v === null ? null : fitOption(v, options); };

const cases = [
  ["Are you legally authorised to work in the country this role is based in?", [], "Yes, Kenyan citizen"],
  ["Will you now or in the future require visa sponsorship?", ["Yes", "No"], "No"],
  ["Are you authorized to work in Kenya?", ["Yes", "No"], "Yes"],
  ["Where are you currently located?", [], "Nairobi, Kenya"],
  ["What is your notice period, or your earliest start date?", [], "Two weeks"],
  ["How many years of relevant experience do you have for this role?", [], "6"],
  ["LinkedIn profile", [], "linkedin.com/in/example"],
  ["Portfolio or GitHub", [], null],                    // left blank by the candidate: stays open
  ["First Name", [], "Wanjiru"],
  ["Last Name", [], "Kamau"],
  ["Email", [], "w@example.com"],
  ["Phone", [], "+254 700 000 000"],
  ["Salary expectations", [], null],                   // only ever from details, and none given
  ["Gender", ["Female", "Male"], null],                // demographics: never
  // a demographic question that ALSO reads like a detail ("citizen") must still be refused
  ["Are you a U.S. veteran or citizen?", ["Yes", "No"], null],
  // the yes/no collapse: a bare "No" must take the No option, not the first option that
  // merely CONTAINS the letters "no" ("now")
  ["Do you require sponsorship?", ["Yes, I will need it now", "No, I will not"], "No, I will not"],
  ["Are you a protected veteran?", ["Yes", "No"], null],
  ["Why are you interested in this role?", [], null],  // the drafter's, not a detail
  // about an earlier tie or another person: never the candidate's own email/phone (live, 2026-10-01)
  ["If you were previously employed by Remote, please share the email you used", [], null],
  ["Referrer's email", [], null],
];
let bad = 0;
for (const [label, options, want] of cases) {
  const got = fill(label, options);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "  ok " : "  BAD"}  ${label.slice(0, 70)} -> ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
}
// From the CV itself (Ken, 2026-10-01: "tapping Upload File doesn't require her to fill in
// JobScout's many forms"): name, email, phone, LinkedIn and a site, copied, never written.
const cv = fromProfile("Achieng Otieno\nNgong Road, Nairobi | +254 711 222 333 | achieng.o@example.com\n" +
  "linkedin.com/in/achieng-otieno · achieng.dev\nOPERATIONS MANAGER\nRan dispatch for 40 riders.");
const want = { name: "Achieng Otieno", email: "achieng.o@example.com", phone: "+254 711 222 333",
               linkedin: "linkedin.com/in/achieng-otieno", portfolio: "achieng.dev" };
for (const [k, v] of Object.entries(want)) {
  const ok = cv[k] === v; if (!ok) bad++;
  console.log(`${ok ? "  ok " : "  BAD"}  from the CV: ${k} -> ${JSON.stringify(cv[k])}${ok ? "" : ` (want ${JSON.stringify(v)})`}`);
}
if (fromProfile("CURRICULUM VITAE\nSummary...").name) { bad++; console.log("  BAD  a 'Curriculum Vitae' heading was taken for a name"); }
// what she types into a question's box is kept under the detail it IS, so the next form has it
for (const [label, k] of [["What is your expected monthly gross salary in KES?", "salary"], ["Notice period", "notice"],
                          ["First Name", "name"], ["Please confirm your gender?", null], ["Referrer's email", null]]) {
  const ok = detailKey(label) === k; if (!ok) bad++;
  console.log(`${ok ? "  ok " : "  BAD"}  remembered as: ${label} -> ${detailKey(label)}`);
}
// A drafted answer may cite several résumé lines joined by "; " (Shyro x M-KOPA, 2026-10-01: the
// mission answer was grounded but dropped every run). Each part must still be verbatim in the profile.
const P = "Operations manager at Siri Studio, Nairobi, since 2024.\nFounder & Operator · S-Ryder, Nairobi 2026 – Present";
for (const [from, want] of [
  ["Operations manager at Siri Studio; Founder & Operator · S-Ryder", true],     // two real lines
  ["Operations manager at Siri Studio", true],                                     // one
  ["Operations manager at Siri Studio; Head of Global Logistics", false],         // one part invented
  ["", false],
  ["Siri; S-Ryder", false],                                                         // parts too short to cite
]) {
  const ok = citesProfile(P, from) === want; if (!ok) bad++;
  console.log(`${ok ? "  ok " : "  BAD"}  citation "${from}" -> ${citesProfile(P, from)}`);
}
// a right-to-work answer needs a line ABOUT authorisation, not any line (M-KOPA, 1 Oct: cited "Legal name: ...")
for (const [from, want] of [["Legal name: Alice Wanjiru Ogolla", false], ["Kenyan citizen", true], ["Canadian permanent resident", true],
                            ["Open work permit valid to 2028", true], ["Ngong Road, Nairobi", false]]) {
  const ok = AUTH_EVIDENCE.test(from) === want; if (!ok) bad++;
  console.log(`${ok ? "  ok " : "  BAD"}  right-to-work evidence "${from}" -> ${AUTH_EVIDENCE.test(from)}`);
}
const leaked = ["gender", "race"].filter(k => k in d);
if (leaked.length) { bad++; console.log(`  BAD  cleanDetails kept ${leaked.join(", ")}`); }
console.log(bad ? `VERDICT: FAIL (${bad})` : "VERDICT: PASS — your details answer what a résumé cannot, demographics never");
process.exit(bad ? 1 : 0);
