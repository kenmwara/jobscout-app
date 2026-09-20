import Foundation

// Which eight postings meet Claude. Mirrors the web page (site/index.html: sectorOf +
// runPipeline) and tools/demo_eval.py, so a banker on the phone meets banking postings
// exactly as on the site. The feed carries the sector lexicon that tagged its postings;
// the same lexicon classifies the profile here.

/// The "unsure" band. Below it nothing is recommended and nothing is drafted (the worker enforces it too).
let fitFloor = 55
private let scored = 8
private let stop: Set<String> = ["experience","looking","remote","years","strong","skills","working","across","within","roles","based","including","ability","seeking","professional","currently","business","company","canada","canadian","kenya","kenyan"]

/// Profile mode (tools/sector.py mode="profile"): headline weighs 3x, the whole text decides, under 3 points is not a sector.
/* ── How senior is this, and how senior are you ──────────────────────────
   Added 2026-09-19 with the picker rewrite. Without it nothing knew what a job's
   level was, and "Summer Intern 2027" ranked into a technical lead's eight on word
   overlap alone. Mirrors levelOf/levelOfProfile in site/index.html and Select.kt. */
private func hits(_ s: String, _ pattern: String) -> Bool {
    s.range(of: pattern, options: [.regularExpression]) != nil
}

