package trade.tbot.jobscout

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What the three Copy buttons put on the clipboard.
 *
 * The mechanism itself was proved on the emulator 2026-09-19: "Copy the answers",
 * then a paste into the app's own resume box, and the pasted text was exactly what
 * answersText() builds. All three buttons call the same
 * LocalClipboardManager.setText, so the only thing that differs between them is the
 * string — which is pure, and belongs here rather than behind ten more Claude calls
 * and a re-run to click two more buttons.
 */
class CopyTextTest {

    private val resume = ResumeResponse(
        name = "Ken Kariuki",
        contact = "Vancouver BC · ken@example.com",
        headline = "Senior Platform Engineer with LLM Orchestration Experience",
        sections = listOf(
            ResumeSection("Experience", listOf(
                ResumeItem("Technical Lead", "T BOT, Apr 2026 – present", listOf(
                    "Built a platform behind a fourteen-layer risk chain",
                    "Fitted a calibration curve after a Brier audit",
                )),
            )),
            ResumeSection("Skills", listOf(
                ResumeItem("Languages & Platforms", "", listOf("Python (8 years)", "Cloudflare Workers")),
            )),
            // The one the emulator surfaced: a heading the model emitted with nothing
            // under it. It must not reach the clipboard either.
            ResumeSection("Education", emptyList()),
        ),
        gaps = listOf(Gap("Go or Rust", "Not claimed anywhere in the profile.")),
    )

    @Test fun `the resume copy carries the document, in order`() {
        val t = resumeText(resume)
        assertTrue(t.startsWith("Ken Kariuki"))
        listOf(
            "Vancouver BC", "Senior Platform Engineer",
            "EXPERIENCE", "Technical Lead — T BOT, Apr 2026 – present",
            "• Built a platform behind a fourteen-layer risk chain",
            "SKILLS", "Python (8 years)",
        ).forEach { assertTrue("missing \"$it\"\n$t", t.contains(it)) }
        // order, not just presence
        assertTrue("experience must precede skills", t.indexOf("EXPERIENCE") < t.indexOf("SKILLS"))
    }

    @Test fun `an empty section never reaches the clipboard`() {
        assertFalse("EDUCATION had no items and must be dropped", resumeText(resume).contains("EDUCATION"))
    }

    @Test fun `the gaps stay out of the copied document`() {
        // They are what the resume does NOT say. Pasting them into an application
        // would be pasting the candidate's own weaknesses into the employer's box.
        val t = resumeText(resume)
        assertFalse(t.contains("Go or Rust"))
        assertFalse(t.contains("Not claimed anywhere"))
    }

    private val answers = AnswersResponse(
        source = "ashby",
        questions = listOf(
            Question(label = "LinkedIn Profile", required = true, why = "yours to type"),
            Question(
                label = "Describe an AI-powered product feature you shipped",
                required = true,
                answer = "LLM orchestration work with 8 years Python experience.",
                from = "8 years Python",
            ),
            Question(label = "What country are you based in?", required = true,
                     why = "yours to answer — your profile does not settle it"),
        ),
        drafted = 1,
    )

    @Test fun `the answers copy pairs each label with its answer or its reason`() {
        // Exactly the shape read off the emulator's paste.
        assertEquals(
            "LinkedIn Profile\n[yours to type]\n\n" +
            "Describe an AI-powered product feature you shipped\n" +
            "LLM orchestration work with 8 years Python experience.\n\n" +
            "What country are you based in?\n" +
            "[yours to answer — your profile does not settle it]",
            answersText(answers),
        )
    }

    @Test fun `an unanswered question is bracketed, never blank`() {
        // A blank line under a required question looks like the app failed. The
        // bracket says a human has to fill it.
        val t = answersText(answers)
        assertFalse("no label may be followed by an empty line", t.contains("\n\n\n"))
        assertTrue(t.contains("[yours to type]"))
    }

    @Test fun `the citation is not copied — it is provenance, not an answer`() {
        assertFalse(answersText(answers).contains("from your resume"))
    }
}

/**
 * Resume, or a job title? The box takes both and the app used to take neither
 * under forty characters — it answered a typed job title with a banner telling
 * you to paste a resume. Mirror of modeOf() in site/index.html, which has drawn
 * this distinction since the single-box redesign.
 */
class LooksLikeResumeTest {

    @Test fun `a typed job title is a search`() {
        listOf(
            "Full Stack Engineer Canada",
            "Senior Platform Engineer",
            "nurse",
            // 44 characters, and still obviously a search — which is why length
            // alone was the wrong test.
            "Senior Staff Platform Engineer, Vancouver BC",
        ).forEach { assertFalse(it, looksLikeResume(it)) }
    }

    @Test fun `a resume is a resume`() {
        assertTrue("long prose", looksLikeResume("a".repeat(200)))
        assertTrue("has line breaks", looksLikeResume("Ken Kariuki\nVancouver BC"))
        assertTrue("says experience", looksLikeResume("8 years experience in Python"))
        assertTrue("says skills", looksLikeResume("Skills: Python, TypeScript"))
    }

    @Test fun `an empty box is neither`() {
        assertFalse(looksLikeResume(""))
        assertFalse(looksLikeResume("   "))
    }
}
