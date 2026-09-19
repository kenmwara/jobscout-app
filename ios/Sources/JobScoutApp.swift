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
 letter, the candidate's own resume rebuilt for this job, and the employer's
 screening questions answered from the profile — each asked for separately,
 because each costs a call and not everyone wants all three.
 */
struct Apply {
    let posting: Posting
    let fit: Int
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
    @Published var error: String?
    @Published var uploading = false
    @Published var uploadStatus: String?
    @Published var tracker: [String: Tracked] = [:]

    private let trackerKey = "jobscout.tracker"

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
    static let noResume = "Add your resume above — upload a file, or paste the text."


    func load() async {
        loadTracker()
        error = nil
        do { feed = try await Api.feed(market: market) }
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
        await load()
    }

    func run() async {
        guard let feed, phase != .gates, phase != .scoring else { return }
        guard let profile = profileText else { banner = Self.noResume; return }
        let sel = select(profile: profile, feed: feed, home: home, remoteOnly: remoteOnly)
        Api.ev("run", sel.sector, market: market)
        selection = sel
        phase = .gates; gatesShown = 0; scores = []; meta = nil; banner = nil; fromCache = false
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

    // MARK: - The application page

    func openApply(_ posting: Posting) {
        let fit = scores.first(where: { $0.id == posting.id })?.fit ?? 0
        Api.ev("apply_open", band(fit).0, market: market)
        apply = Apply(posting: posting, fit: fit)
    }

    func closeApply() { apply = nil }

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
        Api.ev(name, market: market)
        apply?[keyPath: keyPath] = Step(busy: true)
        do {
            let (data, why) = try await call(profile, a.posting, a.fit)
            // The page can be closed, or another posting opened, while a call is in
            // flight — only write back if this is still the same application.
            guard apply?.posting.id == a.posting.id else { return }
            apply?[keyPath: keyPath] = Step(data: data, error: why)
        } catch {
            guard apply?.posting.id == a.posting.id else { return }
            apply?[keyPath: keyPath] = Step(error: "That call didn't get through: \(error.localizedDescription)")
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
    var body: some Scene {
        WindowGroup { ContentView() }
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

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                header
                // Retry path for a failed first load - without this the only fix
                // is force-quitting the app.
                if let e = vm.error {
                    bannerView(e) { Task { await vm.load() } }
                }

                hero

                StageHeading(bearing: "000", label: "THE CANDIDATE", title: "Start with your resume.",
                             note: "Upload a file, or paste the text.")
                HStack(spacing: 8) {
                    ForEach(markets, id: \.0) { id, label in
                        PillButton(text: label, filled: id == vm.market) { Task { await vm.setMarket(id) } }
                    }
                    Spacer(minLength: 0)
                }
                ownResumeBox
                whereRow
                runButton

                if !vm.scores.isEmpty || vm.banner != nil {
                    StageHeading(bearing: "090", label: "SCORING", title: "What Claude makes of them",
                                 note: vm.selection?.note ?? "A fit from 0 to 100, a verdict in plain words, the strongest point and the weakest. The rose lights with the score.")
                    if let b = vm.banner { bannerView(b) }
                    let byId = Dictionary(uniqueKeysWithValues: (vm.feed?.passers ?? []).map { ($0.id, $0) })
                    let sorted = vm.scores.sorted { $0.fit > $1.fit }
                    // Below the floor nothing is recommended: say so, name the nearest, and draft nothing.
                    if let top = sorted.first, top.fit < fitFloor {
                        bannerView(nofitNote(fit: top.fit, posting: byId[top.id], id: top.id))
                    }
                    ForEach(Array(sorted.enumerated()), id: \.element.id) { i, s in
                        // Every card that clears the bar offers the page, not only the
                        // top one: the second-best match is a real application too.
                        // Below the floor it offers the posting alone, because every
                        // step behind that page would be refused.
                        scoreCard(s, posting: byId[s.id], first: i == 0,
                                  canApply: !vm.fromCache && s.fit >= fitFloor)
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
        .background(ZStack { canvasBg; Dots() }.ignoresSafeArea())
        .sheet(isPresented: $showTracker) { TrackerView(vm: vm) }
        .task { Api.ev("open", market: vm.market); await vm.load() }
        .sheet(isPresented: .init(get: { vm.apply != nil },
                                  set: { if !$0 { vm.closeApply() } })) {
            ApplyView(vm: vm)
        }
    }

    /// The floating pill navigation: mark, wordmark, live chip, saved.
    private var header: some View {
        HStack(spacing: 10) {
            Mark()
            Text("JobScout").font(serif(21)).foregroundColor(ink).tracking(-0.2)
            if vm.feed != nil { liveChip }
            Spacer()
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
            LinkText(text: ownOpen ? "Hide the resume box" : "Add your resume") { ownOpen.toggle() }
            if ownOpen {
                HStack(spacing: 10) {
                    if vm.uploading { ProgressView().tint(indigo) }
                    PillButton(text: vm.uploading ? "Extracting…" : "Upload resume (PDF, DOCX, TXT)",
                               enabled: !vm.uploading) { importing = true }
                }
                if let st = vm.uploadStatus {
                    Text(st).font(sans(12)).foregroundColor(muted)
                }
                ZStack(alignment: .topLeading) {
                    if vm.resume.isEmpty {
                        Text("Paste plain resume text (max 6,000 chars)…").font(sans(15)).foregroundColor(text3)
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
                Text((vm.usingOwn ? "Using your own resume for this run. " : "") + "Processed in memory for this run only. Never stored, never logged.")
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
                .background(busy ? lavender : indigo)
                .foregroundColor(busy ? midnightViolet : .white)
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
                    if !s.strongest.isEmpty {
                        Text("+ \(s.strongest)").font(sans(13, .medium)).foregroundColor(meadow).padding(.top, 2)
                    }
                    if !s.weakest.isEmpty {
                        Text("− \(s.weakest)").font(sans(13, .medium)).foregroundColor(emberDeep)
                    }
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
