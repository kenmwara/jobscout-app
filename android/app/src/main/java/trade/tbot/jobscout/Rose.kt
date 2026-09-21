package trade.tbot.jobscout

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
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
/* MOTION v2 stage 1: law 9's geometry, the same glyph site/rose.js draws.
   A 24 box, ring r=11, eight bearings from 000, radii 2.275 + 0.2944*i
   clockwise (the two largest touch at 270/315 on purpose), inside the
   DISPLAY CUT: the true bbox plus 1.2 clear space, squared - 31.3054 units
   with the box's origin at (4.2416, 3.0639). */
private const val VB = 31.3054f
private const val OX = 4.2416f
private const val OY = 3.0639f
private const val RING = 11f

/** Dot centre i (0 = bearing 000, clockwise) for a rose of side [side] px. */
private fun dotCentre(i: Int, side: Float): Offset {
    val u = side / VB
    val th = Math.toRadians((-90 + 45 * i).toDouble())
    return Offset((12f + OX + RING * cos(th).toFloat()) * u, (12f + OY + RING * sin(th).toFloat()) * u)
}
private fun dotRadius(i: Int, side: Float): Float = (2.275f + 0.2944f * i) * side / VB

/** The lit count IS the band: AUTO 8, PING 6, UNSURE 5, NEAR-MISS 3 (rose.js's table). */
/* GENERATED thresholds and lit table (design/Tokens.kt): the scorer emits
   `fit` only, every client derives the band, and this is the one table. */
fun litFor(fit: Int): Int = trade.tbot.jobscout.design.Bands.litByBand[trade.tbot.jobscout.design.Band.of(fit)] ?: 3

@Composable
fun BearingRose(fit: Int, modifier: Modifier = Modifier, diameter: Dp = 84.dp) {
    val f = fit.coerceIn(0, 100)
    /* Theme-aware, like everything else on the card. It used to read the
       hard-coded light palette, which painted midnight violet on the Kenya
       card's near-black ground: a rose you could not see with a number you
       could not read inside it. */
    val col = T.band(f).first
    val lit = litFor(f)

    /* MOTION v1: each lit dot arrives on Motion.arrive (the web's
       --spring-arrive: 520ms, 8.3% overshoot), one Motion.STAGGER_DOT apart
       from bearing 000, so the fill IS the score forming. The numeral counts up
       on the same clock - cubic-out over (lit-1)*46 + 520ms - and seats on the
       frame the last dot lands. Nothing here runs after it settles: an infinite
       breathe would keep the window from idling, which is what law 8's stepped
       wander exists to avoid (uiautomator, TalkBack). */
    val dots = remember(f) { List(8) { Animatable(0f) } }
    val count = remember(f) { Animatable(0f) }
    LaunchedEffect(f) {
        for (i in 0 until lit) launch {
            delay(i * Motion.STAGGER_DOT)
            dots[i].animateTo(1f, Motion.arrive)
        }
        count.animateTo(1f, tween(((lit - 1) * Motion.STAGGER_DOT).toInt() + Motion.ARRIVE_MS,
                                  easing = CubicBezierEasing(0.33f, 1f, 0.68f, 1f)))
    }

    // The unlit bearings: the ink at 14%, scaled .55 - never a band colour
    // (NEAR-MISS's band is the neutral, which left lit and unlit identical).
    val unlit = T.text.copy(alpha = .14f)
    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(diameter)) {
            val side = size.width
            for (i in 0 until 8) {
                val on = i < lit
                val p = if (on) dots[i].value else 0f
                val r = dotRadius(i, side) * (0.55f + 0.45f * p)
                drawCircle(if (on) col.copy(alpha = .14f + .86f * p) else unlit, radius = r, center = dotCentre(i, side))
            }
        }
        // The numeral is data: mono, tabular, 8.6 of the 31.3-unit cut (rose.js).
        Text(
            "${(f * count.value).roundToInt()}", color = col, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium,
            fontSize = (diameter.value * 8.6f / VB).sp,
        )
    }
}


/** Eight empty bearings: "there is a score to be had here", on every row of
 *  the sweep, without a word. */
@Composable
fun EmptyRose(modifier: Modifier = Modifier, diameter: Dp = 38.dp) {
    val unlit = T.text.copy(alpha = .14f)
    Box(modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(diameter)) {
            val side = size.width
            for (i in 0 until 8) drawCircle(unlit, radius = dotRadius(i, side) * 0.55f, center = dotCentre(i, side))
        }
        Text("\u2013", color = T.text3, fontFamily = FontFamily.Monospace, fontSize = (diameter.value * 8.6f / VB).sp)
    }
}

/*
 * The four fit bands. Every caller uses bandFor() for TEXT, so it returns the
 * contrast-checked label colour, not the decorative fill. Measured on the cream
 * canvas #F8F3EB: meadow 8.97, midnight 14.33, ember-deep 4.64, stone 11.44. The
 * fills (forest 3.93, ember 2.54) fail as text and are used only for dots and
 * pill grounds. (Lived in Dial.kt until the needle dial was retired.)
 */
/* THE HEXES ARE GONE, not updated. These held #114e0b / #1b1463 / #cc3600
   / #333333 - the pre-ember palette - so the dial beside a score disagreed
   with the pill under it. They were also a duplicate of Tokens.band(fit),
   which is theme-aware and right, while these were light-only: wrong on
   hue AND wrong in dark. Pointing them at the tokens is what stops the two
   drifting again, and it puts the dial inside the comparison check_palette
   already runs against the web. */
/* The app's band key is "near-miss" (the tokens spell it "nearmiss"). */
fun bandName(fit: Int): String = trade.tbot.jobscout.design.Band.of(fit).let { if (it == "nearmiss") "near-miss" else it }

@Composable
fun bandFor(fit: Int): Pair<String, Color> = bandName(fit) to T.band(fit).first

/** The decorative fill for each band - dots and pill grounds only, never text. */
@Composable
fun bandFill(fit: Int): Color = T.band(fit).second

