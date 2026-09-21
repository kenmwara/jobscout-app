package trade.tbot.jobscout

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import trade.tbot.jobscout.design.Space
import trade.tbot.jobscout.design.Type

/**
 * One application, on its own screen: the mockup's apply + draft screens in one.
 *
 * The posting is the card expanded - the rose, the tiers, STRONGEST and what to
 * answer, the way to the employer's page, the heart - and under it the three
 * steps in the order the band says they are worth doing (band.js leadStep: the
 * résumé leads for unsure and near-miss, the letter for the rest). ONE filled
 * button on the page: the next step. A step that cannot run because there is no
 * résumé does not explain - its button becomes "Add your résumé" and opens the
 * well in place, so the posting is never lost.
 *
 * Nothing here submits anything. Greenhouse and Ashby need the EMPLOYER's key
 * to post an application, and Workday needs an account per tenant. The ceiling
 * is having every answer ready before the form is opened.
 */
@Composable
fun ApplyScreen(vm: DemoVm, a: Apply, onClose: () -> Unit, onUpload: () -> Unit) {
    BackHandler(onBack = onClose)
    val ui by vm.ui.collectAsState()
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    val uri = LocalUriHandler.current
    val p = a.posting
    val score = ui.scores.firstOrNull { it.id == p.id }
    val band = T.bandWord(a.fit)
    val blocked = ui.resume.trim().length <= 40
    val lead = if (band == "unsure" || band == "near-miss") "resume" else "letter"
    val order = if (lead == "resume") listOf("resume", "letter", "answers") else listOf("letter", "resume", "answers")
    val done = mapOf("letter" to (a.letter.data != null), "resume" to (a.resume.data != null), "answers" to (a.answers.data != null))
    val next = order.firstOrNull { done[it] != true }
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
                    MButton("← Back", primary = false, onClick = onClose)
                }
            }

            // The card, expanded: title, org, the rose with the tiers, the evidence.
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
                        score?.strongest?.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(Space.s2))
                            MEvidence("Strongest", it, T.bAuto, T.evidenceRuleStrongest, T.strongestBody)
                        }
                        score?.weakest?.takeIf { it.isNotBlank() }?.let {
                            Spacer(Modifier.height(Space.s2))
                            MEvidence("↓ What to answer", it, T.bUnsure, T.evidenceRuleAnswer, T.answerBody)
                        }
                        Spacer(Modifier.height(Space.s2))
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                            if (p.url.isNotEmpty()) MButton("Open the posting ↗", primary = false) { runCatching { uri.openUri(p.url) } }
                            Spacer(Modifier.weight(1f))
                            if (score != null) Heart(ui.tracker.containsKey(p.id)) {
                                if (ui.tracker.containsKey(p.id)) vm.untrack(p.id) else vm.setStage(trackedFor(score, p), "survivor")
                            }
                        }
                    }
                }
            }

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

            /* The well: only when there is no résumé to write from. Read on this
               phone and sent only to draft for this posting. */
            if (blocked) item {
                Column {
                    ResumeField(
                        value = ui.resume, onChange = vm::setResume, onGo = { /* the steps read it as it is */ },
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
                            onRun = vm::draftLetter, onUnblock = { wantFocus = true },
                        ) { LongText(it) }
                        "resume" -> StepPanel(
                            title = "Your résumé, aimed at it",
                            idle = "The same experience, reworded toward what this posting asks for.",
                            busy = "Rewriting the whole résumé, then checking every name and number against your own…",
                            step = a.resume, action = "Rebuild my résumé", primary = next == id, blocked = blocked,
                            onRun = vm::buildResume, onUnblock = { wantFocus = true },
                        ) { RebuiltResume(it) }
                        else -> StepPanel(
                            title = "Their screening questions",
                            idle = "The questions on the employer's own form, answered from your résumé.",
                            busy = "Reading the employer's own form…",
                            step = a.answers, action = "Get their questions", primary = next == id, blocked = blocked,
                            onRun = vm::readAnswers, onUnblock = { wantFocus = true },
                        ) { Answers(it) }
                    }
                }
            }
        }
    }
}

/**
 * A step is idle, running, refused or done - and a refusal is worth as much screen
 * as a result. One filled button on the page: `primary` marks the next move; a
 * blocked step offers "Add your résumé" and opens the well instead of explaining.
 */
@Composable
private fun <T> StepPanel(
    title: String, idle: String, busy: String, step: Step<T>, action: String,
    primary: Boolean, blocked: Boolean,
    onRun: () -> Unit, onUnblock: () -> Unit, body: @Composable (T) -> Unit,
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
        when {
            step.busy -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), color = T.accent, strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text(busy, color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
            }
            step.error != null -> Column {
                Text(step.error, color = T.bUnsure, fontSize = Type.t2, lineHeight = 20.sp)
                Spacer(Modifier.height(Space.s3))
                MButton("Try again", primary = primary, onClick = onRun)
            }
            step.data != null -> body(step.data)
            else -> Column {
                Text(idle, color = T.text2, fontSize = Type.t2, lineHeight = 20.sp)
                Spacer(Modifier.height(Space.s3))
                if (blocked) MButton("Add your résumé →", primary = primary, onClick = onUnblock)
                else MButton(action, primary = primary, onClick = onRun)
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

/** Selectable so it can be copied into the employer's form, plus a one-tap copy. */
@Composable
private fun LongText(text: String) {
    val clip = LocalClipboardManager.current
    Column {
        SelectionContainer { Text(text, color = T.ink, fontSize = Type.t3, lineHeight = 24.sp) }
        Spacer(Modifier.height(Space.s3))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            MButton("Copy", primary = false) { clip.setText(AnnotatedString(text)) }
            ShareButton("Share", "Cover letter", text)
        }
    }
}

/**
 * The rebuilt résumé, laid out rather than run together as one blob. The gaps sit
 * OUTSIDE the document on purpose: they are what the résumé does not say, and the
 * only hand that may put them in is the candidate's.
 */
@Composable
private fun RebuiltResume(r: ResumeResponse) {
    val clip = LocalClipboardManager.current
    val plain = remember(r) { resumeText(r) }
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
        Spacer(Modifier.height(Space.s3))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            MButton("Copy the résumé", primary = false) { clip.setText(AnnotatedString(plain)) }
            ShareButton("Share", "Resume", plain)
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
    val clip = LocalClipboardManager.current
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
        MButton("Copy the answers", primary = false) { clip.setText(AnnotatedString(answersText(r))) }
    }
}

fun answersText(r: AnswersResponse): String = r.questions.joinToString("\n\n") { q ->
    q.label + "\n" + q.answer.ifEmpty { "[${q.why.ifEmpty { "yours to answer" }}]" }
}
