# JobScout — the first usability session

**Twenty minutes with someone who is actually job hunting, and their own résumé. Nothing in this
build has ever been watched being used.**

*Written 2026-09-22, beside S-Ryder's. The method is the same; the tasks are not.*

---

## 1. The rules

The same four, and they matter more here because the tester is not the builder's friend doing a
favour, they are someone with a real reason to care whether this works:

1. **Give the task, never the route.**
2. **Do not help.** Thirty seconds stuck is a finding worth more than a completed task.
3. **Ask them to think out loud.** When they go quiet: "what are you looking for?"
4. **Watch the thumb.** Where it goes first is the real information architecture.

One extra rule for this product: **do not explain what it is first.** The landing page has to do
that, and whether it does is the first thing being tested.

## 2. Who to ask

Someone job hunting, with a résumé on their phone, who has never seen this. Not a developer. The
worst possible tester is anyone who already knows what a "sweep" is.

Hand them the phone on the landing page, and say only: *"This is a job site. See what you make of
it."* Then stop talking.

## 3. The tasks

| # | Say this | What is being tested | Watch for |
|---|---|---|---|
| 0 | *(nothing — just watch for 60 seconds)* | Whether the landing page explains itself | What do they read? What do they touch first? Do they scroll before acting? |
| 1 | "Find out which of these jobs actually suit you." | Whether the résumé box reads as the way in | Do they paste, upload, or type a job title? Does the arrow look like the action? |
| 2 | "What did it think of the first one, and why?" | Whether the score and the verdict are understood as different things | Do they read the number or the words? Do they know what 72 means? |
| 3 | "Get ready to apply for it." | The whole drafting flow | Do they expect the drafts to appear, or to be asked for? |
| 4 | "Now actually apply." | The Send it step, added 2026-09-22 and never watched | Do they understand the form opens elsewhere? Do they notice the clipboard? |
| 5 | "You liked that one. Come back to it tomorrow." | Whether saving is discoverable | Heart, or back button, or a screenshot of the screen? |

**Task 4 is the one to protect.** It is the newest, it is the one that hands the reader to a third
party, and it is the only place where the product's honest ceiling — that it stops at Submit — has
to be understood rather than read.

## 4. The one question at the end

> **"What did you think it was going to do that it didn't?"**

Phrased that way on purpose. "What would you change" gets feature requests; this gets the model in
their head, which is the thing worth having.

## 5. What counts as a finding

- Anything they could not do without help.
- Any hesitation over three seconds, with what they were looking at.
- Anything they expected that is not there.
- **Any moment they thought the product was doing something it was not.** This product's whole
  claim is that it does not overstate; a reader who believes it submitted an application when it
  did not is the most serious finding available, and task 4 is where it would happen.

## 6. Where the findings go

Into `docs/specs.json` as rows, in the tester's words, with the check that would prove each — the
same ledger every other requirement lives in. A usability finding that does not become a row is a
usability finding that gets forgotten.
