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

    /* Text and ground for a fit band, the same four the web paints — and at the
       same cut-offs. This said 85 while the web, iOS and Rose.kt all said 80,
       so an 82 wore an auto-coloured rose beside a PING pill. */
    fun band(fit: Int): Pair<Color, Color> = when {
        fit >= 80 -> bAuto to bAutoBg
        fit >= 70 -> bPing to bPingBg
        fit >= FIT_FLOOR -> bUnsure to bUnsureBg
        else -> bNear to bNearBg
    }

    /** The word the band carries. Matches BAND() in the mockup. */
    fun bandWord(fit: Int): String = when {
        fit >= 80 -> "auto"
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
    bUnsure = Color(0xFFB23200), bUnsureBg = Color(0xFFFFE6DA),
    bNear = Color(0xFF333333), bNearBg = Color(0xFFE9E8EE),
)

/** html[data-market="ke"] — authored dark, not an inversion. */
val KE_TOKENS = Tokens(
    /* Cool and near-neutral, 65-71deg off the accent. Every grey used to wear
       the accent's own hue - canvas 140deg, surface 140deg, chip 143deg, text2
       111deg, against a green accent at 142deg - so the chrome and the accent
       were the same colour and the screen was one olive wash. Mirrors
       site/base.css; both verified by tools/check_palette.py. */
    canvas = Color(0xFF0E1014),
    canvas2 = Color(0xFF15181D),
    surface = Color(0xFF1B1F25),
    ink = Color(0xFFF3F5F8),
    text = Color(0xFFE5E8ED),
    text2 = Color(0xFFA3AAB6),
    text3 = Color(0xFF8A919D),
    hair = Color(0x1FF3F5F8),
    hair2 = Color(0x38F3F5F8),
    accent = Color(0xFF35D07F),
    accentInk = Color(0xFF06120A),
    live = Color(0xFFFF6F5E),
    btn = Color(0xFF35D07F),
    btnInk = Color(0xFF06120A),
    chip = Color(0xFF242A32),
    chipInk = Color(0xFFE5E8ED),
    scrim = Color(0xA306080C),
    heroFrom = Color(0xFF0B1A14), heroMid = Color(0xFF10553A), heroTo = Color(0xFF35D07F),
    /* The four hues are the product's semantic language and Canada paints the
       same four - calmed, not moved. bNear goes WARM: the old one was the exact
       colour of body copy, so a near-miss band was indistinguishable from it. */
    bAuto = Color(0xFF52D98B), bAutoBg = Color(0x2452D98B),
    bPing = Color(0xFF8FB0F0), bPingBg = Color(0x248FB0F0),
    bUnsure = Color(0xFFF2A16A), bUnsureBg = Color(0x24F2A16A),
    bNear = Color(0xFFA89F97), bNearBg = Color(0x24A89F97),
)

fun tokensFor(market: String): Tokens = if (market == "ke") KE_TOKENS else CA_TOKENS

val LocalTokens = compositionLocalOf { CA_TOKENS }

/** `T.canvas` at any call site, without threading the set through every signature. */
val T: Tokens
    @Composable @ReadOnlyComposable get() = LocalTokens.current
