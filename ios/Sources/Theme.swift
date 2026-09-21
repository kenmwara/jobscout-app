import SwiftUI
import UIKit

// ── JobScout v2.3 — ONE palette, TWO themes. Mirrors site/base.css. ─────────
//
// Three independent signals, three separate channels:
//   market -> the hero gradient and the flag chip (iOS has no hero band yet,
//             so nothing here carries it - see the note at the bottom).
//   theme  -> light or dark. The reader's device, never the market's.
//   band   -> hue, exclusively. Green means AUTO (fit >= 80) at control
//             scale, so nothing else may claim it there.
//
// Every token below was a literal, which is the whole reason this app has
// been light-only on a dark phone: a literal cannot follow the appearance.
// A dynamic UIColor can, and it keeps each token's name and type, so not one
// call site in the other five files had to change.
//
// Ratios are measured, light / dark: see tools/check_palette.py, which holds
// the web and Android to the same numbers.

private func rgb(_ hex: UInt32) -> UIColor {
    UIColor(red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
}

/// `traits` is named rather than `$0`: inside a nested closure `$0` binds to
/// the innermost one, which cost a build here on 2026-09-19.
private func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { traits in traits.userInterfaceStyle == .dark ? rgb(dark) : rgb(light) })
}

private func dynAlpha(_ hex: UInt32, _ a: CGFloat, _ darkHex: UInt32, _ darkA: CGFloat) -> Color {
    Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? rgb(darkHex).withAlphaComponent(darkA) : rgb(hex).withAlphaComponent(a)
    })
}

// Indigo is BRAND, links and selected state - never a primary button fill,
// where it carries white at only 4.58:1. The action is `ink` on `canvasBg`,
// which is deep-ink/cream in light and cream/deep-ink in dark: 17.44:1 and
// 17.93:1, and it inverts for free.
let indigo = dyn(0x4865FF, 0xA2BAFF)
let midnightViolet = dyn(0x1B1463, 0xA2BAFF)

/* SECTION 16, OPTION C. The evidence card is a neutral at the surface's own
   hue; the band colour is a 2px rule and the label. A tinted fill is for
   pill scale - the card measured four times the 4,000px2 the rule names. */
let evidenceBg = dyn(0xF1F1FA, 0x2B284F)
let evidenceRuleStrongest = dyn(0x3E954D, 0x7AC683)
let evidenceRuleAnswer = dyn(0xB86B03, 0xE89F59)
let strongestBody = dyn(0x495349, 0xCCD6CD)
let answerBody = dyn(0x584E45, 0xDBD1C8)
let ink = dyn(0x080331, 0xF8F3EB)         // 17.81:1 / 17.93:1 on canvas
let muted = dyn(0x5A5560, 0xB9B3C4)       // --text2. 6.55:1 / 9.72:1 - was
                                          // 0x4A4560, of the #878789 family
let text3 = dyn(0x5A5560, 0xB9B3C4)       // no third tone; the kit has two
let canvasBg = dyn(0xF8F3EB, 0x0A0524)
let cardBg = dyn(0xFFFFFF, 0x1C1544)
let surface = dyn(0xFFFFFF, 0x1C1544)    // --surface: the sheets and the field (stage 11 referenced it, nothing defined it - Codemagic #238)
let info = dyn(0xEAF0FF, 0x272E42)        // the ping fill, hue 270
let lavender = dyn(0xA2BAFF, 0xA2BAFF)
// `lavender` is the SAME fill in both themes, so whatever sits on it must be
// deep-ink in both themes too - a dynamic ink would turn cream on dark and
// disappear. 10.38:1.
let lavenderInk = Color(hex: 0x080331)
/* ONE RAMP: fixed OKLCH lightness and chroma per rung, hue the only
   variable, light and dark the same hue from opposite ends. Ember is hue 63
   now, not 39 - 39 sits between Apple's red and orange, reads as an error,
   and turns to mud when darkened. docs/THEME.md section 11 has the table. */
let meadow = dyn(0x225B2C, 0x92D098)      // auto label,  147deg 7.11 / 7.38
let forest = dyn(0x3E954D, 0x7AC683)      // auto solid, lit bearings only
let emberDeep = dyn(0x713F00, 0xECB078)   // unsure label, 63deg 7.58 / 7.04
let stone = dyn(0x4B4B5C, 0xBBBCD0)       // near-miss label, 285deg 7.50 / 7.21
let hairline = dynAlpha(0x080331, 0.13, 0xF8F3EB, 0.13)
let hair2 = dynAlpha(0x080331, 0.22, 0xF8F3EB, 0.24)
// A warm-brown shadow reads as dirt on a dark ground, so on dark it goes to
// zero and the hairline border carries the separation instead.
private func warmShadowColor(_ a: CGFloat) -> Color {
    Color(UIColor { traits in
        traits.userInterfaceStyle == .dark ? .clear : rgb(0x4B4439).withAlphaComponent(a)
    })
}

