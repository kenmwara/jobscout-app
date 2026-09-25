import Foundation

/// Same worker API the web demo speaks — the app is another client of it.
let apiBase = URL(string: "https://jobscout-app-api.kenmwara.workers.dev")!

/// Random per launch, in memory only: it links the steps of one session and nothing else.
let evSid = String((0..<12).map { _ in "abcdefghijklmnopqrstuvwxyz0123456789".randomElement()! })

struct Gate: Codable { var verdict = ""; var reason = "" }

struct Posting: Codable, Identifiable {
    var id = ""
    var title = ""
    var company = ""
    var location = ""
    var remote_policy = ""
    var salary = ""
    var url = ""
    var summary = ""
    var source = ""
    var gate = Gate()
    var sector: String?          // from the feed's lexicon (tools/sector.py); optional so an older feed still decodes
    var places: [String]?        // province codes the location names; empty or absent = unpinnable
}

struct Counts: Codable { var pass = 0; var reject = 0 }

struct PlaceOption: Codable, Identifiable {
    var code = ""; var label = ""; var local = 0
    var id: String { code }
}

/// remote = takeable from any of them; unplaced = requires being somewhere but names no province.
struct PlacesInfo: Codable { var remote = 0; var unplaced = 0; var options: [PlaceOption] = [] }

struct Feed: Codable {
    var day: String?
    var generated_utc = ""
    // The published feed is a single postings[] array; each item carries a
    // gate.verdict of "pass"/"reject". Split it client-side, same as the web demo.
    var postings: [Posting] = []
    var counts = Counts()
    var lexicon: [String: [String]]?   // sector -> phrases; classifies the profile client-side
    var labels: [String: String]?
    var places: PlacesInfo?      // the picker's whole vocabulary, counted by the publisher
    var passers: [Posting] { postings.filter { $0.gate.verdict != "reject" } }
    var rejects: [Posting] { postings.filter { $0.gate.verdict == "reject" } }
}

struct Score: Codable, Identifiable {
    var id = ""
    var fit = 0
    var verdict = ""
    var strongest = ""
    var weakest = ""
}

struct Meta: Codable {
    var model = ""
    var cost_usd = 0.0
    var day_spend_usd = 0.0
    var day_budget_usd = 0.0
}

struct CachedRun: Codable { var scores: [Score] = []; var meta: Meta? }

struct ScoreResponse: Codable {
    var scores: [Score] = []
    var meta: Meta?
    var breaker = false
    var cached: CachedRun?
    var error: String?
    var detail: String?
}

struct LetterResponse: Codable {
    var letter = ""
    var meta: Meta?
    var breaker = false
    var error: String?
    var detail: String?
}

/// /api/tailor — the profile reworded toward one posting, plus the gaps to fill only if true.
struct Gap: Codable { var asks = ""; var note = "" }
struct TailorResponse: Codable {
    var summary = ""
    var bullets: [String] = []
    var gaps: [Gap] = []
    var meta: Meta?
    var breaker = false
    var error: String?
    var detail: String?
}

/* /api/resume — the whole resume rewritten for one posting.

   Not /api/tailor's summary-and-bullets: this is every role, school and certificate
   the profile contains, reordered and reworded for this job, so each application
   carries a different document. The worker refuses a draft naming an employer, date,
   number or tool the profile does not, so a 200 here is already grounded. `gaps` sit
   OUTSIDE the document deliberately — they are what the resume does not say, and only
   the candidate may add them. */
struct ResumeItem: Codable {
    var title = ""
    var meta = ""
    var bullets: [String] = []
}

struct ResumeSection: Codable {
    var heading = ""
    var items: [ResumeItem] = []
}

struct ResumeResponse: Codable {
    var name = ""
    var contact = ""
    var headline = ""
    var sections: [ResumeSection] = []
    var gaps: [Gap] = []
    var meta: Meta?
    var breaker = false
    var error: String?
    var invented: [String] = []   // error == "ungrounded": what it tried to add
    var detail: String?
}

/* /api/answers — the employer's own screening questions.

   Greenhouse and Ashby both publish a job's form with no key, so the questions can be
   read and answered before the posting is opened. Two classes are shown and never
   drafted: anything personal (demographics, salary, criminal history, citizenship) and
   plain identity fields — `why` says which. `unsupported` means the board does not
   publish, which is not a failure. */
