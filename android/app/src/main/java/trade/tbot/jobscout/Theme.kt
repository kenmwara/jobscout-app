// Font(variationSettings = …) is still behind ExperimentalTextApi; it is the only
// way to pick a weight/optical size out of a variable TTF.
@file:OptIn(ExperimentalTextApi::class)

package trade.tbot.jobscout

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.delay
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

// ── JobScout v2.1 — August Health language, tokens mirror site/index.html :root ──
// Indigo (4.15:1 on cream) and forest (3.9) are FILL / large-text only, never body copy.
val Indigo = Color(0xFF4865FF)
val MidnightViolet = Color(0xFF1B1463)
val Ink = Color(0xFF080331)
val Muted = Color(0xFF4A4560)        // --text2
val Text3 = Color(0xFF6B6780)
val CanvasBg = Color(0xFFF8F3EB)
val CardBg = Color.White
val Info = Color(0xFFDCE4FB)
val Lavender = Color(0xFFA2BAFF)
/* Meadow, Forest, EmberDeep and Stone lived here holding #114e0b, #328a3b,
   #cc3600 and #333333 - the pre-ramp palette, from before ember moved to
   hue 63. Nothing read Meadow or Stone at all, and the other two reached
   only PERSONA_HUES below, which nothing read either. Deleted rather than
   updated: a colour no one asks for does not need a correct value, it
   needs to stop being available to copy. The live band colours are in
   Tokens.kt, per theme. */
val Hairline = Color(0x1A080331)     // rgba(8,3,49,.10)
val Hair2 = Color(0x2E080331)        // rgba(8,3,49,.18)
private val WarmBrown = Color(0xFF4B4439)

/* PERSONA_HUES went with them - three pre-ramp pairs, zero consumers. The
   web's equivalent is the band ramp itself, which every client now reads
   from its token set. */

// CornerBasedShape, not Shape — Material's Shapes() will not take a plain Shape.
val Pill = RoundedCornerShape(50)
val Card = RoundedCornerShape(16.dp)

