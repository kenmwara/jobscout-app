import Foundation
import SwiftUI

// ── Tracker: per device, no accounts ────────────────────────────────────────
// Stored in UserDefaults under "jobscout.tracker" as the same JSON the web and
// Android clients write: {"v":1,"items":{"<postingId>":{…}}}.

struct Stage: Identifiable { let id: String, label: String }

let stages = [
    Stage(id: "survivor", label: "Gate survivor"),
    Stage(id: "applied", label: "Applied"),
    Stage(id: "pending", label: "Pending"),
    Stage(id: "responded", label: "Responded"),
    Stage(id: "interviewed", label: "Interviewed"),
    Stage(id: "callback", label: "Callback"),
    Stage(id: "declined", label: "Declined"),   // a no is an outcome; the set had no way to say it
]

func stageLabel(_ id: String) -> String {
    stages.first { $0.id == id }?.label ?? "Gate survivor"
}

func nowISO() -> String { ISO8601DateFormatter().string(from: Date()) }

struct Tracked: Codable, Identifiable {
    var id = ""
    var title = ""
    var company = ""
    var url = ""
    var fit = 0
    var stage = "survivor"
    var updated = ""
}

struct TrackerStore: Codable {
    var v = 1
    var items: [String: Tracked] = [:]
}

/// Current stage as an info-tinted pill; tapping opens the six-stage menu.
struct StageMenu: View {
    let stage: String
    let onSelect: (String) -> Void

    var body: some View {
        Menu {
            ForEach(stages) { s in
                Button(s.label) { onSelect(s.id) }
            }
        } label: {
            Text(stageLabel(stage) + " ▾")
                .font(sans(13.5, .medium)).lineLimit(1)
                .foregroundColor(midnightViolet)
                .padding(.horizontal, 17).padding(.vertical, 9)
                .background(info).clipShape(Capsule())
        }
    }
}

struct TrackerView: View {
    @ObservedObject var vm: DemoVM
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var confirmClear = false
    @State private var savedOpen = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                HStack {
                    BearingPill(bearing: "270", label: "SAVED")
                    Spacer()
                    PillButton(text: "Close") { dismiss() }
                }
                Text("Saved jobs").font(serif(27)).foregroundColor(ink).padding(.top, 2)
                Text("Kept on this device only. You click Apply — JobScout never does.")
                    .font(sans(14)).foregroundColor(muted).lineSpacing(4)

                if vm.tracker.isEmpty {
                    Text("Nothing saved yet — tap Save on a score to keep it.")
                        .font(sans(14)).foregroundColor(text3).padding(.top, 8)
                }
                // A few, then the rest behind a tap - an unbounded saved list
                // is the thing that made this unreadable in the first place.
                let all = vm.tracker.values.sorted { $0.fit > $1.fit }
                ForEach(savedOpen ? all : Array(all.prefix(savedShown))) { row($0) }
                if all.count > savedShown {
                    PillButton(text: savedOpen ? "show fewer" : "show the other \(all.count - savedShown)") {
                        savedOpen.toggle()
                    }
                }
                if !vm.tracker.isEmpty {
                    LinkText(text: "Clear all", color: emberDeep) { confirmClear = true }
                }
            }
            .padding(.horizontal, 16).padding(.top, 20).padding(.bottom, 40)
        }
        .background(ZStack { canvasBg; Dots() }.ignoresSafeArea())
        .confirmationDialog("Clear saved jobs?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Clear all", role: .destructive) { vm.clearTracker() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Removes all \(vm.tracker.count) saved postings from this device.")
        }
    }

    private func row(_ t: Tracked) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 12) {
                (Text(t.title.isEmpty ? t.id : t.title).fontWeight(.medium)
                    + Text(t.company.isEmpty ? "" : " · \(t.company)").foregroundColor(muted))
                    .font(sans(15)).foregroundColor(ink).lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("\(t.fit)").font(serif(24)).foregroundColor(band(t.fit).1)
            }
            HStack(spacing: 8) {
                StageMenu(stage: t.stage) { vm.setStage(t.id, $0) }
                if let u = URL(string: t.url), !t.url.isEmpty {
                    PillButton(text: "View posting ↗") { openURL(u) }
                }
                Spacer(minLength: 0)
                LinkText(text: "remove ×", color: text3) { vm.untrack(t.id) }
            }
            .padding(.top, 14)
        }
        .padding(16)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .warmShadow()
    }
}
