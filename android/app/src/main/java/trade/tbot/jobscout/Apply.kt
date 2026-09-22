package trade.tbot.jobscout

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import trade.tbot.jobscout.design.Radius
import trade.tbot.jobscout.design.Space
import trade.tbot.jobscout.design.Type

/**
 * One application: the mockup's TWO screens.
 *
 *   detail   the card expanded - title, org, the rose with the tiers, STRONGEST
 *            and what to answer, ONE filled primary (Prepare application / Apply
 *            anyway), Open the posting, the heart.
 *   prepare  the same head, then the lede that says which step leads (band.js:
 *            the résumé for unsure and near-miss, the letter otherwise), the
 *            steps in that order with ONE filled button - the next step. A step
 *            with no résumé says "Add your résumé" and focuses the well. A
 *            finished draft does not print inline: its bar reads "Read it" and
 *            "Redo", and Read it opens the draft in a sheet with Copy all.
 *
 * Nothing here submits anything. Greenhouse and Ashby need the EMPLOYER's key
 * to post an application, and Workday needs an account per tenant. The ceiling
 * is having every answer ready before the form is opened.
 */
@Composable
fun ApplyScreen(vm: DemoVm, a: Apply, onClose: () -> Unit, onUpload: () -> Unit) {
    val ui by vm.ui.collectAsState()
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    val uri = LocalUriHandler.current
    val clipboard = LocalClipboardManager.current
    val p = a.posting
    val score = ui.scores.firstOrNull { it.id == p.id }
    val band = T.bandWord(a.fit)
    var prepare by remember { mutableStateOf(false) }
    /** Which draft is open in the reading sheet: "letter", "resume", "answers" or null. */
    var reading by remember { mutableStateOf<String?>(null) }
    BackHandler {
        when {
            reading != null -> reading = null
            prepare -> prepare = false
            else -> onClose()
        }
    }
    val blocked = ui.resume.trim().length <= 40
    val lead = if (band == "unsure" || band == "near-miss") "resume" else "letter"
    val order = if (lead == "resume") listOf("resume", "letter", "answers") else listOf("letter", "resume", "answers")
    val done = mapOf("letter" to (a.letter.data != null), "resume" to (a.resume.data != null), "answers" to (a.answers.data != null))
    val next = order.firstOrNull { done[it] != true }
    /* STRAIGHT TO THE POPUP WHEN THE DRAFT LANDS - mockups/mobile.html does
       exactly this ("if (draftState[id].html) openSheet(id)") and the phone
       did not. Ken, 2026-09-20: "Resume and cover page helper should go
       straight to popup", then "Mirror above upgrades from web to mobile",
       then "Popups pls"; and on 09-22, of the shipped app: "cover letter,
       resume... won't popup at all". A finished draft was sitting behind a
       "Read it" tap nobody had been told to make. Read it and Redo stay -
       they are how you reopen a draft you have closed - but the first sight
       of a draft is the draft, not a button that admits one exists. */
    var awaiting by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(a) {
        val w = awaiting ?: return@LaunchedEffect
        val st = when (w) { "letter" -> a.letter; "resume" -> a.resume; else -> a.answers }
        if (st.busy) return@LaunchedEffect      // still running; wait for the next change
        awaiting = null                          // settled either way, so stop watching
        if (st.data != null) reading = w
    }
    val wellFocus = remember { FocusRequester() }
    var wantFocus by remember { mutableStateOf(false) }
    LaunchedEffect(wantFocus) { if (wantFocus) { runCatching { wellFocus.requestFocus() }; wantFocus = false } }

    Box(Modifier.fillMaxSize().background(T.canvas).ground()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(Space.s4, ins.calculateTopPadding() + Space.s3, Space.s4, ins.calculateBottomPadding() + Space.s8),
            verticalArrangement = Arrangement.spacedBy(Space.s3),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MButton("← " + if (prepare) "Back to the match" else "Back", primary = false) { if (prepare) prepare = false else onClose() }
                }
            }

            // The head: title, org, and the card with the rose and the tiers.
            item {
                Column {
                    Text(p.title, style = H2, fontSize = Type.t6, lineHeight = 32.sp, letterSpacing = (-0.02).em, color = T.ink)
                    Spacer(Modifier.height(Space.s1))
                    Text(listOf(p.company, p.location).filter { it.isNotBlank() }.joinToString(" · "),
                         color = T.text2, fontSize = Type.t2, lineHeight = 19.sp)
                    Spacer(Modifier.height(Space.s3))
                    Column(Modifier.fillMaxWidth().background(T.surface, Card).padding(Space.s3)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                            BearingRose(a.fit, diameter = 44.dp)
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Tier1(a.fit)
                                if (p.remote_policy.isNotBlank()) Tier2(policyLabel(p.remote_policy))
                            }
                        }
                        if (!prepare) {
                            score?.strongest?.takeIf { it.isNotBlank() }?.let {
                                Spacer(Modifier.height(Space.s2))
                                MEvidence("Strongest", it, T.bAuto, T.evidenceRuleStrongest, T.strongestBody)
                            }
                            score?.weakest?.takeIf { it.isNotBlank() }?.let {
                                Spacer(Modifier.height(Space.s2))
                                MEvidence("↓ What to answer", it, T.bUnsure, T.evidenceRuleAnswer, T.answerBody)
                            }
                            Spacer(Modifier.height(Space.s2))
                            /* ONE filled primary on the detail: the way to the steps. Below the
                               floor it says so plainly rather than disappearing - the reader
                               decides, not the score. */
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                                MButton(if (a.fit < FIT_FLOOR) "Apply anyway →" else "Prepare application →", primary = true) { prepare = true }
                                Spacer(Modifier.weight(1f))
                                if (score != null) Heart(ui.tracker.containsKey(p.id)) {
                                    if (ui.tracker.containsKey(p.id)) vm.untrack(p.id) else vm.setStage(trackedFor(score, p), "survivor")
                                }
                            }
                            if (p.url.isNotEmpty()) {
                                Spacer(Modifier.height(Space.s2))
                                MButton("Open the posting ↗", primary = false) { runCatching { uri.openUri(p.url) } }
                            }
                        }
                    }
                }
            }

            if (prepare) {
                /* A stretch is never mistaken for the recommendation. */
                if (a.fit < FIT_FLOOR) item {
                    Column(Modifier.fillMaxWidth().background(bandFill(a.fit).copy(alpha = .14f), Card).padding(14.dp)) {
                        Text(
                            "A stretch on paper, at ${a.fit} out of 100 — so everything below argues your case " +
                                "from what you have actually done, and claims nothing you have not. Where a step names " +
                                "something the posting asks for and your résumé does not cover, that is a line to add " +
                                "if it is true of you, and a good use of ten minutes before you send.",
                            color = T.text2, fontSize = Type.t2, lineHeight = 20.sp,
                        )
                    }
                }

                // The lede says which step leads, and why - one sentence, from the band.
                item {
                    Text(
                        if (lead == "resume") "Aiming the résumé first is worth more here than the letter."
                        else "The letter leads here; the résumé already reads close to what this posting asks for.",
                        color = T.text2, fontSize = Type.t3, lineHeight = 23.sp,
                    )
                }

                /* The well: only when there is no résumé to write from. */
                if (blocked) item {
                    Column {
                        ResumeField(
                            value = ui.resume, onChange = vm::setResume, onGo = { },
                            onAttach = onUpload, uploading = ui.uploading, well = true,
                            placeholder = "Paste your résumé — or attach a file", focus = wellFocus,
                        )
                        ui.uploadStatus?.let {
                            Spacer(Modifier.height(Space.s1))
                            Text(it, color = T.text2, fontSize = Type.t1, lineHeight = 17.sp)
                        }
                        Spacer(Modifier.height(Space.s1))
                        Text("Read on this phone and sent only to draft for this posting.",
                             color = T.text3, fontSize = Type.t1, lineHeight = 17.sp)
                    }
                }

                order.forEach { id ->
                    item {
                        when (id) {
                            "letter" -> StepPanel(
                                title = "Cover letter",
                                idle = "A short letter for this posting, grounded in your résumé.",
                                busy = "Drafting from the profile only — it cannot invent experience…",
                                step = a.letter, action = "Write the letter", primary = next == id, blocked = blocked,
                                onRun = { awaiting = "letter"; vm.draftLetter() }, onUnblock = { wantFocus = true }, onRead = { reading = "letter" },
                                onRewrite = { awaiting = "letter"; vm.draftLetter(it) }, onAddThem = onClose,
                            )
                            "resume" -> StepPanel(
                                title = "Your résumé, aimed at it",
                                idle = "The same experience, reworded toward what this posting asks for.",
                                busy = "Rewriting the whole résumé, then checking every name and number against your own…",
                                step = a.resume, action = "Rebuild my résumé", primary = next == id, blocked = blocked,
                                onRun = { awaiting = "resume"; vm.buildResume() }, onUnblock = { wantFocus = true }, onRead = { reading = "resume" },
                                onRewrite = { awaiting = "resume"; vm.buildResume(it) }, onAddThem = onClose,
                            )
                            else -> StepPanel(
                                title = "Their screening questions",
                                idle = "The questions on the employer's own form, answered from your résumé.",
                                busy = "Reading the employer's own form…",
                                step = a.answers, action = "Get their questions", primary = next == id, blocked = blocked,
                                onRun = { awaiting = "answers"; vm.readAnswers() }, onUnblock = { wantFocus = true }, onRead = { reading = "answers" },
                            )
                        }
                    }
                }

                /* SEND IT. Ken's ruling, 2026-09-22: "Enable applications from
                   the applications page without necessarily having to go to the
                   posting itself." Greenhouse and Ashby each publish the form at
                   a URL of its own, so this goes straight there and the posting
                   never opens. What it stops short of is pressing Submit: both
                   boards take an application through their API only with the
                   EMPLOYER's key. So the pack travels instead. */
                item {
                    val pack = buildPack(a)
                    val direct = formUrl(p.url) != p.url
                    Column(Modifier.fillMaxWidth().background(T.surface, Card).padding(Space.s4)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Send it", style = H2, fontSize = Type.t4, color = T.ink, modifier = Modifier.weight(1f))
                            Text(if (pack.isEmpty()) "" else "${done.count { it.value }} of 3 ready",
                                 color = T.text3, fontSize = Type.t1, fontWeight = FontWeight.Medium, letterSpacing = 0.08.em)
                        }
                        Spacer(Modifier.height(Space.s2))
                        Text("Everything above travels with you, in the order the form asks for it, and the posting is not in the way.",
                             color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
                        Spacer(Modifier.height(Space.s3))
                        if (blocked) MButton("Add your résumé →", primary = false) { wantFocus = true }
                        else Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                            MButton("Open " + (p.company.takeIf { it.isNotBlank() } ?: "the employer") + "'s form ↗",
                                    primary = next == null) {
                                if (pack.isNotEmpty()) clipboard.setText(AnnotatedString(pack))
                                score?.let { vm.setStage(trackedFor(it, p), "applied") }
                                runCatching { uri.openUri(formUrl(p.url)) }
                            }
                            if (pack.isNotEmpty()) MButton("Copy everything", primary = false) {
                                clipboard.setText(AnnotatedString(pack))
                            }
                        }
                        Spacer(Modifier.height(Space.s2))
                        Text(
                            when {
                                pack.isEmpty() -> "Draft at least one of the three above and this hands the whole pack over in one move."
                                direct -> "The form opens directly, not the posting, and everything above goes to your clipboard in the order it asks for. Pressing Submit stays yours: this employer's board only accepts an application through its own form."
                                else -> "This employer does not publish a form that can be opened on its own, so this opens their posting with everything above already on your clipboard."
                            },
                            color = T.text3, fontSize = Type.t1, lineHeight = 17.sp,
                        )
                    }
                }
            }
        }

        // The reading sheet: one draft at a time, with Copy all in its foot.
        when (reading) {
            "letter" -> a.letter.data?.let { d -> DraftSheet("Cover letter", d, { reading = null }) { LongText(d) } }
            "resume" -> a.resume.data?.let { d -> DraftSheet("Your résumé, aimed at it", resumeText(d), { reading = null }) { RebuiltResume(d) } }
            "answers" -> a.answers.data?.let { d -> DraftSheet("Their screening questions", answersText(d), { reading = null }) { Answers(d) } }
        }
    }
}

