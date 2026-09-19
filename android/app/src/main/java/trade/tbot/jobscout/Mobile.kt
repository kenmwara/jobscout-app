package trade.tbot.jobscout

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
    onMarket: (String) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Mark(dp = 18.dp, tint = T.accent)
        Spacer(Modifier.width(7.dp))
        Text("JobScout", style = H2, fontSize = 15.sp, color = T.ink)
        Spacer(Modifier.weight(1f))
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
    withStyle(SpanStyle(color = T.live)) { append(".") }
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
@Composable
fun MTax(label: String, count: Int, onClick: () -> Unit) {
    Column(
        Modifier
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
 * The web's footer, in the phone's language: where the product explains itself
 * and what it does with your resume. The app had none of these — Play expects a
 * reachable privacy statement, and "how it works" and the live numbers were
 * web-only despite describing the same product.
 */
@Composable
fun MFoot(onOpen: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 26.dp, bottom = 8.dp)) {
        Text(
            "Reads your resume, drops what cannot fit, and tells you why about the rest.",
            fontSize = 11.5.sp, lineHeight = 17.sp, color = T.text3,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                "How it works" to "https://jobscout.page/#how",
                "Privacy" to "https://jobscout.page/privacy",
                "Live stats" to "https://jobscout.page/stats",
            ).forEach { (label, url) ->
                Text(
                    label,
                    fontSize = 11.sp, fontWeight = FontWeight.Medium, color = T.accent,
                    modifier = Modifier.clip(Pill9999).clickable { onOpen(url) }
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
) {
    Row(
        Modifier.fillMaxWidth()
            .clip(CardShape)
            .background(T.surface)
            .border(1.dp, T.hair, CardShape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
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
            // One line, clipped — the mockup's rows never wrap, which is what keeps
            // four of them legible in a 620px frame.
            Text(title, style = H2, fontSize = 14.5.sp, lineHeight = 18.sp,
                letterSpacing = (-0.015).em, color = T.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
                }
            } else {
                Text(
                    policyLabel(policy),
                    fontSize = 10.5.sp, fontWeight = FontWeight.Medium, color = T.text2,
                    modifier = Modifier.clip(Pill9999).border(1.dp, T.hair2, Pill9999)
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                )
            }
        }
    }
}

fun policyLabel(p: String?): String = when (p) {
    "remote" -> "Remote"
    "hybrid" -> "Hybrid"
    else -> "On site"
}
