package trade.tbot.jobscout

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * The bearing rose — the brand mark carrying the score, same as the web demo.
 *
 * Geometry is the web's verbatim so the two surfaces draw the identical glyph:
 * a 104-unit box, centre (52,52), eight dots on a ring of r=38 at 45° steps
 * starting at bearing 000 (straight up). Fit lights them clockwise; lit dots
 * are r=13 and bloom in, unlit stay r=5.5.
 *
 * Nothing rotates, which is the point — the old dial rotated a needle, and a
 * rotation is the one thing that can land off-canvas when its pivot is wrong.
 */
private const val BOX = 104f
private const val RING = 38f
private const val LIT_R = 13f
private const val UNLIT_R = 5.5f
private val PaleDot = Color(0xFFDDD4C3)

/** Dot centre i (0 = bearing 000, clockwise) in 104-unit space, scaled by [u] about [c]. */
private fun dotCentre(i: Int, c: Offset, u: Float): Offset {
    val th = Math.toRadians((-90 + 45 * i).toDouble())
    return Offset(c.x + RING * u * cos(th).toFloat(), c.y + RING * u * sin(th).toFloat())
}

@Composable
fun BearingRose(fit: Int, modifier: Modifier = Modifier, diameter: Dp = 84.dp) {
    val f = fit.coerceIn(0, 100)
    val col = bandFor(f).second
    val lit = maxOf(1, (f / 100f * 8f).roundToInt())

    // One animation, staggered per dot: dot i is fully open once progress passes
    // (i+1)/lit, so the rose fills clockwise in the order the score fills it.
    var started by remember(f) { mutableStateOf(false) }
    LaunchedEffect(f) { started = true }
    val progress by animateFloatAsState(
        targetValue = if (started) 1f else 0f,
        animationSpec = tween(620), label = "bloom",
    )

    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(diameter)) {
            val u = size.width / BOX
            val c = center
            for (i in 0 until 8) {
                val on = i < lit
                val p = if (on) ((progress * lit) - i).coerceIn(0f, 1f) else 1f
                val r = if (on) LIT_R * u * (0.34f + 0.66f * p) else UNLIT_R * u
                drawCircle(if (on) col else PaleDot, radius = r, center = dotCentre(i, c, u))
            }
        }
        // The web's .fitnum: serif at weight 400, 24 units of the 104 box.
        Text(
            "$f", color = col, fontFamily = Serif, fontWeight = FontWeight.Normal,
            fontSize = (diameter.value * 24f / BOX).sp,
        )
    }
}

/**
 * The same eight bearings at one size, dormant until chosen — the candidate
 * cards carry the mark so picking one rhymes with getting a result.
 */
@Composable
fun MiniRose(selected: Boolean, tint: Color, modifier: Modifier = Modifier, diameter: Dp = 30.dp) {
    val open by animateFloatAsState(
        targetValue = if (selected) 1f else 0f,
        animationSpec = tween(420), label = "mini",
    )
    Canvas(modifier.size(diameter)) {
        val u = size.width / BOX
        val c = center
        for (i in 0 until 8) {
            val p = ((open * 8f) - i).coerceIn(0f, 1f)
            drawCircle(
                color = if (selected) tint else PaleDot,
                radius = 11f * u * (0.42f + 0.58f * p),
                center = dotCentre(i, c, u),
            )
        }
    }
}

/*
 * The four fit bands. Every caller uses bandFor() for TEXT, so it returns the
 * contrast-checked label colour, not the decorative fill. Measured on the cream
 * canvas #F8F3EB: meadow 8.97, midnight 14.33, ember-deep 4.64, stone 11.44. The
 * fills (forest 3.93, ember 2.54) fail as text and are used only for dots and
 * pill grounds. (Lived in Dial.kt until the needle dial was retired.)
 */
fun bandFor(fit: Int): Pair<String, Color> = when {
    fit >= 80 -> "auto" to Color(0xFF114E0B)      // meadow
    fit >= 70 -> "ping" to Color(0xFF1B1463)      // midnight violet
    fit >= 55 -> "unsure" to Color(0xFFCC3600)    // ember deep
    else -> "near-miss" to Color(0xFF333333)      // stone
}

/** The decorative fill for each band - dots and pill grounds only, never text. */
fun bandFill(fit: Int): Color = when {
    fit >= 80 -> Color(0xFF328A3B)
    fit >= 70 -> Color(0xFF4865FF)
    fit >= 55 -> Color(0xFFFF6D39)
    else -> Color(0xFFDCE4FB)
}

