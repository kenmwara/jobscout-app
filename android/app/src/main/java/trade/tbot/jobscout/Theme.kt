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
import androidx.compose.ui.draw.drawBehind
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
val Meadow = Color(0xFF114E0B)
val Forest = Color(0xFF328A3B)
val EmberDeep = Color(0xFFCC3600)
val Stone = Color(0xFF333333)
val Hairline = Color(0x1A080331)     // rgba(8,3,49,.10)
val Hair2 = Color(0x2E080331)        // rgba(8,3,49,.18)
private val WarmBrown = Color(0xFF4B4439)

/** One hue per candidate (border + rose) and its card ground, same as the web. */
val PERSONA_HUES = listOf(
    Forest to Color(0xFFF2F7F1),
    EmberDeep to Color(0xFFFDF3EE),
    Indigo to Color(0xFFF1F3FD),
)

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
fun Modifier.backdrop(tint: Color, step: Dp = 24.dp, alpha: Float = .07f): Modifier = drawBehind {
    val w = size.width
    val h = size.height
    // fractions of the width, so it scales with the phone rather than the dp grid
    for ((cx, cy, cr, a) in listOf(
        listOf(-0.18f, 0.10f, 0.62f, 0.040f),
        listOf(1.16f, 0.30f, 0.70f, 0.034f),
        listOf(0.30f, 0.86f, 0.80f, 0.026f),
        listOf(1.02f, 0.98f, 0.46f, 0.030f),
    )) drawCircle(tint.copy(alpha = a), cr * w, Offset(cx * w, cy * h))

    val s = step.toPx()
    val r = 0.75.dp.toPx()
    val c = tint.copy(alpha = alpha)
    var y = s / 2
    while (y < size.height) {
        var x = s / 2
        while (x < size.width) { drawCircle(c, r, Offset(x, y)); x += s }
        y += s
    }
}