/* The APPLICATION FORM's own URL, where the board publishes one. Greenhouse
   puts the form on the job page behind an anchor; Ashby gives it a page of its
   own. Anything else falls back to the posting, and the screen says so rather
   than pretending. The two patterns are the worker's own (readForm). */
private val GH_FORM = Regex("""^https?://(?:job-boards|boards)\.greenhouse\.io/([^/?#]+)/jobs/(\d+)""")
private val ASHBY_FORM = Regex("""^https?://jobs\.ashbyhq\.com/([^/?#]+)/([0-9a-f-]{36})""")

fun formUrl(u: String): String {
    GH_FORM.find(u)?.let { return "https://job-boards.greenhouse.io/${it.groupValues[1]}/jobs/${it.groupValues[2]}#app" }
    ASHBY_FORM.find(u)?.let { return "https://jobs.ashbyhq.com/${it.groupValues[1]}/${it.groupValues[2]}/application" }
    return u
}

/** The letter, the rebuilt résumé and the answered questions, in the order a
 *  form asks for them. Empty when nothing has been drafted. */
fun buildPack(a: Apply): String = buildString {
    a.letter.data?.let { append("COVER LETTER\n\n").append(it.trim()) }
    a.resume.data?.let {
        if (isNotEmpty()) append("\n\n\n")
        append("RÉSUMÉ, AIMED AT THIS POSTING\n\n").append(resumeText(it).trim())
    }
    a.answers.data?.let {
        if (isNotEmpty()) append("\n\n\n")
        append("THEIR SCREENING QUESTIONS, ANSWERED\n\n").append(answersText(it).trim())
    }
}

