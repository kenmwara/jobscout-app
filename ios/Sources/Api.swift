import Foundation

/// Same worker API the web demo speaks — the app is another client of it.
let apiBase = URL(string: "https://jobscout-app-api.kenmwara.workers.dev")!

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
}

struct Counts: Codable { var pass = 0; var reject = 0 }

struct Feed: Codable {
    var day: String?
    var generated_utc = ""
    // The published feed is a single postings[] array; each item carries a
    // gate.verdict of "pass"/"reject". Split it client-side, same as the web demo.
    var postings: [Posting] = []
    var counts = Counts()
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

    static func feed() async throws -> Feed {
        let (data, _) = try await URLSession.shared.data(from: apiBase.appendingPathComponent("api/feed"))
        return try JSONDecoder().decode(Feed.self, from: data)
    }

    static func score(profile: String, postings: [Posting]) async throws -> ScoreResponse {
        struct Body: Encodable { let profile: String; let postings: [Posting] }
        return try await post("api/score", Body(profile: profile, postings: postings))
    }

    static func letter(profile: String, posting: Posting) async throws -> LetterResponse {
        struct Body: Encodable { let profile: String; let posting: Posting }
        return try await post("api/letter", Body(profile: profile, posting: posting))
    }
}
