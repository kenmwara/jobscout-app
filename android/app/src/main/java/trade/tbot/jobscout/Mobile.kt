package trade.tbot.jobscout

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import trade.tbot.jobscout.design.Radius
import trade.tbot.jobscout.design.Space
import trade.tbot.jobscout.design.Type

/*
 * The phone's screens, drawn in Compose from the mockup (mockups/mobile.html),
 * which is the spec. 0.9.3 (2026-09-21) brings the phone level with the web and
 * the mockup after a week in which the web moved and the phone did not:
 *
 *   MHead        brand; on the landing the two segmented groups (market flags,
 *                theme), elsewhere the market chip (flag + code) and the "..."
 *                that opens the menu sheet
 *   MenuSheet    market, the three-state theme, and every destination - 56dp rows
 *   ResumeField  ONE résumé field at two densities: the BAR in the hero (one line,
 *                grows to five with text) and the WELL on the application screen.
 *                Paste OR file; a 44dp paperclip and a 44dp go; no browser chrome
 *                to fight here, but the same geometry as site/field.css
 *   MJob         the card: rose left, org over a serif title, the three metadata
 *                tiers AS GEOMETRY (band pill filled / fact chip sunken / date
 *                bare), STRONGEST only on the card, one filled primary + the heart
 *   MEvidence    the neutral evidence card with the band as a 2px rule
 *
 * Every size comes from design/Tokens.kt (generated from tokens/tokens.json), so
 * the three clients can no longer drift on a number.
 */

private val CardShape = RoundedCornerShape(Radius.card)
private val HeroShape = RoundedCornerShape(Radius.card)
private val ChipShape = RoundedCornerShape(Radius.chip)
private val InnerShape = RoundedCornerShape(Radius.inner)
val Pill9999 = RoundedCornerShape(50)

/** The product's target law: nothing actionable is under 44dp. */
val TARGET = 44.dp

val FLAG = mapOf("ca" to "🇨🇦", "ke" to "🇰🇪")

/**
 * .ahead - brand left; on the landing the two segmented groups, elsewhere the
 * chip and the "...". The bar is the page ground at full width (a bar that
 * paints, bleeds), never a rectangle inset inside the padding.
 */
@Composable
fun MHead(
    market: String,
    home: Boolean,
    themeChoice: String?,
    onHome: () -> Unit,
    onMarket: (String) -> Unit,
    onTheme: (String?) -> Unit,
    onMenu: () -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(top = Space.s1, bottom = Space.s3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.clip(Pill9999).clickable(onClick = onHome)
                .heightIn(min = TARGET).padding(horizontal = Space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Mark(dp = 18.dp, tint = T.accent)
            Spacer(Modifier.width(7.dp))
            Text("JobScout", style = H2, fontSize = Type.t3, color = T.ink)
        }
        Spacer(Modifier.weight(1f))
        /* The chip and the "..." on every screen, the landing included - the
           web's phone header (hsheet.js) on all four routes. The mockup's
           landing-only segmented groups have no route to Saved on a phone
           without the mockup's rail, so the sheet is the one wiring here. */
        run {
            Row(
                Modifier.clip(Pill9999).background(T.chip).border(1.dp, T.hair, Pill9999)
                    .clickable(onClick = onMenu).heightIn(min = 36.dp).padding(horizontal = Space.s3),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Space.s1),
            ) {
                Text(FLAG[market] ?: "", fontSize = Type.t2)
                Text(market.uppercase(), fontSize = Type.t1, fontWeight = FontWeight.SemiBold, color = T.ink)
            }
            Spacer(Modifier.width(Space.s2))
            Box(
                Modifier.size(TARGET).clip(Pill9999).border(1.dp, T.hair, Pill9999)
                    .clickable(onClick = onMenu),
                contentAlignment = Alignment.Center,
            ) { Text("⋯", fontSize = 18.sp, color = T.ink) }
        }
    }
}

/** The three theme states as glyphs: device, light, dark. */
val THEME_ICONS = listOf("system" to "◐", "light" to "☀", "dark" to "☾")

