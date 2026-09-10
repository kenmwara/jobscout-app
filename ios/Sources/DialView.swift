import SwiftUI

/// Brand-kit bearing dial, drawn natively. 270° sweep starting bottom-left;
/// band segments are fixed (the routing thresholds), only the needle turns —
/// needle angle IS the score, band color IS the routing decision.
struct BearingDial: View {
    let fit: Int
    @State private var settled = false

    private var f: Double { Double(min(max(fit, 0), 100)) }

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                seg(0.00, 0.55, Color(hex: 0xE6DED0))  // near-miss track
                seg(0.55, 0.70, Color(hex: 0xFF6D39))  // unsure
                seg(0.70, 0.80, Color(hex: 0x4865FF))  // ping
                seg(0.80, 1.00, Color(hex: 0x328A3B))  // auto
                Needle()
                    .rotationEffect(.degrees(settled ? -135 + 270 * f / 100 : -135))
                Circle().fill(Color(hex: 0x080331))
                    .overlay(Circle().stroke(.white, lineWidth: 2))
                    .frame(width: 6.5, height: 6.5)
            }
            .frame(width: 88, height: 88)
            Text("\(fit)")
                .font(.system(size: 19, weight: .bold))
                .foregroundColor(band(fit).1)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.9)) { settled = true }
        }
    }

    // SwiftUI Circle trims from 3 o'clock clockwise; rotate so the dial starts bottom-left.
    private func seg(_ from: Double, _ to: Double, _ color: Color) -> some View {
        Circle()
            .trim(from: from * 0.75, to: to * 0.75)
            .stroke(color, style: StrokeStyle(lineWidth: 7, lineCap: .butt))
            .rotationEffect(.degrees(135))
    }
}

/// Two-tone indigo kite needle (brand kit), authored on the kit's 200-unit grid.
private struct Needle: View {
    var body: some View {
        GeometryReader { geo in
            let u = geo.size.width / 200
            ZStack {
                kite([(100, 40), (109, 102), (100, 112)], Color(hex: 0x1B1463), u)
                kite([(100, 40), (91, 102), (100, 112)], Color(hex: 0x4865FF), u)
                kite([(100, 150), (106, 98), (100, 90)], Color(hex: 0xA2BAFF), u)
                kite([(100, 150), (94, 98), (100, 90)], Color(hex: 0xDCE4FB), u)
            }
        }
    }

    private func kite(_ pts: [(CGFloat, CGFloat)], _ color: Color, _ u: CGFloat) -> some View {
        Path { p in
            p.move(to: CGPoint(x: pts[0].0 * u, y: pts[0].1 * u))
            for pt in pts.dropFirst() { p.addLine(to: CGPoint(x: pt.0 * u, y: pt.1 * u)) }
            p.closeSubpath()
        }
        .fill(color)
    }
}

/// Score → (route label, TEXT colour). Same thresholds as the production pipeline.
///
/// Every caller uses this for text, so it returns the contrast-checked label colour
/// rather than the decorative arc fill. Measured on cream #F8F3EB: meadow 8.97,
/// midnight 14.33, ember-deep 4.64, stone 11.44. The fills (forest 3.93, ember 2.54)
/// fail as text and are used only for the arcs.
func band(_ fit: Int) -> (String, Color) {
    switch fit {
    case 80...: return ("auto", Color(hex: 0x114E0B))
    case 70...: return ("ping", Color(hex: 0x1B1463))
    case 55...: return ("unsure", Color(hex: 0xCC3600))
    default: return ("near-miss", Color(hex: 0x333333))
    }
}

/// The decorative fill for each band - arcs and pill grounds only, never text.
func bandFill(_ fit: Int) -> Color {
    switch fit {
    case 80...: return Color(hex: 0x328A3B)
    case 70...: return Color(hex: 0x4865FF)
    case 55...: return Color(hex: 0xFF6D39)
    default: return Color(hex: 0xDCE4FB)
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
