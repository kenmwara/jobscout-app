package trade.tbot.jobscout

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The v3 token sets, one per market, lifted from site/base.css.
 *
 * Two AUTHORED sets, not one inverted into the other — Kenya's dark ground needs its
 * own band colours because the light ones go muddy on near-black. Values are copied
 * from the mockup's resolved custom properties (extracted 2026-09-19, CA `0d98ef3d`
 * / KE `dd63597f`), so a drift here is a drift from the contract.
 *
 * The app was light-only until now: Theme.kt declared its colours as top-level vals,
 * which cannot change with the market. These live in a CompositionLocal instead, so
 * switching market repaints everything that reads them.
 */
@Immutable
data class Tokens(
    val canvas: Color,
    val canvas2: Color,
    val surface: Color,
    val ink: Color,
    val text: Color,
    val text2: Color,
    val text3: Color,
    val hair: Color,
    val hair2: Color,
    val accent: Color,
    val accentInk: Color,
    val live: Color,          // the one chromatic dot
    val btn: Color,
    val btnInk: Color,
    val chip: Color,
    val chipInk: Color,
    val scrim: Color,
    val heroFrom: Color,      // --hero-img is a 140° three-stop gradient
    val heroMid: Color,
    val heroTo: Color,
    // fit bands
    val bAuto: Color, val bAutoBg: Color,
    val bPing: Color, val bPingBg: Color,
    val bUnsure: Color, val bUnsureBg: Color,
    val bNear: Color, val bNearBg: Color,
) {
    /** 140deg in CSS runs top-left to bottom-right, which is what Brush.linearGradient does by default. */
    val hero: Brush get() = Brush.linearGradient(listOf(heroFrom, heroMid, heroTo))

    /** Text and ground for a fit band, the same four the web paints. */
    fun band(fit: Int): Pair<Color, Color> = when {
        fit >= 85 -> bAuto to bAutoBg
        fit >= 70 -> bPing to bPingBg
        fit >= FIT_FLOOR -> bUnsure to bUnsureBg
        else -> bNear to bNearBg
    }

    /** The word the band carries. Matches BAND() in the mockup. */
    fun bandWord(fit: Int): String = when {
        fit >= 85 -> "auto"
        fit >= 70 -> "ping"
        fit >= FIT_FLOOR -> "unsure"
        else -> "near-miss"
    }
}

/** html, html[data-market="ca"] — the cream-and-indigo set. */
val CA_TOKENS = Tokens(
    canvas = Color(0xFFF4F1EA),
    canvas2 = Color(0xFFFAF8F4),
    surface = Color(0xFFFFFFFF),
    ink = Color(0xFF080331),
    text = Color(0xFF1A1636),
    text2 = Color(0xFF565173),
    text3 = Color(0xFF83809A),
    hair = Color(0x1A080331),
    hair2 = Color(0x29080331),
    accent = Color(0xFF4865FF),
    accentInk = Color(0xFFFFFFFF),
    live = Color(0xFFFF6D39),
    btn = Color(0xFF080331),
    btnInk = Color(0xFFFFFFFF),
    chip = Color(0xFFFFFFFF),
    chipInk = Color(0xFF080331),
    scrim = Color(0x8C080331),
    heroFrom = Color(0xFF2B2350), heroMid = Color(0xFF4865FF), heroTo = Color(0xFFF098D7),
    bAuto = Color(0xFF114E0B), bAutoBg = Color(0xFFE3F0E4),
    bPing = Color(0xFF1B1463), bPingBg = Color(0xFFDCE4FB),
    bUnsure = Color(0xFFCC3600), bUnsureBg = Color(0xFFFFE6DA),
    bNear = Color(0xFF333333), bNearBg = Color(0xFFE9E8EE),
)

/** html[data-market="ke"] — authored dark, not an inversion. */
val KE_TOKENS = Tokens(
    canvas = Color(0xFF0C0F0D),
    canvas2 = Color(0xFF131815),
    surface = Color(0xFF181E1A),
    ink = Color(0xFFF2F5F1),
    text = Color(0xFFE6EBE4),
    text2 = Color(0xFFA8B3A6),
    text3 = Color(0xFF7D8A7C),
    hair = Color(0x1FF2F5F1),
    hair2 = Color(0x38F2F5F1),
    accent = Color(0xFF2FBD6A),
    accentInk = Color(0xFF06120A),
    live = Color(0xFFEF4B3C),
    btn = Color(0xFF2FBD6A),
    btnInk = Color(0xFF06120A),
    chip = Color(0xFF1E2621),
    chipInk = Color(0xFFE6EBE4),
    scrim = Color(0x9E040805),
    heroFrom = Color(0xFF06120A), heroMid = Color(0xFF0B3D22), heroTo = Color(0xFF2FBD6A),
    bAuto = Color(0xFF5FD98C), bAutoBg = Color(0x245FD98C),
    bPing = Color(0xFF8FB3FF), bPingBg = Color(0x248FB3FF),
    bUnsure = Color(0xFFFF9466), bUnsureBg = Color(0x24FF9466),
    bNear = Color(0xFFA8B3A6), bNearBg = Color(0x24A8B3A6),
)

fun tokensFor(market: String): Tokens = if (market == "ke") KE_TOKENS else CA_TOKENS

val LocalTokens = compositionLocalOf { CA_TOKENS }

/** `T.canvas` at any call site, without threading the set through every signature. */
val T: Tokens
    @Composable @ReadOnlyComposable get() = LocalTokens.current