/**
 * The menu sheet: market, the three-state theme, every destination. An overlay
 * in the activity's own window (a Dialog never received the light system-bar
 * style), bottom-aligned, on the surface with the sheet radius.
 */
@Composable
fun MenuSheet(
    market: String, themeChoice: String?, saved: Int,
    onMarket: (String) -> Unit, onTheme: (String?) -> Unit,
    onGo: (String) -> Unit, onClose: () -> Unit,
) {
/* CENTRED. Ken's ruling, 2026-09-22: "Centre all popups." It was a bottom
   sheet, argued for in a comment nobody outside this repo ever read. The
   objection that argument raised is answered by geometry instead of by
   anchoring: full width minus one gutter, 88% of the height so a long
   document still has room, rounded on all four corners so nothing reads as
   sliced, and the scrim on every side is the way out. */
    val ins = WindowInsets.safeDrawing.asPaddingValues()
    // The menu is short on a tall phone and long on a short one, so it is
    // capped and scrolls rather than running off a centred window's edges.
    val maxH = LocalConfiguration.current.screenHeightDp.dp * 0.88f
    Box(
        Modifier.fillMaxSize().background(T.ink.copy(alpha = .38f))
            .clickable(onClick = onClose).padding(ins).padding(Space.s3),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier.fillMaxWidth().heightIn(max = maxH)
                .clip(RoundedCornerShape(Radius.sheet))
                .background(T.surface)
                .clickable(enabled = false) {}
                .verticalScroll(rememberScrollState())
                .padding(start = Space.s4, end = Space.s4, top = Space.s3, bottom = Space.s4),
        ) {
            Row(Modifier.fillMaxWidth().padding(top = Space.s2), verticalAlignment = Alignment.CenterVertically) {
                Text("Menu", style = H2, fontSize = Type.t5, color = T.ink, modifier = Modifier.weight(1f))
                Box(Modifier.size(TARGET).clip(Pill9999).clickable(onClick = onClose), contentAlignment = Alignment.Center) {
                    Text("×", fontSize = 20.sp, color = T.text2)
                }
            }
            SheetLabel("Market")
            WideSeg(listOf("ca" to (FLAG["ca"] + "  Canada"), "ke" to (FLAG["ke"] + "  Kenya")), market, onMarket)
            SheetLabel("Theme")
            WideSeg(listOf("system" to "◐  Device", "light" to "☀  Light", "dark" to "☾  Dark"),
                    ThemeChoice.key(themeChoice)) { onTheme(ThemeChoice.fromKey(it)) }
            SheetLabel("Go to")
            val hair = T.hair   // read here: a draw lambda is not a composable
            listOf("home" to "Home", "saved" to "Saved", "how" to "How it works", "privacy" to "Privacy").forEachIndexed { i, (id, label) ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable { onGo(id) }
                        .drawBehind { if (i < 3) drawRect(hair, topLeft = androidx.compose.ui.geometry.Offset(0f, size.height - 1f), size = Size(size.width, 1f)) }
                        .padding(horizontal = Space.s1),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(label, fontSize = Type.t3, fontWeight = FontWeight.Medium, color = T.ink, modifier = Modifier.weight(1f))
                    if (id == "saved" && saved > 0) Text("$saved", fontSize = Type.t1, fontWeight = FontWeight.Medium, color = T.text3)
                    Spacer(Modifier.width(Space.s2))
                    Text("›", fontSize = 18.sp, color = T.text2)
                }
            }
        }
    }
}

@Composable
private fun SheetLabel(text: String) {
    Text(text.uppercase(), fontSize = Type.t0, letterSpacing = 0.09.em, fontWeight = FontWeight.Medium,
        color = T.text3, modifier = Modifier.padding(top = Space.s4, bottom = Space.s2))
}

