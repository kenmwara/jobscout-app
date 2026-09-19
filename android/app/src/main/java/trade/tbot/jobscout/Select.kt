package trade.tbot.jobscout

import kotlin.math.ln

/*
 * Which eight postings meet Claude. Mirrors the web page (site/index.html: sectorOf +
 * runPipeline) and tools/demo_eval.py, so a banker on the phone meets banking postings
 * exactly as on the site. The feed carries the sector lexicon that tagged its postings;
 * the same lexicon classifies the profile here.
 */

/** The "unsure" band. Below it nothing is recommended and nothing is drafted (the worker enforces it too). */
const val FIT_FLOOR = 55

/* ── How senior is this, and how senior are you ──────────────────────────
   Added 2026-09-19 with the picker rewrite. Without it nothing knew what a
   job's level was, and "Summer Intern 2027" ranked into a technical lead's
   eight on word overlap alone. Compiled once: rel() already walks 80 words
   over every posting, and rebuilding five regexes per row on top of that is
   the kind of cost a phone notices. */
// Raw strings on purpose: in a normal Kotlin literal "\b" is a BACKSPACE, not a word
// boundary, and it compiles — so an escaped copy of these would silently match nothing.
private val L_INTERN = Regex("""\b(intern|internship|co-?op|new ?grad|graduate program|apprentice|trainee)\b""")
private val L_JUNIOR = Regex("""\b(junior|jr\.?|entry.level|associate)\b""")
private val L_EXEC   = Regex("""\b(chief|c[te]o\b|vp\b|vice president|head of|director)\b""")
private val L_SENIOR = Regex("""\b(senior|sr\.?|staff|principal|lead|manager)\b""")
private val P_EXEC   = Regex("""\b(chief|founder|vp\b|vice president|head of|director)\b""")
private val P_JUNIOR = Regex("""\b(junior|graduate|intern|entry.level)\b""")
private val P_YEARS  = Regex("""(\d{1,2})\+?\s*years?""")

/**
 * Roughly where a posting sits, 0 = internship to 4 = executive. Titles are the only
 * honest source: a summary saying "senior engineers will thrive" is describing
 * colleagues, not the role. Mirror of levelOf() in site/index.html.
 */
fun levelOf(title: String): Int {
    val t = " " + title.lowercase() + " "
    return when {
        L_INTERN.containsMatchIn(t) -> 0
        L_JUNIOR.containsMatchIn(t) -> 1
        L_EXEC.containsMatchIn(t) -> 4
        L_SENIOR.containsMatchIn(t) -> 3
        else -> 2
    }
}

/**
 * And the candidate's own, from what they call themselves and how long they have been
 * at it. Deliberately generous downwards: a lead can take a mid role, so only the ends
 * are ruled out. Mirror of levelOfProfile() in site/index.html.
 */
fun levelOfProfile(profile: String): Int {
    val t = profile.lowercase()
    val yrs = P_YEARS.findAll(t).mapNotNull { it.groupValues[1].toIntOrNull() }.filter { it < 45 }.maxOrNull() ?: 0
    val head = t.take(400)
    return when {
        P_EXEC.containsMatchIn(head) -> 4
        L_SENIOR.containsMatchIn(head) || yrs >= 5 -> 3
        P_JUNIOR.containsMatchIn(head) && yrs < 2 -> 1
        yrs >= 2 -> 2
        else -> 1
    }
}
private const val SCORED = 8
private val STOP = setOf("experience","looking","remote","years","strong","skills","working","across","within","roles","based","including","ability","seeking","professional","currently","business","company","canada","canadian","kenya","kenyan")
private val WORD = Regex("[a-z][a-z&-]{4,}")

/** Profile mode (tools/sector.py mode="profile"): headline weighs 3x, the whole text decides, under 3 points is not a sector. */
fun sectorOf(profile: String, lex: Map<String, List<String>>): String {
    val t = profile.take(300).lowercase()
    val b = profile.drop(300).take(2500).lowercase()
    var best = "other"; var bestScore = 0
    for ((sec, phrases) in lex) {
        var th = 0; var bh = 0
        for (ph in phrases) {
            val rx = Regex("(?<![a-z0-9])" + Regex.escape(ph) + "(?![a-z0-9])")
            val w = ph.trim().split(Regex("\\s+")).size   // a phrase weighs its word count
            if (rx.containsMatchIn(t)) th += w else if (rx.containsMatchIn(b)) bh += w
        }
        val total = 3 * th + bh
        if (total > bestScore) { best = sec; bestScore = total }
    }
    return if (bestScore >= 3) best else "other"
}

/**
 * Could someone living in [home] take this posting? Mirror of takeable() in site/index.html,
 * Select.swift and tools/demo_eval.py - change the four together.
 *
 * Remote is takeable from anywhere inside its own scope; onsite or hybrid needs you there; and a
 * posting naming no province is ambiguous rather than nowhere, so it is kept. That last clause is
 * load-bearing: 23 rows a day say only "Canada".
 */
fun takeable(p: Posting, home: String, remoteOnly: Boolean): Boolean {
    if (remoteOnly && p.remote_policy != "remote") return false
    if (home.isEmpty()) return true
    if (p.remote_policy == "remote") return true
    if (p.places.isEmpty()) return true
    return home in p.places
}

