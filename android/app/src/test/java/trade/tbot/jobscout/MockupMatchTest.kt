package trade.tbot.jobscout

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Grades the Compose screens against the mockup's Mobile tab.
 *
 * Why this and not a screenshot diff: the contract lives in structure and copy, and
 * the two sides are rendered by different engines — a pixel comparison between
 * Skia and a browser will never agree, and a "perfect hash" between a Compose tree
 * and a DOM tree is not a thing that exists. What IS comparable is the ordered list
 * of elements and the words in them, which is exactly what was extracted from the
 * mockup (src/test/resources/mockup-reference.json, CA 0d98ef3d / KE dd63597f).
 *
 * Why Robolectric: this runs on the JVM. The machine it was written on could run
 * neither an emulator (hypervisor driver needs admin) nor adb to a phone, and a
 * check that needs either is a check that stops being run.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MockupMatchTest {

    @get:Rule val compose = createComposeRule()

    private val postings = listOf(
        Posting(id = "1", title = "External Wholesaler Canada Insurance", company = "Manulife", remote_policy = "remote"),
        Posting(id = "2", title = "Product Owner, Fraud, Waste & Abuse", company = "Manulife", remote_policy = "remote"),
        Posting(id = "3", title = "Bilingual Disability Case Analyst", company = "Manulife", remote_policy = "remote"),
        Posting(id = "4", title = "Inside Business Development Manager", company = "Manulife", remote_policy = "remote"),
    )

    private fun tree(market: String, content: @androidx.compose.runtime.Composable () -> Unit): String {
        compose.setContent {
            CompositionLocalProvider(LocalTokens provides tokensFor(market)) {
                JobScoutTheme { Column { content() } }
            }
        }
        return compose.onRoot().printToString(maxDepth = 100)
    }

    // ── frame 1 ────────────────────────────────────────────────────────────
    /* NOTE on what this file can and cannot see: it composes the components
       itself rather than calling landing()/browse(), so it tests the pieces, not
       the screen. That is why a whole landing restructure once passed it
       untouched — it was asserting a count string the test itself had written. */
    @Test fun `landing carries the head, the hero and the feed`() {
        val t = tree("ca") {
            MHead("ca") {}
            MHero(resume = "", onResume = {}, onRun = {}, policy = null, onPolicy = {},
                  onUpload = {}, uploading = false, hint = null)
            MTitle("Browse by what the feed actually knows")
            MTax("Finance & banking", 24) {}
            MTitle("Explore today’s sweep")
            postings.take(2).forEach { MJob(it.title, it.company, policy = it.remote_policy) }
        }
        listOf(
            "JobScout",
            // BOTH markets, always. One pill carrying only the current market meant
            // Kenya did not exist unless you already knew the pill was a switch.
            "Canada", "Kenya",
            "Find the work", "made for you.",
            "Paste your resume",
            // The upload control lives in the box. It was dropped in the v3 rebuild
            // and there was then no way to upload a file at all.
            "Upload",
            "Remote", "Hybrid", "On site",
            // The feed, above the sweep: the web's order, asked for on the phone too.
            "Browse by what the feed actually knows", "Finance & banking", "24 open",
            "Explore today’s sweep",
            "External Wholesaler Canada Insurance", "Manulife",
        ).forEach { assertTrue("landing is missing \"$it\" in:\n$t", t.contains(it)) }
    }

    @Test fun `a scored card says what tapping it does, and only above the floor`() {
        /* The card WAS clickable and said so nowhere: the whole row opened the
           application page with no label and no button. Reported from the phone
           as "there is no prepare application button". */
        // Both cards in ONE composition: the rule allows a single setContent per
        // test, so two tree() calls throw rather than fail on the assertion.
        val t = tree("ca") {
            MJob("Above the floor", "A company", fit = 72, onClick = {},
                 action = "Prepare application →")
            MJob("Below the floor", "B company", fit = 28, onClick = null, action = null)
        }
        assertTrue("a card above the floor must name its action:\n$t",
                   t.contains("Prepare application"))
        assertEquals(
            "exactly one card offers it — below the floor nothing is drafted:\n$t",
            1, Regex("Prepare application").findAll(t).count(),
        )
    }

    // ── frame 2 ────────────────────────────────────────────────────────────
    @Test fun `browse carries the title, the three filters and the sweep`() {
        val t = tree("ca") {
            MHead("ca") {}
            MTitle("Explore today’s sweep")
            MFilter("Remote 184", on = true) {}
            MFilter("Hybrid 28", on = false) {}
            MFilter("On site", on = false) {}
            MCount("184 of 309")
            postings.forEach { MJob(it.title, it.company, policy = it.remote_policy) }
        }
        listOf("Explore today’s sweep", "Remote 184", "Hybrid 28", "On site", "184 of 309")
            .forEach { assertTrue("browse is missing \"$it\"\n$t", t.contains(it)) }
        assertEquals("browse shows four postings", 4, Regex("Manulife").findAll(t).count())
    }

    // ── frame 3 ────────────────────────────────────────────────────────────
    @Test fun `matches carries the bands the mockup paints`() {
        val fits = listOf(92, 85, 78, 67)
        val t = tree("ca") {
            MHead("ca") {}
            MTitle("Your matches")
            MCount("46 survived the gate of 309")
            postings.forEachIndexed { i, p -> MJob(p.title, p.company, fit = fits[i]) }
        }
        listOf("Your matches", "46 survived the gate of 309", "AUTO", "PING", "UNSURE")
            .forEach { assertTrue("matches is missing \"$it\"\n$t", t.contains(it)) }
    }

    // ── the bands themselves ───────────────────────────────────────────────
    @Test fun `band words match the mockup's four routes`() {
        val ca = CA_TOKENS
        assertEquals("auto", ca.bandWord(92))
        assertEquals("auto", ca.bandWord(85))
        assertEquals("ping", ca.bandWord(78))
        assertEquals("unsure", ca.bandWord(67))
        assertEquals("near-miss", ca.bandWord(42))
    }

    // ── both markets are authored, and differ ──────────────────────────────
    @Test fun `kenya is its own dark set, not an inverted canada`() {
        // The mockup's Kenya frames are near-black with a green accent and a red dot.
        assertTrue("Kenya canvas must be darker than Canada's",
            KE_TOKENS.canvas.luminance() < CA_TOKENS.canvas.luminance())
        assertTrue("the markets must not share an accent", KE_TOKENS.accent != CA_TOKENS.accent)
        assertTrue("the markets must not share a live dot", KE_TOKENS.live != CA_TOKENS.live)
    }

    // One setContent per rule, so the two markets are two tests rather than one
    // with two calls — the second call throws "Cannot call setContent twice".
    @Test fun `the kenya chip says Kenya`() {
        assertTrue(tree("ke") { MHead("ke") {} }.contains("Kenya"))
    }

    @Test fun `the canada chip says Canada`() {
        assertTrue(tree("ca") { MHead("ca") {} }.contains("Canada"))
    }
}

private fun androidx.compose.ui.graphics.Color.luminance(): Float =
    0.2126f * red + 0.7152f * green + 0.0722f * blue
