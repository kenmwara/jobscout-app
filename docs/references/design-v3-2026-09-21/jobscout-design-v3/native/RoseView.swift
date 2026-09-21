// JobScout — the rose, SwiftUI. Law 9 geometry, generated from the same
// constants as the web (Tokens.swift / tokens.json). Build-unproven.
import SwiftUI

/// THE LAW: the number of lit dots IS the band, not the score.
/// AUTO 8 · PING 6 · UNSURE 5 · NEAR-MISS 3.
///
/// An unlit dot may NEVER take a band colour: NEAR-MISS's band IS the
/// neutral, so a band-coloured track leaves lit and unlit identical but for
/// opacity.
struct RoseView: View {
    let band: String?              // nil = swept
    let size: CGFloat
    let bandColor: Color
    let emptyColor: Color          // --rose-empty, i.e. --text
    var animate: Bool = true

    @State private var progress: CGFloat = 0

    private var lit: Int { band.flatMap { JSBands.litByBand[$0] } ?? 0 }

    // The display cut: the true bbox plus 1.2 clear space, squared.
    private let cut: CGFloat = 31.3054
    private let originX: CGFloat = -4.2416
    private let originY: CGFloat = -3.0639

    var body: some View {
        Canvas { ctx, canvasSize in
            let k = min(canvasSize.width, canvasSize.height) / cut
            for i in 0..<JSRose.count {
                let a = CGFloat(i) * .pi / 4 - .pi / 2
                let cx = (JSRose.box + JSRose.ring * cos(a) - originX) * k
                let cy = (JSRose.box + JSRose.ring * sin(a) - originY) * k
                let r  = (JSRose.r0 + JSRose.dr * CGFloat(i)) * k
                let isLit = CGFloat(i) < progress
                let scale = isLit ? 1.0 : JSRose.emptyScale
                let rr = r * scale
                let rect = CGRect(x: cx - rr, y: cy - rr, width: rr * 2, height: rr * 2)
                ctx.opacity = isLit ? 1 : JSRose.emptyAlpha
                ctx.fill(Path(ellipseIn: rect), with: .color(isLit ? bandColor : emptyColor))
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            if animate { withAnimation(JSMotion.arrive) { progress = CGFloat(lit) } }
            else { progress = CGFloat(lit) }
        }
        .onChange(of: band) { _ in
            if animate { withAnimation(JSMotion.arrive) { progress = CGFloat(lit) } }
            else { progress = CGFloat(lit) }
        }
        .accessibilityHidden(true)   // the numeral beside it is the voice
    }
}
