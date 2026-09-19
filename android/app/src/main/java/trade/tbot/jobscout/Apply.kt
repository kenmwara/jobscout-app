package trade.tbot.jobscout

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/**
 * One application, on its own screen. The phone half of site/apply.html.
 *
 * Until 2026-09-19 the two Claude drafts were pills on a score card and opened a
 * shared dialog, which put the writing before the job it was for and made a second
 * draft overwrite the first. Here the posting is the page, and the three steps sit
 * under it in the order someone actually uses them: the letter, their own resume
 * rebuilt for this job, then the questions the employer will ask.
 *
 * Nothing here submits anything. It cannot: Greenhouse and Ashby both need the
 * EMPLOYER's key to post an application, and Workday needs an account per tenant.
 * The ceiling is having every answer ready before the form is opened, and that is
 * what this screen is for.
 */
@Composable
fun ApplyScreen(vm: DemoVm, a: Apply, onClose: () -> Unit) {
    BackHandler(onBack = onClose)
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    val uri = LocalUriHandler.current
    val (band, bandColor) = bandFor(a.fit)
    val p = a.posting

    Box(Modifier.fillMaxSize().background(CanvasBg).dots()) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp, ins.calculateTopPadding() + 12.dp, 16.dp, ins.calculateBottomPadding() + 40.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Row(
                        Modifier.warmShadow(6.dp, Pill).background(CardBg, Pill).padding(horizontal = 16.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("360", color = Indigo, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.em)
                        Text(" — THE APPLICATION", color = Text3, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.1.em)
                    }
                    Spacer(Modifier.weight(1f))
                    PillButton("Back", onClick = onClose)
                }
            }

            // The posting this is all for, with its score — so a page of drafts can
            // never drift away from the job it was written against.
            item {
                Column(Modifier.warmShadow(10.dp, Card).background(CardBg, Card).padding(18.dp)) {
                    Row {
                        BearingRose(a.fit, Modifier.padding(end = 14.dp, top = 2.dp), diameter = 84.dp)
                        Column(Modifier.weight(1f)) {
                            Text(p.title, style = H2, fontSize = 22.sp)
                            Text(
                                listOf(p.company, p.location).filter { it.isNotEmpty() }.joinToString(" · "),
                                color = Muted, fontSize = 14.sp, lineHeight = 21.sp,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                            Spacer(Modifier.height(8.dp))
                            Chip("${a.fit} / 100 · ${band.uppercase()}", bandColor, ground = bandFill(a.fit).copy(alpha = .18f))
                        }
                    }
                    if (p.url.isNotEmpty()) Row(Modifier.padding(top = 14.dp)) {
                        PillButton("View posting ↗") { runCatching { uri.openUri(p.url) } }
                    }
                }
            }

            item {
                Text(
                    "Three things, each drafted from your resume alone and each one call. " +
                        "JobScout never submits anything — you open the employer's form with the answers already written.",
                    color = Muted, fontSize = 14.sp, lineHeight = 21.sp,
                )
            }

            item {
                StepPanel(
                    title = "Cover letter",
                    idle = "Written from your resume and this posting, in your register. Nothing it cannot point at in your own words.",
                    busy = "Drafting from the profile only — it cannot invent experience…",
                    step = a.letter, action = "Draft the letter", onRun = vm::draftLetter,
                ) { LongText(it) }
            }

            item {
                StepPanel(
                    title = "Your resume, rebuilt for this job",
                    idle = "Every role, school and certificate you already have — reordered and reworded for this posting. " +
                        "A different document for every application.",
                    busy = "Rewriting the whole resume, then checking every name and number against your own…",
                    step = a.resume, action = "Rebuild the resume", onRun = vm::buildResume,
                ) { RebuiltResume(it) }
            }

            item {
                StepPanel(
                    title = "Their screening questions",
                    idle = "Greenhouse and Ashby publish a job's form, so the questions can be read and answered before you open it.",
                    busy = "Reading the employer's own form…",
                    step = a.answers, action = "Read the questions", onRun = vm::readAnswers,
                ) { Answers(it) }
            }
        }
    }
}

/**
 * A step is idle, running, refused or done — and a refusal is worth as much screen
 * as a result. The worker refuses a draft that invented a number or an employer, and
 * that sentence is the honest answer, not an error to bury.
 */
@Composable
private fun <T> StepPanel(
    title: String, idle: String, busy: String, step: Step<T>, action: String,
    onRun: () -> Unit, body: @Composable (T) -> Unit,
) {
    Column(Modifier.warmShadow(10.dp, Card).background(CardBg, Card).padding(18.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = H2, fontSize = 20.sp, modifier = Modifier.weight(1f))
            Text(
                when {
                    step.busy -> "working"
                    step.error != null -> "not available"
                    step.data != null -> "ready"
                    else -> "not started"
                },
                color = Text3, fontSize = 12.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.08.em,
            )
        }
        Spacer(Modifier.height(8.dp))
        when {
            step.busy -> Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.size(16.dp), color = Indigo, strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text(busy, color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
            }
            step.error != null -> Column {
                Text(step.error, color = EmberDeep, fontSize = 14.sp, lineHeight = 21.sp)
                Spacer(Modifier.height(12.dp))
                PillButton("Try again", filled = true, onClick = onRun)
            }
            step.data != null -> body(step.data)
            else -> Column {
                Text(idle, color = Muted, fontSize = 14.sp, lineHeight = 21.sp)
                Spacer(Modifier.height(12.dp))
                PillButton(action, filled = true, onClick = onRun)
            }
        }
    }
}

