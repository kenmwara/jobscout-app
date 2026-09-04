import Foundation
import SwiftUI
import UniformTypeIdentifiers

// ── Brand kit v1.0 ──────────────────────────────────────────────────────────
let violet = Color(hex: 0x7C5AFF)
let violetDeep = Color(hex: 0x5A3CD2)
let ink = Color(hex: 0x0E0E16)
let muted = Color(hex: 0x6E6E73)
let canvasBg = Color(hex: 0xF5F5F7)
let hairline = Color(hex: 0xE5E5EA)

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

enum Phase { case idle, gates, scoring, done }

@MainActor
final class DemoVM: ObservableObject {
    @Published var feed: Feed?
    @Published var personaIdx = 0
    @Published var resume = ""          // pasted resume text — in-memory only, never persisted
    @Published var phase = Phase.idle
    @Published var gatesShown = 0
    @Published var scores: [Score] = []
    @Published var meta: Meta?
    @Published var fromCache = false
    @Published var banner: String?
    @Published var letterText: String?
    @Published var letterBusy = false
    @Published var error: String?
    @Published var uploading = false
    @Published var uploadStatus: String?
    @Published var tracker: [String: Tracked] = [:]

    private let trackerKey = "jobscout.tracker"

    /// Same rule as the web demo: pasted text wins once it is longer than 40 chars, else the persona.
    var usingOwn: Bool { resume.trimmingCharacters(in: .whitespacesAndNewlines).count > 40 }
    var profileText: String {
        let own = resume.trimmingCharacters(in: .whitespacesAndNewlines)
        return own.count > 40 ? own : personas[personaIdx].profile
    }

