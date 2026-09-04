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

/// Current stage as a label; tapping opens the six-stage menu.
struct StageMenu: View {
    let stage: String
    let onSelect: (String) -> Void

    var body: some View {
        Menu {
            ForEach(stages) { s in
                Button(s.label) { onSelect(s.id) }
            }
        } label: {
            Text(stageLabel(stage))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(violetDeep)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(violet.opacity(0.12))
                .cornerRadius(8)
        }
    }
}

struct TrackerView: View {
    @ObservedObject var vm: DemoVM
    @Environment(\.dismiss) private var dismiss
    @State private var confirmClear = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Saved on this device only — nothing is sent anywhere. Applying happens on the employer's site; JobScout never submits for you.")
                        .font(.system(size: 12)).foregroundColor(muted)
                }
                if vm.tracker.isEmpty {
                    Text("Nothing tracked yet — run a sweep and the scored postings land here.")
                        .font(.system(size: 13)).foregroundColor(muted)
                }
                ForEach(stages) { st in
                    let items = vm.tracker.values.filter { $0.stage == st.id }.sorted { $0.fit > $1.fit }
                    if !items.isEmpty {
                        Section("\(st.label) (\(items.count))") {
                            ForEach(items) { row($0) }
                        }
                    }
                }
            }
            .navigationTitle("Your pipeline")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Clear all", role: .destructive) { confirmClear = true }
                        .disabled(vm.tracker.isEmpty)
                }
            }
            .confirmationDialog("Clear the tracker?", isPresented: $confirmClear, titleVisibility: .visible) {
                Button("Clear all", role: .destructive) { vm.clearTracker() }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func row(_ t: Tracked) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t.title.isEmpty ? t.id : t.title)
                .font(.system(size: 15, weight: .semibold)).foregroundColor(ink)
            Text(t.company.isEmpty ? "fit \(t.fit)" : "\(t.company) · fit \(t.fit)")
                .font(.system(size: 12)).foregroundColor(muted)
            HStack(spacing: 14) {
                StageMenu(stage: t.stage) { vm.setStage(t.id, $0) }
                if let u = URL(string: t.url), !t.url.isEmpty {
                    Link("View posting ↗", destination: u)
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(violetDeep)
                }
                Spacer()
                Button("Remove", role: .destructive) { vm.untrack(t.id) }
                    .font(.system(size: 13))
            }
            .buttonStyle(.borderless)  // else the whole List row swallows every tap
        }
        .padding(.vertical, 4)
    }
}
