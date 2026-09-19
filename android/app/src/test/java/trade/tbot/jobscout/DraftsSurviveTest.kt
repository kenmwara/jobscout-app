package trade.tbot.jobscout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Closing the application page must not throw away what it cost to fill.
 *
 * Each of the three steps is a Claude call. Until 2026-09-19 openApply built a fresh
 * Apply every time, so glancing at the posting and coming back meant paying for all
 * three again — the most expensive bug in the app, in the one currency the user
 * actually spends.
 *
 * These exercise the state rules directly rather than through the view model, which
 * needs an Application and a live worker. The rules are the whole fix.
 */
class DraftsSurviveTest {

    private val posting = Posting(id = "p1", title = "Senior Platform Engineer", company = "Linear")
    private val other = Posting(id = "p2", title = "Staff Backend Engineer", company = "GitLab")

    /** openApply's rule, lifted: reuse the draft unless the resume changed. */
    private fun open(u: Ui, p: Posting, profile: String, fit: Int): Ui {
        val kept = if (u.draftsFor == profile) u.drafts else emptyMap()
        val a = kept[p.id]?.copy(posting = p, fit = fit) ?: Apply(p, fit)
        return u.copy(apply = a, drafts = kept + (p.id to a), draftsFor = profile)
    }

    /** closeApply's rule. */
    private fun close(u: Ui): Ui =
        u.copy(apply = null, drafts = u.apply?.let { u.drafts + (it.posting.id to it) } ?: u.drafts)

    /** patch's rule, keyed by posting rather than by what is on screen. */
    private fun patch(u: Ui, id: String, f: (Apply) -> Apply): Ui {
        val target = u.drafts[id] ?: u.apply?.takeIf { it.posting.id == id } ?: return u
        val next = f(target)
        return u.copy(
            apply = if (u.apply?.posting?.id == id) next else u.apply,
            drafts = u.drafts + (id to next),
        )
    }

    @Test fun `a letter survives closing and reopening`() {
        var u = open(Ui(), posting, "my resume", 72)
        u = patch(u, "p1") { it.copy(letter = Step(data = "Dear hiring manager")) }
        u = close(u)
        assertNull("the page is closed", u.apply)

        u = open(u, posting, "my resume", 72)
        assertEquals("Dear hiring manager", u.apply?.letter?.data)
    }

    @Test fun `a result that lands after closing is not lost`() {
        // The call takes seconds; the page can be closed before it returns. Keying
        // the write to the posting is what makes this hold.
        var u = open(Ui(), posting, "my resume", 72)
        u = patch(u, "p1") { it.copy(letter = Step(busy = true)) }
        u = close(u)
        u = patch(u, "p1") { it.copy(letter = Step(data = "arrived late")) }

        u = open(u, posting, "my resume", 72)
        assertEquals("arrived late", u.apply?.letter?.data)
    }

    @Test fun `a new resume throws every draft away`() {
        // A letter written from one resume, shown against another, is worse than
        // no letter at all.
        var u = open(Ui(), posting, "resume A", 72)
        u = patch(u, "p1") { it.copy(letter = Step(data = "written from A")) }
        u = close(u)

        u = open(u, posting, "resume B", 72)
        assertNull("stale draft must not survive a resume change", u.apply?.letter?.data)
        assertEquals("resume B", u.draftsFor)
    }

    @Test fun `drafts do not leak between postings`() {
        var u = open(Ui(), posting, "my resume", 72)
        u = patch(u, "p1") { it.copy(letter = Step(data = "for Linear")) }
        u = close(u)

        u = open(u, other, "my resume", 64)
        assertNull("p2 must not inherit p1's letter", u.apply?.letter?.data)

        u = close(u)
        u = open(u, posting, "my resume", 72)
        assertEquals("and p1 still has its own", "for Linear", u.apply?.letter?.data)
    }

    @Test fun `reopening takes the fit from the current run, not the stored draft`() {
        // The draft is about the posting. The score belongs to whichever run is live.
        var u = open(Ui(), posting, "my resume", 72)
        u = patch(u, "p1") { it.copy(letter = Step(data = "kept")) }
        u = close(u)

        u = open(u, posting, "my resume", 81)
        assertEquals(81, u.apply?.fit)
        assertEquals("kept", u.apply?.letter?.data)
    }

    @Test fun `all three steps are kept, not just the letter`() {
        var u = open(Ui(), posting, "my resume", 72)
        u = patch(u, "p1") { it.copy(letter = Step(data = "L")) }
        u = patch(u, "p1") { it.copy(resume = Step(data = ResumeResponse(name = "Ken"))) }
        u = patch(u, "p1") { it.copy(answers = Step(data = AnswersResponse(source = "ashby", drafted = 3))) }
        u = close(u)

        u = open(u, posting, "my resume", 72)
        val a = u.apply
        assertNotNull(a)
        assertEquals("L", a?.letter?.data)
        assertEquals("Ken", a?.resume?.data?.name)
        assertEquals(3, a?.answers?.data?.drafted)
        assertTrue("and nothing is left marked busy", listOf(a?.letter, a?.resume, a?.answers).none { it?.busy == true })
    }
}