    func load() async {
        loadTracker()
        do { feed = try await Api.feed() }
        catch { self.error = "Feed unavailable: \(error.localizedDescription)" }
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

    func run() async {
        guard let feed, phase != .gates, phase != .scoring else { return }
        phase = .gates; gatesShown = 0; scores = []; meta = nil; banner = nil; fromCache = false
        for _ in 0...feed.rejects.count {
            try? await Task.sleep(nanoseconds: 160_000_000)
            gatesShown += 1
        }
        phase = .scoring
        do {
            let r = try await Api.score(profile: profileText,
                                        postings: Array(feed.passers.prefix(8)))
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
        autoTrack()
        phase = .done
    }

    // ── Tracker ────────────────────────────────────────────────────────────
    /// Every scored posting (live or cached) enters as a gate survivor; an
    /// already-tracked one keeps its stage and only refreshes the details.
    private func autoTrack() {
        guard !scores.isEmpty else { return }
        let byId = Dictionary(uniqueKeysWithValues: (feed?.passers ?? []).map { ($0.id, $0) })
        let now = nowISO()
        for s in scores {
            let p = byId[s.id]
            let existing = tracker[s.id]
            var t = existing ?? Tracked(id: s.id, stage: "survivor", updated: now)
            t.title = p?.title ?? t.title
            t.company = p?.company ?? t.company
            t.url = p?.url ?? t.url
            t.fit = s.fit
            tracker[s.id] = t
        }
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
        letterBusy = true; letterText = nil
        do {
            let r = try await Api.letter(profile: profileText, posting: posting)
            letterText = (r.breaker || r.error != nil) ? (r.detail ?? "Unavailable.") : r.letter
        } catch {
            letterText = "Letter failed: \(error.localizedDescription)"
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
    @State private var ownOpen = false
    @State private var importing = false
    @State private var showTracker = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                header
                if let e = vm.error { bannerView(e) }

                sectionLabel("000 · CANDIDATE")
                ForEach(Array(personas.enumerated()), id: \.element.id) { i, p in
                    personaCard(p, selected: i == vm.personaIdx && !vm.usingOwn)
                        .onTapGesture { vm.personaIdx = i }
                }
                ownResumeBox
                runButton

                if vm.phase != .idle, let feed = vm.feed {
                    sectionLabel("090 · GATES BEFORE TOKENS")
                    ForEach(Array(feed.rejects.enumerated()), id: \.element.id) { i, r in
                        if i < vm.gatesShown { gateRow(r) }
                    }
                    if vm.gatesShown > feed.rejects.count {
                        Text("✓ \(feed.passers.count) postings cleared the gates → scoring the top \(min(8, feed.passers.count))")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(hex: 0x34C759))
                    }
                }

                if !vm.scores.isEmpty || vm.banner != nil {
                    sectionLabel("180 · HONEST SCORES")
                    if let b = vm.banner { bannerView(b) }
                    let byId = Dictionary(uniqueKeysWithValues: (vm.feed?.passers ?? []).map { ($0.id, $0) })
                    let sorted = vm.scores.sorted { $0.fit > $1.fit }
                    ForEach(Array(sorted.enumerated()), id: \.element.id) { i, s in
                        scoreCard(s, posting: byId[s.id], showLetter: i == 0 && !vm.fromCache)
                    }
                    if let m = vm.meta {
                        Text("model \(m.model.isEmpty ? "haiku" : m.model) · this run $\(String(format: "%.4f", m.cost_usd)) · today $\(String(format: "%.2f", m.day_spend_usd)) of $\(String(format: "%.2f", m.day_budget_usd)) budget")
                            .font(.system(size: 12)).foregroundColor(muted)
                    }
                }
            }
            .padding(16)
        }
        .background(canvasBg.ignoresSafeArea())
        .sheet(isPresented: $showTracker) { TrackerView(vm: vm) }
        .task { await vm.load() }
        .sheet(isPresented: .init(get: { vm.letterBusy || vm.letterText != nil },
                                  set: { if !$0 { vm.letterText = nil; vm.letterBusy = false } })) {
            letterSheet
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 10) {
                Text("JobScout").font(.system(size: 28, weight: .heavy)).foregroundColor(violetDeep)
                chip("NATIVE", violet)
                Spacer()
                if !vm.tracker.isEmpty {
                    Button("Tracker (\(vm.tracker.count))") { showTracker = true }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(violetDeep)
                }
            }
            Text(vm.feed?.day != nil
                 ? "Real sweep · \(vm.feed!.day!) · \(vm.feed!.passers.count) passers, \(vm.feed!.rejects.count) instructive rejects"
                 : "Loading today's sweep…")
                .font(.system(size: 13)).foregroundColor(muted)
        }
    }

    // Same affordance as the web demo: hidden behind a toggle, processed in memory only.
    private var ownResumeBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(ownOpen ? "Hide resume box" : "…or upload / paste your own resume") { ownOpen.toggle() }
                .font(.system(size: 14)).foregroundColor(violetDeep)
            if ownOpen {
                HStack(spacing: 10) {
                    Button("Upload resume (PDF, DOCX, TXT)") { importing = true }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(violetDeep)
                        .disabled(vm.uploading)
                    if vm.uploading { ProgressView().tint(violet) }
                }
                if let st = vm.uploadStatus {
                    Text(st).font(.system(size: 12)).foregroundColor(muted)
                }
                ZStack(alignment: .topLeading) {
                    if vm.resume.isEmpty {
                        Text("Paste plain resume text (max 6,000 chars)…").foregroundColor(muted)
                            .padding(.horizontal, 14).padding(.vertical, 12)
                    }
                    TextEditor(text: $vm.resume)
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .frame(minHeight: 120)
                        .onChange(of: vm.resume) { v in if v.count > 6000 { vm.resume = String(v.prefix(6000)) } }
                }
                .background(Color.white)
                .cornerRadius(12)
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(vm.usingOwn ? violet : hairline, lineWidth: vm.usingOwn ? 2 : 1))
                Text((vm.usingOwn ? "Using your own resume for this run. " : "") + "Processed in-memory for this one scoring run. Never stored, never logged, never used for anything else. Uploads are extracted in memory and discarded.")
                    .font(.system(size: 12)).foregroundColor(muted)
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
        Button {
            Task { await vm.run() }
        } label: {
            Text(vm.phase == .gates ? "Running the gates…"
                 : vm.phase == .scoring ? "Scoring live with Claude…"
                 : "Run today's real sweep →")
                .font(.system(size: 16, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 52)
                .background(violet)
                .foregroundColor(.white)
                .cornerRadius(14)
        }
        .disabled(vm.feed == nil || vm.phase == .gates || vm.phase == .scoring)
    }

    private var letterSheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Grounded cover letter").font(.headline)
            if vm.letterBusy {
                HStack(spacing: 12) {
                    ProgressView().tint(violet)
                    Text("Drafting from the profile only — it cannot invent experience…")
                }
            } else {
                ScrollView { Text(vm.letterText ?? "").font(.system(size: 15)) }
            }
            Spacer()
        }
        .padding(20)
        .presentationDetents([.medium, .large])
    }

    private func sectionLabel(_ t: String) -> some View {
        Text(t).font(.system(size: 12, weight: .bold)).tracking(1.5)
            .foregroundColor(violetDeep).padding(.top, 12)
    }

    private func bannerView(_ t: String) -> some View {
        Text(t).font(.system(size: 13)).foregroundColor(Color(hex: 0x8A6D00))
            .frame(maxWidth: .infinity, alignment: .leading).padding(12)
            .background(Color(hex: 0xFFF6DC)).cornerRadius(10)
    }

    private func chip(_ t: String, _ c: Color) -> some View {
        Text(t).font(.system(size: 10, weight: .bold)).tracking(1)
            .foregroundColor(c).padding(.horizontal, 8).padding(.vertical, 3)
            .background(c.opacity(0.12)).cornerRadius(6)
    }

    private func personaCard(_ p: Persona, selected: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(p.name).font(.system(size: 15, weight: .semibold)).foregroundColor(ink)
            Text(p.desc).font(.system(size: 13)).foregroundColor(muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.white)
        .cornerRadius(14)
        .overlay(RoundedRectangle(cornerRadius: 14)
            .stroke(selected ? violet : hairline, lineWidth: selected ? 2 : 1))
    }

    private func gateRow(_ r: Posting) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("✕").fontWeight(.bold).foregroundColor(Color(hex: 0x8E8E93))
            VStack(alignment: .leading, spacing: 1) {
                Text("\(r.title) — \(r.company)").font(.system(size: 13, weight: .medium)).foregroundColor(ink)
                Text(r.gate.reason).font(.system(size: 12)).foregroundColor(muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.white)
        .cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(hairline, lineWidth: 1))
    }

    private func scoreCard(_ s: Score, posting: Posting?, showLetter: Bool) -> some View {
        let (route, bandColor) = band(s.fit)
        return HStack(alignment: .top, spacing: 14) {
            BearingDial(fit: s.fit).padding(.top, 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("\(posting?.title ?? s.id) · \(posting?.company ?? "")")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    chip(route.uppercased(), bandColor)
                }
                Text(s.verdict).font(.system(size: 13)).foregroundColor(Color(hex: 0x3A3A3C))
                if !s.strongest.isEmpty {
                    Text("+ \(s.strongest)").font(.system(size: 12)).foregroundColor(Color(hex: 0x34C759))
                }
                if !s.weakest.isEmpty {
                    Text("− \(s.weakest)").font(.system(size: 12)).foregroundColor(Color(hex: 0xFF9500))
                }
                HStack(spacing: 14) {
                    if let p = posting, !p.url.isEmpty, let u = URL(string: p.url) {
                        Link("View posting ↗", destination: u)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(violetDeep)
                    }
                    StageMenu(stage: vm.tracker[s.id]?.stage ?? "survivor") { vm.setStage(s.id, $0) }
                    Spacer()
                }
                .padding(.top, 2)
                if showLetter, let posting {
                    Button("Draft a grounded cover letter →") {
                        Task { await vm.draftLetter(posting) }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(violetDeep)
                }
            }
        }
        .padding(14)
        .background(Color.white)
        .cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(hairline, lineWidth: 1))
    }
}