@Composable
private fun WideSeg(items: List<Pair<String, String>>, on: String, onPick: (String) -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(Pill9999).background(T.chip).border(1.dp, T.hair, Pill9999).padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        items.forEach { (id, label) ->
            val pressed = id == on
            Box(
                Modifier.weight(1f).heightIn(min = 38.dp).clip(Pill9999)
                    .background(if (pressed) T.surface else Color.Transparent)
                    .clickable(enabled = !pressed) { onPick(id) },
                contentAlignment = Alignment.Center,
            ) { Text(label, fontSize = Type.t2, fontWeight = if (pressed) FontWeight.SemiBold else FontWeight.Medium,
                     color = if (pressed) T.ink else T.text3, maxLines = 1) }
        }
    }
}

/**
 * .mhero - the gradient card. The scrim sits between the gradient and the content so
 * white text holds on both markets' hero images.
 */
@Composable
fun MHero(
    resume: String, onResume: (String) -> Unit, onRun: () -> Unit,
    policy: String?, onPolicy: (String?) -> Unit,
    onUpload: () -> Unit, uploading: Boolean, hint: String?,
) {
    Box(Modifier.fillMaxWidth().clip(HeroShape).background(T.hero)) {
        Box(Modifier.matchParentSize().background(T.scrim))
        Column(
            Modifier.fillMaxWidth().padding(horizontal = Space.s4, vertical = Space.s6),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                buildHeadline(),
                style = H1, fontSize = Type.t7, lineHeight = 34.sp,
                letterSpacing = (-0.025).em, color = Color.White,
            )
            Spacer(Modifier.height(Space.s4))
            ResumeField(
                value = resume, onChange = onResume, onGo = onRun, onAttach = onUpload,
                uploading = uploading, well = false,
                placeholder = "Paste or drop your résumé",
            )
            hint?.let {
                Spacer(Modifier.height(Space.s2))
                Text(it, fontSize = Type.t1, lineHeight = 16.sp, color = Color.White.copy(alpha = .85f))
            }
            Spacer(Modifier.height(Space.s3))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                POLICIES.forEach { (id, label) ->
                    MTab(label, on = policy == id) { onPolicy(if (policy == id) null else id) }
                }
            }
        }
    }
}

/** The display line, with the full stop in the brand. */
@Composable
private fun buildHeadline() = buildAnnotatedString {
    append("Find the work\nmade for you")
    withStyle(SpanStyle(color = T.accent)) { append(".") }
}

val POLICIES = listOf("remote" to "Remote", "hybrid" to "Hybrid", "onsite" to "On site")

/** The paperclip from site/field.css's markup, drawn as a path so it is one glyph on every client. */
private val CLIP_PATH = "M21.4 11.05 12.25 20.2a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.18 5.18l-9.2 9.2a1.83 1.83 0 0 1-2.59-2.6l8.49-8.48"

