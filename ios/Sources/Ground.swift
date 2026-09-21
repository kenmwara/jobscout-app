import SwiftUI

/// THE GROUND, as SwiftUI (motion v2, stage 11; spec in
/// docs/references/motion-2026-09-20/.../docs/IOS-GROUND.md).
///
/// Law 7 in full: one ground - three radial blooms plus a 24pt dot texture,
/// fixed, on every screen; no screen paints its own. Dark halo = brightness
/// (peak 1.26:1 in the canvas's hue family); light halo = HUE (amber over
/// cream, because white on cream tops out at 1.105:1 and disappears). Law 8:
/// the eight-dot rose at 1400pt and 6% accent wanders on a stepped cadence
/// so the display can idle, and holds still under reduced motion.
///
/// Three things iOS adds that the web gets free, designed around rather than
/// found in profiling: the gradient lives BEHIND the scroll view and is
/// rasterised once (`.drawingGroup()`); the texture is one cached tile
/// repeated by Core Animation, never a ForEach of ~570 circles; the mark
/// steps every 12s and stops entirely in Low Power Mode.
///
/// Uncompiled here (no Xcode on this machine); checked by tools/check_swift.py
/// and built by Codemagic's ios-simulator workflow.
enum Ground {
    // the canvas, identical in both markets (base.css --canvas)
    static func canvas(_ dark: Bool) -> Color { dark ? Color(hex: 0x0A0524) : Color(hex: 0xF8F3EB) }

    /// The three blooms: base.css --halo-1/2/3, with the alpha in the colour.
    /// LIGHT carries hue - amber, peach, gold at low alpha (the web's measured
    /// values, ΔE 6 at the corner). DARK carries brightness at the canvas's
    /// own hue, 250deg (the spec's 227deg read as navy). Do not swap them: a
    /// cool bloom on cream turns the ground grey even when it is lighter -
    /// that is the retired --blob failure.
    static func halo(_ dark: Bool) -> [(Color, UnitPoint, CGFloat)] {
        dark
        ? [(Color(hex: 0x3B2D80).opacity(0.72), UnitPoint(x: 0.88, y: 0.02), 0.62),
           (Color(hex: 0x3A2A60).opacity(0.60), UnitPoint(x: 0.02, y: 0.30), 0.54),
           (Color(hex: 0x382B7A).opacity(0.55), UnitPoint(x: 0.74, y: 0.92), 0.70)]
        : [(Color(hex: 0xFFD696).opacity(0.26), UnitPoint(x: 0.88, y: 0.02), 0.62),
           (Color(hex: 0xFFCEB2).opacity(0.22), UnitPoint(x: 0.02, y: 0.30), 0.54),
           (Color(hex: 0xFFE4B0).opacity(0.24), UnitPoint(x: 0.74, y: 0.92), 0.70)]
    }

    /// The dot texture: the web's 24px grid at 2.8% / 3.0%.
    static func texture(_ dark: Bool) -> Color {
        dark ? Color(hex: 0xF8F3EB).opacity(0.030) : Color(hex: 0x080331).opacity(0.028)
    }

    /// The mark: on dark the accent at 6%; on light the halo's own amber so
    /// the discs ADD warm light (the accent at 6% over cream composited to a
    /// cool grey - the same blob failure, as geometry).
    static func mark(_ dark: Bool) -> Color {
        dark ? Color(hex: 0xA2BAFF).opacity(0.06) : Color(hex: 0xFFE4B0).opacity(0.42)
    }

    static let texturePitch: CGFloat = 24    // law 7
    static let markSize: CGFloat = 1400      // law 8
}

/// Three RadialGradients stacked, each ending in clear. `endRadius` is a
/// fraction of the DIAGONAL, which is how the CSS percentages behave - width
/// alone makes the blooms the wrong shape on an iPad.
struct HaloLayer: View {
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geo in
            let dark = scheme == .dark
            let diag = hypot(geo.size.width, geo.size.height)
            ZStack {
                Ground.canvas(dark)
                ForEach(Array(Ground.halo(dark).enumerated()), id: \.offset) { pair in
                    let bloom = pair.element
                    RadialGradient(
                        gradient: Gradient(colors: [bloom.0, bloom.0.opacity(0)]),
                        center: bloom.1,
                        startRadius: 0,
                        endRadius: diag * bloom.2
                    )
                }
            }
            .drawingGroup()      // rasterise once; the layer never changes
            .ignoresSafeArea()
        }
    }
}

