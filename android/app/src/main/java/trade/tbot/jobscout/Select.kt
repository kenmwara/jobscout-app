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

/** The profile's sector first, ranked by the profile's own words (title hit 3, summary 1, IDF-weighted); under four in the sector, top up with the rest. */
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
    fun ranked(pool: List<Posting>) = pool.map { it to rel(it) }.sortedByDescending { it.second }.map { it.first }
    val picked = (if (inSector.size >= 4) ranked(inSector)
                  else ranked(inSector) + ranked(eligible.filter { it.sector != sector })).take(SCORED)
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
