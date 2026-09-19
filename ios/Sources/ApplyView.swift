import SwiftUI
import UIKit   // UIPasteboard

/**
 One application, on its own sheet. The iOS half of site/apply.html and Apply.kt.

 Until 2026-09-19 the two Claude drafts were pills on a score card opening a shared
 sheet, which put the writing before the job it was for and let a second draft
 overwrite the first. Here the posting is the page, and the three steps sit under it
 in the order someone actually uses them: the letter, their own resume rebuilt for
 this job, then the questions the employer will ask.

 Nothing here submits anything. It cannot: Greenhouse and Ashby both need the
 EMPLOYER's key to post an application, and Workday needs an account per tenant. The
 ceiling is having every answer ready before the form is opened, which is what this
 screen is for.
 */
struct ApplyView: View {
    @ObservedObject var vm: DemoVM
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        // The sheet's binding clears vm.apply on dismiss, so a nil here is one frame
        // of teardown rather than a state worth drawing.
        if let a = vm.apply {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header
                    posting(a)
                    Text("Three things, each drafted from your resume alone and each one call. "
                         + "JobScout never submits anything \u{2014} you open the employer's form with "
                         + "the answers already written.")
                        .font(sans(14)).foregroundColor(muted).lineSpacing(4)

                    StepPanel(
                        title: "Cover letter",
                        idle: "Written from your resume and this posting, in your register. Nothing it cannot point at in your own words.",
                        busy: "Drafting from the profile only \u{2014} it cannot invent experience\u{2026}",
                        action: "Draft the letter",
                        step: a.letter,
                        onRun: { Task { await vm.draftLetter() } }
                    ) { LongText(text: $0) }

                    StepPanel(
                        title: "Your resume, rebuilt for this job",
                        idle: "Every role, school and certificate you already have \u{2014} reordered and reworded for this posting. A different document for every application.",
                        busy: "Rewriting the whole resume, then checking every name and number against your own\u{2026}",
                        action: "Rebuild the resume",
                        step: a.resume,
                        onRun: { Task { await vm.buildResume() } }
                    ) { RebuiltResume(r: $0) }

                    StepPanel(
                        title: "Their screening questions",
                        idle: "Greenhouse and Ashby publish a job's form, so the questions can be read and answered before you open it.",
                        busy: "Reading the employer's own form\u{2026}",
                        action: "Read the questions",
                        step: a.answers,
                        onRun: { Task { await vm.readAnswers() } }
                    ) { Answers(r: $0) }
                }
                .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 40)
            }
            .background(ZStack { canvasBg; Dots() }.ignoresSafeArea())
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            HStack(spacing: 0) {
                Text("360").font(sans(12, .medium)).foregroundColor(indigo).tracking(1.2)
                Text(" \u{2014} THE APPLICATION").font(sans(12, .medium)).foregroundColor(text3).tracking(1.2)
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(cardBg).clipShape(Capsule()).warmShadow(12, y: 6)
            Spacer()
            PillButton(text: "Done") { dismiss() }
        }
    }

    /// The posting this is all for, with its score — so a page of drafts can never
    /// drift away from the job it was written against.
    private func posting(_ a: Apply) -> some View {
        let (route, bandColor) = band(a.fit)
        let place = [a.posting.company, a.posting.location].filter { !$0.isEmpty }.joined(separator: " \u{00B7} ")
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 14) {
                BearingRose(fit: a.fit, side: 84).padding(.top, 2)
                VStack(alignment: .leading, spacing: 6) {
                    Text(a.posting.title).font(serif(22)).foregroundColor(ink).lineSpacing(2)
                    Text(place).font(sans(14)).foregroundColor(muted).lineSpacing(3)
                    Chip(text: "\(a.fit) / 100 \u{00B7} \(route.uppercased())",
                         color: bandColor, ground: bandFill(a.fit).opacity(0.18))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let u = URL(string: a.posting.url), !a.posting.url.isEmpty {
                HStack {
                    PillButton(text: "View posting \u{2197}") { openURL(u) }
                    Spacer(minLength: 0)
                }
                .padding(.top, 14)
            }
        }
        .padding(18)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .warmShadow()
    }
}

/**
 A step is idle, running, refused or done — and a refusal is worth as much screen as
 a result. The worker refuses a draft that invented a number or an employer, and that
 sentence is the honest answer, not an error to bury.
 */
struct StepPanel<T, C: View>: View {
    let title: String
    let idle: String
    let busy: String
    let action: String
    let step: Step<T>
    let onRun: () -> Void
    // Named `content`, not `body`: a View already has a `body`, and the two silently
    // collide.
    @ViewBuilder let content: (T) -> C

    private var state: String {
        if step.busy { return "working" }
        if step.error != nil { return "not available" }
        if step.data != nil { return "ready" }
        return "not started"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(serif(20)).foregroundColor(ink)
                Spacer(minLength: 8)
                Text(state).font(sans(12, .medium)).foregroundColor(text3).tracking(0.8)
            }
            if step.busy {
                HStack(spacing: 10) {
                    ProgressView().tint(indigo)
                    Text(busy).font(sans(14)).foregroundColor(muted).lineSpacing(4)
                }
            } else if let e = step.error {
                Text(e).font(sans(14)).foregroundColor(emberDeep).lineSpacing(4)
                PillButton(text: "Try again", filled: true, action: onRun).padding(.top, 4)
            } else if let d = step.data {
                content(d)
            } else {
                Text(idle).font(sans(14)).foregroundColor(muted).lineSpacing(4)
                PillButton(text: action, filled: true, action: onRun).padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .warmShadow()
    }
}

