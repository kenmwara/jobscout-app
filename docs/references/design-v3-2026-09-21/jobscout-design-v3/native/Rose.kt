// JobScout — the rose, Compose. Law 9 geometry, generated from the same
// constants as the web (Tokens.kt / tokens.json). Build-unproven: written
// from the generator, never compiled in the authoring environment.
package page.jobscout.design

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * THE LAW: the number of lit dots IS the band, not the score.
 * AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3. A 79 and a 65 are both PING and
 * both light six.
 *
 * An unlit dot may NEVER take a band colour: NEAR-MISS's band IS the neutral,
 * so a band-coloured track leaves lit and unlit identical but for alpha.
 */
@Composable
fun Rose(
    band: String?,                 // null = swept: eight empty bearings
    size: Dp,
    bandColor: Color,
    emptyColor: Color,             // --rose-empty, i.e. --text
    animate: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val lit = band?.let { Bands.litByBand[it] } ?: 0
    // Compose has no :active and cannot consume linear(); the spring comes
    // from Motion, which is generated as stiffness = omega^2.
    val progress = remember(band) { Animatable(if (animate) 0f else lit.toFloat()) }
    LaunchedEffect(band) {
        if (animate) progress.animateTo(lit.toFloat(), Motion.arrive)
        else progress.snapTo(lit.toFloat())
    }

    Canvas(modifier.then(Modifier)) {
        // The display cut: the true bbox plus 1.2 clear space, squared.
        // 0 0 24 24 clips every outer dot AT EVERY SIZE.
        val cut = 31.3054f
        val originX = -4.2416f
        val originY = -3.0639f
        val k = this.size.minDimension / cut

        for (i in 0 until Rose.COUNT) {
            val a = i * PI.toFloat() / 4f - PI.toFloat() / 2f
            val cx = (Rose.BOX + Rose.RING * cos(a) - originX) * k
            val cy = (Rose.BOX + Rose.RING * sin(a) - originY) * k
            val r  = (Rose.R0 + Rose.DR * i) * k

            val isLit = i < progress.value
            val scale = if (isLit) 1f else Rose.EMPTY_SCALE
            drawCircle(
                color = if (isLit) bandColor else emptyColor,
                radius = r * scale,
                center = Offset(cx, cy),
                alpha = if (isLit) 1f else Rose.EMPTY_ALPHA,
            )
        }
    }
}
