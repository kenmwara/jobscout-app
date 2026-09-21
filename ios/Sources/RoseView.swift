import SwiftUI

/// The bearing rose — the brand mark carrying the score, same as the web demo
/// and the Android app.
///
/// Geometry is the web's verbatim so all three surfaces draw the identical
/// glyph: a 104-unit box, centre (52,52), eight dots on a ring of r=38 at 45°
/// steps starting at bearing 000 (straight up). Fit lights them clockwise; lit
/// dots are r=13 and bloom in, unlit stay r=5.5.
///
/// Nothing rotates, which is the point — the old dial turned a needle, and a
/// rotation is the one thing that can land off-canvas when its pivot is wrong.
///
/// Everything here is CGFloat rather than Double on purpose: SwiftUI's frame
/// and font APIs take CGFloat, and leaning on implicit numeric conversion is
/// not worth it in a file that cannot be compiled locally.
/// MOTION v2 stage 1: law 9's geometry, the glyph site/rose.js draws - a 24
/// box, ring r=11, eight bearings from 000, radii 2.275 + 0.2944*i clockwise,
/// inside the display cut (31.3054 units, origin offset 4.2416 / 3.0639).
private let roseVB: CGFloat = 31.3054
private let roseOX: CGFloat = 4.2416
private let roseOY: CGFloat = 3.0639
private let roseRing: CGFloat = 11

/// Dot centre i (0 = bearing 000, clockwise) for a rose of side `side`.
func roseDot(_ i: Int, side: CGFloat) -> CGPoint {
    let u = side / roseVB
    let th = Double(-90 + 45 * i) * .pi / 180
    return CGPoint(x: (12 + roseOX + roseRing * CGFloat(cos(th))) * u,
                   y: (12 + roseOY + roseRing * CGFloat(sin(th))) * u)
}
func roseRadius(_ i: Int, side: CGFloat) -> CGFloat { (2.275 + 0.2944 * CGFloat(i)) * side / roseVB }

/// The lit count IS the band: AUTO 8, PING 6, UNSURE 5, NEAR-MISS 3.
func litFor(_ f: Int) -> Int { f >= 80 ? 8 : f >= 70 ? 6 : f >= 55 ? 5 : 3 }

struct BearingRose: View {
    let fit: Int
    var side: CGFloat = 76
    @State private var bloom = false

    private var f: Int { min(max(fit, 0), 100) }
    private var lit: Int { litFor(f) }

    var body: some View {
        return ZStack {
            ForEach(0..<8, id: \.self) { i in
                let on = i < lit
                // unlit bearings: the ink at 14%, scaled .55 - never a band colour
                let open: CGFloat = on ? (bloom ? 1.0 : 0.55) : 0.55
                let d = roseRadius(i, side: side) * 2 * open
                Circle()
                    .fill(on ? band(f).1 : ink)
                    .opacity(on ? (bloom ? 1 : 0.14) : 0.14)
                    .frame(width: d, height: d)
                    .position(roseDot(i, side: side))
                    // MOTION v1: each bearing arrives on the web's --spring-arrive
                    // (520ms, 8.3% overshoot), one --stagger-dot apart, from 000.
                    .animation(Motion.arrive.delay(Double(i) * Motion.staggerDot), value: bloom)
            }
            // The numeral is data: mono, tabular, 8.6 of the 31.3-unit cut.
            Text("\(f)")
                .font(.system(size: side * 8.6 / roseVB, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundColor(band(f).1)
        }
        .frame(width: side, height: side)
        .onAppear { bloom = true }
    }
}

/// The same eight bearings at one size, dormant until chosen — the candidate
/// cards carry the mark so picking one rhymes with getting a result.
struct MiniRose: View {
    let selected: Bool
    let tint: Color
    var side: CGFloat = 30

    var body: some View {
        return ZStack {
            ForEach(0..<8, id: \.self) { i in
                let d = roseRadius(i, side: side) * 2 * (selected ? 1.0 : 0.55)
                Circle()
                    .fill(selected ? tint : ink)
                    .opacity(selected ? 1 : 0.14)
                    .frame(width: d, height: d)
                    .position(roseDot(i, side: side))
                    .animation(.easeOut(duration: 0.42).delay(Double(i) * 0.05), value: selected)
            }
        }
        .frame(width: side, height: side)
    }
}

/// The four fit bands. Every caller uses this for text, so it returns the
/// contrast-checked label colour rather than the decorative fill. Measured on
/// cream #F8F3EB: meadow 8.97, midnight 14.33, ember-deep 4.64, stone 11.44. The
/// fills (forest 3.93, ember 2.54) fail as text and are used only for dots and
/// pill grounds. (Lived in DialView.swift until the needle dial was retired.)
func band(_ fit: Int) -> (String, Color) {
    switch fit {
    /* The pre-ember palette lived here - #114e0b, #cc3600 - so the dial
       disagreed with every other band surface, and with itself in dark,
       since these were light values only. They are the band tokens now. */
    case 80...: return ("auto", meadow)
    case 70...: return ("ping", pingLabel)
    case 55...: return ("unsure", emberDeep)
    default: return ("near-miss", stone)
    }
}

/// The decorative fill for each band - dots and pill grounds only, never text.
func bandFill(_ fit: Int) -> Color {
    switch fit {
    case 80...: return autoFill
    case 70...: return pingFill
    case 55...: return unsureFill
    default: return nearFill
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