@Composable
fun Paperclip(tint: Color, size: androidx.compose.ui.unit.Dp = 18.dp) {
    val path = remember { PathParser().parsePathString(CLIP_PATH).toPath() }
    Canvas(Modifier.size(size)) {
        val k = this.size.width / 24f
        scale(k, pivot = androidx.compose.ui.geometry.Offset.Zero) {
            drawPath(path, tint, style = Stroke(width = 1.8f, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
    }
}

/**
 * ONE résumé field, two densities (site/field.css). The bar: pill, one line
 * while empty, grows to five with text. The well: a card-radius box that
 * starts three lines tall. Both carry the paperclip (the file door - Android's
 * document picker, then /api/extract, then the text lands here) and the go.
 */
@Composable
fun ResumeField(
    value: String, onChange: (String) -> Unit, onGo: () -> Unit, onAttach: () -> Unit,
    uploading: Boolean, well: Boolean, placeholder: String,
    focus: FocusRequester? = null,
) {
    val has = value.isNotBlank()
    /* PHONE PARITY WITH site/field.css: A BAR WITH CONTENT IS A WELL.
       Ken, 2026-09-20, on the mobile mockup: "the design language is off -
       both the oval text box, and the clip", and on 09-22 about the shipped
       app: "Landing page upload bar is still the same old oval one". A pill
       holding five rows of resume is an oval with a ten-character column of
       text up its left side and the clip floating halfway up its right. So
       the bar keeps its one line only while it is EMPTY, which is the whole
       reason the bar density exists; the moment it carries text it takes the
       geometry the well already defines. `well` stays the caller's request
       for the always-well density; `stacked` is the geometry actually drawn. */
    val stacked = well || has
    val shape = if (stacked) CardShape else Pill9999
    val pulse = rememberInfiniteTransition(label = "clip")
    val k by pulse.animateFloat(1f, 0.45f, infiniteRepeatable(tween(700, easing = LinearEasing), RepeatMode.Reverse), label = "busy")
    val field: @Composable RowScope.() -> Unit = {
        BasicTextField(
            value = value, onValueChange = onChange,
            modifier = Modifier.weight(1f).then(if (focus != null) Modifier.focusRequester(focus) else Modifier)
                .then(if (stacked) Modifier.heightIn(min = 72.dp) else Modifier.padding(vertical = Space.s2)), // web: .field--bar .field__area padding s2 0 (the pill's radius clears the first glyph)
            minLines = if (stacked) 3 else 1,
            maxLines = if (stacked) 10 else 5,
            textStyle = TextStyle(fontFamily = Sans, fontSize = Type.t2, lineHeight = 19.sp, color = T.text),
            cursorBrush = SolidColor(T.accent),
            decorationBox = { inner ->
                if (value.isEmpty()) Text(placeholder, fontSize = Type.t2, color = T.text3, maxLines = 1, overflow = TextOverflow.Ellipsis)
                inner()
            },
        )
    }
    val foot: @Composable RowScope.() -> Unit = {
        Row(
            Modifier.heightIn(min = TARGET).clip(Pill9999)
                // the web's aria-label; the phone's clip had no name at all
                .semantics { contentDescription = "Attach your résumé as a PDF, Word file or text" }
                .clickable(enabled = !uploading, onClick = onAttach)
                .padding(horizontal = if (stacked) Space.s3 else 0.dp)
                .then(if (stacked) Modifier else Modifier.width(TARGET))
                .graphicsLayer { alpha = if (uploading) k else 1f },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Paperclip(T.text2)
            if (stacked) {
                Spacer(Modifier.width(Space.s2))
                Text(if (uploading) "Reading…" else "Attach a file", fontSize = Type.t1, fontWeight = FontWeight.Medium, color = T.text2)
            }
        }
        if (stacked) Spacer(Modifier.weight(1f)) else Spacer(Modifier.width(Space.s1))
        Box(
            Modifier.size(TARGET).clip(Pill9999)
                .background(if (has) T.btn else T.canvas2)
                .clickable(enabled = has, onClick = onGo),
            contentAlignment = Alignment.Center,
        ) { Text("→", fontSize = Type.t3, color = if (has) T.btnInk else T.text3) }
    }
    if (stacked) {
        Column(
            Modifier.fillMaxWidth().clip(shape).background(T.surface).border(1.dp, T.hair2, shape)
                .padding(Space.s3),
        ) {
            Row(Modifier.fillMaxWidth()) { field() }
            Row(Modifier.fillMaxWidth().padding(top = Space.s2), verticalAlignment = Alignment.CenterVertically) { foot() }
        }
    } else {
        Row(
            Modifier.fillMaxWidth().clip(shape).background(T.surface)
                .padding(start = Space.s4, top = Space.s1, end = Space.s1, bottom = Space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            field()
            Spacer(Modifier.width(Space.s1))
            Row(verticalAlignment = Alignment.CenterVertically) { foot() }
        }
    }
}

/** .mtabs i - translucent white on the hero, which is why they are not MFilter. */
@Composable
private fun MTab(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.heightIn(min = 36.dp).clip(Pill9999)
            .background(if (on) Color.White else Color.White.copy(alpha = .16f))
            .border(1.dp, Color.White.copy(alpha = .26f), Pill9999)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, fontSize = Type.t1, fontWeight = FontWeight.Medium, color = if (on) T.ink else Color.White) }
}

/** .mfilters i - the same control off the hero, on the page ground. 44dp: the target law. */
@Composable
fun MFilter(label: String, on: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.heightIn(min = TARGET).clip(Pill9999)
            .background(if (on) T.ink else T.chip)
            .border(1.dp, if (on) T.ink else T.hair, Pill9999)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, fontSize = Type.t1, fontWeight = FontWeight.Medium, maxLines = 1, color = if (on) T.canvas else T.text2) }
}

