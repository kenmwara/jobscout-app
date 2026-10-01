// Your details fill the questions a résumé never settles (2026-09-30, Ken: "those screening
// questions, they only auto-fill one or two lines"). Real labels from the generic form and from
// Greenhouse/Ashby forms in the feed go in; the candidate's own words, or the matching option,
// must come out. Demographics must never be filled, whatever is passed.
//   node worker/tools/check_details.mjs
import { cleanDetails, detailFor, fitOption } from "../src/details.js";

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
const leaked = ["gender", "race"].filter(k => k in d);
if (leaked.length) { bad++; console.log(`  BAD  cleanDetails kept ${leaked.join(", ")}`); }
console.log(bad ? `VERDICT: FAIL (${bad})` : "VERDICT: PASS — your details answer what a résumé cannot, demographics never");
process.exit(bad ? 1 : 0);