/**
 * A step is idle, running, refused or done. `primary` marks the one filled button
 * on the page (the next move). A finished draft shows "Read it" and "Redo", not
 * the draft itself - the mockup's bar - and Read it opens the sheet.
 */
@Composable
private fun <T> StepPanel(
    title: String, idle: String, busy: String, step: Step<T>, action: String,
    primary: Boolean, blocked: Boolean,
    onRun: () -> Unit, onUnblock: () -> Unit, onRead: () -> Unit,
    onRewrite: (List<String>) -> Unit = {}, onAddThem: () -> Unit = {},
) {
    Column(Modifier.fillMaxWidth().background(T.surface, Card).padding(Space.s4)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = H2, fontSize = Type.t4, color = T.ink, modifier = Modifier.weight(1f))
            Text(
                when {
                    step.busy -> "working"
                    step.error != null -> "not available"
                    step.data != null -> "ready"
                    else -> ""
                },
                color = T.text3, fontSize = Type.t1, fontWeight = FontWeight.Medium, letterSpacing = 0.08.em,
            )
        }
        Spacer(Modifier.height(Space.s2))
        Text(idle, color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
        Spacer(Modifier.height(Space.s3))
        when {
            /* Claude's own mark, breathing - not a material spinner. The mockup's
               busy bar is the mark and a line naming what it is doing, and Ken
               asked for it three times on 2026-09-20. A spinner says "waiting";
               the mark says who is working. */
            step.busy -> Row(verticalAlignment = Alignment.CenterVertically) {
                ClaudePulse(20.dp)
                Spacer(Modifier.width(10.dp))
                Text(busy, color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
            }
            /* A grounded refusal is the product WORKING (mockup .refusal): it leads
               with what was done, quotes each claim it could not find, and offers
               two routes - never a number, never a bare error. */
            step.invented.isNotEmpty() -> Column {
                val n = step.invented.size
                Text("The document was written, then checked.", style = H2, fontSize = Type.t4, lineHeight = 24.sp, color = T.ink)
                Spacer(Modifier.height(Space.s2))
                Text((if (n == 1) "One of its claims is" else "$n of its claims are") +
                     " not in your résumé, so it is not being shown as yours. Nothing here is a judgement about you — only about what the résumé says.",
                     color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
                Spacer(Modifier.height(Space.s3))
                Text("NOT IN THE RÉSUMÉ", fontSize = Type.t0, letterSpacing = 0.09.em, fontWeight = FontWeight.Medium, color = T.bUnsure)
                Spacer(Modifier.height(Space.s1))
                step.invented.forEachIndexed { i, q ->
                    Text("${i + 1}.  “$q” — the résumé does not say it.", color = T.text2, fontSize = Type.t2, lineHeight = 20.sp,
                         modifier = Modifier.padding(bottom = Space.s1))
                }
                Spacer(Modifier.height(Space.s3))
                MButton("Rewrite without " + (if (n == 1) "that one" else if (n == 2) "those two" else "those $n") + " →", primary = true) { onRewrite(step.invented.take(12)) }
                Spacer(Modifier.height(Space.s2))
                MButton("Add them to the résumé and re-run →", primary = false, onClick = onAddThem)
            }
            step.error != null -> Column {
                Text(step.error, color = T.bUnsure, fontSize = Type.t2, lineHeight = 20.sp)
                Spacer(Modifier.height(Space.s3))
                MButton("Try again", primary = primary, onClick = onRun)
            }
            step.data != null -> Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                MButton("Read it", primary = false, onClick = onRead)
                MButton("Redo", primary = false, onClick = onRun)
            }
            else -> {
                if (blocked) MButton("Add your résumé →", primary = primary, onClick = onUnblock)
                else MButton(action, primary = primary, onClick = onRun)
            }
        }
    }
}