/** Selectable so it can be copied into the employer's form, plus a one-tap copy. */
@Composable
private fun LongText(text: String) {
    val clip = LocalClipboardManager.current
    Column {
        SelectionContainer { Text(text, color = Ink, fontSize = 15.sp, lineHeight = 24.sp) }
        Spacer(Modifier.height(12.dp))
        PillButton("Copy") { clip.setText(AnnotatedString(text)) }
    }
}

/**
 * The rebuilt resume, laid out rather than run together as one blob. The gaps sit
 * OUTSIDE the document on purpose: they are what the resume does not say, and the
 * only hand that may put them in is the candidate's.
 */
@Composable
private fun RebuiltResume(r: ResumeResponse) {
    val clip = LocalClipboardManager.current
    val plain = remember(r) { resumeText(r) }
    Column {
        SelectionContainer {
            Column {
                if (r.name.isNotEmpty()) Text(r.name, style = H2, fontSize = 20.sp)
                if (r.contact.isNotEmpty()) Text(r.contact, color = Text3, fontSize = 13.sp)
                if (r.headline.isNotEmpty())
                    Text(r.headline, color = Ink, fontSize = 15.sp, lineHeight = 23.sp, modifier = Modifier.padding(top = 8.dp))
                r.sections.forEach { sec ->
                    Text(
                        sec.heading.uppercase(), color = Indigo, fontSize = 12.sp,
                        fontWeight = FontWeight.Medium, letterSpacing = 0.08.em,
                        modifier = Modifier.padding(top = 16.dp, bottom = 6.dp),
                    )
                    sec.items.forEach { it ->
                        Text(it.title, color = Ink, fontSize = 15.sp, fontWeight = FontWeight.Medium, lineHeight = 22.sp)
                        if (it.meta.isNotEmpty()) Text(it.meta, color = Text3, fontSize = 13.sp, lineHeight = 20.sp)
                        it.bullets.forEach { b ->
                            Text("•  $b", color = Muted, fontSize = 14.sp, lineHeight = 21.sp,
                                modifier = Modifier.padding(top = 3.dp))
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }
            }
        }
        if (r.gaps.isNotEmpty()) Column(
            Modifier.padding(top = 8.dp).background(Info, Card).padding(14.dp)
        ) {
            Text("WHAT THIS POSTING ASKS FOR THAT YOUR RESUME DOES NOT SAY",
                color = MidnightViolet, fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.08.em)
            Spacer(Modifier.height(8.dp))
            r.gaps.forEach {
                Text(it.asks, color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 21.sp)
                if (it.note.isNotEmpty()) Text(it.note, color = Muted, fontSize = 13.sp, lineHeight = 20.sp)
                Spacer(Modifier.height(8.dp))
            }
            Text("Yours to add, and only if true — they are deliberately left out of the document above.",
                color = Text3, fontSize = 12.sp, lineHeight = 18.sp)
        }
        Spacer(Modifier.height(12.dp))
        PillButton("Copy the resume") { clip.setText(AnnotatedString(plain)) }
    }
}

/** The same document as plain text, for pasting into a form that wants one box. */
fun resumeText(r: ResumeResponse): String = buildString {
    if (r.name.isNotEmpty()) appendLine(r.name)
    if (r.contact.isNotEmpty()) appendLine(r.contact)
    if (r.headline.isNotEmpty()) { appendLine(); appendLine(r.headline) }
    r.sections.forEach { sec ->
        appendLine(); appendLine(sec.heading.uppercase())
        sec.items.forEach { it ->
            append(it.title)
            if (it.meta.isNotEmpty()) append(" — ").append(it.meta)
            appendLine()
            it.bullets.forEach { b -> appendLine("  • $b") }
        }
    }
}

/**
 * The employer's questions. Two classes are shown and never drafted — anything
 * personal (demographics, salary, criminal history, citizenship) and plain identity
 * fields — and each says so in its own words rather than sitting there blank.
 */
@Composable
private fun Answers(r: AnswersResponse) {
    val clip = LocalClipboardManager.current
    if (r.unsupported) {
        Text(
            r.detail.orEmpty().ifEmpty {
                "This employer's board does not publish its form, so the questions cannot be read before you open it."
            },
            color = Muted, fontSize = 14.sp, lineHeight = 21.sp,
        )
        return
    }
    Column {
        Text(
            "${r.questions.size} question${if (r.questions.size == 1) "" else "s"} on ${r.source.ifEmpty { "the form" }}" +
                " — ${r.drafted} answered from your resume.",
            color = Text3, fontSize = 13.sp, lineHeight = 20.sp,
        )
        Spacer(Modifier.height(12.dp))
        r.questions.forEach { q ->
            Column(Modifier.padding(bottom = 14.dp)) {
                Text(
                    q.label + if (q.required) "  ·  required" else "",
                    color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Medium, lineHeight = 21.sp,
                )
                when {
                    q.answer.isNotEmpty() -> {
                        SelectionContainer {
                            Text(q.answer, color = Muted, fontSize = 14.sp, lineHeight = 21.sp,
                                modifier = Modifier.padding(top = 4.dp))
                        }
                        if (q.from.isNotEmpty()) Text(
                            "from your resume: “${q.from}”",
                            color = Text3, fontSize = 12.sp, lineHeight = 18.sp,
                            modifier = Modifier.padding(top = 3.dp),
                        )
                    }
                    // Not a gap to be filled in later — a deliberate refusal, and the
                    // reason is the useful part.
                    else -> Text(
                        q.why.ifEmpty { "yours to answer" },
                        color = EmberDeep, fontSize = 13.sp, lineHeight = 20.sp,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }
        }
        PillButton("Copy the answers") { clip.setText(AnnotatedString(answersText(r))) }
    }
}

fun answersText(r: AnswersResponse): String = r.questions.joinToString("\n\n") { q ->
    q.label + "\n" + q.answer.ifEmpty { "[${q.why.ifEmpty { "yours to answer" }}]" }
}
