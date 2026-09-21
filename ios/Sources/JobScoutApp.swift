import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// How many gate verdicts stream before the rest go behind a tap. Matches the web.
let gateStream = 6
/// How many saved jobs list before the rest go behind a tap. Matches the web.
let savedShown = 4


// The Kenya market (2026-09-15): the same sweep re-gated for a hire based in
// Kenya, with its own rubric. One app, one bundle; the market is a switch.
let markets = [("ca", "Canada"), ("ke", "Kenya")]

enum Phase { case idle, gates, scoring, done }

/// One of the three drafts: not asked for, running, arrived, or refused.
struct Step<T> {
    var busy = false
    var data: T?
    var error: String?
}

/**
 One application, being prepared. Mirrors site/apply.html and Apply.kt: a cover
 letter, the candidate's own résumé rebuilt for this job, and the employer's
 screening questions answered from the profile — each asked for separately,
 because each costs a call and not everyone wants all three.
 */
struct Apply {
    var posting: Posting
    var fit: Int
    var letter = Step<String>()
    var resume = Step<ResumeResponse>()
    var answers = Step<AnswersResponse>()
}

@MainActor
final class DemoVM: ObservableObject {
    @Published var feed: Feed?
    @Published var market = "ca"
    @Published var resume = ""          // pasted resume text — in-memory only, never persisted
    @Published var phase = Phase.idle
    @Published var gatesShown = 0
    @Published var scores: [Score] = []
    @Published var meta: Meta?
    @Published var fromCache = false
    @Published var banner: String?
    @Published var selection: Selection?   // which postings met Claude, and why (sector + counts)
    @Published var home = ""               // province the visitor lives in; "" = anywhere
    @Published var remoteOnly = false
    @Published var apply: Apply?           // the open application page, or none
    /* Drafts survive closing the page. Each one costs a Claude call, so throwing
       three away because someone looked at the posting is expensive in the one
       currency the user actually pays. Keyed by posting; `draftsFor` is the
       resume they were written from, because a letter drafted for one profile
       shown against another is worse than no letter. */
    @Published var drafts: [String: Apply] = [:]
    @Published var draftsFor = ""
    @Published var error: String?
    @Published var uploading = false
    @Published var uploadStatus: String?
    @Published var tracker: [String: Tracked] = [:]
    /* The candidate has said they want to apply below the floor. Per run and
       never persisted: a fresh resume deserves the honest answer first. */
    @Published var stretch = false
    /// Set when the restored run was scored against an earlier day's sweep.
    @Published var runStale: String?

    private let trackerKey = "jobscout.tracker"
    private let runKey = "jobscout.run"

    /* Same rule as the web page: the pasted resume, once it is long enough to be one,
       or nothing. Three fictional candidates used to sit under the button as a
       fallback; they were removed on 2026-09-19 because they asked the visitor to do
       the product's work before it had done any. */
    var usingOwn: Bool { resume.trimmingCharacters(in: .whitespacesAndNewlines).count > 40 }
    var profileText: String? {
        let own = resume.trimmingCharacters(in: .whitespacesAndNewlines)
        return own.count > 40 ? own : nil
    }
    /// Run with no resume. Same words as the web page.
    static let noResume = "Add your résumé above — upload a file, or paste the text."


    func load() async {
        loadTracker()
        // The stored run first, so `market` is the one it belongs to before the
        // feed is asked for; then vetted, once the feed's day is known.
        loadRun()
        error = nil
        do { feed = try await Api.feed(market: market); vetRestoredRun() }
        catch { self.error = Self.friendly(error) }
    }

    /// A phone with no route to the network surfaces a URLError whose description
    /// names the host - which told the reader nothing except that something
    /// internal broke. Name the actual condition instead; anything we cannot
    /// classify keeps its detail, because that one IS worth reporting.
    static func friendly(_ error: Error) -> String {
        guard let e = error as? URLError else {
            return "Feed unavailable: \(error.localizedDescription)"
        }
        switch e.code {
        case .notConnectedToInternet, .cannotFindHost, .cannotConnectToHost,
             .networkConnectionLost, .dataNotAllowed:
            return "No internet connection \u{2014} JobScout can't reach the feed."
        case .timedOut:
            return "The connection timed out. Try again in a moment."
        case .secureConnectionFailed, .serverCertificateUntrusted:
            return "Couldn't establish a secure connection."
        default:
            return "Feed unavailable: \(e.localizedDescription)"
        }
    }

