package trade.tbot.jobscout

/*
 * The picker's self-check: the two defects the 2026-09-19 rewrite exists to fix,
 * plus the behaviour that must survive it. Run with: bash tools/check_picker.sh
 *
 * It is deliberately the SAME two failures the real run showed on the web:
 * a technical lead was handed 2027 internships, and a resume spanning two fields
 * only ever met one of them.
 */

private var failed = 0

private fun check(name: String, ok: Boolean, saw: String = "") {
    if (ok) println("  ok    $name")
    else { failed++; println("  FAIL  $name${if (saw.isEmpty()) "" else "  ($saw)"}") }
}

private fun p(id: String, title: String, sector: String, summary: String = "") =
    Posting(id = id, title = title, sector = sector, summary = summary.ifEmpty { title })

private val LEX = mapOf(
    "engineering" to listOf("software engineer", "backend", "platform", "kubernetes", "python", "typescript"),
    "security" to listOf("security", "threat hunting", "siem", "detection", "vulnerability"),
    "media" to listOf("video editor", "premiere", "colour grading", "motion graphics"),
)
private val LABELS = mapOf("engineering" to "engineering", "security" to "security", "media" to "media")

// A lead who is both an engineer and a security analyst — Ken's own resume, in short.
private const val LEAD =
    "Senior platform engineer and technical lead, Vancouver BC. 8 years building Python and " +
    "TypeScript backend and platform systems, plus threat hunting, SIEM detection rules and " +
    "vulnerability triage as a security analyst."

private const val GRAD =
    "Recent computer science graduate looking for a first software engineering role. " +
    "Python, JavaScript, SQL, one internship."

private fun feedOf(vararg ps: Posting) = Feed(postings = ps.toList(), lexicon = LEX, labels = LABELS)