/// One 24pt tile, rendered once per colour scheme and repeated by Core
/// Animation through `resizable(resizingMode: .tile)`. Zero per-frame cost.
struct TextureLayer: View {
    @Environment(\.colorScheme) private var scheme
    @State private var tile: UIImage? = nil

    var body: some View {
        let dark = scheme == .dark
        Group {
            if let img = tile {
                Image(uiImage: img)
                    .resizable(resizingMode: .tile)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            } else {
                Color.clear
            }
        }
        .onAppear { tile = Self.render(dark: dark) }
        .onChange(of: scheme) { _ in tile = Self.render(dark: scheme == .dark) }
    }

    /// The tile: a 1.6pt dot at the centre of a 24pt square.
    @MainActor static func render(dark: Bool) -> UIImage? {
        let pitch = Ground.texturePitch
        let view = Canvas { ctx, _ in
            let dot = Path(ellipseIn: CGRect(x: pitch / 2 - 0.8, y: pitch / 2 - 0.8, width: 1.6, height: 1.6))
            ctx.fill(dot, with: .color(Ground.texture(dark)))
        }
        .frame(width: pitch, height: pitch)
        let renderer = ImageRenderer(content: view)
        renderer.scale = UIScreen.main.scale
        return renderer.uiImage
    }
}

/// Law 9's geometry: ring r=11 in a 24 box, eight bearings, radii
/// 2.275 + 0.2944*i clockwise from 000 - the two largest dots touching at
/// 270/315 on purpose. At this size it is the display cut, so the path's
/// bounds are the true bbox plus 1.2 clear space, squared.
struct RoseShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let vb = CGRect(x: -4.2416, y: -3.0639, width: 31.3054, height: 31.3054)
        let s = min(rect.width, rect.height) / vb.width
        for i in 0..<8 {
            let a = Double(i) * .pi / 4 - .pi / 2
            let cx = (12 + 11 * CGFloat(cos(a)) - vb.minX) * s
            let cy = (12 + 11 * CGFloat(sin(a)) - vb.minY) * s
            let r = (2.275 + 0.2944 * CGFloat(i)) * s
            p.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        }
        return p
    }
}

/// The mark on a stepped figure: four steps around the 48s figure, 12s apart,
/// so the layer is static 90% of the time and the display can idle. Three
/// guards, all required: reduced motion (the mark is STILL, not slower), Low
/// Power Mode (a decorative layer must not cost battery), and the cadence.
struct WanderingMark: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @State private var phase: Int = 0
    private let step = Timer.publish(every: 12, on: .main, in: .common).autoconnect()

    var body: some View {
        GeometryReader { geo in
            let t = Double(phase) * .pi / 2
            let ax = geo.size.width * 0.10
            let ay = geo.size.height * 0.06
            RoseShape()
                .fill(Ground.mark(scheme == .dark))
                .frame(width: Ground.markSize, height: Ground.markSize)
                .position(x: geo.size.width * 0.5 + CGFloat(sin(t)) * ax,
                          y: geo.size.height * 0.42 + CGFloat(sin(2 * t)) * ay)
                .animation(reduceMotion ? nil : .easeInOut(duration: 1.2), value: phase)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onReceive(step) { _ in
            guard !reduceMotion, !ProcessInfo.processInfo.isLowPowerModeEnabled else { return }
            phase = (phase + 1) % 4
        }
    }
}

extension View {
    /// The ground. Once, at the root of every screen, OUTSIDE any ScrollView -
    /// the scroll view is the content, never the ground's parent. No screen,
    /// sheet, card or section may set a background over half the viewport.
    func ground() -> some View {
        self.background {
            ZStack {
                HaloLayer()
                TextureLayer()
                WanderingMark()
            }
        }
    }
}
