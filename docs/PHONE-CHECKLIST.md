# What only a real phone can tell us

Everything below was already exercised on the emulator — all three frames, both
markets, the apply flow end to end, the clipboard. None of that needs re-doing.

This list is deliberately short. It is the things a Pixel 6 emulator running
software rendering at desk height **cannot** answer, and a Galaxy S24 in your hand
can. If a line here is fine, say nothing; if it is wrong, that is a real bug the
test suite will never catch.

## Touch — the emulator uses a mouse, which is not a thumb

- [ ] **The market chip** (top right, "🇨🇦 Canada"). It is the only way to switch
      markets now. Is it big enough to hit with a thumb without stretching?
- [ ] **The three policy tabs** inside the hero — Remote / Hybrid / On site. They sit
      on a gradient at 7px vertical padding. Do you hit the one you aimed at?
- [ ] **The go arrow** in the paste box, 30dp. Below Android's 48dp minimum on
      purpose, to match the mockup. Does that cost you taps?
- [ ] **A scored card.** The whole card opens the application; nothing labels it as
      tappable. Did you know to press it, or did you look for a button?

## The gradient, on an OLED panel

- [ ] Canada's hero runs indigo to pink behind a 55% scrim. Does the white display
      type hold, or does the pink end wash it out?
- [ ] Kenya's runs near-black to green. Same question at the green end — and does
      the near-black canvas show banding on OLED, which an LCD emulator hides?
- [ ] The full stop after "made for you" is the one chromatic dot (orange in Canada,
      red in Kenya). Visible, or lost?

## Type, at your density

The emulator is 420dpi. An S24 is ~450. Every size below was taken from the
mockup's CSS, which was authored for a 300px-wide phone frame.

- [ ] Job titles are 14.5sp serif, clipped to **one line**. At your density, how much
      of a real title survives? "Bilingual Disability Case Analyst/Case Manager"
      is the test case.
- [ ] The counts ("309 swept this morning", "184 of 309") are 11.5sp. Readable at
      arm's length?
- [ ] The band chips (AUTO / PING / UNSURE) are 10.5sp with letter-spacing.

## Scroll and motion

- [ ] Browse lists ~180 remote postings. Does it stay smooth, or does the serif
      title rendering make it stutter?
- [ ] Back from the application page, then from matches, then from browse. Does each
      step go where you expect?
- [ ] Rotate the phone on the application page with all three steps drafted. They
      live in the view model, so they should survive — do they?

## The things I already know are imperfect

Not bugs to report — flagged so you are not reporting what I already owe you:

- The **On site** filter shows its count (94) where the mockup shows a bare label.
- **Leaving the application page discards the three drafts.** Re-opening the same
  card starts from "not started". The run itself survives; the drafts do not.
- The paste box **grows to three lines** as you type. The mockup's is one line.
