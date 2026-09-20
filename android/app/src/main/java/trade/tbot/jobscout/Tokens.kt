package trade.tbot.jobscout

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

/**
 * The v2.3 token sets: ONE palette, TWO themes, lifted from site/base.css.
 *
 * Three independent signals, three separate channels, and none of them borrows
 * another's:
 *
 *   market -> the hero gradient and the active flag chip. That is the list.
 *   theme  -> light or dark. The reader's device, never the market's.
 *   band   -> hue, exclusively.
 *
 * This replaced a set per MARKET, where Canada was light and Kenya was dark. Two
 * things were wrong with that. Kenya's accent was green, so a fit of 72 — PING,
 * which is indigo — sat beside a green `Prepare application` button, and both were
 * correct in the colour language while contradicting each other; at control scale
 * green already means auto (fit >= 80). And a reader in Nairobi who wanted light,
 * or one in Vancouver who wanted dark, could not have it.
 *
 * Kenya keeps a real identity: the same gradient construction with one hue swapped,
 * so its green appears only as a large dark ground and never on a control.
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

/** :root — cream and deep-ink. Both markets. */
val LIGHT_TOKENS = Tokens(
    canvas = Color(0xFFF8F3EB),
    canvas2 = Color(0xFFFFFDF9),
    surface = Color(0xFFFFFFFF),
    ink = Color(0xFF080331),      // 17.81:1 on canvas
    text = Color(0xFF080331),
    text2 = Color(0xFF5A5560),    //  6.55:1 — replaces #83809A, which was 3.37:1
    text3 = Color(0xFF5A5560),    // no third tone; the kit measures exactly two
    hair = Color(0x21080331),
    hair2 = Color(0x38080331),
    accent = Color(0xFF4865FF),
    accentInk = Color(0xFFFFFFFF),  // 4.58:1 on accent
    live = Color(0xFFFF6D39),       // a FILL. Never text: 2.48:1 on cream.
    // THE ACTION IS DEEP-INK: 17.44:1 with its cream label, against 4.58:1
    // for indigo-with-white. Indigo is brand, links and selection only.
    btn = Color(0xFF080331),
    btnInk = Color(0xFFF8F3EB),
    chip = Color(0xFFFFFFFF),
    chipInk = Color(0xFF080331),
    scrim = Color(0x8C080331),
    heroFrom = Color(0xFF241A7A), heroMid = Color(0xFF150E52), heroTo = Color(0xFF080331),
    bAuto = Color(0xFF114E0B), bAutoBg = Color(0xFFE8F2E6),    //  8.63:1
    bPing = Color(0xFF1B1463), bPingBg = Color(0xFFDCE4FB),    // 12.46:1
    bUnsure = Color(0xFFBF3200), bUnsureBg = Color(0xFFFDEADF), //  4.91:1
    bNear = Color(0xFF333333), bNearBg = Color(0xFFECEAF2),    // 11.40:1
)

/** :root[data-theme="dark"] — derived from deep-ink #080331, not a neutral
 *  black, so it is still this brand in the dark. Both markets. */
val DARK_TOKENS = Tokens(
    canvas = Color(0xFF0A0524),
    canvas2 = Color(0xFF100B2F),
    surface = Color(0xFF16103A),   // separates by hairline, not luminance
    ink = Color(0xFFF8F3EB),       // 17.93:1 on canvas
    text = Color(0xFFF8F3EB),
    text2 = Color(0xFFB9B3C4),     //  9.72:1 on canvas
    text3 = Color(0xFFB9B3C4),
    hair = Color(0x21F8F3EB),
    hair2 = Color(0x3DF8F3EB),
    /* Indigo is only 4.32:1 on this ground, so the action inverts: a lavender
       fill carrying deep-ink text, 10.38:1. */
    accent = Color(0xFFA2BAFF),
    accentInk = Color(0xFF0A0524),
    live = Color(0xFFFF9B6F),
    btn = Color(0xFFF8F3EB),   // the action inverts: cream fill, 17.93:1
    btnInk = Color(0xFF0A0524),
    chip = Color(0xFF16103A),
    chipInk = Color(0xFFF8F3EB),
    scrim = Color(0xA8040210),
    heroFrom = Color(0xFF241A7A), heroMid = Color(0xFF150E52), heroTo = Color(0xFF080331),
    /* Forest and indigo both fail as labels on dark, so both lift. */
    bAuto = Color(0xFF5FD07A), bAutoBg = Color(0xFF1F2940),    //  7.44:1
    bPing = Color(0xFFA2BAFF), bPingBg = Color(0xFF2C2A56),    //  7.00:1
    bUnsure = Color(0xFFFF9B6F), bUnsureBg = Color(0xFF36223E), //  6.99:1
    bNear = Color(0xFFDDD7E4), bNearBg = Color(0xFF1E1A44),    // 10.10:1
)

/* MARKET — two places, never a third. The hero is the first; the active flag
   chip (drawn in MainActivity from `accent` at low alpha) is the second. Same
   construction, one hue swapped, and the hero is dark in BOTH themes. */
private val CA_HERO = Triple(Color(0xFF241A7A), Color(0xFF150E52), Color(0xFF080331))
private val KE_HERO = Triple(Color(0xFF11401A), Color(0xFF0C2A12), Color(0xFF080331))

/**
 * Three states, the same three the web has:
 *
 *   null / absent -> follow the OS   <- the default
 *   "light"       -> force light
 *   "dark"        -> force dark
 *
 * Stored under the app's own "jobscout" preferences, beside the tracker. A
 * toggle would need all three: clearing the key is the only way to hand
 * control back to the OS, so a two-way switch cannot express it.
 */
object ThemeChoice {
    private const val KEY = "jobscout.theme"
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE)

    /** "light", "dark", or null for "follow the OS". */
    fun stored(ctx: Context): String? = prefs(ctx).getString(KEY, null)

    fun set(ctx: Context, choice: String?) = prefs(ctx).edit().apply {
        if (choice == "light" || choice == "dark") putString(KEY, choice) else remove(KEY)
    }.apply()

    /** The OS answer unless the reader has overridden it. */
    fun isDark(ctx: Context, systemIsDark: Boolean): Boolean = when (stored(ctx)) {
        "light" -> false
        "dark" -> true
        else -> systemIsDark
    }
}

/**
 * The palette comes from the THEME and the hero from the MARKET, which is the
 * whole rule in one function.
 */
fun tokensFor(market: String, dark: Boolean): Tokens {
    val base = if (dark) DARK_TOKENS else LIGHT_TOKENS
    val (from, mid, to) = if (market == "ke") KE_HERO else CA_HERO
    return base.copy(heroFrom = from, heroMid = mid, heroTo = to)
}

val LocalTokens = compositionLocalOf { LIGHT_TOKENS }

/** `T.canvas` at any call site, without threading the set through every signature. */
val T: Tokens
    @Composable @ReadOnlyComposable get() = LocalTokens.current