    /// Resume file → worker /api/extract → the same text field a paste fills.
    func importResume(_ file: Data?, mime: String, name: String) async {
        guard let file else {
            uploadStatus = "Couldn't read text from that file — paste the text instead."
            return
        }
        uploading = true; uploadStatus = nil
        do {
            let r = try await Api.extract(file, mime: mime, filename: name)
            if let t = r.text, !t.isEmpty {
                resume = t
                let n = r.chars ?? t.count
                uploadStatus = "✓ \(n.formatted()) characters extracted from \(name) — review, then run"
                    + (n > 6000 ? " (trimmed to 6,000)" : "")
            } else {
                uploadStatus = r.detail ?? r.error ?? "Couldn't read text from that file — paste the text instead."
            }
        } catch {
            uploadStatus = "Upload failed: \(error.localizedDescription)"
        }
        uploading = false
    }

    /// Switching market swaps the feed, the candidates and the rubric; a run in progress is left alone.
    func setMarket(_ m: String) async {
        guard m != market, phase != .gates, phase != .scoring else { return }
        // home is cleared with the market: "Manitoba" means nothing in the Kenya feed.
        Api.ev("open", market: m)
        market = m; home = ""; remoteOnly = false; feed = nil; phase = .idle; scores = []; banner = nil
        stretch = false; runStale = nil; keepRun()
        await load()
    }

    func run() async {
        guard let feed, phase != .gates, phase != .scoring else { return }
        guard let profile = profileText else { banner = Self.noResume; return }
        let sel = select(profile: profile, feed: feed, home: home, remoteOnly: remoteOnly)
        Api.ev("run", sel.sector, market: market)
        selection = sel
        // A new run is a new answer; the opt-in belonged to the resume that earned it.
        phase = .gates; gatesShown = 0; scores = []; meta = nil; banner = nil; fromCache = false
        stretch = false; runStale = nil
        for _ in 0...feed.rejects.count {
            try? await Task.sleep(nanoseconds: 160_000_000)
            gatesShown += 1
        }
        phase = .scoring
        do {
            let r = try await Api.score(profile: profile, postings: sel.postings, market: market)
            if r.breaker {
                banner = r.detail
                scores = r.cached?.scores ?? []
                meta = r.cached?.meta
                fromCache = true
            } else if let err = r.error {
                banner = r.detail ?? err
            } else {
                scores = r.scores
                meta = r.meta
                keepRun()
            }
        } catch {
            banner = "Scoring failed: \(error.localizedDescription)"
        }
        phase = .done
    }

    // ── Tracker ────────────────────────────────────────────────────────────
    /// Keeps one scored posting. This used to run over EVERY score the moment a
    /// run finished, so the tracker filled itself with a list nobody asked for
    /// and nobody could read. Nothing enters it now without a tap.
    func save(_ s: Score, _ p: Posting?) {
        if tracker[s.id] == nil { Api.ev("save", market: market) }
        var t = tracker[s.id] ?? Tracked(id: s.id, stage: "survivor", updated: nowISO())
        t.title = p?.title ?? t.title
        t.company = p?.company ?? t.company
        t.url = p?.url ?? t.url
        t.fit = s.fit
        tracker[s.id] = t
        saveTracker()
    }

    func setStage(_ id: String, _ stage: String) {
        guard var t = tracker[id] else { return }
        // The word alone leaves the device - no title, no company, no id (see site/privacy.html).
        if stage != "survivor" && t.stage != stage { Api.ev("outcome", stage, market: market) }
        t.stage = stage
        t.updated = nowISO()
        tracker[id] = t
        saveTracker()
    }

    func untrack(_ id: String) {
        tracker[id] = nil
        saveTracker()
    }

    func clearTracker() {
        tracker = [:]
        saveTracker()
    }

    private func loadTracker() {
        guard let d = UserDefaults.standard.data(forKey: trackerKey),
              let store = try? JSONDecoder().decode(TrackerStore.self, from: d) else { return }
        tracker = store.items
    }

    private func saveTracker() {
        guard let d = try? JSONEncoder().encode(TrackerStore(items: tracker)) else { return }
        UserDefaults.standard.set(d, forKey: trackerKey)
    }

    // MARK: - The last run

    /* Eight scored postings cost eight Claude calls, and iOS suspends and kills
       apps far more readily than a browser closes a tab. Same store as the
       tracker, same two stamps as the web: the sweep's day, because a run about
       yesterday's postings is describing a market that has moved, and a hash of
       the resume, because a run shown against a resume it was not scored from
       is worse than no run. */
    private struct SavedRun: Codable {
        var day = ""
        var market = "ca"
        var fp = ""
        var profile = ""
        var scores: [Score] = []
    }

    /// The same djb2 the web uses, so the two agree on what "a different résumé" means.
    private func fingerprint(_ text: String) -> String {
        var h: Int32 = 5381
        for u in text.unicodeScalars { h = (h &<< 5) &+ h &+ Int32(truncatingIfNeeded: u.value) }
        return "\(UInt32(bitPattern: h)).\(text.count)"
    }

