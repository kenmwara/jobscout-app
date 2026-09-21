/* ===========================================================================
   check_field_chrome — no control in JobScout ever shows its UA defaults.

   This is the check that would have caught the screenshot. It asserts nothing
   about markup or class names; it focuses each control and reads what the
   browser actually computed, which is the only thing a user sees.

   ASSERTIONS
     A  every <textarea> computes resize: none            (the grip)
     B  no control inside .field draws its own outline on focus  (the blue ring)
     C  a control outside .field DOES draw one            (the guard on B —
        "outline:none everywhere" is a worse bug than the ring, and a check
        that cannot tell the two apart is asleep)
     D  an empty control is not scrolled by its own placeholder (the clipping)
     E  every résumé control lives inside a .field         (no ad-hoc inputs)
     F  every .field offers BOTH doors: a paste area and a file input
     G  nor horizontally — found by rendering the fix and looking at it

   Run:  node tools/check_field_chrome.mjs <url-or-file> [...]
   =========================================================================== */

import { chromium } from 'playwright';
import { resolve } from 'node:path';

const EXEC = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: node tools/check_field_chrome.mjs <url|file> [...]');
  process.exit(3);                       // 3 = did not RUN, never a pass
}

const fails = [];
const note  = (t, msg) => fails.push(`${t}\n      ${msg}`);

const browser = await chromium.launch({ executablePath: EXEC });

for (const t of targets) {
  const url = t.startsWith('http') || t.startsWith('file:') ? t : 'file://' + resolve(t);
  const page = await browser.newPage({ colorScheme: 'dark' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const r = await page.evaluate(() => {
    const out = { textareas: [], focus: [], clipped: [], orphans: [], fields: [] };

    // --- A: the resize grip -------------------------------------------------
    for (const ta of document.querySelectorAll('textarea')) {
      out.textareas.push({
        id: ta.id || ta.name || ta.className,
        resize: getComputedStyle(ta).resize
      });
    }

    // --- B / C: focus rings -------------------------------------------------
    for (const el of document.querySelectorAll('input:not([type=file]), textarea, select, button')) {
      if (el.disabled) continue;
      el.focus();
      const cs = getComputedStyle(el);
      const w  = parseFloat(cs.outlineWidth) || 0;
      const drawn = cs.outlineStyle !== 'none' && w > 0;
      out.focus.push({
        id: el.id || el.className || el.tagName,
        inField: !!el.closest('.field'),
        drawn
      });
      el.blur();
    }

    // --- D / G: the placeholder must fit, in BOTH axes ----------------------
    // G was added after a render of the fix itself showed a bar-density field
    // clipping its own placeholder horizontally. A check that only watches one
    // axis is half a check.
    for (const el of document.querySelectorAll('textarea, input[type=text]')) {
      if (el.value) continue;
      const overY = el.scrollHeight - el.clientHeight;
      const overX = el.scrollWidth  - el.clientWidth;
      if (overY > 1) out.clipped.push({ axis: 'vertical',   id: el.id || el.className, over: overY, c: el.clientHeight, s: el.scrollHeight });
      if (overX > 1) out.clipped.push({ axis: 'horizontal', id: el.id || el.className, over: overX, c: el.clientWidth,  s: el.scrollWidth  });
    }

    // --- E: no ad-hoc résumé controls --------------------------------------
    for (const el of document.querySelectorAll('textarea, input[type=file]')) {
      if (!el.closest('.field')) out.orphans.push(el.id || el.className || el.tagName);
    }

    // --- F: both doors ------------------------------------------------------
    for (const f of document.querySelectorAll('.field')) {
      out.fields.push({
        id: f.id || f.className,
        area: !!f.querySelector('.field__area'),
        file: !!f.querySelector('input[type=file]'),
        state: f.dataset.state || '(unset)'
      });
    }
    return out;
  });

  const tag = t.split('/').pop();

  for (const ta of r.textareas)
    if (ta.resize !== 'none')
      note('A resize grip', `${tag}: <textarea ${ta.id}> computes resize:${ta.resize} — the grip is visible`);

  for (const f of r.focus) {
    if (f.inField && f.drawn)
      note('B focus ring', `${tag}: ${f.id} is inside .field but draws its own outline — the ring belongs on the well`);
    if (!f.inField && !f.drawn)
      note('C no focus at all', `${tag}: ${f.id} is outside .field and draws NO outline on focus — keyboard users lose it`);
  }

  for (const c of r.clipped)
    note(c.axis === 'vertical' ? 'D clipped placeholder' : 'G clipped placeholder (across)',
      `${tag}: ${c.id} overflows ${c.axis}ly by ${c.over}px when empty (client ${c.c}, scroll ${c.s}) — its own placeholder does not fit`);

  for (const o of r.orphans)
    note('E ad-hoc control', `${tag}: ${o} is a résumé control outside any .field — screens must not build their own`);

  if (!r.fields.length)
    note('F no field', `${tag}: no .field on the page — if this screen asks for a résumé it must use the component`);
  for (const f of r.fields) {
    if (!f.area) note('F missing paste', `${tag}: .field has no .field__area — paste is one of the two doors`);
    if (!f.file) note('F missing upload', `${tag}: .field has no file input — upload is the other door`);
  }

  await page.close();
}

await browser.close();

if (fails.length) {
  console.log(`check_field_chrome  FAIL  (${fails.length})`);
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log('check_field_chrome  pass');
