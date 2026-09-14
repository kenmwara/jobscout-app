import SwiftUI

// ── JobScout v2.1 — August Health language, tokens mirror site/index.html :root ──
// Indigo (4.15:1 on cream) and forest (3.9) are FILL / large-text only, never body copy.
let indigo = Color(hex: 0x4865FF)
let midnightViolet = Color(hex: 0x1B1463)
let ink = Color(hex: 0x080331)
let muted = Color(hex: 0x4A4560)          // --text2
let text3 = Color(hex: 0x6B6780)
let canvasBg = Color(hex: 0xF8F3EB)
let cardBg = Color.white
let info = Color(hex: 0xDCE4FB)
let lavender = Color(hex: 0xA2BAFF)
let meadow = Color(hex: 0x114E0B)
let forest = Color(hex: 0x328A3B)
let emberDeep = Color(hex: 0xCC3600)
let stone = Color(hex: 0x333333)
let hairline = Color(hex: 0x080331).opacity(0.10)
let hair2 = Color(hex: 0x080331).opacity(0.18)
private let warmBrown = Color(hex: 0x4B4439)

/// One hue per candidate (border + rose) and its card ground, same as the web.
let personaHues: [(Color, Color)] = [
    (forest, Color(hex: 0xF2F7F1)),
    (emberDeep, Color(hex: 0xFDF3EE)),
    (indigo, Color(hex: 0xF1F3FD)),
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
        self.shadow(color: warmBrown.opacity(0.10), radius: radius, x: 0, y: y)
            .shadow(color: warmBrown.opacity(0.05), radius: 3, x: 0, y: 2)
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
        .buttonStyle(.plain)
        .disabled(!enabled)
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
        .buttonStyle(.plain)
    }
}
