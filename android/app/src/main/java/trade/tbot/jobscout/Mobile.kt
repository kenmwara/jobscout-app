package trade.tbot.jobscout

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/*
 * The three screens the mockup's Mobile tab specifies, drawn in Compose.
 *
 * The reference was extracted from the mockup's own rendered DOM on 2026-09-19 rather
 * than read off a screenshot — an ordered element list per screen, hashed:
 * Canada `0d98ef3d`, Kenya `dd63597f`. Every composable below maps to one line of it,
 * and the names are kept deliberately close to the mockup's class names so the two can
 * be diffed by eye as well as by hash:
 *
 *   mhead    brand mark + wordmark, market chip pushed right
 *   mhero    gradient card, serif display, paste box, three policy tabs
 *   mcount   the quiet line of numbers
 *   mjob     company initials | serif role | company | policy pill
 *   mtitle   "Explore today's sweep" / "Your matches"
 *   mfilters Remote N (on) / Hybrid N / On site
 *
 * On the "after a run" screen the initials give way to a rose and the policy pill to
 * the fit band, which is the only structural difference between the two card shapes.
 */

private val CardShape = RoundedCornerShape(14.dp)
private val HeroShape = RoundedCornerShape(16.dp)
private val BoxShape = RoundedCornerShape(12.dp)
private val Pill9999 = RoundedCornerShape(50)

/** .mhead — brand on the left, market chip hard right. */
@Composable
fun MHead(
    market: String,
    /* How many postings are kept, and the way in to them. TrackerScreen existed
       and `trackerOpen` was read in exactly one place and set in none, so the
       saved list was unreachable on the phone while the web carried "Saved (N)"
       in its nav the whole time. */
    saved: Int = 0,
    onSaved: (() -> Unit)? = null,
    /** The wordmark goes home, as the web's has since the redesign. */
    onHome: (() -> Unit)? = null,
    /* THEME.md section 6: the toggle is a required feature. ThemeChoice has
       carried all three states since it was written and nothing ever called
       set(), so the stored value could only be absent - this app was
       permanently light with no route to dark, on a phone whose owner may
       have asked their whole device for dark. */
    themeChoice: String? = null,
    onTheme: (() -> Unit)? = null,
    onMarket: (String) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // One target for the mark and the word — two adjacent decorations is
        // not what anyone means by "the logo".
        Row(
            Modifier.clip(Pill9999)
                .then(if (onHome != null) Modifier.clickable(onClick = onHome) else Modifier)
                .padding(horizontal = 4.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Mark(dp = 18.dp, tint = T.accent)
            Spacer(Modifier.width(7.dp))
            Text("JobScout", style = H2, fontSize = 15.sp, color = T.ink)
        }
        Spacer(Modifier.weight(1f))
        if (onTheme != null) {
            /* THREE STATES ON ONE CONTROL, because a switch cannot express
               the third and the third - follow the phone - is the one most
               people want. It names the state it is IN and cycles Light,
               Device, Dark. A word rather than an icon: this bar already
               speaks in words, and a word is its own accessibility label. */
            Text(
                ThemeChoice.label(themeChoice),
                fontSize = 11.sp, fontWeight = FontWeight.Medium, color = T.text3,
                modifier = Modifier
                    .clip(Pill9999)
                    .clickable(onClick = onTheme)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        if (onSaved != null) {
            Text(
                if (saved > 0) "Saved ($saved)" else "Saved",
                fontSize = 11.sp, fontWeight = FontWeight.Medium,
                color = if (saved > 0) T.accent else T.text3,
                modifier = Modifier
                    .clip(Pill9999)
                    .clickable(onClick = onSaved)
                    .padding(horizontal = 8.dp, vertical = 6.dp),
            )
            Spacer(Modifier.width(6.dp))
        }
        /* Both markets, both visible. One pill carrying only the CURRENT market
           meant Kenya did not exist unless you already knew the pill was a
           switch — reported from the phone as "there's no KE button". The web
           has always shown the pair; this is the same control. */
        Row(
            Modifier.clip(Pill9999).background(T.chip).border(1.dp, T.hair, Pill9999).padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            listOf("ca" to "🇨🇦 Canada", "ke" to "🇰🇪 Kenya").forEach { (id, label) ->
                val on = market == id
                Text(
                    label,
                    fontSize = 11.sp,
                    fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium,
                    color = if (on) T.ink else T.text3,
                    modifier = Modifier
                        .clip(Pill9999)
                        .background(if (on) T.surface else Color.Transparent)
                        .clickable(enabled = !on) { onMarket(id) }
                        .padding(horizontal = 9.dp, vertical = 5.dp),
                )
            }
        }
    }
}

/**
 * .mhero — the gradient card. The scrim sits between the gradient and the content so
 * white text holds on both markets' hero images; without it Kenya's light green end
 * takes the display type down to nothing.
 */
@Composable
fun MHero(
    resume: String, onResume: (String) -> Unit, onRun: () -> Unit,
    policy: String?, onPolicy: (String?) -> Unit,
    onUpload: () -> Unit, uploading: Boolean, hint: String?,
) {
    Box(
        Modifier.fillMaxWidth().clip(HeroShape).background(T.hero)
    ) {
        Box(Modifier.matchParentSize().background(T.scrim))
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 26.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                buildHeadline(),
                style = H1, fontSize = 27.sp, lineHeight = 30.sp,
                letterSpacing = (-0.025).em, color = Color.White,
            )
            Spacer(Modifier.height(16.dp))
            MBox(resume = resume, onResume = onResume, onRun = onRun,
                 onUpload = onUpload, uploading = uploading)
            // What the extractor said, next to the control that caused it
            // rather than three sections away.
            hint?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, fontSize = 11.5.sp, lineHeight = 16.sp,
                     color = Color.White.copy(alpha = .85f))
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                POLICIES.forEach { (id, label) ->
                    MTab(label, on = policy == id) { onPolicy(if (policy == id) null else id) }
                }
            }
        }
    }
}

