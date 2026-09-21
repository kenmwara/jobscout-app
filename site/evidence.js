/* THE HONESTY LAW AS CODE (design system v3, stage 4), not as intention.

   Two lines are allowed about a match, and they mean opposite things:
     STRONGEST        what the resume HAS that this posting wants
     WHAT TO ANSWER   what the posting ASKS that the resume does not evidence
   plus THEY ARE ASKING FOR, a quotation from the posting, attributed.

   validate() runs at render time and in tools/check_honesty.mjs. A line that
   fails is NOT shown: showing a line that overclaims is worse than none.
   allowedOn() is the placement rule as a function, so it cannot be forgotten
   at a call site: a browse card carries STRONGEST only (never lead with a
   gap), a saved row carries no prose, the apply page carries both.

   Measured 2026-09-21 against eight real scorer lines: 0/8 STRONGEST and
   2/8 answers passed as the scorer wrote them (no resume anchor; over 240
   chars). The scorer's prompt was changed the same day to anchor and to cap;
   this is the gate that keeps it honest if it drifts.

   Classic script AND CommonJS, like band.js. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.JSEvidence = api;
})(typeof self !== "undefined" ? self : this, function () {
  const KIND = Object.freeze({ STRONGEST: "strongest", ANSWER: "answer", QUOTED: "quoted" });
  /* Words that sell. The product is free and public and has nothing to sell. */
  const PERSUASION = ["perfect", "ideal candidate", "dream", "amazing", "incredible", "stand out",
    "don’t miss", "dont miss", "act fast", "hurry", "guaranteed", "unlock", "supercharge",
    "game-chang", "best-in-class", "world-class", "must-apply", "you’ll love", "youll love", "no-brainer"];
  /* Assertions about the reader the scorer cannot know. "You have led teams"
     is a claim; "the resume shows team leadership" is an observation. */
  const CLAIMS_ABOUT_READER = [
    /\byou (?:have|'ve|ve) (?:led|built|shipped|managed|delivered|run)\b/i,
    /\byou are (?:a |an )?(?:great|strong|excellent|perfect|ideal)\b/i,
    /\byou will (?:get|land|win|succeed)\b/i,
    /\byour (?:experience|background) (?:is|makes you) (?:perfect|ideal|a match)\b/i,
  ];
  /* A STRONGEST line points at the document; an ANSWER line at the demand. */
  const RESUME_ANCHOR = /\b(r[eé]sum[eé]|profile|experience|work|background|projects?|lab work|the same|certif|degree|years?)\b/i;
  const POSTING_ANCHOR = /\b(posting|role|they|this job|listed|asks?|requires?|wants?|needs?|calls? for|expects?)\b/i;
  const LIMITS = Object.freeze({ min: 20, max: 240 });
  const COPY_LIMIT = Object.freeze({ lede: 160, explanation: 420 });
  /* Deficiency framing: naming the reader's document as the thing that is
     wrong. "The resume is the gap" is a verdict on what they have; "aiming
     the resume first is worth more than the letter" compares two moves. */
  const DEFICIENCY = [
    /\bis the gap\b/i,
    /\byour (?:r[eé]sum[eé]|experience|background) (?:is|lacks|does not|doesn’t)\b/i,
    /\b(?:too|not) (?:weak|thin|light|enough)\b/i,
    /\byou (?:are )?missing\b/i,
    /\bfalls? short\b/i,
  ];
  function content(t, reasons) {
    const low = t.toLowerCase();
    for (const w of PERSUASION) if (low.includes(w)) reasons.push(`persuasion: "${w}"`);
    for (const re of CLAIMS_ABOUT_READER) if (re.test(t)) reasons.push(`claims something about the reader: ${re}`);
  }
  function validate(kind, text) {
    const reasons = [], t = String(text || "").trim();
    if (t.length < LIMITS.min) reasons.push(`shorter than ${LIMITS.min} chars - say something or say nothing`);
    if (t.length > LIMITS.max) reasons.push(`longer than ${LIMITS.max} chars - this is one line, not a paragraph`);
    content(t, reasons);
    if (kind === KIND.STRONGEST) {
      if (!RESUME_ANCHOR.test(t)) reasons.push("STRONGEST must point at the resume, not at the reader");
      if (/\b(lacks?|missing|does not|doesn’t|no evidence)\b/i.test(t)) reasons.push("STRONGEST states what is THERE; a gap belongs in WHAT TO ANSWER");
    }
    if (kind === KIND.ANSWER && !POSTING_ANCHOR.test(t)) reasons.push("WHAT TO ANSWER must point at what the posting asks");
    if (kind === KIND.QUOTED && t.length > 400) reasons.push("a quotation longer than 400 chars is a wall, not evidence");
    return { ok: reasons.length === 0, reasons };
  }
  /* Where a line may appear. The site's apply page is the detail AND the
     prepare screen in one, so it takes "detail". */
  function allowedOn(kind, surface) {
    switch (surface) {
      case "browse": return kind === KIND.STRONGEST;
      case "saved": return false;
      case "detail": return kind !== KIND.QUOTED;
      case "prepare": return kind === KIND.ANSWER;
      case "matches": return kind === KIND.QUOTED;
      default: return false;
    }
  }
  /* Screen-level copy: a lede (one line, the next move) or an explanation (a
     paragraph that does real work when the news is bad). Same content law. */
  function validateLede(text, kind) {
    const t = String(text || "").trim(), reasons = [];
    content(t, reasons);
    for (const re of DEFICIENCY) if (re.test(t)) reasons.push(`leads with a lack: ${re}`);
    const cap = COPY_LIMIT[kind || "lede"] || COPY_LIMIT.lede;
    if (t.length > cap) reasons.push(`${kind || "lede"} over ${cap} chars`);
    return { ok: reasons.length === 0, reasons };
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* Render or refuse. Never render an invalid line. */
  function render(kind, text, surface) {
    if (!allowedOn(kind, surface)) return "";
    const v = validate(kind, text);
    if (!v.ok) { if (typeof console !== "undefined") console.warn(`[evidence] refused on ${surface}:`, v.reasons, text); return ""; }
    const key = kind === KIND.STRONGEST ? "Strongest" : kind === KIND.ANSWER ? "↓ What to answer" : "They are asking for";
    const mod = kind === KIND.STRONGEST ? "ev--strongest" : kind === KIND.ANSWER ? "ev--answer" : "ev--quoted";
    return `<div class="ev ${mod}"><p class="ev__k">${key}</p><p class="ev__b">${esc(text)}</p></div>`;
  }
  return { KIND, LIMITS, COPY_LIMIT, validate, validateLede, allowedOn, render };
});