// Variable TTFs from google/fonts (OFL), same families the site embeds. The
// serif is weight 400 ONLY — that is the whole point of the language.
val Serif = FontFamily(
    Font(R.font.newsreader, FontWeight.Normal,
        variationSettings = FontVariation.Settings(FontVariation.weight(400), FontVariation.Setting("opsz", 20f))),
)
val Sans = FontFamily(
    Font(R.font.inter, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
    Font(R.font.inter, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
    Font(R.font.inter, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
)

/* No colour in here. These carried `color = Ink` — the fixed #080331 of the
   pre-redesign palette — so on the Kenya ground (#0c0f0d) every serif heading
   was navy on near-black. A TextStyle in a themed app states the type and
   lets the call site state the ink. */
val H1 = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Normal, fontSize = 34.sp,
    lineHeight = 37.sp, letterSpacing = (-0.02).em)
val H2 = TextStyle(fontFamily = Serif, fontWeight = FontWeight.Normal, fontSize = 27.sp,
    lineHeight = 30.sp, letterSpacing = (-0.015).em)

private fun sans(size: Int, weight: FontWeight = FontWeight.Normal, line: Int = (size * 1.5).toInt()) =
    TextStyle(fontFamily = Sans, fontWeight = weight, fontSize = size.sp, lineHeight = line.sp)

/** Every Material slot in Inter so buttons, chips, menus and dialogs inherit it. */
private val Type = Typography(
    displayLarge = H1, displayMedium = H1, displaySmall = H2,
    headlineLarge = H2, headlineMedium = H2, headlineSmall = H2,
    titleLarge = sans(18, FontWeight.Medium), titleMedium = sans(16, FontWeight.Medium), titleSmall = sans(14, FontWeight.Medium),
    bodyLarge = sans(15), bodyMedium = sans(14), bodySmall = sans(12),
    labelLarge = sans(14, FontWeight.Medium), labelMedium = sans(12, FontWeight.Medium), labelSmall = sans(11, FontWeight.Medium),
)

@Composable
fun JobScoutTheme(content: @Composable () -> Unit) = MaterialTheme(
    colorScheme = lightColorScheme(
        primary = Indigo, onPrimary = Color.White,
        background = CanvasBg, onBackground = Ink,
        surface = CardBg, onSurface = Ink, surfaceVariant = Info, onSurfaceVariant = Muted,
        outline = Hair2,
    ),
    typography = Type,
    // extraLarge drives AlertDialog, small drives chips, medium drives menus.
    shapes = Shapes(extraSmall = RoundedCornerShape(12.dp), small = Pill, medium = Card, large = Card, extraLarge = Card),
    content = content,
)

/** August's warm-brown shadow instead of Material's grey. */
fun Modifier.warmShadow(elevation: Dp, shape: Shape): Modifier =
    shadow(elevation, shape, clip = false, ambientColor = WarmBrown.copy(alpha = .4f), spotColor = WarmBrown.copy(alpha = .4f))

/**
 * The ground: the site's soft halo circles, then its dot texture, both in one
 * pass behind the content.
 *
 * The circles sit off the edges deliberately — a halo is the part of a circle
 * you can see, and a whole one floating mid-screen is a bubble. They are
 * drawn at a few percent alpha, which is enough to stop a flat fill reading
 * as a blank page and not enough to compete with a card.
 *
 * `tint` because this cannot read the theme: it is a plain Modifier, and the
 * old `dots()` hard-coded Ink — which on the Kenya ground is near-black on
 * near-black, so that texture has never once been visible there.
 */
/**
 * THE GROUND, the same one the web paints on <html>: three blooms that ADD
 * light, the dot texture, and the page mark - the eight-dot rose at 180% of
 * the width at a whisper of the accent - wandering on a 48s figure. It draws
 * behind the root box the list scrolls inside, so it is pinned to the screen
 * by construction and everything scrolls over it.
 *
 * This replaced backdrop(), which drew four ink circles at 3-4% OVER the
 * canvas: the retired --blob idea section 14 killed on the web, because a
 * glow that darkens is a shadow. The dot texture is kept as it was.
 *
 * The wander is an infinite transition, which Compose scales by the system
 * animator duration scale - a reader who has animations off gets it still.
 */
@Composable
fun Modifier.ground(step: Dp = 24.dp, alpha: Float = .07f): Modifier {
    val t = T
    /* IN STEPS, NOT PER FRAME. An infinite transition redraws the ground on
       every frame, and a window that never goes idle breaks anything that
       waits for idleness - uiautomator returned "null root node" on one dump
       in three, and TalkBack's traversal waits on the same signal. So the
       mark eases to the next point on its figure every twelve seconds over 1.2s
       and rests between: visibly moving, idle most of the time. Compose
       scales the tween by the animator duration scale, so a reader who has
       animations off gets it still. */
    val drift = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        var k = 0
        while (true) {
            k += 1
            drift.animateTo(k / 8f, tween(1_200, easing = FastOutSlowInEasing))
            delay(12_000)   // idle ~90% of the time; the bridge still failed at 6s/1.6s
        }
    }
    val phase = drift.value
    return drawBehind {
        val w = size.width
        val h = size.height

        // the blooms: base.css's three radial-gradients, positioned the same way
        for ((cx, cy, rx, col) in listOf(
            listOf(0.88f, 0.02f, 0.62f, t.halo1),
            listOf(0.02f, 0.30f, 0.54f, t.halo2),
            listOf(0.74f, 0.92f, 0.70f, t.halo3),
        )) {
            val c = Offset((cx as Float) * w, (cy as Float) * h)
            val r = (rx as Float) * w
            drawCircle(Brush.radialGradient(listOf(col as Color, Color.Transparent), c, r), r, c)
        }

        // the mark: eight dots, radii 2.275 -> 4.336 on a width/24 grid, as Mark()
        // draws them, at page scale. A slow figure of a few percent each way,
        // with the breath and the lean the web's keyframes carry.
        val ph = phase * 2f * Math.PI.toFloat()
        val dx = 0.03f * w * kotlin.math.sin(ph)
        val dy = 0.03f * w * kotlin.math.sin(ph * 2f + 1f) * 0.6f
        val scale = 1f + 0.045f * (0.5f - 0.5f * kotlin.math.cos(ph))
        val lean = Math.toRadians((2.0 - 2.0 * kotlin.math.cos(ph.toDouble())))
        val markW = 1.8f * w * scale
        val u = markW / 24f
        val centre = Offset(w / 2f + dx, h / 2f + dy)
        val dot = t.accent.copy(alpha = .06f)
        for (i in 0 until 8) {
            val th = Math.toRadians((-90 + 45 * i).toDouble()) + lean
            val r = (2.275f + (4.336f - 2.275f) * i / 7f) * u
            drawCircle(dot, r, Offset(centre.x + (11f * u * Math.cos(th)).toFloat(),
                                      centre.y + (11f * u * Math.sin(th)).toFloat()))
        }

        // the dot texture, unchanged
        val s = step.toPx()
        val rr = 0.75.dp.toPx()
        val c = t.ink.copy(alpha = alpha)
        var y = s / 2
        while (y < size.height) {
            var x = s / 2
            while (x < size.width) { drawCircle(c, rr, Offset(x, y)); x += s }
            y += s
        }
    }
}