/// Selectable so it can be copied into the employer's form, plus a one-tap copy.
struct LongText: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(text).font(sans(15)).foregroundColor(ink).lineSpacing(6).textSelection(.enabled)
            PillButton(text: "Copy") { UIPasteboard.general.string = text }
        }
    }
}

/**
 The rebuilt resume, laid out rather than run together as one blob. The gaps sit
 OUTSIDE the document on purpose: they are what the resume does not say, and the only
 hand that may put them in is the candidate's.
 */
struct RebuiltResume: View {
    let r: ResumeResponse

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Group {
                if !r.name.isEmpty { Text(r.name).font(serif(20)).foregroundColor(ink) }
                if !r.contact.isEmpty { Text(r.contact).font(sans(13)).foregroundColor(text3) }
                if !r.headline.isEmpty {
                    Text(r.headline).font(sans(15)).foregroundColor(ink).lineSpacing(5).padding(.top, 8)
                }
            }
            .textSelection(.enabled)

            ForEach(Array(r.sections.enumerated()), id: \.offset) { _, sec in
                Text(sec.heading.uppercased())
                    .font(sans(12, .medium)).foregroundColor(indigo).tracking(0.8)
                    .padding(.top, 16).padding(.bottom, 6)
                ForEach(Array(sec.items.enumerated()), id: \.offset) { _, item in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.title).font(sans(15, .medium)).foregroundColor(ink).lineSpacing(3)
                        if !item.meta.isEmpty {
                            Text(item.meta).font(sans(13)).foregroundColor(text3).lineSpacing(2)
                        }
                        ForEach(Array(item.bullets.enumerated()), id: \.offset) { _, b in
                            Text("\u{2022}  \(b)").font(sans(14)).foregroundColor(muted).lineSpacing(4)
                        }
                    }
                    .textSelection(.enabled)
                    .padding(.bottom, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            if !r.gaps.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("WHAT THIS POSTING ASKS FOR THAT YOUR RESUME DOES NOT SAY")
                        .font(sans(11, .medium)).foregroundColor(midnightViolet).tracking(0.8)
                    ForEach(Array(r.gaps.enumerated()), id: \.offset) { _, g in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(g.asks).font(sans(14, .medium)).foregroundColor(ink).lineSpacing(3)
                            if !g.note.isEmpty {
                                Text(g.note).font(sans(13)).foregroundColor(muted).lineSpacing(2)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    Text("Yours to add, and only if true \u{2014} they are deliberately left out of the document above.")
                        .font(sans(12)).foregroundColor(text3).lineSpacing(2)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(info)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .padding(.top, 8)
            }

            PillButton(text: "Copy the resume") { UIPasteboard.general.string = resumeText(r) }
                .padding(.top, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The same document as plain text, for pasting into a form that wants one box.
func resumeText(_ r: ResumeResponse) -> String {
    var out = ""
    if !r.name.isEmpty { out += r.name + "\n" }
    if !r.contact.isEmpty { out += r.contact + "\n" }
    if !r.headline.isEmpty { out += "\n" + r.headline + "\n" }
    for sec in r.sections {
        out += "\n" + sec.heading.uppercased() + "\n"
        for item in sec.items {
            out += item.title
            if !item.meta.isEmpty { out += " \u{2014} " + item.meta }
            out += "\n"
            for b in item.bullets { out += "  \u{2022} " + b + "\n" }
        }
    }
    return out
}

/**
 The employer's questions. Two classes are shown and never drafted — anything personal
 (demographics, salary, criminal history, citizenship) and plain identity fields — and
 each says so in its own words rather than sitting there blank.
 */
struct Answers: View {
    let r: AnswersResponse

    var body: some View {
        if r.unsupported {
            Text(r.detail?.isEmpty == false ? r.detail!
                 : "This employer's board does not publish its form, so the questions cannot be read before you open it.")
                .font(sans(14)).foregroundColor(muted).lineSpacing(4)
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text("\(r.questions.count) question\(r.questions.count == 1 ? "" : "s") on "
                     + "\(r.source.isEmpty ? "the form" : r.source) \u{2014} \(r.drafted) answered from your resume.")
                    .font(sans(13)).foregroundColor(text3).lineSpacing(3)
                ForEach(Array(r.questions.enumerated()), id: \.offset) { _, q in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(q.label + (q.required ? "  \u{00B7}  required" : ""))
                            .font(sans(14, .medium)).foregroundColor(ink).lineSpacing(3)
                        if !q.answer.isEmpty {
                            Text(q.answer).font(sans(14)).foregroundColor(muted)
                                .lineSpacing(4).textSelection(.enabled)
                            if !q.from.isEmpty {
                                Text("from your resume: \u{201C}\(q.from)\u{201D}")
                                    .font(sans(12)).foregroundColor(text3).lineSpacing(2)
                            }
                        } else {
                            // Not a gap to be filled in later — a deliberate refusal, and
                            // the reason is the useful part.
                            Text(q.why.isEmpty ? "yours to answer" : q.why)
                                .font(sans(13)).foregroundColor(emberDeep).lineSpacing(3)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                PillButton(text: "Copy the answers") { UIPasteboard.general.string = answersText(r) }
            }
        }
    }
}

func answersText(_ r: AnswersResponse) -> String {
    r.questions.map { q in
        q.label + "\n" + (q.answer.isEmpty ? "[\(q.why.isEmpty ? "yours to answer" : q.why)]" : q.answer)
    }.joined(separator: "\n\n")
}