/**
 * The drafting sheet: the mockup's window - a title, the draft, and Copy all in
 * the foot. An overlay in the activity's own window, like the menu sheet.
 */
@Composable
private fun DraftSheet(title: String, plain: String, onClose: () -> Unit, body: @Composable () -> Unit) {
    val clip = LocalClipboardManager.current
    val ins = WindowInsets.safeDrawing.asPaddingValues()
/* CENTRED. Ken's ruling, 2026-09-22: "Centre all popups." It was a bottom
   sheet, argued for in a comment nobody outside this repo ever read. The
   objection that argument raised is answered by geometry instead of by
   anchoring: full width minus one gutter, 88% of the height so a long
   document still has room, rounded on all four corners so nothing reads as
   sliced, and the scrim on every side is the way out. */
    Box(
        Modifier.fillMaxSize().background(T.ink.copy(alpha = .38f))
            .clickable(onClick = onClose).padding(ins).padding(Space.s3),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(0.88f)
                .clip(RoundedCornerShape(Radius.sheet))
                .background(T.surface)
                .clickable(enabled = false) {}
                .padding(top = Space.s3),
        ) {
            // No grab handle: a centred window does not drag, and an
            // affordance that lies is worse than none.
            Row(Modifier.fillMaxWidth().padding(horizontal = Space.s4, vertical = Space.s2), verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = H2, fontSize = Type.t5, color = T.ink, modifier = Modifier.weight(1f))
                Box(Modifier.size(TARGET).clip(Pill9999).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
                    Text("×", fontSize = 20.sp, color = T.text2)
                }
            }
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Space.s4, vertical = Space.s2)) { body() }
            Row(
                Modifier.fillMaxWidth().padding(start = Space.s4, end = Space.s4, top = Space.s3, bottom = Space.s4),
                horizontalArrangement = Arrangement.spacedBy(Space.s2),
            ) {
                MButton("Copy all", primary = true) { clip.setText(AnnotatedString(plain)) }
                ShareButton("Share", title, plain)
            }
        }
    }
}

