import Foundation
import SwiftUI
import UniformTypeIdentifiers

/// How many gate verdicts stream before the rest go behind a tap. Matches the web.
let gateStream = 6
/// How many saved jobs list before the rest go behind a tap. Matches the web.
let savedShown = 4

struct Persona: Identifiable {
    let id: String, name: String, desc: String, profile: String
}

// Same three personas as the web demo — one candidate lens per run.
let personas = [
    Persona(id: "maya", name: "Maya — Senior Platform Engineer",
        desc: "Vancouver · Canadian PR · remote-only · Python/TypeScript, Cloudflare, LLM orchestration",
        profile: "Senior platform engineer in Vancouver, BC (Canadian PR; no US work authorization — US roles must allow remote-from-Canada). 8 years: Python, TypeScript, Cloudflare Workers/D1, DigitalOcean, FastAPI, nginx. Builds and operates LLM-orchestrated production systems (Claude API) end-to-end solo: trading platform, audit pipelines, edge APIs. Wants: senior/staff platform or AI-infrastructure roles, fully remote."),
    Persona(id: "dev", name: "Dev — New-grad SWE",
        desc: "Toronto · React/Node internships · hybrid OK · first full-time role",
        profile: "New-grad software engineer in Toronto, ON (Canadian citizen). BSc CS 2026. Two internships: React/Next.js front-end at a fintech, Node/Express APIs at a startup. Comfortable with TypeScript, Postgres, basic AWS. Looking for: junior/new-grad full-stack or front-end roles, Toronto hybrid or remote-Canada."),
    Persona(id: "ingrid", name: "Ingrid — Data Scientist",
        desc: "Berlin · EU work auth · Python/ML · remote EU or hybrid Berlin",
        profile: "Data scientist in Berlin, Germany (EU work authorization only). 5 years: Python, pandas, scikit-learn, PyTorch, SQL, dbt; production ML for churn and pricing at a marketplace. Strong experimentation/causal inference. Looking for: senior data science or ML engineer roles, remote within EU or hybrid Berlin. No relocation."),
]

// The Kenya market (2026-09-15): the same sweep re-gated for a hire based in Kenya,
// its own candidates and rubric. One app, one bundle; the market is a switch.
let personasKE = [
    Persona(id: "wanjiru", name: "Wanjiru — Software Developer (graduate)",
        desc: "Nairobi · BSc CS 2025 · Ajira-trained · Python/JS/SQL",
        profile: "Software developer in Nairobi, Kenya (Kenyan citizen; remote-only; East Africa Time, UTC+3). BSc Computer Science 2025, University of Nairobi. Ajira Digital web-development track. Two internships: Django/PostgreSQL back-end at a fintech startup, React front-end at a digital agency. Python, JavaScript, SQL, Git, basic AWS. Looking for: junior or entry-level software, QA or support-engineering roles, fully remote, contractor or employee."),
    Persona(id: "brian", name: "Brian — Customer Support Specialist",
        desc: "Nakuru · 3 yrs remote support · Zendesk/Intercom · English + Swahili",
        profile: "Customer support specialist in Nakuru, Kenya (remote-only; East Africa Time, UTC+3). 3 years of remote support for a US SaaS company via Upwork and for a Kenyan BPO: Zendesk, Intercom, HubSpot; email, chat and phone; CSAT 96%. Ajira Digital certified virtual assistant. Fluent English and Swahili. Looking for: remote customer support, customer success or virtual-assistant roles covering EMEA or US-morning hours."),
    Persona(id: "amina", name: "Amina — Accountant",
        desc: "Mombasa · CPA-K · QuickBooks/Xero · remote bookkeeping",
        profile: "Accountant in Mombasa, Kenya (CPA-K; remote-only; East Africa Time, UTC+3). 6 years: bookkeeping, month-end close, payroll, VAT and tax filings; QuickBooks Online, Xero, Excel, Google Sheets. Two years of remote bookkeeping for UK and Kenyan small businesses. Looking for: remote accounting, bookkeeping or finance-operations roles; contractor arrangements are fine."),
]
let markets = [("ca", "Canada"), ("ke", "Kenya")]
func personasFor(_ market: String) -> [Persona] { market == "ke" ? personasKE : personas }

enum Phase { case idle, gates, scoring, done }

@MainActor
final class DemoVM: ObservableObject {
    @Published var feed: Feed?
    @Published var personaIdx = -1          // nothing chosen on open (2026-09-17); -1 = no persona
    @Published var market = "ca"
    @Published var resume = ""          // pasted resume text — in-memory only, never persisted
    @Published var phase = Phase.idle
    @Published var gatesShown = 0
    @Published var scores: [Score] = []
    @Published var meta: Meta?
    @Published var fromCache = false
    @Published var banner: String?
    @Published var selection: Selection?   // which postings met Claude, and why (sector + counts)
    @Published var letterText: String?
    @Published var letterBusy = false
    @Published var letterTitle = "Grounded cover letter"
    @Published var error: String?
    @Published var uploading = false
    @Published var uploadStatus: String?
    @Published var tracker: [String: Tracked] = [:]

    private let trackerKey = "jobscout.tracker"