    func keepRun() {
        if scores.isEmpty { UserDefaults.standard.removeObject(forKey: runKey); return }
        let r = SavedRun(day: feed?.day ?? "", market: market, fp: fingerprint(resume),
                         profile: resume, scores: scores)
        guard let d = try? JSONEncoder().encode(r) else { return }
        UserDefaults.standard.set(d, forKey: runKey)
    }

    func loadRun() {
        guard let d = UserDefaults.standard.data(forKey: runKey),
              let r = try? JSONDecoder().decode(SavedRun.self, from: d),
              !r.scores.isEmpty else { return }
        market = r.market
        resume = r.profile
        scores = r.scores
    }

    /// Judged once the feed is in, because only then is today's date known.
    func vetRestoredRun() {
        guard !scores.isEmpty,
              let d = UserDefaults.standard.data(forKey: runKey),
              let r = try? JSONDecoder().decode(SavedRun.self, from: d) else { return }
        guard r.fp == fingerprint(resume) else {
            UserDefaults.standard.removeObject(forKey: runKey)
            scores = []; runStale = nil
            return
        }
        let day = feed?.day ?? ""
        runStale = (!r.day.isEmpty && !day.isEmpty && r.day != day)
            ? "These matches were scored against \(r.day)\u{2019}s sweep, not today\u{2019}s. Run it again for today\u{2019}s."
            : nil
    }

    // MARK: - The application page

    func openApply(_ posting: Posting) {
        let profile = profileText ?? ""
        let fit = scores.first(where: { $0.id == posting.id })?.fit ?? 0
        Api.ev("apply_open", band(fit).0, market: market)
        // A different resume invalidates every draft at once — they were all
        // written from the old one.
        if draftsFor != profile { drafts = [:]; draftsFor = profile }
        if var kept = drafts[posting.id] {
            // Reuse the drafts, but take the fit from the run that is current.
            kept.posting = posting
            kept.fit = fit
            apply = kept
        } else {
            apply = Apply(posting: posting, fit: fit)
        }
        drafts[posting.id] = apply
    }

    func closeApply() {
        if let a = apply { drafts[a.posting.id] = a }
        apply = nil
    }

    /// Write to one application by POSTING, not to "whatever is on screen". A draft
    /// takes seconds to come back and the page can be closed before it does.
    private func put<T>(_ id: String, _ keyPath: WritableKeyPath<Apply, Step<T>>, _ step: Step<T>) {
        if var stored = drafts[id] ?? (apply?.posting.id == id ? apply : nil) {
            stored[keyPath: keyPath] = step
            drafts[id] = stored
            if apply?.posting.id == id { apply = stored }
        }
    }

    /**
     The three drafts share a shape: mark busy, call, and store either the result or
     one sentence saying why not. A breaker (the day's budget spent) and a refusal
     (the model tried to invent something) both arrive as `detail`, and both are
     worth reading — so neither is swallowed into "unavailable".

     `keyPath` is what keeps this to one function instead of three near-copies: the
     step being filled is the only thing that differs.
     */
    private func draft<T>(
        _ name: String,
        _ keyPath: WritableKeyPath<Apply, Step<T>>,
        _ call: (String, Posting, Int) async throws -> (T?, String?)
    ) async {
        guard let a = apply, let profile = profileText, !a[keyPath: keyPath].busy else { return }
        let id = a.posting.id
        Api.ev(name, market: market)
        put(id, keyPath, Step(busy: true))
        do {
            let (data, why) = try await call(profile, a.posting, a.fit)
            // The page may have been closed while this was in flight. It still
            // lands — against the posting it was asked for, not against whatever
            // happens to be on screen.
            put(id, keyPath, Step(data: data, error: why))
        } catch {
            put(id, keyPath, Step(error: "That call didn't get through: \(error.localizedDescription)"))
        }
    }

    func draftLetter() async {
        await draft("letter", \.letter) { p, post, fit in
            let r = try await Api.letter(profile: p, posting: post, fit: fit)
            if r.breaker || r.error != nil { return (nil, r.detail ?? r.error ?? "Unavailable.") }
            return (r.letter, nil)
        }
    }

    func buildResume() async {
        await draft("tailor", \.resume) { p, post, fit in
            let r = try await Api.resume(profile: p, posting: post, fit: fit)
            if r.breaker || r.error != nil { return (nil, r.detail ?? r.error ?? "Unavailable.") }
            return (r, nil)
        }
    }

