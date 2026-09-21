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
    /* SECTION 16, OPTION C. An evidence card is a neutral at the surface's
       own hue and wears its band as a 2px rule; a tinted FILL is for pill
       scale. The card measured 16,448px2 on the phone mockup, four times
       the 4,000px2 the rule names, and at that size the tint stopped being
       a hint. The body gets its own colour because it was painted with the
       label's, which made the paragraph the label at a smaller size. */
    val evidenceBg: Color,
    val evidenceRuleStrongest: Color,
    val evidenceRuleAnswer: Color,
    val strongestBody: Color,
    val answerBody: Color,
    /* THE HALO - base.css --halo-1/2/3, with the alpha in the colour. Light
       carries HUE (amber, peach, gold at low alpha: white on cream caps at
       1.105:1 and is invisible), dark carries brightness in the canvas's own
       hue family (250deg; the spec's 227deg read as navy). Section 14. */
    val halo1: Color,
    val halo2: Color,
    val halo3: Color,
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
    live = Color(0xFFB86B03),       // the unsure SOLID. Never text.
    // THE ACTION IS DEEP-INK: 17.44:1 with its cream label, against 4.58:1
    // for indigo-with-white. Indigo is brand, links and selection only.
    btn = Color(0xFF080331),
    btnInk = Color(0xFFF8F3EB),
    chip = Color(0xFFFFFFFF),
    chipInk = Color(0xFF080331),
    scrim = Color(0x8C080331),
    heroFrom = Color(0xFF241A7A), heroMid = Color(0xFF150E52), heroTo = Color(0xFF080331),
    /* ONE RAMP: fixed OKLCH lightness and chroma per rung, hue the only
       variable. See site/base.css for the table and docs/THEME.md section 11.
       Ember is hue 63 now, not 39. Every pair lands 7.04-7.58:1. */
    bAuto = Color(0xFF225B2C), bAutoBg = Color(0xFFE7F4E8),    // 147deg 7.11:1
    bPing = Color(0xFF394981), bPingBg = Color(0xFFEAF0FF),    // 270deg 7.53:1
    bUnsure = Color(0xFF713F00), bUnsureBg = Color(0xFFFBEDE2), //  63deg 7.58:1
    bNear = Color(0xFF4B4B5C), bNearBg = Color(0xFFEFF0F4),    // 285deg 7.50:1
    // section 16 option C - the card is a neutral, the band is a rule
    evidenceBg = Color(0xFFF1F1FA),
    evidenceRuleStrongest = Color(0xFF3E954D),
    evidenceRuleAnswer = Color(0xFFB86B03),
    strongestBody = Color(0xFF495349),   // 7.15:1 on the neutral
    answerBody = Color(0xFF584E45),      // 7.22:1 on the neutral
    halo1 = Color(0x42FFD696),           // rgba(255,214,150,.26)
    halo2 = Color(0x38FFCEB2),           // rgba(255,206,178,.22)
    halo3 = Color(0x3DFFE4B0),           // rgba(255,228,176,.24)
)

/** :root[data-theme="dark"] — derived from deep-ink #080331, not a neutral
 *  black, so it is still this brand in the dark. Both markets. */
val DARK_TOKENS = Tokens(
    canvas = Color(0xFF0A0524),
    canvas2 = Color(0xFF100B2F),
    surface = Color(0xFF1C1544),   // lifted from 16103A: 1.17:1 on canvas,
                                   // the same step light uses. Luminance
                                   // alone never separates on dark.
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
    live = Color(0xFFE89F59),   // the unsure solid
    btn = Color(0xFFF8F3EB),   // the action inverts: cream fill, 17.93:1
    btnInk = Color(0xFF0A0524),
    chip = Color(0xFF16103A),
    chipInk = Color(0xFFF8F3EB),
    scrim = Color(0xA8040210),
    heroFrom = Color(0xFF241A7A), heroMid = Color(0xFF150E52), heroTo = Color(0xFF080331),
    /* The same ramp at the dark rungs - same four hues, same chroma, same
       lightness, so light and dark are one system seen from two sides. The
       old dark fills were composited from the light ones over the purple
       surface, which dragged every hue back to 250: auto measured 222 (blue,
       not green) and unsure 283 (purple, where ember should be). */
    bAuto = Color(0xFF92D098), bAutoBg = Color(0xFF223424),    // 147deg 7.38:1
    bPing = Color(0xFFA4BBFF), bPingBg = Color(0xFF272E42),    // 270deg 7.15:1
    bUnsure = Color(0xFFECB078), bUnsureBg = Color(0xFF3D2B1A), //  63deg 7.04:1
    bNear = Color(0xFFBBBCD0), bNearBg = Color(0xFF2E2E34),    // 285deg 7.21:1
    evidenceBg = Color(0xFF2B284F),
    evidenceRuleStrongest = Color(0xFF7AC683),
    evidenceRuleAnswer = Color(0xFFE89F59),
    strongestBody = Color(0xFFCCD6CD),   // 9.26:1 on the neutral
    answerBody = Color(0xFFDBD1C8),      // 9.19:1 on the neutral
    halo1 = Color(0xB83B2D80),           // rgba(59,45,128,.72)  hue 250
    halo2 = Color(0x993A2A60),           // rgba(58,42,96,.60)   hue 258
    halo3 = Color(0x8C382B7A),           // rgba(56,43,122,.55)  hue 250
)

/* MARKET — two places, never a third. The hero is the first; the active flag
   chip (drawn in MainActivity from `accent` at low alpha) is the second. Same
   construction, one hue swapped, and the hero is dark in BOTH themes. */
private val CA_HERO = Triple(Color(0xFF241A7A), Color(0xFF150E52), Color(0xFF080331))
private val KE_HERO = Triple(Color(0xFF11401A), Color(0xFF0C2A12), Color(0xFF080331))

/**
 * Three states, the same three the web has:
 *
 *   null / absent -> LIGHT   <- the default, on every market and every device
 *   "system"      -> follow the OS
 *   "dark"        -> force dark
 *
 * Light is the default deliberately (operator, 2026-09-20): cream and
 * Newsreader are the brand, and a first launch should land on them whatever
 * the phone is set to. Following the phone is reachable, it is just asked for.
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
        // "light" is the default, so it is stored as an ABSENCE, exactly as
        // the web stores it by removing the attribute.
        if (choice == "dark" || choice == "system") putString(KEY, choice) else remove(KEY)
    }.apply()

    /** Light unless the reader asked for dark, or asked to follow the phone. */
    fun isDark(ctx: Context, systemIsDark: Boolean): Boolean =
        isDark(stored(ctx), systemIsDark)

    /* The same rule against a choice the UI is already holding. Compose does
       not observe SharedPreferences, so the screen watches a state value and
       the preference stays the durable copy; both have to resolve
       identically or the theme would differ between a tap and a restart. */
    fun isDark(choice: String?, systemIsDark: Boolean): Boolean = when (choice) {
        "dark" -> true
        "system" -> systemIsDark
        else -> false          // absent or "light": the default
    }

    /** light -> match the device -> dark -> light. */
    fun next(choice: String?): String? = when (choice) {
        null -> "system"
        "system" -> "dark"
        else -> null
    }

    /** What the button says it is showing now. */
    fun label(choice: String?): String = when (choice) {
        null -> "Light"
        "system" -> "Device"
        else -> "Dark"
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