data class Selection(val sector: String, val label: String, val inSector: Int, val eligible: Int, val postings: List<Posting>)

/** Six from the sector the profile reads as, two from outside it, ranked by the profile's own words (title hit 3, summary 1, IDF-weighted) and discounted by level distance. */
fun select(profile: String, feed: Feed, home: String = "", remoteOnly: Boolean = false): Selection {
    val all = feed.passers
    val eligible = all.filter { takeable(it, home, remoteOnly) }
    val sector = sectorOf(profile, feed.lexicon)
    val inSector = eligible.filter { it.sector == sector }
    val words = WORD.findAll(profile.lowercase()).map { it.value }.distinct().filter { it !in STOP }.take(80).toList()
    // The IDF corpus stays the WHOLE eligible feed, not the filtered set: rarity is a property
    // of the market, not of what this visitor will consider.
    val docs = all.map { (it.title + " " + it.summary).lowercase() }
    val idf = words.associateWith { w -> 1.0 / ln(2.0 + docs.count { w in it }) }
    fun rel(p: Posting): Double {
        val t = p.title.lowercase(); val s = p.summary.lowercase()
        return words.sumOf { w -> (if (w in t) 3 else if (w in s) 1 else 0) * idf.getValue(w) }
    }
    /* Six from the sector the profile reads as, two from outside it.

       Sector was a hard GATE until 2026-09-19: four in-sector postings hid the other
       three hundred, so a resume spanning two fields only ever met one. Making it a
       mere weight swung too far the other way — a thin profile's noise words put a
       video editor in a new graduate's eight — so it is a split instead. The six are
       the sector's best; the two have to beat the median of those six to take a slot,
       which noise cannot do. Mirror of runPipeline() in site/index.html. */
    val myLevel = levelOfProfile(profile)
    fun gap(p: Posting) = kotlin.math.abs(levelOf(p.title) - myLevel)
    // The ends are category errors, not near misses: a lead does not apply to a 2027
    // internship, and a graduate is not the VP.
    fun sane(p: Posting) = !(gap(p) >= 2 && (levelOf(p.title) <= 1 || myLevel <= 1))

    // Short of eight, this used to fall back to the UNFILTERED pool — which handed
    // every category error straight back, so a thin day put 2027 internships in a
    // technical lead's eight after all. A category error is never the lesser evil:
    // fewer than eight is the honest answer, and the page already says so.
    val usable = eligible.filter(::sane)
    // Scored once per posting, not once per comparison: rel() walks 80 words and a
    // sort would call it O(n log n) times over a three-hundred-row feed.
    val rank = usable.associate { it.id to (rel(it) to rel(it) / (1 + 0.55 * gap(it))) }
    fun relOf(p: Posting) = rank[p.id]?.first ?: 0.0
    fun score(p: Posting) = rank[p.id]?.second ?: 0.0

    val mine = usable.filter { it.sector == sector }.sortedByDescending(::score)
    val rest = usable.filter { it.sector != sector }.sortedByDescending(::score)
    val best = mine.take(6)
    val mid = if (best.isEmpty()) 0.0 else score(best[(best.size - 1) / 2])
    val other = rest.filter { relOf(it) > 0 && score(it) >= mid }.take(SCORED - best.size)
    /* Short of eight either way, the ranking fills the rest — but only with postings
       there is some evidence for, and there are two kinds. Either will do:

         · the posting is in the sector the profile reads as. The feed's own lexicon
           put it there, which is a better signal than word overlap and independent
           of it — a pharmacist writes "medication" and "dispensing" where the
           posting says "Medical" and "Patient", so rel is 0 and the job is still
           right. Requiring overlap here dropped four of five healthcare postings
           and filled the slots with every "Manager, …" in the feed, because
           "pharmacy manager" put "manager" among the profile's eighty words.

         · or the profile's words actually touch it. Outside the sector there is no
           other evidence, and without this a video editor reached a CS graduate. */
    val picked = (best + other + mine + rest).distinctBy { it.id }
        .filter { it.sector == sector || relOf(it) > 0 }
        .take(SCORED)
    return Selection(sector, feed.labels[sector] ?: sector, inSector.size, eligible.size, picked)
}

/** The scoring note, in the page's words. */
fun Selection.note() =
    "A fit from 0 to 100, a verdict in plain words, the strongest point and the weakest. " +
    "This profile reads as $label: $inSector of today's $eligible eligible postings are in that sector, and ${postings.size} go to Claude. " +
    "A cover letter or a tailored resume is offered only when the top match scores $FIT_FLOOR or better."

fun nofitNote(fit: Int, p: Posting?, id: String) =
    "Nothing in today's pool clears the bar for this profile. The nearest was $fit out of 100 — " +
    (p?.title?.ifEmpty { null } ?: id) + (p?.company?.takeIf { it.isNotEmpty() }?.let { " · $it" } ?: "") +
    ". A cover letter or a tailored resume is only offered from $FIT_FLOOR up, so none is offered here. The verdicts below say why."