    /// `unsupported` is not a failure: it means this employer's board does not publish
    /// its form, which is worth saying plainly rather than showing as an error.
    func readAnswers() async {
        await draft("apply_open", \.answers) { p, post, fit in
            let r = try await Api.answers(profile: p, posting: post, fit: fit)
            if r.unsupported { return (r, nil) }
            if r.breaker || r.error != nil { return (nil, r.detail ?? r.error ?? "Unavailable.") }
            return (r, nil)
        }
    }
}

/// A picked file lives outside the sandbox — the scope must be held across the read.
func readScoped(_ url: URL) -> Data? {
    // false here means the URL simply is not security-scoped (a file already in the container) —
    // that is readable, so only balance the stop when the start actually succeeded.
    let scoped = url.startAccessingSecurityScopedResource()
    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
    return try? Data(contentsOf: url)
}

/// The worker sniffs the kind from content-type first, x-filename second.
func mimeFor(_ ext: String) -> String {
    switch ext {
    case "pdf": return "application/pdf"
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    case "txt": return "text/plain"
    case "md", "markdown": return "text/markdown"
    default: return "application/octet-stream"
    }
}

@main
struct JobScoutApp: App {
    /* Three states, the same three the web resolves with light-dark():
         no stored value -> LIGHT   <- the default, whatever the phone says
         "system"        -> follow the trait collection
         "dark"          -> force dark

       Light is the default deliberately (operator, 2026-09-20): cream and
       Newsreader are the brand, and a first launch lands on them.

       A toggle needs all three, because clearing the stored value is the only
       way to hand control back to the OS. Nothing in the UI sets this yet;
       the mechanism is here so a settings row costs nothing. */
    @AppStorage("jobscout.theme") private var themeChoice: String = ""

    private var forced: ColorScheme? {
        switch themeChoice {
        case "dark": return .dark
        case "system": return nil    // hand it back to the trait collection
        default: return .light       // absent or "light": the default
        }
    }

    var body: some Scene {
        WindowGroup { ContentView().preferredColorScheme(forced) }
    }
}

struct ContentView: View {
    @StateObject private var vm = DemoVM()
    @Environment(\.openURL) private var openURL
    // the resume is the point of the app, so its box is open on arrival
    @State private var ownOpen = true
    @State private var importing = false
    @State private var showTracker = false
    @State private var gatesOpen = false
    /// Which slice of the feed the sweep is showing, if any. Nil is the whole day.
    @State private var sector: String? = nil
    /// The sweep is long; show a screenful until asked for the rest.
    @State private var sweepOpen = false
    /* One scrolling page, so "home" and "back to the résumé box" are anchors
       rather than screens. Held as a closure because the panel and the header
       are both nested inside the reader. */
    @State private var scrollTo: ((String) -> Void)?

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                header
                    .id("top")
                    // `$0` binds to the INNERMOST closure, which is withAnimation's and takes
                    // no arguments — so the id has to be named to reach past it.
                    .onAppear { scrollTo = { id in withAnimation { proxy.scrollTo(id, anchor: .top) } } }
                // Retry path for a failed first load - without this the only fix
                // is force-quitting the app.
                if let e = vm.error {
                    bannerView(e) { Task { await vm.load() } }
                }

                hero

                StageHeading(bearing: "000", label: "THE CANDIDATE", title: "Start with your résumé.",
                             note: "Upload a file, or paste the text.")
                HStack(spacing: 8) {
                    ForEach(markets, id: \.0) { id, label in
                        PillButton(text: label, filled: id == vm.market) { Task { await vm.setMarket(id) } }
                    }
                    Spacer(minLength: 0)
                }
                ownResumeBox.id("resumebox")
                whereRow
                runButton

                feedSection

                if !vm.scores.isEmpty || vm.banner != nil {
                    StageHeading(bearing: "090", label: "SCORING", title: "What Claude makes of them",
                                 note: vm.selection?.note ?? "A fit from 0 to 100, a verdict in plain words, the strongest point and the weakest. The rose lights with the score.")
                    if let b = vm.banner { bannerView(b) }
                    let byId = Dictionary(uniqueKeysWithValues: (vm.feed?.passers ?? []).map { ($0.id, $0) })
                    let sorted = vm.scores.sorted { $0.fit > $1.fit }
                    /* Below the floor the page used to stop at one sentence. The
                       recommendation is unchanged \u{2014} rewrite the resume first
                       \u{2014} but it is a brief now, with the other two things a
                       candidate might reasonably do beside it. */
                    if let top = sorted.first, top.fit < fitFloor {
                        nofitPanel(near: top.fit,
                                   asks: sorted.prefix(3).compactMap { s in
                                       s.weakest.isEmpty ? nil
                                           : (byId[s.id]?.title ?? s.id, s.weakest)
                                   })
                    }
                    if let stale = vm.runStale {
                        Text(stale).font(sans(12)).foregroundColor(text3)
                    }
                    ForEach(Array(sorted.enumerated()), id: \.element.id) { i, s in
                        // Every card that clears the bar offers the page, not only the
                        // top one: the second-best match is a real application too.
                        // Below the floor it offers the page once the candidate has
                        // asked it to, and the letter then argues their case.
                        scoreCard(s, posting: byId[s.id], first: i == 0,
                                  canApply: !vm.fromCache && (s.fit >= fitFloor || vm.stretch))
                    }
                }