/** The one filled primary of a region (deep ink), or its quiet sibling. 44dp. */
@Composable
fun MButton(label: String, primary: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier.heightIn(min = TARGET).clip(Pill9999)
            .background(if (primary) T.btn else Color.Transparent)
            .border(1.dp, if (primary) T.btn else T.hair2, Pill9999)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = Space.s4),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, fontSize = Type.t2, fontWeight = FontWeight.SemiBold, maxLines = 1,
             color = if (!enabled) T.text3 else if (primary) T.btnInk else T.ink)
    }
}

/** The heart: 44dp, outlined; the brand when kept (selection is the brand, never a band). */
@Composable
fun Heart(saved: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(TARGET).clip(Pill9999)
            .background(if (saved) T.accent.copy(alpha = .12f) else Color.Transparent)
            .border(1.dp, if (saved) T.accent else T.hair2, Pill9999)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(if (saved) "♥" else "♡", fontSize = Type.t3, color = if (saved) T.accent else T.text2) }
}

/**
 * The hourly cap, as a STATE (mockup .state.limited): what happened and when,
 * a countdown in tabular mono so it never reflows, and two real routes.
 */
@Composable
fun MLimited(at: Long, hasRun: Boolean, onLast: () -> Unit, onBrowse: () -> Unit) {
    var now by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(System.currentTimeMillis()) }
    androidx.compose.runtime.LaunchedEffect(at) {
        while (true) { kotlinx.coroutines.delay(1000); now = System.currentTimeMillis() }
    }
    val left = ((at + 3_600_000L - now) / 1000L).coerceAtLeast(0L)
    val cal = java.util.Calendar.getInstance().apply { timeInMillis = at }
    val hh = "%02d:%02d".format(cal.get(java.util.Calendar.HOUR_OF_DAY), cal.get(java.util.Calendar.MINUTE))
    Column(
        Modifier.fillMaxWidth().clip(CardShape).background(T.surface).border(1.dp, T.hair, CardShape).padding(Space.s4),
    ) {
        Text("HOURLY LIMIT", fontSize = Type.t0, letterSpacing = 0.09.em, fontWeight = FontWeight.Medium, color = T.bUnsure)
        Spacer(Modifier.height(Space.s2))
        Text("The hourly cap was reached at $hh.", style = H2, fontSize = Type.t4, lineHeight = 24.sp, color = T.ink)
        Spacer(Modifier.height(Space.s2))
        Text("The demo scores for everyone from one budget, so each reader gets a fixed number of runs an hour. Nothing was lost \u2014 your last run is still here.",
             fontSize = Type.t2, lineHeight = 19.sp, color = T.text2)
        Spacer(Modifier.height(Space.s3))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text("NEXT RUN", fontSize = Type.t0, letterSpacing = 0.09.em, fontWeight = FontWeight.Medium, color = T.text3)
            Text("%02d:%02d".format(left / 60, left % 60), fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                 fontSize = Type.t3, fontWeight = FontWeight.Medium, color = T.ink)
            Text("from now", fontSize = Type.t1, color = T.text3)
        }
        Spacer(Modifier.height(Space.s3))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            if (hasRun) MButton("Open your last run", primary = true, onClick = onLast)
            MButton("Browse the sweep meanwhile", primary = !hasRun, onClick = onBrowse)
        }
    }
}

/** .mcount */
@Composable
fun MCount(text: String, modifier: Modifier = Modifier) {
    Text(text, fontSize = Type.t1, fontWeight = FontWeight.Medium, color = T.text3, modifier = modifier)
}

