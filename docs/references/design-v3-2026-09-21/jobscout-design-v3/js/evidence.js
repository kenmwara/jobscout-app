/* ===========================================================================
   evidence.js — the honesty law, as code rather than as good intentions.

   Two lines are allowed to appear about a match, and they mean opposite
   things:

     STRONGEST        what the resume HAS that this posting wants.
     WHAT TO ANSWER   what the posting ASKS that the resume does not evidence.

   The law: never claim what the reader has not done, never lead with what
   they lack, never persuade. A browse card carries STRONGEST only —
   what-to-answer stays behind the tap, because a card that leads with a gap
   leads with what the reader lacks.

   validate() is called at render time and in tools/check_honesty.mjs. A line
   that fails is not shown; showing a line that overclaims is worse than
   showing none.
   =========================================================================== */

export const KIND = Object.freeze({
  STRONGEST: 'strongest',   /* from the resume  */
  ANSWER:    'answer',      /* from the posting */
  QUOTED:    'quoted',      /* verbatim from the posting, attributed */
});

/* Words that sell. The product is free and public and has nothing to sell, so
   none of these belong in a line about a job. */
const PERSUASION = [
  'perfect', 'ideal candidate', 'dream', 'amazing', 'incredible', 'stand out',
  'don’t miss', 'dont miss', 'act fast', 'hurry', 'guaranteed', 'unlock',
  'supercharge', 'game-chang', 'best-in-class', 'world-class', 'must-apply',
  'you’ll love', 'youll love', 'no-brainer',
];

/* Constructions that assert something about the reader that the scorer cannot
   know. "You have led teams" is a claim; "the resume shows team leadership"
   is an observation about a document. */
const CLAIMS_ABOUT_READER = [
  /\byou (?:have|'ve|ve) (?:led|built|shipped|managed|delivered|run)\b/i,
  /\byou are (?:a |an )?(?:great|strong|excellent|perfect|ideal)\b/i,
  /\byou will (?:get|land|win|succeed)\b/i,
  /\byour (?:experience|background) (?:is|makes you) (?:perfect|ideal|a match)\b/i,
];

/* A STRONGEST line must point at the resume, not at the reader's worth. */
const RESUME_ANCHOR = /\b(resume|experience|work|background|projects?|lab work|the same)\b/i;
/* An ANSWER line must point at the posting's demand. */
const POSTING_ANCHOR = /\b(posting|role|they|this job|listed|asks?|requires?|wants?)\b/i;

export const LIMITS = Object.freeze({ min: 20, max: 240 });

/**
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function validate(kind, text) {
  const reasons = [];
  const t = String(text || '').trim();

  if (t.length < LIMITS.min) reasons.push(`shorter than ${LIMITS.min} chars — say something or say nothing`);
  if (t.length > LIMITS.max) reasons.push(`longer than ${LIMITS.max} chars — this is one line, not a paragraph`);

  const low = t.toLowerCase();
  for (const w of PERSUASION) if (low.includes(w)) reasons.push(`persuasion: "${w}"`);
  for (const re of CLAIMS_ABOUT_READER) if (re.test(t)) reasons.push(`claims something about the reader: ${re}`);

  if (kind === KIND.STRONGEST) {
    if (!RESUME_ANCHOR.test(t)) reasons.push('STRONGEST must point at the resume, not at the reader');
    if (/\b(lacks?|missing|does not|doesn’t|no evidence)\b/i.test(t))
      reasons.push('STRONGEST states what is THERE; a gap belongs in WHAT TO ANSWER');
  }
  if (kind === KIND.ANSWER) {
    if (!POSTING_ANCHOR.test(t)) reasons.push('WHAT TO ANSWER must point at what the posting asks');
  }
  if (kind === KIND.QUOTED) {
    if (t.length > 400) reasons.push('a quotation longer than 400 chars is a wall, not evidence');
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Where a line is ALLOWED to appear. This is the law-12 placement rule, and
 * it is a function so it cannot be forgotten at a call site.
 */
export function allowedOn(kind, surface) {
  switch (surface) {
    case 'browse':  return kind === KIND.STRONGEST;   /* never lead with a gap */
    case 'saved':   return false;                     /* a row carries no prose */
    case 'detail':  return kind !== KIND.QUOTED;
    case 'prepare': return kind === KIND.ANSWER;
    case 'matches': return kind === KIND.QUOTED;      /* their demand, attributed */
    default:        return false;
  }
}

/* Deficiency framing: naming the reader's document as the thing that is
   wrong. "The resume is the gap" is a verdict on what they have; "aiming the
   resume first is worth more than the letter" is a comparison of two moves.
   The second says the same thing operationally and claims nothing.

   This was caught in review: the prepare screen's lede led with a lack, which
   the law forbids on a card, and the law had simply never been extended to
   screen copy. A rule that only polices the easy place is not a rule. */
const DEFICIENCY = [
  /\bis the gap\b/i,
  /\byour (?:resume|experience|background) (?:is|lacks|does not|doesn\u2019t)\b/i,
  /\b(?:too|not) (?:weak|thin|light|enough)\b/i,
  /\byou (?:are )?missing\b/i,
  /\bfalls? short\b/i,
];

/**
 * Screen-level copy. Two kinds, and conflating them was a mistake this rule
 * made on its first run:
 *
 *   'lede'        one line that explains the screen's next move. Capped at
 *                 160 characters, because past that it stops being a lede.
 *   'explanation' a paragraph that does real work when the news is bad —
 *                 the weak-day message, an empty state, a refusal. NOT
 *                 capped at a lede's length. A first draft of this function
 *                 capped everything at 160 and failed the best paragraph in
 *                 the product. The length rule was wrong, not the copy.
 *
 * Both are held to the same CONTENT law: no persuasion, no claim about the
 * reader, no framing the reader's document as deficient. Comparing two
 * ACTIONS is always allowed — "aiming the resume first is worth more than the
 * letter" says what "the resume is the gap" says, and claims nothing.
 *
 * @returns {{ok: boolean, reasons: string[]}}
 */
export const COPY_LIMIT = Object.freeze({ lede: 160, explanation: 420 });

export function validateLede(text, kind = 'lede') {
  const t = String(text || '').trim();
  const reasons = [];
  const low = t.toLowerCase();
  for (const w of PERSUASION) if (low.includes(w)) reasons.push(`persuasion: "${w}"`);
  for (const re of CLAIMS_ABOUT_READER) if (re.test(t)) reasons.push(`claims something about the reader: ${re}`);
  for (const re of DEFICIENCY) if (re.test(t)) reasons.push(`leads with a lack: ${re}`);
  const cap = COPY_LIMIT[kind] ?? COPY_LIMIT.lede;
  if (t.length > cap) reasons.push(`${kind} over ${cap} chars`);
  return { ok: reasons.length === 0, reasons };
}

/** Render or refuse. Never render an invalid line. */
export function render(kind, text, surface) {
  if (!allowedOn(kind, surface)) return null;
  const v = validate(kind, text);
  if (!v.ok) { console.warn(`[evidence] refused on ${surface}:`, v.reasons, text); return null; }
  const key = kind === KIND.STRONGEST ? 'STRONGEST'
            : kind === KIND.ANSWER    ? '↓ WHAT TO ANSWER'
            : 'THEY ARE ASKING FOR';
  const mod = kind === KIND.STRONGEST ? 'ev--strongest'
            : kind === KIND.ANSWER    ? 'ev--answer' : 'ev--quoted';
  return `<div class="ev ${mod}"><p class="ev__k">${key}</p><p class="ev__b">${text}</p></div>`;
}