/* THE BAND FILLS, NAMED. They existed only as literals inside personaHues
   and as hexes inside the rose, which is how the rose kept the pre-ember
   palette while everything else moved. Named once, read everywhere. */
let autoFill = dyn(0xE7F4E8, 0x223424)
let unsureFill = dyn(0xFBEDE2, 0x3D2B1A)
let pingFill = dyn(0xEAF0FF, 0x272E42)
let nearFill = dyn(0xEFF0F4, 0x2E2E34)
/* The ping LABEL. iOS carried the fill and borrowed --link for the text,
   which is a different token at a different contrast. */
let pingLabel = dyn(0x394981, 0xA4BBFF)

/// One hue per candidate (border + rose) and its card ground, same as the web.
let personaHues: [(Color, Color)] = [
    (forest, autoFill),
    (emberDeep, unsureFill),
    (indigo, pingFill),
]

// The same two variable TTFs the site embeds and Android bundles (google/fonts, OFL),
// registered through UIAppFonts in project.yml. Font.custom wants the PostScript
// name of the default instance — "Newsreader" alone would silently fall back.
// The serif is weight 400 ONLY; that is the whole point of the language.
func serif(_ size: CGFloat) -> Font { .custom("Newsreader16pt-Regular", size: size) }
func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
    Font.custom("Inter-Regular", size: size).weight(weight)
}

extension View {
    /// August's warm-brown shadow instead of the system grey.
    func warmShadow(_ radius: CGFloat = 20, y: CGFloat = 10) -> some View {
        self.shadow(color: warmShadowColor(0.10), radius: radius, x: 0, y: y)
            .shadow(color: warmShadowColor(0.05), radius: 3, x: 0, y: 2)
    }
}

/// The tiny-dot texture the site paints on the canvas: a grid of 1px ink dots at low alpha.
struct Dots: View {
    var step: CGFloat = 24
    var body: some View {
        Canvas { ctx, size in
            let c = GraphicsContext.Shading.color(ink.opacity(0.07))
            var y = step / 2
            while y < size.height {
                var x = step / 2
                while x < size.width {
                    ctx.fill(Path(ellipseIn: CGRect(x: x - 0.75, y: y - 0.75, width: 1.5, height: 1.5)), with: c)
                    x += step
                }
                y += step
            }
        }
        .allowsHitTesting(false)
    }
}

/// The brand mark: August's geometry (8 dots, ring r=11 in a 24 box, cropped by the
/// square) with OUR one difference — radii graduate 2.30 → 4.35 clockwise from
/// bearing 000, so it reads as a sweep, not a wheel.
struct Mark: View {
    var side: CGFloat = 28
    var tint: Color = indigo
    var body: some View {
        Canvas { ctx, size in
            let u = size.width / 24
            for i in 0..<8 {
                let th = Double(-90 + 45 * i) * .pi / 180
                let r = (2.30 + (4.35 - 2.30) * CGFloat(i) / 7) * u
                let cx = size.width / 2 + 11 * u * CGFloat(cos(th))
                let cy = size.height / 2 + 11 * u * CGFloat(sin(th))
                ctx.fill(Path(ellipseIn: CGRect(x: cx - r, y: cy - r, width: 2 * r, height: 2 * r)),
                         with: .color(tint))
            }
        }
        .frame(width: side, height: side)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// The white bearing pill: "000 — CANDIDATE".
struct BearingPill: View {
    let bearing: String
    let label: String
    var body: some View {
        HStack(spacing: 0) {
            Text(bearing).foregroundColor(indigo)
            Text(" — \(label)").foregroundColor(text3)
        }
        .font(sans(12, .medium)).tracking(1.2)
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(cardBg).clipShape(Capsule())
        .warmShadow(12, y: 6)
    }
}

/// A stage heading: the bearing pill, the serif title, the note.
struct StageHeading: View {
    let bearing: String
    let label: String
    let title: String
    var note: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BearingPill(bearing: bearing, label: label)
            Text(title).font(serif(27)).foregroundColor(ink).padding(.top, 14)
            if let note {
                Text(note).font(sans(14)).foregroundColor(muted).lineSpacing(4).padding(.top, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 22)
    }
}

/// Small uppercase pill — route bands, gate verdicts.
struct Chip: View {
    let text: String
    let color: Color
    var ground: Color? = nil
    var body: some View {
        Text(text).font(sans(10.5, .medium)).tracking(0.9).lineLimit(1)
            .foregroundColor(color)
            .padding(.horizontal, 11).padding(.vertical, 4)
            .background(ground ?? color.opacity(0.16)).clipShape(Capsule())
    }
}

/// TIME, the fourth axis (motion v1, 2026-09-20): the web's four curves from
/// base.css. SwiftUI's `response` IS the natural period, so it equals the CSS
/// duration directly; the damping fractions are the ones the linear() curves
/// were sampled from. Do not eyeball an equivalent - the two clients drift.
/// GENERATED numbers (design system v3): tokens/tokens.json -> Tokens.swift.
/// SwiftUI's `response` IS the natural period, so it equals the CSS duration.
enum Motion {
    static let snap = JSMotion.snap        // 180ms, zeta .72
    static let settle = JSMotion.settle    // 340ms, critically damped
    static let arrive = JSMotion.arrive    // 520ms, 8.3% over
    static let exit = JSMotion.exit        // 160ms, never overshoots
    static let staggerDot = 0.046          // tokens.json motion.stagger.dot
}

/// Every actionable surface has three states; the press is the one that was
/// missing. Scale by mass (.96 for a control), and it resolves on EXIT timing
/// - a give that eases in is not a give.
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(configuration.isPressed ? Motion.exit : Motion.settle, value: configuration.isPressed)
    }
}