/// Roughly where a posting sits, 0 = internship to 4 = executive. Titles are the only
/// honest source: a summary saying "senior engineers will thrive" describes colleagues.
func levelOf(_ title: String) -> Int {
    let t = " " + title.lowercased() + " "
    if hits(t, #"\b(intern|internship|co-?op|new ?grad|graduate program|apprentice|trainee)\b"#) { return 0 }
    if hits(t, #"\b(junior|jr\.?|entry.level|associate)\b"#) { return 1 }
    if hits(t, #"\b(chief|c[te]o\b|vp\b|vice president|head of|director)\b"#) { return 4 }
    if hits(t, #"\b(senior|sr\.?|staff|principal|lead|manager)\b"#) { return 3 }
    return 2
}

/// And the candidate's own. Deliberately generous downwards: a lead can take a mid
/// role, so only the ends are ruled out.
func levelOfProfile(_ profile: String) -> Int {
    let t = profile.lowercased()
    var yrs = 0
    if let rx = try? NSRegularExpression(pattern: #"(\d{1,2})\+?\s*years?"#) {
        for m in rx.matches(in: t, range: NSRange(t.startIndex..., in: t)) {
            guard let r = Range(m.range(at: 1), in: t), let n = Int(t[r]), n < 45 else { continue }
            yrs = max(yrs, n)
        }
    }
    let head = String(t.prefix(400))
    if hits(head, #"\b(chief|founder|vp\b|vice president|head of|director)\b"#) { return 4 }
    if hits(head, #"\b(senior|staff|principal|lead|manager)\b"#) || yrs >= 5 { return 3 }
    if hits(head, #"\b(junior|graduate|intern|entry.level)\b"#) && yrs < 2 { return 1 }
    return yrs >= 2 ? 2 : 1
}

func sectorOf(_ profile: String, lex: [String: [String]]) -> String {
    let t = String(profile.prefix(300)).lowercased()
    let b = String(profile.dropFirst(300).prefix(2500)).lowercased()
    var best = "other", bestScore = 0
    // ponytail: a Swift dictionary has no order, so an exact tie between two sectors can
    // land differently from the page (which keeps the lexicon's order); sorted keys keep it deterministic.
    for sec in lex.keys.sorted() {
        var th = 0, bh = 0
        for ph in lex[sec] ?? [] {
            let rx = "(?<![a-z0-9])" + NSRegularExpression.escapedPattern(for: ph) + "(?![a-z0-9])"
            let w = ph.split(whereSeparator: { $0.isWhitespace }).count   // a phrase weighs its word count
            if t.range(of: rx, options: .regularExpression) != nil { th += w }
            else if b.range(of: rx, options: .regularExpression) != nil { bh += w }
        }
        let total = 3 * th + bh
        if total > bestScore { best = sec; bestScore = total }
    }
    return bestScore >= 3 ? best : "other"
}

/// Could someone living in `home` take this posting? Mirror of takeable() in site/index.html,
/// Select.kt and tools/demo_eval.py - change the four together.
///
/// Remote is takeable from anywhere inside its own scope; onsite or hybrid needs you there; and a
/// posting naming no province is ambiguous rather than nowhere, so it is kept. That last clause is
/// load-bearing: 23 rows a day say only "Canada".
func takeable(_ p: Posting, home: String, remoteOnly: Bool) -> Bool {
    if remoteOnly && p.remote_policy != "remote" { return false }
    if home.isEmpty { return true }
    if p.remote_policy == "remote" { return true }
    let places = p.places ?? []
    if places.isEmpty { return true }
    return places.contains(home)
}

struct Selection {
    let sector: String, label: String, inSector: Int, eligible: Int, postings: [Posting]

    /// The scoring note, in the page's words.
    var note: String {
        "A fit from 0 to 100, a verdict in plain words, the strongest point and the weakest. " +
        "This profile reads as \(label): \(inSector) of today's \(eligible) eligible postings are in that sector, and \(postings.count) go to Claude. " +
        "A cover letter or a tailored resume is offered only when the top match scores \(fitFloor) or better."
    }
}

/// The profile's sector first, ranked by the profile's own words (title hit 3, summary 1, IDF-weighted); under four in the sector, top up with the rest.
func select(profile: String, feed: Feed, home: String = "", remoteOnly: Bool = false) -> Selection {
    let all = feed.passers
    let eligible = all.filter { takeable($0, home: home, remoteOnly: remoteOnly) }
    let sector = sectorOf(profile, lex: feed.lexicon ?? [:])
    let inSector = eligible.filter { ($0.sector ?? "") == sector }
    let low = profile.lowercased()
    var seen = Set<String>(), words: [String] = []
    if let rx = try? NSRegularExpression(pattern: "[a-z][a-z&-]{4,}") {
        for m in rx.matches(in: low, range: NSRange(low.startIndex..., in: low)) {
            guard let r = Range(m.range, in: low) else { continue }
            let w = String(low[r])
            if !stop.contains(w), seen.insert(w).inserted { words.append(w) }
            if words.count == 80 { break }
        }
    }
    // The IDF corpus stays the WHOLE eligible feed, not the filtered set: rarity is a property
    // of the market, not of what this visitor will consider.
    let docs = all.map { ($0.title + " " + $0.summary).lowercased() }
    var idf: [String: Double] = [:]
    for w in words { idf[w] = 1.0 / log(2.0 + Double(docs.filter { $0.contains(w) }.count)) }
    func rel(_ p: Posting) -> Double {
        let t = p.title.lowercased()
        let s = p.summary.lowercased()
        var n = 0.0
        for w in words {
            let hit: Double = t.contains(w) ? 3 : (s.contains(w) ? 1 : 0)
            n += hit * (idf[w] ?? 0)
        }
        return n
    }
    /* Six from the sector the profile reads as, two from outside it.

       Sector was a hard GATE until 2026-09-19: four in-sector postings hid the other
       three hundred, so a resume spanning two fields only ever met one. Making it a
       mere weight swung too far the other way — a thin profile's noise words put a
       video editor in a new graduate's eight — so it is a split instead. The six are
       the sector's best; the two have to beat the median of those six. */
    let myLevel = levelOfProfile(profile)
    func gap(_ p: Posting) -> Int { abs(levelOf(p.title) - myLevel) }
    // The ends are category errors, not near misses: a lead does not apply to a 2027
    // internship, and a graduate is not the VP. Nothing falls back to the unfiltered
    // pool when this leaves fewer than eight — fewer is the honest answer.
    func sane(_ p: Posting) -> Bool { !(gap(p) >= 2 && (levelOf(p.title) <= 1 || myLevel <= 1)) }
    let usable = eligible.filter(sane)

    // Scored once per posting, not once per comparison.
    var relBy: [String: Double] = [:], scoreBy: [String: Double] = [:]
    for p in usable {
        let r = rel(p)
        relBy[p.id] = r
        scoreBy[p.id] = r / (1 + 0.55 * Double(gap(p)))
    }
    func relOf(_ p: Posting) -> Double { relBy[p.id] ?? 0 }
    func score(_ p: Posting) -> Double { scoreBy[p.id] ?? 0 }

    struct Ranked { let i: Int; let p: Posting; let r: Double }
    func ranked(_ pool: [Posting]) -> [Posting] {
        var rs: [Ranked] = []
        for (i, p) in pool.enumerated() { rs.append(Ranked(i: i, p: p, r: score(p))) }
        rs.sort { a, b in a.r == b.r ? a.i < b.i : a.r > b.r }   // stable, like the page's sort
        return rs.map { $0.p }
    }
    let mine = ranked(usable.filter { ($0.sector ?? "") == sector })
    let rest = ranked(usable.filter { ($0.sector ?? "") != sector })
    let best = Array(mine.prefix(6))
    let mid = best.isEmpty ? 0 : score(best[(best.count - 1) / 2])
    let other = Array(rest.filter { relOf($0) > 0 && score($0) >= mid }.prefix(scored - best.count))

    /* Short of eight either way, the ranking fills the rest — but only with postings
       there is some evidence for, and there are two kinds. Either will do: the
       posting is in the sector the profile reads as (the feed's lexicon put it
       there, which is better evidence than word overlap and independent of it — a
       pharmacist writes "medication" where the posting says "Patient"), or the
       profile's words touch it. Outside the sector there is no other evidence, and
       without that a video editor reached a CS graduate. */
    var picked: [Posting] = []
    var taken = Set<String>()
    for p in best + other + mine + rest
    where ((p.sector ?? "") == sector || relOf(p) > 0) && taken.insert(p.id).inserted {
        picked.append(p)
        if picked.count == scored { break }
    }
    return Selection(sector: sector, label: feed.labels?[sector] ?? sector, inSector: inSector.count, eligible: eligible.count, postings: picked)
}

/* A low score is the distance between what these postings ask for and what the
   resume currently says \u{2014} a rewrite brief, not a judgement of the person.
   Written forward for the same reason the letter is: the product exists to get
   someone hired, not to tell them they are not good enough. */
func nofitNote(fit: Int, posting p: Posting?, id: String) -> String {
    return "Today\u{2019}s postings are a stretch for this resume as written. The nearest was \(fit) out of 100 "
        + "\u{2014} which measures the distance between what these postings ask for and what the resume "
        + "currently says, not what you are capable of. The quickest way to move it is to make the resume "
        + "answer them, and they have been unusually clear about what they are asking:"
}

/// What to do about it, shown under the quoted asks.
let nofitRoutes = "Put whatever is genuinely true of you against those points and run it again \u{2014} the same "
    + "experience in their words often scores very differently. Or back yourself on one of these today: the "
    + "letter leads with your strongest real evidence and the recruiter decides the rest."