    /// Same rule as the web demo: pasted text wins once it is longer than 40 chars, else the persona.
    var usingOwn: Bool { resume.trimmingCharacters(in: .whitespacesAndNewlines).count > 40 }
    var profileText: String? {
        let own = resume.trimmingCharacters(in: .whitespacesAndNewlines)
        if own.count > 40 { return own }
        let ps = personasFor(market)
        return ps.indices.contains(personaIdx) ? ps[personaIdx].profile : nil
    }
    /// Run with nothing chosen. Same words as the web page.
    static let noCandidate = "Choose a candidate above, or upload your resume, and the pipeline scores this morning's postings against it."


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
        market = m; personaIdx = -1; feed = nil; phase = .idle; scores = []; banner = nil
        await load()
    }

    func run() async {
        guard let feed, phase != .gates, phase != .scoring else { return }
        guard let profile = profileText else { banner = Self.noCandidate; return }
        let sel = select(profile: profile, feed: feed)
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

    func draftLetter(_ posting: Posting) async {
        guard let profile = profileText else { return }
        letterBusy = true; letterText = nil; letterTitle = "Grounded cover letter"
        do {
            let fit = scores.first(where: { $0.id == posting.id })?.fit ?? 0
            let r = try await Api.letter(profile: profile, posting: posting, fit: fit)
            letterText = (r.breaker || r.error != nil) ? (r.detail ?? "Unavailable.") : r.letter
        } catch {
            letterText = "Letter failed: \(error.localizedDescription)"
        }
        letterBusy = false
    }

    /// The resume helper shares the letter sheet: same guards, same grounding, one more section.
    func tailorResume(_ posting: Posting) async {
        guard let profile = profileText else { return }
        letterBusy = true; letterText = nil; letterTitle = "Tailored resume"
        do {
            let fit = scores.first(where: { $0.id == posting.id })?.fit ?? 0
            let r = try await Api.tailor(profile: profile, posting: posting, fit: fit)
            if r.breaker || r.error != nil { letterText = r.detail ?? "Unavailable." } else {
                var t = r.summary
                if !r.bullets.isEmpty { t += "\n\nEXPERIENCE, AIMED AT THIS POSTING\n" + r.bullets.map { "• " + $0 }.joined(separator: "\n") }
                t += "\n\nWHAT THE POSTING ASKS FOR THAT THE PROFILE DOES NOT SAY\n"
                t += r.gaps.isEmpty ? "Nothing — the profile covers what the posting asks for."
                                    : r.gaps.map { "– \($0.asks): \($0.note)" }.joined(separator: "\n")
                t += "\n\nReworded from the profile only, nothing added. The gaps are yours to fill, and only if true."
                letterText = t
            }
        } catch {
            letterText = "Tailoring failed: \(error.localizedDescription)"
        }
        letterBusy = false
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
    @State private var ownOpen = false
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

                StageHeading(bearing: "000", label: "THE CANDIDATE", title: "Start with a candidate.",
                             note: "Three profiles or your own resume. Same jobs, different scores.")
                HStack(spacing: 8) {
                    ForEach(markets, id: \.0) { id, label in
                        PillButton(text: label, filled: id == vm.market) { Task { await vm.setMarket(id) } }
                    }
                    Spacer(minLength: 0)
                }
                ForEach(Array(personasFor(vm.market).enumerated()), id: \.element.id) { i, p in
                    personaCard(p, index: i, selected: i == vm.personaIdx && !vm.usingOwn)
                        .onTapGesture { vm.personaIdx = i }
                }
                ownResumeBox
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
                        scoreCard(s, posting: byId[s.id], first: i == 0, showLetter: i == 0 && !vm.fromCache && s.fit >= fitFloor)
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
        .task { await vm.load() }
        .sheet(isPresented: .init(get: { vm.letterBusy || vm.letterText != nil },
                                  set: { if !$0 { vm.letterText = nil; vm.letterBusy = false } })) {
            letterSheet
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
    private var ownResumeBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            LinkText(text: ownOpen ? "Hide resume box" : "or use your own resume") { ownOpen.toggle() }
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

    private var letterSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(vm.letterTitle).font(serif(24)).foregroundColor(ink)
            if vm.letterBusy {
                HStack(spacing: 12) {
                    ProgressView().tint(indigo)
                    Text("Drafting from the profile only — it cannot invent experience…")
                        .font(sans(15)).foregroundColor(muted)
                }
            } else {
                ScrollView { Text(vm.letterText ?? "").font(sans(15)).foregroundColor(ink).lineSpacing(6) }
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(canvasBg)
        .presentationDetents([.medium, .large])
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

    private func personaCard(_ p: Persona, index: Int, selected: Bool) -> some View {
        let (hue, ground) = personaHues[index % personaHues.count]
        return VStack(alignment: .leading, spacing: 2) {
            MiniRose(selected: selected, tint: hue).padding(.bottom, 8)
            Text(p.name).font(sans(15, .medium)).foregroundColor(ink)
            Text(p.desc).font(sans(13)).foregroundColor(muted).lineSpacing(3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(selected ? ground : cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(selected ? hue : hairline, lineWidth: selected ? 1.5 : 1))
        .warmShadow(selected ? 16 : 0, y: selected ? 8 : 0)
        .contentShape(Rectangle())
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

    private func scoreCard(_ s: Score, posting: Posting?, first: Bool, showLetter: Bool) -> some View {
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
            // The two Claude drafts get their own row: four pills do not fit a phone's width.
            if showLetter, let posting {
                HStack(spacing: 8) {
                    PillButton(text: "Draft a letter", filled: true) { Task { await vm.draftLetter(posting) } }
                    PillButton(text: "Tailor the resume", filled: true) { Task { await vm.tailorResume(posting) } }
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
