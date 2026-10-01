package trade.tbot.jobscout

import java.io.File

// Only what Docx.kt reads. The real ones live in Api.kt with serialization annotations.
data class ResumeItem(val title: String = "", val meta: String = "", val bullets: List<String> = emptyList())
data class ResumeSection(val heading: String = "", val items: List<ResumeItem> = emptyList())
data class ResumeResponse(val name: String = "", val contact: String = "", val headline: String = "",
                          val sections: List<ResumeSection> = emptyList())

/** Writes the two documents for tools/check_docx.sh to open; args[0] is the folder. */
fun main(args: Array<String>) {
    val r = ResumeResponse(
        name = "Wanjiru Kamau", contact = "Nairobi · w@example.com", headline = "Operations & logistics <lead>",
        sections = listOf(
            ResumeSection("Experience", listOf(ResumeItem("Logistics Coordinator", "Acme & Sons, 2019–2025",
                listOf("Ran a 40-truck fleet", "Cut fuel cost 12%")))),
            ResumeSection("Projects", emptyList()),          // an empty section must not reach the document
        ),
    )
    val p = Posting(title = "Operations Coordinator", company = "Example Org (Kenya)")
    val slug = jobSlug(p)
    File(args[0], "resume-$slug.docx").writeBytes(Docx.resume(r))
    File(args[0], "cover-letter-$slug.docx").writeBytes(Docx.letter("Dear hiring team,\n\nI coordinate logistics & fleets.\nLine two.\n\nKind regards"))
    println(slug)
}