/// August's outlined pill; `filled` is the info-tinted state (saved, letter).
struct PillButton: View {
    let text: String
    var color: Color = midnightViolet
    var filled = false
    var enabled = true
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text).font(sans(13.5, .medium)).lineLimit(1)
                .foregroundColor(enabled ? color : text3)
                .padding(.horizontal, 17).padding(.vertical, 9)
                .background(filled ? info : Color.clear)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(filled ? Color.clear : hair2, lineWidth: 1.5))
        }
        .buttonStyle(PressStyle())
        .disabled(!enabled)
    }
}

/// The same pill as a plain LABEL, for the cases where the tap belongs to
/// something else - ShareLink owns its own button, so it needs the look
/// without a second Button wrapped around it.
struct PillLabel: View {
    let text: String
    var color: Color = midnightViolet
    var body: some View {
        Text(text).font(sans(13.5, .medium)).lineLimit(1)
            .foregroundColor(color)
            .padding(.horizontal, 17).padding(.vertical, 9)
            .overlay(Capsule().stroke(hair2, lineWidth: 1.5))
    }
}

/// The quiet text link (resume toggle, remove, clear all).
struct LinkText: View {
    let text: String
    var color: Color = midnightViolet
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text).font(sans(14, .medium)).foregroundColor(color).padding(.vertical, 6)
        }
        .buttonStyle(PressStyle())
    }
}

/// The word for a posting's remote policy. "onsite" covers everything that is
/// neither remote nor hybrid, including a posting that simply never said.
func policyWord(_ policy: String) -> String {
    switch policy {
    case "remote": return "Remote"
    case "hybrid": return "Hybrid"
    default: return "On site"
    }
}

/// A wrapping row of tiles, each a slice of the feed with its count. SwiftUI had
/// no flow layout before iOS 16's Layout protocol, so the rows are chunked in
/// twos by hand — which is what a phone's width wants anyway: two tiles a row,
/// readable, and no horizontal scroll.
struct FlowTiles: View {
    /// (id, label, count) — the id is what the caller filters on, the label is
    /// what a person reads.
    let items: [(String, String, Int)]
    let selected: String?
    let onTap: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            ForEach(Array(stride(from: 0, to: items.count, by: 2)), id: \.self) { i in
                HStack(spacing: 8) {
                    tile(items[i])
                    if i + 1 < items.count {
                        tile(items[i + 1])
                    } else {
                        Color.clear.frame(maxWidth: .infinity)
                    }
                }
            }
        }
    }

    private func tile(_ it: (String, String, Int)) -> some View {
        let on = selected == it.0
        return Button { onTap(it.0) } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(on ? it.1 + "  \u{00D7}" : it.1)
                    .font(sans(13, .medium)).foregroundColor(ink)
                    .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                Text("\(it.2) open").font(sans(11.5)).foregroundColor(text3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, 13).padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(cardBg)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(on ? indigo : hairline, lineWidth: on ? 1.5 : 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
