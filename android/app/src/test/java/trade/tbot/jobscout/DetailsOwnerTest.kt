package trade.tbot.jobscout

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Saved answers belong to the résumé's owner, not the phone (Ken, 2026-10-02: on the web his
 * own résumé was offered Shyro's name, email, phone, location and salary). The web's twin is
 * tools/check_apply_details.mjs H.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])   // Robolectric 4.13's ceiling; the app targets 36
class DetailsOwnerTest {
    private lateinit var ctx: Context
    private val ken = "Ken Tester\nken.tester@example.com | +1 604 555 0100\nSecurity engineer, SIEM and SOAR."
    private val other = "Other Person\nother@example.org\nOperations lead in Mombasa, logistics and support."

    @Before fun setUp() {
        ctx = ApplicationProvider.getApplicationContext()
        ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test fun ownerIsTheResumesEmailElseItsFirstLine() {
        assertEquals("ken.tester@example.com", DetailsStore.ownerOf(ken))
        assertEquals("no email here", DetailsStore.ownerOf("No Email Here\nJust forty-plus characters of résumé text."))
        assertEquals("", DetailsStore.ownerOf("too short"))
    }

    @Test fun anotherPersonsAnswersAreNeverLoadedForThisResume() {
        DetailsStore.save(ctx, DetailsStore.ownerOf(other), mapOf("name" to "Other Person", "location" to "Mombasa"))
        assertEquals(emptyMap<String, String>(), DetailsStore.load(ctx, DetailsStore.ownerOf(ken)))
        DetailsStore.save(ctx, DetailsStore.ownerOf(ken), mapOf("notice" to "Two weeks"))
        assertEquals(mapOf("notice" to "Two weeks"), DetailsStore.load(ctx, DetailsStore.ownerOf(ken)))
        assertEquals("Mombasa", DetailsStore.load(ctx, DetailsStore.ownerOf(other))["location"])
    }

    @Test fun theOldFlatSetIsKeptForWhoeverItBelongsTo() {
        ctx.getSharedPreferences("jobscout", Context.MODE_PRIVATE).edit()
            .putString("jobscout.details", """{"name":"Other Person","email":"other@example.org","salary":"90000"}""").commit()
        assertTrue(DetailsStore.load(ctx, DetailsStore.ownerOf(ken)).isEmpty())
        assertEquals("90000", DetailsStore.load(ctx, DetailsStore.ownerOf(other))["salary"])
    }

    @Test fun clearingRemovesOnlyThisOwnersAnswers() {
        DetailsStore.save(ctx, DetailsStore.ownerOf(other), mapOf("location" to "Mombasa"))
        DetailsStore.save(ctx, DetailsStore.ownerOf(ken), mapOf("notice" to "Two weeks"))
        DetailsStore.save(ctx, DetailsStore.ownerOf(ken), emptyMap())
        assertTrue(DetailsStore.load(ctx, DetailsStore.ownerOf(ken)).isEmpty())
        assertEquals("Mombasa", DetailsStore.load(ctx, DetailsStore.ownerOf(other))["location"])
    }
}