/** Tier 1 - the verdict: the band pill, filled, the label colour. */
@Composable
fun Tier1(fit: Int) {
    val (fg, bg) = T.band(fit)
    Box(
        Modifier.heightIn(min = 22.dp).clip(Pill9999).background(bg).padding(horizontal = Space.s2),
        contentAlignment = Alignment.Center,
    ) { Text(T.bandWord(fit).replace("-", " ").uppercase(), fontSize = Type.t0, fontWeight = FontWeight.SemiBold, letterSpacing = 0.06.em, color = fg) }
}

/** Tier 2 - a fact: the sunken chip, 4dp corners, the quieter ink. */
@Composable
fun Tier2(text: String) {
    Box(
        Modifier.heightIn(min = 20.dp).clip(ChipShape).background(T.canvas2).padding(horizontal = 6.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, fontSize = Type.t1, color = T.text2, maxLines = 1) }
}

/** Tier 3 - context: bare. */
@Composable
fun Tier3(text: String) { Text(text, fontSize = Type.t1, color = T.text3, maxLines = 1) }

/**
 * One piece of evidence behind a score: a neutral at the surface's own hue, the
 * band as a 2px rule down the left edge, a micro-label over the sentence.
 */
@Composable
fun MEvidence(label: String, text: String?, fg: Color, rule: Color, body_: Color) {
    val body = text?.takeIf { it.isNotBlank() } ?: return
    Column(
        Modifier.fillMaxWidth().clip(InnerShape).background(T.evidenceBg)
            .drawBehind { drawRect(rule, size = Size(2.dp.toPx(), size.height)) }
            .padding(start = 13.dp, end = 11.dp, top = 9.dp, bottom = 9.dp),
    ) {
        Text(label.uppercase(), fontSize = Type.t0, letterSpacing = 0.09.em, fontWeight = FontWeight.Medium, color = fg)
        Spacer(Modifier.height(Space.s1))
        Text(body, fontSize = Type.t2, lineHeight = 19.sp, color = body_)
    }
}

/** One line of label over one line of count, so one height fits them all. */
private val TAX_H = 66.dp

@Composable
fun MTax(label: String, count: Int, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(
        modifier.fillMaxWidth().height(TAX_H).clip(CardShape).background(T.surface)
            .border(1.dp, T.hair, CardShape).clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 11.dp),
    ) {
        Text(label, fontSize = Type.t2, fontWeight = FontWeight.Medium, color = T.ink, maxLines = 1)
        Spacer(Modifier.height(3.dp))
        Text("$count open", fontSize = Type.t1, color = T.text3)
    }
}

/**
 * Claude's mark, breathing. ONE drawing, TWO callers: a run in progress and a
 * draft being written. Ken asked for it three times on 2026-09-20 - "have the
 * claude icon pulsing to let the candidate know it's working not frozen", "a
 * pulsing claude icon would help", "Even the pulsating arrow should have been
 * the claude icon" - and the drafting steps still shipped a plain spinner,
 * because the mark lived inline in the one screen that had it.
 */
@Composable
fun ClaudePulse(size: Dp = 22.dp) {
    val pulse = rememberInfiniteTransition(label = "claude")
    val k by pulse.animateFloat(
        initialValue = 1f, targetValue = 0.72f,
        animationSpec = infiniteRepeatable(tween(760, easing = LinearEasing), RepeatMode.Reverse),
        label = "breathe",
    )
    Image(
        painter = painterResource(R.drawable.claude_mark), contentDescription = null,
        modifier = Modifier.size(size).clip(RoundedCornerShape(percent = 23))
            .graphicsLayer { scaleX = k; scaleY = k; alpha = k },
    )
}

/** A run in progress: Claude's mark, breathing, and which half is running. */
@Composable
fun MRunning(scoring: Boolean, swept: Int, going: Int) {
    Row(
        Modifier.fillMaxWidth().clip(CardShape).background(T.surface).border(1.dp, T.hair, CardShape).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ClaudePulse(22.dp)
        Column {
            Text(if (scoring) "Claude is scoring them" else "Dropping what cannot fit",
                 fontSize = Type.t2, fontWeight = FontWeight.Medium, color = T.ink)
            Spacer(Modifier.height(2.dp))
            Text(
                if (scoring) "$going postings, one Claude call each — about half a minute"
                else "$swept from this morning’s sweep, narrowing to $going — this part is free",
                fontSize = Type.t1, lineHeight = 17.sp, color = T.text2,
            )
        }
    }
}