/** The display line, with the full stop in --live. */
@Composable
private fun buildHeadline() = buildAnnotatedString {
    append("Find the work\nmade for you")
    // brand, not T.live: live IS the unsure band solid
    withStyle(SpanStyle(color = T.accent)) { append(".") }
}

val POLICIES = listOf("remote" to "Remote", "hybrid" to "Hybrid", "onsite" to "On site")

/** .mbox — the paste field with the go button inside it, not beside it. */
@Composable
private fun MBox(
    resume: String, onResume: (String) -> Unit, onRun: () -> Unit,
    onUpload: () -> Unit, uploading: Boolean,
) {
    Row(
        Modifier.fillMaxWidth().clip(BoxShape).background(T.surface)
            .padding(start = 13.dp, top = 6.dp, end = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        /* maxLines is load-bearing. Without it an uploaded resume — 1,800 words —
           grew this field down past the fold and pushed the whole page off the
           screen, which is what the operator saw after tapping Upload. Six
           lines is enough to see that the right document arrived; the field
           scrolls its own overflow from there. */
        BasicTextField(
            value = resume,
            onValueChange = onResume,
            modifier = Modifier.weight(1f).heightIn(max = 108.dp),
            maxLines = 6,
            textStyle = TextStyle(
                fontFamily = Sans, fontSize = 12.5.sp, color = T.text,
            ),
            cursorBrush = SolidColor(T.accent),
            decorationBox = { inner ->
                if (resume.isEmpty()) {
                    Text("Paste your resume, or a job title…", fontSize = 12.5.sp, color = T.text3)
                }
                inner()
            },
        )
        // The upload control sits INSIDE the box, where the web puts it. The v3
        // rebuild dropped it and left importResume with no caller, so there was
        // no way to upload a file at all.
        Text(
            if (uploading) "Reading…" else "Upload",
            fontSize = 12.sp, fontWeight = FontWeight.Medium, color = T.accent, maxLines = 1,
            modifier = Modifier.clip(Pill9999)
                .clickable(enabled = !uploading, onClick = onUpload)
                .padding(horizontal = 8.dp, vertical = 6.dp),
        )
        Spacer(Modifier.width(4.dp))
        Box(
            Modifier.size(30.dp).clip(Pill9999).background(T.btn).clickable(onClick = onRun),
            contentAlignment = Alignment.Center,
        ) {
            Text("→", fontSize = 13.sp, color = T.btnInk)
        }
    }
}

/** .mtabs i — translucent white on the hero, which is why they are not MFilter. */
@Composable
private fun MTab(label: String, on: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 11.sp, fontWeight = FontWeight.Medium,
        color = if (on) T.ink else Color.White,
        modifier = Modifier
            .clip(Pill9999)
            .background(if (on) Color.White else Color.White.copy(alpha = .16f))
            .border(1.dp, Color.White.copy(alpha = .26f), Pill9999)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 7.dp),
    )
}