                // The receipts, after the results. Six stream; the rest sit
                // behind a tap, because the full list is a wall.
                if vm.phase != .idle, let feed = vm.feed {
                    StageHeading(bearing: "180", label: "GATES", title: "Why those, and not the rest",
                                 note: "Before Claude sees anything, three deterministic checks read every posting. They cost nothing, and each rejection carries its reason.")
                    let shown = gatesOpen ? feed.rejects : Array(feed.rejects.prefix(gateStream))
                    VStack(spacing: 0) {
                        ForEach(Array(shown.enumerated()), id: \.element.id) { i, r in
                            if gatesOpen || i < vm.gatesShown {
                                if i > 0 { Divider().overlay(hairline) }
                                gateRow(r)
                                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                            }
                        }
                    }
                    .background(cardBg)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .warmShadow()
                    .animation(.easeOut(duration: 0.45), value: vm.gatesShown)
                    if feed.rejects.count > gateStream {
                        PillButton(text: gatesOpen ? "hide them again"
                                              : "show the other \(feed.rejects.count - gateStream) verdicts") {
                            gatesOpen.toggle()
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 40)
        }
        .ground()   // law 7: ONE ground, from Ground.swift, never a per-screen fill
        .sheet(isPresented: $showTracker) {
            // THEME.md s15: a sheet is 90% tall with a grab handle; the ground
            // stays visible above it. An explicit surface, never a system
            // material (it would sample the hero and leak market colour).
            TrackerView(vm: vm)
                .presentationDetents([.fraction(0.9)])
                .presentationDragIndicator(.visible)
        }
        .task { Api.ev("open", market: vm.market); await vm.load() }
        .sheet(isPresented: .init(get: { vm.apply != nil },
                                  set: { if !$0 { vm.closeApply() } })) {
            ApplyView(vm: vm)
                .presentationDetents([.fraction(0.9)])
                .presentationDragIndicator(.visible)
        }
        }   // ScrollViewReader
    }

    /* The same key the App struct reads to resolve preferredColorScheme.
       @AppStorage is observable on both sides, so writing it here redraws
       the window's colour scheme without anything else being wired up. */
    @AppStorage("jobscout.theme") private var themeChoice: String = ""

    private var themeLabel: String {
        switch themeChoice {
        case "system": return "Device"
        case "dark": return "Dark"
        default: return "Light"        // absent or "light": the default
        }
    }

    private var themeNext: String {
        switch themeChoice {
        case "": return "system"
        case "system": return "dark"
        default: return ""             // back to the default, stored as empty
        }
    }

    /// The floating pill navigation: mark, wordmark, live chip, saved.
    private var header: some View {
        HStack(spacing: 10) {
            // The wordmark goes home, as the web's does. One target for the mark
            // and the word — two adjacent decorations is not what anyone means
            // by "the logo". Home on one page is the top of it.
            Button { scrollTo?("top") } label: {
                HStack(spacing: 10) {
                    Mark()
                    Text("JobScout").font(serif(21)).foregroundColor(ink).tracking(-0.2)
                }
            }
            .buttonStyle(.plain)
            if vm.feed != nil { liveChip }
            Spacer()
            /* THREE STATES ON ONE CONTROL. A switch cannot express the
               third, and the third - follow the phone - is the one most
               people want; leaving it out is why the mechanism in the App
               struct sat unused since it was written. It names the state it
               is IN and cycles Light, Device, Dark. A word rather than an
               icon: this bar already speaks in words, and a word carries its
               own accessibility label. */
            Button(themeLabel) { themeChoice = themeNext }
                .font(sans(14, .medium)).foregroundColor(muted)
                .buttonStyle(.plain)
            Button("Saved (\(vm.tracker.count))") { showTracker = true }
                .font(sans(14, .medium)).foregroundColor(midnightViolet)
                .buttonStyle(.plain)
        }
        .padding(.leading, 16).padding(.trailing, 16).padding(.vertical, 12)
        .background(cardBg).clipShape(Capsule())
        .warmShadow(16, y: 8)
    }

    private var liveChip: some View {
        HStack(spacing: 6) {
            Circle().fill(forest).frame(width: 6, height: 6)
            Text("live").font(sans(12, .medium)).foregroundColor(meadow)
        }
        .padding(.horizontal, 11).padding(.vertical, 5)
        .background(forest.opacity(0.14)).clipShape(Capsule())
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 10) {
            (Text("Watch an ") + Text("LLM").foregroundColor(indigo) + Text(" read the job market honestly."))
                .font(serif(34)).foregroundColor(ink).tracking(-0.5)
                .fixedSize(horizontal: false, vertical: true)
            Text("Real postings, scored live by Claude. Every reason shown.")
                .font(sans(16)).foregroundColor(muted).lineSpacing(4)
            Text(vm.feed == nil ? "loading today's sweep…"
                 : "today's sweep · \(vm.feed?.passers.count ?? 0) passed the gates · \(vm.feed?.rejects.count ?? 0) did not")
                .font(sans(13)).foregroundColor(text3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 14).padding(.bottom, 4)
    }

    // Same affordance as the web demo: hidden behind a toggle, processed in memory only.
    /// "I'm in <province>" + "Remote only" — the same two controls as the web page, rendered
    /// from feed.places so a province only appears with the postings that really require being
    /// there today.
    @ViewBuilder private var whereRow: some View {
        if let feed = vm.feed, let pl = feed.places, !pl.options.isEmpty {
            let opt = pl.options.first { $0.code == vm.home }
            let whereLabel = opt?.label ?? (vm.market == "ke" ? "anywhere in Kenya" : "anywhere in Canada")
            let all = feed.passers
            let n = all.filter { takeable($0, home: vm.home, remoteOnly: vm.remoteOnly) }.count
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    // One place to choose between is not a choice: the Kenya feed is already gated
                    // to Kenya, so every on-site row there is in Kenya and picking it excludes nothing.
                    if pl.options.count > 1 { Menu {
                        Button(vm.market == "ke" ? "anywhere in Kenya" : "anywhere in Canada") { vm.home = "" }
                        ForEach(pl.options) { o in
                            Button(o.label + (o.local > 0 ? "  \u{2014} \(o.local) local" : "")) { vm.home = o.code }
                        }
                    } label: {
                        PillButton(text: "Work in: \(whereLabel)") { }
                            .allowsHitTesting(false)
                    } }
                    PillButton(text: "Remote only", filled: vm.remoteOnly) { vm.remoteOnly.toggle() }
                    Spacer(minLength: 0)
                }
                let note = noteText(n: n, total: all.count, whereLabel: whereLabel, opt: opt, pl: pl)
                if !note.isEmpty {
                    Text(note).font(sans(12.5)).foregroundColor(muted).lineSpacing(3)
                }
            }
            .padding(.top, 6)
        }
    }

    /// Empty until a control has been used: a count under an untouched filter reads as the
    /// result of a search nobody ran, which is why the page stopped printing one.
    private func noteText(n: Int, total: Int, whereLabel: String, opt: PlaceOption?, pl: PlacesInfo) -> String {
        if vm.home.isEmpty && !vm.remoteOnly { return "" }
        if vm.remoteOnly {
            return "\(n) of \(total) \u{2014} \(whereLabel), remote only"
        }
        var t = "\(n) of \(total) \u{2014} \(whereLabel) \u{00b7} \(pl.remote) remote"
        if let o = opt, o.local > 0 { t += " \u{00b7} \(o.local) on site there" }
        return t
    }

    private var ownResumeBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            LinkText(text: ownOpen ? "Hide the résumé box" : "Add your résumé") { ownOpen.toggle() }
            if ownOpen {
                HStack(spacing: 10) {
                    if vm.uploading { ProgressView().tint(indigo) }
                    PillButton(text: vm.uploading ? "Extracting…" : "Upload résumé (PDF, DOCX, TXT)",
                               enabled: !vm.uploading) { importing = true }
                }
                if let st = vm.uploadStatus {
                    Text(st).font(sans(12)).foregroundColor(muted)
                }
                ZStack(alignment: .topLeading) {
                    if vm.resume.isEmpty {
                        Text("Paste plain résumé text (max 6,000 chars)…").font(sans(15)).foregroundColor(text3)
                            .padding(.horizontal, 14).padding(.vertical, 12)
                    }
                    TextEditor(text: $vm.resume)
                        .font(sans(15))
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .frame(minHeight: 120)
                        .onChange(of: vm.resume) { v in if v.count > 6000 { vm.resume = String(v.prefix(6000)) } }
                }
                .background(cardBg)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(vm.usingOwn ? indigo : hair2, lineWidth: vm.usingOwn ? 2 : 1))
                Text((vm.usingOwn ? "Using your own résumé for this run. " : "") + "Processed in memory for this run only. Never stored, never logged.")
                    .font(sans(12)).foregroundColor(text3)
            }
        }
        .fileImporter(isPresented: $importing,
                      allowedContentTypes: [.pdf, .plainText,
                                            UTType("org.openxmlformats.wordprocessingml.document") ?? .data],
                      allowsMultipleSelection: false) { result in
            guard case .success(let urls) = result, let url = urls.first else { return }
            let data = readScoped(url)
            let name = url.lastPathComponent
            let mime = mimeFor(url.pathExtension.lowercased())
            Task { await vm.importResume(data, mime: mime, name: name) }
        }
    }

    private var runButton: some View {
        let busy = vm.feed == nil || vm.phase == .gates || vm.phase == .scoring
        return Button {
            Task { await vm.run() }
        } label: {
            Text(vm.phase == .gates ? "Running the gates…"
                 : vm.phase == .scoring ? "Scoring live with Claude…"
                 : "Run the pipeline")
                .font(sans(16, .medium))
                .frame(maxWidth: .infinity, minHeight: 54)
                .background(busy ? lavender : ink)
                // Not `.white`: on dark the action inverts to a lavender fill, and
                // white on lavender is 1.9:1. `actionInk` is white on light and
                // deep-ink on dark. The busy fill is lavender in BOTH themes, so its
                // ink is the static one - `midnightViolet` resolves TO lavender on
                // dark, which would have erased the label entirely.
                .foregroundColor(busy ? lavenderInk : canvasBg)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .warmShadow(24, y: 12)
    }

    private func bannerView(_ t: String, onRetry: (() -> Void)? = nil) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t).font(sans(13)).foregroundColor(Color(hex: 0x8A6D00)).lineSpacing(3)
            if let onRetry = onRetry {
                PillButton(text: "Try again", action: onRetry)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(14)
        .background(Color(hex: 0xFFF6DC))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// What the day is MADE of, and then the day. The web's order, and Android's.
    private var feedSection: some View {
        Group {
            if let feed = vm.feed {
                let eligible = feed.passers
                // Posting.sector is optional (an older feed may not carry one) and
                // Feed.labels is too, so both are unwrapped rather than assumed.
                let counted = Dictionary(grouping: eligible.filter { $0.sector != nil },
                                         by: { $0.sector ?? "" })
                    .map { ($0.key, $0.value.count) }
                    .sorted { $0.1 > $1.1 }
                let rows = sector == nil ? eligible : eligible.filter { $0.sector == sector }
                let shown = sweepOpen ? rows : Array(rows.prefix(6))

                StageHeading(bearing: "045", label: "THE FEED",
                             title: "Browse by what the feed actually knows",
                             note: "Every tile is a real slice of today’s sweep. Nothing here is a category we cannot fill.")
                FlowTiles(items: counted.prefix(10).map { ($0.0, feed.labels?[$0.0] ?? $0.0, $0.1) },
                          selected: sector) { tapped in
                    sector = (sector == tapped) ? nil : tapped
                    sweepOpen = false
                }

                StageHeading(bearing: "070", label: "THE SWEEP",
                             title: sector.flatMap { feed.labels?[$0] } ?? "Explore today’s sweep",
                             note: "\(rows.count) of \(feed.postings.count) swept this morning. Tap one to open the posting on the employer’s own site.")
                VStack(spacing: 0) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, p in
                        if i > 0 { Divider().overlay(hairline) }
                        sweepRow(p)
                    }
                }
                .background(cardBg)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .warmShadow()
                if rows.count > 6 {
                    PillButton(text: sweepOpen ? "show fewer"
                                               : "see all \(rows.count)") { sweepOpen.toggle() }
                }
            }
        }
    }

    /// One posting in the sweep. Tapping it opens the employer's page — the only
    /// thing JobScout ever does on your behalf is open a link.
    private func sweepRow(_ p: Posting) -> some View {
        Button {
            if let u = URL(string: p.url) { openURL(u) }
        } label: {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.title).font(sans(14, .medium)).foregroundColor(ink)
                        .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                    Text(p.company).font(sans(12.5)).foregroundColor(text3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                Chip(text: policyWord(p.remote_policy).uppercased(), color: stone, ground: info)
            }
            .padding(.horizontal, 18).padding(.vertical, 13)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(p.url.isEmpty)
    }

    private func gateRow(_ r: Posting) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                (Text(r.title).fontWeight(.medium) + Text(" · \(r.company)"))
                    .font(sans(14)).foregroundColor(text3).strikethrough(true, color: hair2)
                Text(r.gate.reason).font(sans(12.5)).foregroundColor(text3).lineSpacing(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Chip(text: "REJECT", color: stone, ground: info)
        }
        .padding(.horizontal, 18).padding(.vertical, 13)
    }

    /* The below-floor panel: the brief, the quoted asks, and the two routes.

       Every posting in the run already carries the one thing it most wants to
       see, so the list is quoted from the run rather than invented for this
       screen \u{2014} and it is the rewrite list, which is why the first button
       goes back to the resume box rather than forward to an application. */
    @ViewBuilder
    private func nofitPanel(near: Int, asks: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(nofitNote(fit: near, posting: nil, id: ""))
                .font(sans(14)).foregroundColor(muted).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(asks.enumerated()), id: \.offset) { _, a in
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(a.0.uppercased()) \u{2014} WHAT TO ANSWER")
                        .font(sans(10, .medium)).tracking(0.9).foregroundColor(text3)
                        .lineLimit(2)
                    Text(a.1).font(sans(12.5)).foregroundColor(muted).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(canvasBg)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .padding(.top, 10)
            }

            Text(nofitRoutes)
                .font(sans(13)).foregroundColor(muted).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)

            HStack(spacing: 9) {
                PillButton(text: "Rework your résumé", filled: true) {
                    withAnimation { scrollTo?("resumebox") }
                }
                // One way: whoever pressed this wanted it. It resets with the next run.
                if !vm.stretch {
                    PillButton(text: "Apply to these anyway") { vm.stretch = true }
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 14)
        }
        .padding(18)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .warmShadow()
    }

    /* One piece of evidence behind a score. It was a bare green or red sentence
       prefixed "+" or "−" \u{2014} the same information in a voice nothing else in
       the product uses. Same tinted row with a micro-label as the web's popover
       and the phone's card, so a receipt reads the same everywhere. */
    @ViewBuilder
    private func evidenceRow(_ label: String, _ text: String, _ fg: Color,
                             _ rule: Color, _ bodyColor: Color) -> some View {
        if !text.isEmpty {
            HStack(alignment: .top, spacing: 0) {
                // the band, as a rule down the left edge
                Rectangle().fill(rule).frame(width: 2)
                VStack(alignment: .leading, spacing: 4) {
                    Text(label.uppercased())
                        .font(sans(10, .medium)).tracking(0.9).foregroundColor(fg)
                    Text(text).font(sans(12.5)).foregroundColor(bodyColor).lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 11).padding(.trailing, 11).padding(.vertical, 9)
            }
            .background(evidenceBg)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .padding(.top, 5)
        }
    }

    private func scoreCard(_ s: Score, posting: Posting?, first: Bool, canApply: Bool) -> some View {
        let (route, bandColor) = band(s.fit)
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                BearingRose(fit: s.fit, side: 84).padding(.top, 2)
                VStack(alignment: .leading, spacing: 6) {
                    (Text(posting?.title ?? s.id).fontWeight(.medium)
                        + Text(" · \(posting?.company ?? "")").foregroundColor(muted))
                        .font(sans(16)).foregroundColor(ink).lineSpacing(3)
                    Chip(text: route.uppercased(), color: bandColor, ground: bandFill(s.fit).opacity(0.18))
                    Text(s.verdict).font(sans(14)).foregroundColor(muted).lineSpacing(4)
                    /* Section 16, option C: the neutral plus a rule, not
                       a tint across the whole card. */
                    evidenceRow("Strongest", s.strongest, meadow,
                                evidenceRuleStrongest, strongestBody)
                    evidenceRow("What to answer", s.weakest, emberDeep,
                                evidenceRuleAnswer, answerBody)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            // Opening the posting IS how a user applies — the app never submits anything.
            HStack(spacing: 8) {
                // Untracked postings offer to be SAVED; only once kept do
                // they get a stage to move through.
                if vm.tracker[s.id] != nil {
                    StageMenu(stage: vm.tracker[s.id]?.stage ?? "survivor") { vm.setStage(s.id, $0) }
                } else {
                    PillButton(text: "Save", color: muted) { vm.save(s, posting) }
                }
                if let p = posting, !p.url.isEmpty, let u = URL(string: p.url) {
                    PillButton(text: "View posting ↗") { openURL(u) }
                }
                Spacer(minLength: 0)
            }
            .padding(.top, 14)
            // One door instead of two pills. Until 2026-09-19 the card offered "Draft a
            // letter" and "Tailor the resume" side by side, which put the work before the
            // job it was for; the page holds all three steps and the posting they belong to.
            if canApply, let posting {
                HStack(spacing: 8) {
                    PillButton(text: "Prepare application →", filled: true) { vm.openApply(posting) }
                    Spacer(minLength: 0)
                }
                .padding(.top, 8)
            }
        }
        .padding(18)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        // the top card carries the indigo ring the web gives its first score
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(indigo.opacity(first ? 0.16 : 0), lineWidth: 3))
        .warmShadow()
    }
}
