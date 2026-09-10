package trade.tbot.jobscout

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text

/**
 * Brand-kit bearing dial, drawn natively. 270° sweep starting bottom-left;
 * band segments are fixed (the routing thresholds), only the needle turns —
 * needle angle IS the score, band color IS the routing decision.
 */
@Composable
fun BearingDial(fit: Int, modifier: Modifier = Modifier) {
    val f = fit.coerceIn(0, 100)
    val bandColor = bandFor(f).second
    val needle by animateFloatAsState(
        targetValue = -135f + 270f * f / 100f,
        animationSpec = tween(900), label = "needle"
    )

    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Canvas(Modifier.size(96.dp)) {
            val stroke = Stroke(width = size.width * 0.075f)
            val inset = stroke.width / 2
            val arc = Size(size.width - stroke.width, size.height - stroke.width)
            fun seg(fromPct: Float, toPct: Float, color: Color) = drawArc(
                color = color,
                startAngle = 135f + 270f * fromPct,
                sweepAngle = 270f * (toPct - fromPct),
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = arc,
                style = stroke,
            )
            seg(0.00f, 0.55f, Color(0xFFE6DED0))   // near-miss track
            seg(0.55f, 0.70f, Color(0xFFFF6D39))   // unsure
            seg(0.70f, 0.80f, Color(0xFF4865FF))   // ping
            seg(0.80f, 1.00f, Color(0xFF328A3B))   // auto

            // Two-tone indigo kite needle (brand kit v2.0), rotated about center.
            val c = center
            val u = size.width / 200f  // brand-kit dial is authored on a 200-unit grid
            rotate(needle, pivot = c) {
                fun kite(vararg pts: Pair<Float, Float>, color: Color) {
                    val p = Path()
                    pts.forEachIndexed { i, (x, y) ->
                        val px = c.x + (x - 100f) * u
                        val py = c.y + (y - 100f) * u
                        if (i == 0) p.moveTo(px, py) else p.lineTo(px, py)
                    }
                    p.close(); drawPath(p, color)
                }
                kite(100f to 40f, 109f to 102f, 100f to 112f, color = Color(0xFF1B1463))
                kite(100f to 40f, 91f to 102f, 100f to 112f, color = Color(0xFF4865FF))
                kite(100f to 150f, 106f to 98f, 100f to 90f, color = Color(0xFFA2BAFF))
                kite(100f to 150f, 94f to 98f, 100f to 90f, color = Color(0xFFDCE4FB))
            }
            drawCircle(Color(0xFF080331), radius = 6.5f * u, center = c)
            drawCircle(Color.White, radius = 6.5f * u, center = c, style = Stroke(2f * u))
        }
        Text("$f", color = bandColor, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * Score → (route label, TEXT colour). Same thresholds as the production pipeline.
 *
 * Every caller uses this for text - the fit number and the route pill - so it returns
 * the contrast-checked label colour, not the decorative arc fill. Measured on the cream
 * canvas #F8F3EB: meadow 8.97, midnight 14.33, ember-deep 4.64, stone 11.44. The fills
 * themselves (forest 3.93, ember 2.54) fail as text and are used only for the arcs.
 */
fun bandFor(fit: Int): Pair<String, Color> = when {
    fit >= 80 -> "auto" to Color(0xFF114E0B)      // meadow
    fit >= 70 -> "ping" to Color(0xFF1B1463)      // midnight violet
    fit >= 55 -> "unsure" to Color(0xFFCC3600)    // ember deep
    else -> "near-miss" to Color(0xFF333333)      // stone
}

/** The decorative fill for each band - arcs and pill grounds only, never text. */
fun bandFill(fit: Int): Color = when {
    fit >= 80 -> Color(0xFF328A3B)
    fit >= 70 -> Color(0xFF4865FF)
    fit >= 55 -> Color(0xFFFF6D39)
    else -> Color(0xFFDCE4FB)
}