/** .mfilters i — the same control off the hero, on the page ground. */
@Composable
fun MFilter(label: String, on: Boolean, onClick: () -> Unit) {
    Text(
        label,
        fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1,
        color = if (on) T.canvas else T.text2,
        modifier = Modifier
            .clip(Pill9999)
            .background(if (on) T.ink else T.chip)
            .border(1.dp, if (on) T.ink else T.hair, Pill9999)
            .clickable(onClick = onClick)
            .padding(horizontal = 11.dp, vertical = 8.dp),
    )
}

/** .mcount */
@Composable
fun MCount(text: String, modifier: Modifier = Modifier) {
    Text(text, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, color = T.text3, modifier = modifier)
}

/**
 * .tax — one slice of the feed: a name and how much of today it is. The web
 * has had these since the redesign; the phone showed a bare count instead, so
 * the landing said "318 swept this morning" and stopped.
 */
/**
 * One piece of evidence behind a score, in the same shape the below-floor panel
 * uses for its asks: a micro-label in the band's own colour over the sentence
 * itself. Nothing is truncated — a receipt you cannot read is not a receipt.
 */
@Composable
private fun MEvidence(label: String, text: String?, fg: Color, rule: Color, body_: Color) {
    val body = text?.takeIf { it.isNotBlank() } ?: return
    Spacer(Modifier.height(7.dp))
    Column(
        Modifier.fillMaxWidth().clip(EvShape).background(T.evidenceBg)
            /* The band, as a rule down the left edge rather than across the
               whole field. drawBehind rather than a border, because a
               border would run round all four sides. */
            .drawBehind {
                drawRect(rule, size = androidx.compose.ui.geometry.Size(2.dp.toPx(), size.height))
            }
            .padding(start = 13.dp, end = 11.dp, top = 9.dp, bottom = 9.dp),
    ) {
        Text(label.uppercase(), fontSize = 9.5.sp, letterSpacing = 0.09.em,
            fontWeight = FontWeight.Medium, color = fg)
        Spacer(Modifier.height(4.dp))
        Text(body, fontSize = 12.sp, lineHeight = 18.sp, color = body_)
    }
}

private val EvShape = RoundedCornerShape(10.dp)

/** One line of label over one line of count, so one height fits them all. */
private val TAX_H = 66.dp

@Composable
fun MTax(label: String, count: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier
            /* Half a row is only half a row if the card takes it, and every tile
               is the same rectangle whatever its label says. Both were true of
               the web's grid from the start; the phone's tiles were sized by
               their own words until 2026-09-19. */
            .fillMaxWidth()
            .height(TAX_H)
            .clip(CardShape)
            .background(T.surface)
            .border(1.dp, T.hair, CardShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 11.dp),
    ) {
        Text(label, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = T.ink, maxLines = 1)
        Spacer(Modifier.height(3.dp))
        Text("$count open", fontSize = 11.5.sp, color = T.text3)
    }
}

/**
 * A run in progress. The phone showed nothing at all between the tap and the
 * finished matches — the gate stream and eight Claude calls are forty seconds
 * of silence, which reads as a dead button. Claude's own mark, breathing,
 * and a line saying which half is running.
 */