struct Question: Codable, Identifiable {
    var label = ""
    var required = false
    var type = ""
    var options: [String] = []
    var answer = ""
    var from = ""     // the phrase in the profile that establishes it
    var why = ""      // set when it is the candidate's to answer
    var id: String { label }
}

struct AnswersResponse: Codable {
    var source = ""
    var url = ""
    var questions: [Question] = []
    var drafted = 0
    var unsupported = false
    var host = ""
    var meta: Meta?
    var breaker = false
    var error: String?
    var detail: String?
}

/// /api/extract — every field optional because the error shapes (413/415/422)
/// carry only error+detail.
struct ExtractResponse: Codable {
    var text: String?
    var chars: Int?
    var kind: String?
    var error: String?
    var detail: String?
}

enum Api {
    private static func post<B: Encodable, R: Decodable>(_ path: String, _ body: B) async throws -> R {
        var req = URLRequest(url: apiBase.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONEncoder().encode(body)
        req.timeoutInterval = 120  // 8 sequential live LLM calls behind /api/score
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(R.self, from: data)
    }

    /// One counted step. The same names the web page sends; the worker drops anything not on
    /// its list. No resume, no posting, no device id, no address, and `evSid` is random per
    /// launch and never written to disk. Fire and forget: a counter must never fail a screen.
    static func ev(_ name: String, _ detail: String? = nil, market: String = "ca") {
        #if targetEnvironment(simulator)
        return  // the simulator is where our own harness drives the app; it is not a visitor (2026-09-25)
        #endif
        var req = URLRequest(url: apiBase.appendingPathComponent("api/ev"))
        req.httpMethod = "POST"
        // text/plain keeps this a simple request, matching the page (see site/index.html)
        req.setValue("text/plain", forHTTPHeaderField: "content-type")
        var payload: [String: String] = ["n": name, "m": market, "s": "ios", "sid": evSid]
        if let d = detail { payload["d"] = String(d.prefix(48)) }
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        URLSession.shared.dataTask(with: req).resume()
    }

    static func feed(market: String = "ca") async throws -> Feed {
        let url = URL(string: "api/feed?market=\(market)", relativeTo: apiBase)!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode(Feed.self, from: data)
    }

    static func score(profile: String, postings: [Posting], market: String = "ca") async throws -> ScoreResponse {
        struct Body: Encodable { let profile: String; let postings: [Posting]; let market: String }
        return try await post("api/score", Body(profile: profile, postings: postings, market: market))
    }

    /* The worker refuses fit < fitFloor unless `stretch` says the candidate
       asked anyway — and with it the letter argues their case from what they
       have actually done rather than refusing. Derived from the fit here, not
       threaded through four signatures: below the floor the only route to the
       application page is that opt-in, so a below-floor fit at this point
       already IS the anyway. */
    private struct DraftBody: Encodable {
        let profile: String; let posting: Posting; let fit: Int; let stretch: Bool
        init(_ profile: String, _ posting: Posting, _ fit: Int) {
            self.profile = profile; self.posting = posting; self.fit = fit
            self.stretch = fit < fitFloor
        }
    }

    static func letter(profile: String, posting: Posting, fit: Int) async throws -> LetterResponse {
        return try await post("api/letter", DraftBody(profile, posting, fit))
    }

    static func tailor(profile: String, posting: Posting, fit: Int) async throws -> TailorResponse {
        return try await post("api/tailor", DraftBody(profile, posting, fit))
    }

    static func resume(profile: String, posting: Posting, fit: Int) async throws -> ResumeResponse {
        return try await post("api/resume", DraftBody(profile, posting, fit))
    }

    static func answers(profile: String, posting: Posting, fit: Int) async throws -> AnswersResponse {
        return try await post("api/answers", DraftBody(profile, posting, fit))
    }

    /// Raw file bytes as the request body — the worker extracts text in memory and stores nothing.
    static func extract(_ file: Data, mime: String, filename: String) async throws -> ExtractResponse {
        var req = URLRequest(url: apiBase.appendingPathComponent("api/extract"))
        req.httpMethod = "POST"
        req.setValue(mime, forHTTPHeaderField: "content-type")
        // ASCII-only: a header value must be Latin-1, and only the extension matters to the worker.
        req.setValue(filename.filter { $0.isASCII && !$0.isNewline }, forHTTPHeaderField: "x-filename")
        req.httpBody = file
        req.timeoutInterval = 120
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(ExtractResponse.self, from: data)
    }
}