/** The footer: what the product does with a résumé, and the two pages. */
@Composable
fun MFoot(onPage: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = Space.s6, bottom = Space.s2)) {
        Text("Reads your résumé, drops what cannot fit, and tells you why about the rest.",
             fontSize = Type.t1, lineHeight = 17.sp, color = T.text3)
        Spacer(Modifier.height(Space.s2))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
            listOf("How it works" to "how", "Privacy" to "privacy").forEach { (label, page) ->
                Box(Modifier.heightIn(min = TARGET).clip(Pill9999).clickable { onPage(page) }.padding(horizontal = Space.s2),
                    contentAlignment = Alignment.Center) {
                    Text(label, fontSize = Type.t1, fontWeight = FontWeight.Medium, color = T.accent)
                }
            }
        }
    }
}

/** .mtitle */
@Composable
fun MTitle(text: String) {
    Text(text, style = H2, fontSize = Type.t5, letterSpacing = (-0.02).em, color = T.ink,
        modifier = Modifier.padding(top = Space.s1, bottom = Space.s3))
}

/**
 * .jcard - one posting. The browse row leads with the empty rose and ends in a
 * policy chip; the scored card leads with the rose, carries the three tiers,
 * ONE evidence line (STRONGEST - what to answer waits behind the tap), and a
 * single filled primary beside the heart.
 */
@Composable
fun MJob(
    title: String,
    company: String,
    location: String = "",
    policy: String? = null,
    fit: Int? = null,
    onClick: (() -> Unit)? = null,
    action: String? = null,
    strongest: String? = null,
    saved: Boolean = false,
    onSave: (() -> Unit)? = null,
    onDismiss: (() -> Unit)? = null,
) {
    val press = remember { MutableInteractionSource() }
    val pressed by press.collectIsPressedAsState()
    val give by animateFloatAsState(if (pressed) 0.988f else 1f,
        animationSpec = if (pressed) Motion.exit else Motion.settle, label = "press")
    Column(
        Modifier.fillMaxWidth()
            .graphicsLayer { scaleX = give; scaleY = give }
            .clip(CardShape).background(T.surface).border(1.dp, T.hair, CardShape)
            .then(if (onClick != null) Modifier.clickable(interactionSource = press, indication = null, onClick = onClick) else Modifier)
            .padding(Space.s3),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(11.dp)) {
            if (fit != null) BearingRose(fit, diameter = 44.dp) else EmptyRose(diameter = 44.dp)
            Column(Modifier.weight(1f)) {
                Text(listOf(company, location).filter { it.isNotBlank() }.joinToString(" · "),
                     fontSize = Type.t1, color = T.text2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Text(title, style = H2, fontSize = Type.t4, lineHeight = 22.sp,
                     letterSpacing = (-0.015).em, color = T.ink,
                     maxLines = if (fit != null) 2 else 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(Space.s2))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (fit != null) Tier1(fit)
                    if (policy != null) Tier2(policyLabel(policy))
                }
            }
            if (onDismiss != null) {
                Box(Modifier.size(32.dp).clip(Pill9999).clickable(onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Text("×", fontSize = 17.sp, color = T.text3)
                }
            }
        }
        if (fit != null) {
            strongest?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.height(Space.s2))
                MEvidence("Strongest", it, T.bAuto, T.evidenceRuleStrongest, T.strongestBody)
            }
            if (action != null || onSave != null) {
                Spacer(Modifier.height(Space.s2))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                    if (action != null && onClick != null) MButton(action, primary = true, onClick = onClick)
                    Spacer(Modifier.weight(1f))
                    if (onSave != null) Heart(saved, onSave)
                }
            }
        }
    }
}

fun policyLabel(p: String?): String = when (p) {
    "remote" -> "Remote"
    "hybrid" -> "Hybrid"
    else -> "On site"
}