@Composable
fun MRunning(scoring: Boolean, swept: Int, going: Int) {
    val pulse = rememberInfiniteTransition(label = "run")
    val k by pulse.animateFloat(
        initialValue = 1f, targetValue = 0.72f,
        animationSpec = infiniteRepeatable(tween(760, easing = LinearEasing), RepeatMode.Reverse),
        label = "breathe",
    )
    Row(
        Modifier.fillMaxWidth().clip(CardShape).background(T.surface)
            .border(1.dp, T.hair, CardShape).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Image(
            painter = painterResource(R.drawable.claude_mark),
            contentDescription = null,
            modifier = Modifier.size(22.dp).clip(RoundedCornerShape(5.dp))
                .graphicsLayer { scaleX = k; scaleY = k; alpha = k },
        )
        Column {
            Text(
                if (scoring) "Claude is scoring them" else "Dropping what cannot fit",
                fontSize = 14.sp, fontWeight = FontWeight.Medium, color = T.ink,
            )
            Spacer(Modifier.height(2.dp))
            Text(
            /* This counted the reject STREAM, and the API marks only a handful
               of postings as hard rejects — so on a 318-posting sweep it read
               "3 of 3" while the gate was narrowing 318 to 8. */
                if (scoring) "$going postings, one Claude call each — about half a minute"
                else "$swept from this morning’s sweep, narrowing to $going — this part is free",
                fontSize = 12.5.sp, lineHeight = 18.sp, color = T.text2,
            )
        }
    }
}

/**
 * The web's footer, in the phone's language: where the product explains itself
 * and what it does with your resume. The app had none of these — Play expects a
 * reachable privacy statement, and "how it works" and the live numbers were
 * web-only despite describing the same product.
 */
@Composable
fun MFoot(onPage: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 8.dp)) {
        Text(
            "Reads your resume, drops what cannot fit, and tells you why about the rest.",
            fontSize = 11.5.sp, lineHeight = 17.sp, color = T.text3,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // In the app, not in a browser. A privacy policy is the last thing
            // that should throw the reader out of the app to read.
            listOf("How it works" to "how", "Privacy" to "privacy").forEach { (label, page) ->
                Text(
                    label,
                    fontSize = 11.sp, fontWeight = FontWeight.Medium, color = T.accent,
                    modifier = Modifier.clip(Pill9999).clickable { onPage(page) }
                        .padding(horizontal = 9.dp, vertical = 6.dp),
                )
            }
        }
    }
}

/** .mtitle */
@Composable
fun MTitle(text: String) {
    Text(text, style = H2, fontSize = 21.sp, letterSpacing = (-0.02).em, color = T.ink,
        modifier = Modifier.padding(top = 4.dp, bottom = 14.dp))
}

/**
 * .mjob — one posting. Two forms: the browse card leads with the company's initials
 * and ends in a policy pill; the scored card leads with the rose and ends in the fit
 * band. Everything between them is identical, so it is one composable.
 */
