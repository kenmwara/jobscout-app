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
private let roseBox: CGFloat = 104
private let roseRing: CGFloat = 38
private let roseLit: CGFloat = 13
private let roseUnlit: CGFloat = 5.5
private let paleDot = Color(hex: 0xDDD4C3)

/// Dot centre i (0 = bearing 000, clockwise) in a box of side `side`.
func roseDot(_ i: Int, side: CGFloat) -> CGPoint {
    let u = side / roseBox
    let th = Double(-90 + 45 * i) * .pi / 180
    return CGPoint(x: side / 2 + roseRing * u * CGFloat(cos(th)),
                   y: side / 2 + roseRing * u * CGFloat(sin(th)))
}

struct BearingRose: View {
    let fit: Int
    var side: CGFloat = 76
    @State private var bloom = false

    private var f: Int { min(max(fit, 0), 100) }
    private var lit: Int { max(1, Int((Double(f) / 100 * 8).rounded())) }

    var body: some View {
        let u = side / roseBox
        return ZStack {
            ForEach(0..<8, id: \.self) { i in
                let on = i < lit
                let open: CGFloat = on ? (bloom ? 1.0 : 0.34) : 1.0
                let d = (on ? roseLit : roseUnlit) * 2 * u * open
                Circle()
                    .fill(on ? band(f).1 : paleDot)
                    .frame(width: d, height: d)
                    .position(roseDot(i, side: side))
                    // Staggered, so the rose fills in the order the score fills it.
                    .animation(.easeOut(duration: 0.42).delay(Double(i) * 0.07), value: bloom)
            }
            // The web's .fitnum: serif at weight 400, 24 units of the 104 box.
            Text("\(f)")
                .font(serif(side * 24 / roseBox))
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
        let u = side / roseBox
        return ZStack {
            ForEach(0..<8, id: \.self) { i in
                let d = 22 * u * (selected ? 1.0 : 0.42)
                Circle()
                    .fill(selected ? tint : paleDot)
                    .frame(width: d, height: d)
                    .position(roseDot(i, side: side))
                    .animation(.easeOut(duration: 0.42).delay(Double(i) * 0.05), value: selected)
            }
        }
        .frame(width: side, height: side)
    }
}
