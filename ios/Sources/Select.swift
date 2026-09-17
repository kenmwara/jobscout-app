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
func select(profile: String, feed: Feed) -> Selection {
    let eligible = feed.passers
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
    let docs = eligible.map { ($0.title + " " + $0.summary).lowercased() }
    var idf: [String: Double] = [:]
    for w in words { idf[w] = 1.0 / log(2.0 + Double(docs.filter { $0.contains(w) }.count)) }
    func rel(_ p: Posting) -> Double {
        let t = p.title.lowercased(), s = p.summary.lowercased()
        return words.reduce(0.0) { $0 + Double(t.contains($1) ? 3 : s.contains($1) ? 1 : 0) * (idf[$1] ?? 0) }
    }
    func ranked(_ pool: [Posting]) -> [Posting] {
        pool.enumerated().map { ($0.offset, $0.element, rel($0.element)) }
            .sorted { $0.2 == $1.2 ? $0.0 < $1.0 : $0.2 > $1.2 }   // stable, like the page's sort
            .map { $0.1 }
    }
    let picked = Array((inSector.count >= 4 ? ranked(inSector)
                        : ranked(inSector) + ranked(eligible.filter { ($0.sector ?? "") != sector })).prefix(scored))
    return Selection(sector: sector, label: feed.labels?[sector] ?? sector, inSector: inSector.count, eligible: eligible.count, postings: picked)
}

func nofitNote(fit: Int, posting p: Posting?, id: String) -> String {
    var name = id
    if let p, !p.title.isEmpty { name = p.title }
    if let p, !p.company.isEmpty { name += " · \(p.company)" }
    return "Nothing in today's pool clears the bar for this profile. The nearest was \(fit) out of 100 — \(name). " +
           "A cover letter or a tailored resume is only offered from \(fitFloor) up, so none is offered here. The verdicts below say why."
}