/** SHARE IS THE PHONE'S DOWNLOAD: a share sheet reaches mail, Drive, Files and the ATS's own app. */
@Composable
private fun ShareButton(label: String, subject: String, text: String) {
    val ctx = LocalContext.current
    MButton(label, primary = false) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        ctx.startActivity(Intent.createChooser(send, label))
    }
}

/** Selectable so it can be copied into the employer's form. */
@Composable
private fun LongText(text: String) {
    SelectionContainer { Text(text, color = T.ink, fontSize = Type.t3, lineHeight = 24.sp) }
}

/**
 * The rebuilt résumé, laid out rather than run together as one blob. The gaps sit
 * OUTSIDE the document on purpose: they are what the résumé does not say, and the
 * only hand that may put them in is the candidate's.
 */
@Composable
private fun RebuiltResume(r: ResumeResponse) {
    Column {
        SelectionContainer {
            Column {
                if (r.name.isNotEmpty()) Text(r.name, style = H2, fontSize = Type.t5, color = T.ink)
                if (r.contact.isNotEmpty()) Text(r.contact, color = T.text3, fontSize = Type.t2)
                if (r.headline.isNotEmpty())
                    Text(r.headline, color = T.ink, fontSize = Type.t3, lineHeight = 23.sp, modifier = Modifier.padding(top = Space.s2))
                r.sections.filter { it.items.isNotEmpty() }.forEach { sec ->
                    Text(
                        sec.heading.uppercase(), color = T.accent, fontSize = Type.t1,
                        fontWeight = FontWeight.Medium, letterSpacing = 0.08.em,
                        modifier = Modifier.padding(top = Space.s4, bottom = 6.dp),
                    )
                    sec.items.forEach { it ->
                        Text(it.title, color = T.ink, fontSize = Type.t3, fontWeight = FontWeight.Medium, lineHeight = 22.sp)
                        if (it.meta.isNotEmpty()) Text(it.meta, color = T.text3, fontSize = Type.t2, lineHeight = 20.sp)
                        it.bullets.forEach { b ->
                            Text("•  $b", color = T.text2, fontSize = Type.t2, lineHeight = 20.sp,
                                modifier = Modifier.padding(top = 3.dp))
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }
            }
        }
        if (r.gaps.isNotEmpty()) Column(
            Modifier.padding(top = Space.s2).background(T.chip, Card).padding(14.dp)
        ) {
            Text("WHAT THIS POSTING ASKS FOR THAT YOUR RÉSUMÉ DOES NOT SAY",
                color = T.ink, fontSize = Type.t1, fontWeight = FontWeight.Medium, letterSpacing = 0.08.em)
            Spacer(Modifier.height(Space.s2))
            r.gaps.forEach {
                Text(it.asks, color = T.ink, fontSize = Type.t2, fontWeight = FontWeight.Medium, lineHeight = 20.sp)
                if (it.note.isNotEmpty()) Text(it.note, color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
                Spacer(Modifier.height(Space.s2))
            }
            Text("Yours to add, and only if true — they are deliberately left out of the document above.",
                color = T.text3, fontSize = Type.t1, lineHeight = 18.sp)
        }
    }
}

/** The same document as plain text, for pasting into a form that wants one box. */
fun resumeText(r: ResumeResponse): String = buildString {
    if (r.name.isNotEmpty()) appendLine(r.name)
    if (r.contact.isNotEmpty()) appendLine(r.contact)
    if (r.headline.isNotEmpty()) { appendLine(); appendLine(r.headline) }
    r.sections.filter { it.items.isNotEmpty() }.forEach { sec ->
        appendLine(); appendLine(sec.heading.uppercase())
        sec.items.forEach { it ->
            append(it.title)
            if (it.meta.isNotEmpty()) append(" — ").append(it.meta)
            appendLine()
            it.bullets.forEach { b -> appendLine("  • $b") }
        }
    }
}

/** A copy control for one answer. */
@Composable
private fun CopyChip(text: String) {
    val clip = LocalClipboardManager.current
    var copied by remember(text) { mutableStateOf(false) }
    LaunchedEffect(copied) { if (copied) { delay(1600); copied = false } }
    Box(Modifier.padding(top = Space.s2)) {
        MButton(if (copied) "⧉  Copied" else "⧉  Copy", primary = false) {
            clip.setText(AnnotatedString(text))
            copied = true
        }
    }
}

/**
 * The employer's questions. Two classes are shown and never drafted - anything
 * personal and plain identity fields - and each says so in its own words.
 */
@Composable
private fun Answers(r: AnswersResponse) {
    if (r.unsupported) {
        Text(
            "This employer keeps its application form behind a login, so the questions cannot be read ahead of time by anyone — not us, and not you. Open the posting when you are ready and answer them there: the letter and the rebuilt résumé above are what most of those boxes ask for anyway.",
            color = T.text2, fontSize = Type.t2, lineHeight = 20.sp,
        )
        return
    }
    Column {
        Text(
            "${r.questions.size} question${if (r.questions.size == 1) "" else "s"} on ${r.source.ifEmpty { "the form" }}" +
                " — ${r.drafted} answered from your résumé.",
            color = T.text3, fontSize = Type.t2, lineHeight = 20.sp,
        )
        Spacer(Modifier.height(Space.s3))
        r.questions.forEach { q ->
            Column(Modifier.padding(bottom = 14.dp)) {
                Text(
                    q.label + if (q.required) "  ·  required" else "",
                    color = T.ink, fontSize = Type.t2, fontWeight = FontWeight.Medium, lineHeight = 20.sp,
                )
                when {
                    q.answer.isNotEmpty() -> {
                        SelectionContainer {
                            Text(q.answer, color = T.text2, fontSize = Type.t2, lineHeight = 20.sp,
                                modifier = Modifier.padding(top = Space.s1))
                        }
                        CopyChip(q.answer)
                        if (q.from.isNotEmpty()) Text(
                            "from your résumé: “${q.from}”",
                            color = T.text3, fontSize = Type.t1, lineHeight = 18.sp,
                            modifier = Modifier.padding(top = 3.dp),
                        )
                    }
                    else -> Text(
                        q.why.ifEmpty { "yours to answer" },
                        color = T.bUnsure, fontSize = Type.t2, lineHeight = 20.sp,
                        modifier = Modifier.padding(top = Space.s1),
                    )
                }
            }
        }
    }
}

fun answersText(r: AnswersResponse): String = r.questions.joinToString("\n\n") { q ->
    q.label + "\n" + q.answer.ifEmpty { "[${q.why.ifEmpty { "yours to answer" }}]" }
}