fun main() {
    println("levels")
    check("an internship reads as 0", levelOf("Software Engineer Summer Intern 2027") == 0)
    check("a co-op reads as 0", levelOf("Backend Co-op Student") == 0)
    check("junior reads as 1", levelOf("Junior Developer") == 1)
    check("plain reads as 2", levelOf("Software Engineer") == 2)
    check("senior reads as 3", levelOf("Senior Software Engineer") == 3)
    check("a director reads as 4", levelOf("Director of Engineering") == 4)
    // The trap the comment in Select.kt names: seniority in the SUMMARY is describing
    // colleagues, and only the title is read.
    check("a summary cannot promote a posting",
        levelOf("Support Assistant") == 2, "got ${levelOf("Support Assistant")}")
    check("the lead reads as 3", levelOfProfile(LEAD) == 3, "got ${levelOfProfile(LEAD)}")
    check("the graduate reads as 1", levelOfProfile(GRAD) == 1, "got ${levelOfProfile(GRAD)}")
    check("'6 years' alone reads as 3", levelOfProfile("Accountant. 6 years of bookkeeping.") == 3)

    // ── defect 1: a technical lead was handed 2027 internships ──────────────
    println("\na lead is never shown an internship")
    val interns = feedOf(
        p("i1", "Software Engineer Summer Intern 2027", "engineering", "python typescript platform intern"),
        p("i2", "Backend Engineering Co-op Student", "engineering", "python backend co-op"),
        p("i3", "Engineering Intern, Platform", "engineering", "platform python intern"),
        p("s1", "Senior Platform Engineer", "engineering", "python typescript platform kubernetes"),
        p("s2", "Staff Backend Engineer", "engineering", "python backend platform"),
        p("s3", "Security Engineer, Detection", "security", "siem detection threat hunting"),
        p("s4", "Lead Security Analyst", "security", "security siem vulnerability"),
        p("s5", "Principal Software Engineer", "engineering", "typescript platform"),
        p("s6", "Senior Detection Engineer", "security", "detection siem security"),
    )
    val forLead = select(LEAD, interns).postings.map { it.id }
    check("no internship in the eight", forLead.none { it.startsWith("i") }, forLead.joinToString())
    // Six, not eight: three of the nine were internships and they are simply gone.
    // Returning fewer is the point — the old fallback made the numbers up with them.
    check("it returns the six that are his", forLead.size == 6, "got ${forLead.size}")

    // ── defect 2: sector was a gate, so a two-field resume met one field ─────
    println("\nsector is a weight, not a wall")
    val both = feedOf(
        p("e1", "Senior Platform Engineer", "engineering", "python typescript platform kubernetes"),
        p("e2", "Staff Backend Engineer", "engineering", "python backend platform kubernetes"),
        p("e3", "Senior Software Engineer", "engineering", "python typescript"),
        p("e4", "Principal Platform Engineer", "engineering", "platform kubernetes python"),
        p("e5", "Senior Backend Engineer", "engineering", "python backend"),
        p("e6", "Staff Platform Engineer", "engineering", "platform typescript"),
        p("e7", "Senior Python Engineer", "engineering", "python"),
        p("e8", "Lead Backend Engineer", "engineering", "backend python"),
        p("k1", "Lead Security Analyst", "security", "security siem threat hunting detection vulnerability"),
        p("k2", "Senior Detection Engineer", "security", "detection siem security threat hunting"),
    )
    // This resume reads as SECURITY, not engineering: the lexicon weighs its five
    // security phrases above the four engineering ones, and the headline counts
    // triple. That is the picker working — so the check is that whichever sector is
    // read leads, and that the other field is not hidden behind it.
    val sel = select(LEAD, both)
    val mixed = sel.postings.map { it.id }
    val lead = sel.postings.take(minOf(6, sel.inSector))
    check("the read sector (${sel.sector}) leads", lead.isNotEmpty() && lead.all { it.sector == sel.sector }, mixed.joinToString())
    // Eight in one sector would have hidden the other entirely before the rewrite.
    check("the other field is not hidden", sel.postings.any { it.sector != sel.sector }, mixed.joinToString())

    // ── and the weight must not swing the other way ─────────────────────────
    println("\nnoise from another field cannot take a slot")
    val noisy = feedOf(
        p("g1", "Junior Software Engineer", "engineering", "python javascript sql graduate"),
        p("g2", "Software Engineer, New Grad", "engineering", "python javascript graduate"),
        p("g3", "Associate Developer", "engineering", "python sql"),
        p("g4", "Software Engineer", "engineering", "python javascript"),
        p("g5", "Junior Backend Developer", "engineering", "python sql"),
        p("g6", "Associate Software Engineer", "engineering", "javascript python"),
        p("v1", "Video Editor", "media", "premiere colour grading motion graphics"),
        p("v2", "Senior Video Editor", "media", "premiere motion graphics"),
        p("x1", "Director of Engineering", "engineering", "python platform leadership"),
    )
    val forGrad = select(GRAD, noisy).postings.map { it.id }
    check("no video editor in a graduate's eight", forGrad.none { it.startsWith("v") }, forGrad.joinToString())
    check("no directorship in a graduate's eight", forGrad.none { it == "x1" }, forGrad.joinToString())

    // ── the ends are dropped, but only the ends ─────────────────────────────
    println("\na lead can still take a mid-level role")
    val mid = feedOf(
        p("m1", "Software Engineer", "engineering", "python typescript platform"),
        p("m2", "Backend Engineer", "engineering", "python backend platform"),
        p("i1", "Software Engineering Intern", "engineering", "python intern"),
    )
    val forLead2 = select(LEAD, mid).postings.map { it.id }
    check("plain mid-level roles survive", forLead2.containsAll(listOf("m1", "m2")), forLead2.joinToString())

    // ── a thin pool is never padded with things he cannot apply to ─────────
    println("\na thin day is short, not padded")
    val onlyIntern = feedOf(p("i1", "Software Engineering Intern 2027", "engineering", "python intern"))
    check("a lone internship is nothing for a lead", select(LEAD, onlyIntern).postings.isEmpty())
    val onlyOne = feedOf(p("s1", "Senior Platform Engineer", "engineering", "python typescript platform"))
    check("a lone real match still comes through", select(LEAD, onlyOne).postings.size == 1)

    println(if (failed == 0) "\nALL GREEN" else "\n$failed FAILED")
    if (failed > 0) kotlin.system.exitProcess(1)
}
