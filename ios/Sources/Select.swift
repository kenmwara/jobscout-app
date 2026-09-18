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
    struct Ranked { let i: Int; let p: Posting; let r: Double }
    func ranked(_ pool: [Posting]) -> [Posting] {
        var rs: [Ranked] = []
        for (i, p) in pool.enumerated() { rs.append(Ranked(i: i, p: p, r: rel(p))) }
        rs.sort { a, b in a.r == b.r ? a.i < b.i : a.r > b.r }   // stable, like the page's sort
        return rs.map { $0.p }
    }
    var pool = ranked(inSector)
    if inSector.count < 4 { pool += ranked(eligible.filter { ($0.sector ?? "") != sector }) }
    let picked = Array(pool.prefix(scored))
    return Selection(sector: sector, label: feed.labels?[sector] ?? sector, inSector: inSector.count, eligible: eligible.count, postings: picked)
}

func nofitNote(fit: Int, posting p: Posting?, id: String) -> String {
    var name = id
    if let p, !p.title.isEmpty { name = p.title }
    if let p, !p.company.isEmpty { name += " · \(p.company)" }
    return "Nothing in today's pool clears the bar for this profile. The nearest was \(fit) out of 100 — \(name). " +
           "A cover letter or a tailored resume is only offered from \(fitFloor) up, so none is offered here. The verdicts below say why."
}