@Composable
fun MJob(
    title: String,
    company: String,
    policy: String? = null,
    fit: Int? = null,
    onClick: (() -> Unit)? = null,
    /* The word for what tapping does. A scored card WAS clickable and said so
       nowhere — reported from the phone as "there is no prepare application
       button", and it was right: the whole card opened the application page
       and nothing on it suggested that. The web has carried the label since
       the redesign. */
    action: String? = null,
    /* What the score MEANS. A scored card used to carry a number and a band
       word and nothing else: the verdict and the two evidence lines existed in
       the response and were rendered nowhere, so the phone showed "28 ·
       NEAR-MISS" and left the reader to guess. The web has shown all three
       since the redesign. */
    verdict: String? = null,
    strongest: String? = null,
    weakest: String? = null,
    /* Keeping a posting. The web's score card has had this since the redesign
       and MJob never got it, so the Saved screen's own empty state — "tap Save
       on a score to keep it" — pointed at a control that did not exist. */
    saved: Boolean = false,
    onSave: (() -> Unit)? = null,
    /** Put this posting away, with one undo. The web has had dismiss since the
     *  redesign; the phone had no way to say "not this one". */
    onDismiss: (() -> Unit)? = null,
) {
    /* MOTION v1: the press. Compose has no :active, so the card reads its own
       interaction source and gives .988 on Motion.exit (160ms) while pressed,
       returning on Motion.settle - a give that eases in is not a give. */
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val give by animateFloatAsState(if (pressed) 0.988f else 1f,
        animationSpec = if (pressed) Motion.exit else Motion.settle, label = "press")
    Row(
        Modifier.fillMaxWidth()
            .graphicsLayer { scaleX = give; scaleY = give }
            .clip(CardShape)
            .background(T.surface)
            .border(1.dp, T.hair, CardShape)
            .then(if (onClick != null) Modifier.clickable(interactionSource = press, indication = null, onClick = onClick) else Modifier)
            .padding(13.dp),
        horizontalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        if (fit != null) {
            BearingRose(fit, diameter = 38.dp)
        } else {
            Box(
                Modifier.size(28.dp).clip(RoundedCornerShape(8.dp)).background(T.chip)
                    .border(1.dp, T.hair, RoundedCornerShape(8.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(company.take(2).uppercase(), fontSize = 11.sp,
                    fontWeight = FontWeight.Medium, color = T.text2)
            }
        }
        Column(Modifier.weight(1f)) {
            /* One line for a browse row: the mockup's rows never wrap, and that is
               what keeps four of them legible in a 620px frame. Two for a scored
               one — a match's title is the identity of the thing being judged,
               and "Senior Associate, SLC Accounting and Controls - SLC …" is not
               that. */
            Text(title, style = H2, fontSize = 14.5.sp, lineHeight = 18.sp,
                letterSpacing = (-0.015).em, color = T.ink,
                maxLines = if (fit != null) 2 else 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(3.dp))
            Text(company, fontSize = 11.5.sp, color = T.text2)
            Spacer(Modifier.height(7.dp))
            if (fit != null) {
                val (fg, bg) = T.band(fit)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        T.bandWord(fit).uppercase(),
                        fontSize = 10.5.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.06.em, color = fg,
                        modifier = Modifier.clip(Pill9999).background(bg).padding(horizontal = 8.dp, vertical = 5.dp),
                    )
                    if (action != null) Text(
                        action,
                        fontSize = 10.5.sp, fontWeight = FontWeight.SemiBold, color = T.accent, maxLines = 1,
                        modifier = Modifier.clip(Pill9999).border(1.dp, T.accent, Pill9999)
                            .padding(horizontal = 9.dp, vertical = 5.dp),
                    )
                    if (onSave != null) Text(
                        if (saved) "\u2665 Saved" else "\u2661 Save",
                        fontSize = 10.5.sp, fontWeight = FontWeight.Medium, maxLines = 1,
                        // selected state is the brand; T.live is the unsure solid
                        color = if (saved) T.accent else T.text2,
                        modifier = Modifier.clip(Pill9999)
                            .border(1.dp, if (saved) T.accent else T.hair2, Pill9999)
                            .clickable(onClick = onSave)
                            .padding(horizontal = 9.dp, vertical = 5.dp),
                    )
                }
                // The reasoning, not clipped: this is what the score is FOR.
                verdict?.takeIf { it.isNotBlank() }?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, fontSize = 12.5.sp, lineHeight = 19.sp, color = T.text2)
                }
                MEvidence("Strongest", strongest, T.bAuto,
                          T.evidenceRuleStrongest, T.strongestBody)
                MEvidence("What to answer", weakest, T.bUnsure,
                          T.evidenceRuleAnswer, T.answerBody)
            } else {
                Text(
                    policyLabel(policy),
                    fontSize = 10.5.sp, fontWeight = FontWeight.Medium, color = T.text2,
                    modifier = Modifier.clip(Pill9999).border(1.dp, T.hair2, Pill9999)
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                )
            }
        }
        if (onDismiss != null) {
            Text(
                "×",
                fontSize = 17.sp, color = T.text3,
                modifier = Modifier.clip(Pill9999).clickable(onClick = onDismiss)
                    .padding(horizontal = 8.dp, vertical = 2.dp),
            )
        }
    }
}

fun policyLabel(p: String?): String = when (p) {
    "remote" -> "Remote"
    "hybrid" -> "Hybrid"
    else -> "On site"
}
