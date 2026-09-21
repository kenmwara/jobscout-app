// JobScout — the card, Compose. Same anatomy as .jcard: the score leads, the
// three tiers are geometry, the heart lives in the action row.
// Build-unproven.
package page.jobscout.design

import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.ui.unit.dp

/** tier 1 verdict: TALLER and WIDER than tier 2, and a pill. Fill cannot
 *  carry this hierarchy — on light the fact's fill is heavier than the
 *  verdict's — so geometry does. */
@Composable fun Tier1(label: String, fill: Color, ink: Color) =
    Box(Modifier.height(22.dp).background(fill, RoundedCornerShape(999.dp))
        .padding(horizontal = Space.s3), contentAlignment = Alignment.Center) {
        Text(label, color = ink, fontSize = Type.t0, letterSpacing = Type.t0 * 0.14f)
    }

/** tier 2 fact: shorter, tighter, a 4dp corner — a different SHAPE. */
@Composable fun Tier2(label: String, sunken: Color, ink2: Color) =
    Box(Modifier.height(19.dp).background(sunken, RoundedCornerShape(Radius.chip))
        .padding(horizontal = Space.s2), contentAlignment = Alignment.Center) {
        Text(label, color = ink2, fontSize = Type.t1)
    }

/** tier 3 context: NO container at all. */
@Composable fun Tier3(label: String, ink2: Color) =
    Text(label, color = ink2, fontSize = Type.t1)

/**
 * The material ladder. Compose has no :active, so the press comes from the
 * interaction source and animates on EXIT timing — faster than the entry,
 * and it never overshoots.
 */
@Composable
fun JobCard(
    band: String?, score: Int?, org: String, location: String,
    title: String, strongest: String?, posted: String?,
    bandColor: Color, bandFill: Color, bandInk: Color,
    surface: Color, sunken: Color, ink: Color, ink2: Color, empty: Color,
    onOpen: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.988f else 1f, Motion.exit, label = "press")

    Column(
        Modifier.fillMaxWidth().scale(scale)
            .background(surface, RoundedCornerShape(Radius.card))
            .clickable(interaction, null, onClick = onOpen)
            .padding(horizontal = Space.s4, vertical = Space.s3)
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Box(contentAlignment = Alignment.Center) {
                Rose(band, 52.dp, bandColor, empty)
                Text(score?.toString() ?: "–", color = ink, fontSize = Type.t3)
            }
            Spacer(Modifier.width(Space.s3))
            Column(Modifier.weight(1f)) {
                Text("$org · $location", color = ink2, fontSize = Type.t1)
                Spacer(Modifier.height(Space.s0))
                Text(title, color = ink, fontSize = Type.t4)   // Newsreader 400
            }
        }
        Spacer(Modifier.height(Space.s2))
        Row(horizontalArrangement = Arrangement.spacedBy(Space.s2),
            verticalAlignment = Alignment.CenterVertically) {
            band?.let { Tier1(Bands.litByBand.keys.let { _ -> it.uppercase() }, bandFill, bandInk) }
            Tier2(location, sunken, ink2)
            posted?.let { Tier3("Posted $it", ink2) }
        }
        // STRONGEST only. What-to-answer stays behind the tap: a card that
        // leads with a gap leads with what the reader LACKS.
        strongest?.let {
            Spacer(Modifier.height(Space.s3))
            Column(Modifier.fillMaxWidth()) { Text(it, color = ink, fontSize = Type.t1) }
        }
    }
}
