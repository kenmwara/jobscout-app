# iOS — the ground, as SwiftUI

iOS is the one surface with **no ground at all**: no halo, no texture, no
wandering mark. `HANDOVER-design.md` §5 lists it first under "where design
attention would pay", and law 8 already says Android draws the same ground in
`Modifier.ground()`. This is the iOS half.

**Files:** `ios/Sources/` — one new `Ground.swift`, one modifier applied at the
root of every screen.

> Law 7 in full: *"One ground, on `<html>`: three radial blooms + a 24px dot
> texture, `background-attachment: fixed`, every route. No page paints its own
> ground. **Dark halo = brightness** (peak 1.26:1 at the canvas hue 250°);
> **light halo = hue** (amber/peach/gold at low alpha, ΔE 6 at the corner)
> because white on cream caps at 1.105:1 and is invisible."*

Everything below is that law, in SwiftUI, with the same numbers.

---

## 1. The three constraints iOS adds

The web ground is free — `position: fixed` composites on the GPU and costs
nothing on scroll. On iOS, three things are not free, and all three have to be
designed around rather than discovered in profiling:

1. **The gradient must not redraw per frame.** A `RadialGradient` inside a
   `ScrollView`'s content is re-rasterised as the content moves. It belongs
   *behind* the scroll view, in a layer that never moves.
2. **A 24px dot texture drawn per-dot is thousands of draw calls.** At 393×852
   in points that is ~570 dots, redrawn on every invalidation. Draw it **once**
   into a tile and let the system repeat it.
3. **The wandering mark must idle.** Law 8 already made Android step the wander
   (1.2s every 12s) "so the window idles". iOS has the same problem with more
   teeth: a continuously animating layer keeps the display awake, defeats
   ProMotion's variable refresh, and shows up as battery. Use the same stepped
   approach, and stop entirely in Low Power Mode.

---

## 2. Tokens

Mirror `theme-resolution.css`. These are the only colours in this document and
every one already exists.

```swift
// Ground.swift
import SwiftUI

extension Color {
    init(_ hex: UInt32, _ a: Double = 1) {
        self.init(.sRGB,
                  red:   Double((hex >> 16) & 0xff) / 255,
                  green: Double((hex >>  8) & 0xff) / 255,
                  blue:  Double( hex        & 0xff) / 255,
                  opacity: a)
    }
}

enum Ground {
    // canvas — law 7's ground, identical in both markets
    static func canvas(_ dark: Bool) -> Color { dark ? Color(0x0a0524) : Color(0xf8f3eb) }

    // THE HALO.
    // Light blooms are WARM and LIGHTER than the cream: the axis is hue
    // (37° -> 46°), because white-on-cream tops out at 1.105:1 and disappears.
    // Dark blooms are INDIGO and brighter: the axis is brightness, peak 1.26:1.
    // Do not swap them. A cool bloom on cream turns the ground grey even when
    // it is lighter — that is the retired `--blob` failure.
    static func halo(_ dark: Bool) -> [(Color, UnitPoint, CGFloat)] {
        dark
        ? [(Color(0x2b396c, 0.50), UnitPoint(x: 0.88, y: 0.02), 0.62),
           (Color(0x3a2a60, 0.42), UnitPoint(x: 0.02, y: 0.30), 0.54),
           (Color(0x243464, 0.38), UnitPoint(x: 0.74, y: 0.92), 0.70)]
        : [(Color(0xfffcf2, 0.92), UnitPoint(x: 0.88, y: 0.02), 0.62),
           (Color(0xfffaf0, 0.80), UnitPoint(x: 0.02, y: 0.30), 0.54),
           (Color(0xfffdf6, 0.85), UnitPoint(x: 0.74, y: 0.92), 0.70)]
    }

    static func texture(_ dark: Bool) -> Color {
        dark ? Color(0xf8f3eb, 0.030) : Color(0x080331, 0.028)
    }

    static func mark(_ dark: Bool) -> Color {
        dark ? Color(0xa2baff, 0.06) : Color(0x4865ff, 0.06)   // law 8: 6% accent
    }

    static let texturePitch: CGFloat = 24   // law 7
    static let markSize:     CGFloat = 1400 // law 8
}
```

---

## 3. The halo

Three `RadialGradient`s stacked, each ending in `.clear`. `endRadius` is a
fraction of the **diagonal**, which is how the CSS percentages behave — using
width or height alone makes the blooms the wrong shape on an iPad.

```swift
struct HaloLayer: View {
    @Environment(\\.colorScheme) private var scheme

    var body: some View {
        GeometryReader { geo in
            let dark = scheme == .dark
            let diag = hypot(geo.size.width, geo.size.height)
            ZStack {
                Ground.canvas(dark)
                ForEach(Array(Ground.halo(dark).enumerated()), id: \\.offset) { _, bloom in
                    RadialGradient(
                        gradient: Gradient(colors: [bloom.0, bloom.0.opacity(0)]),
                        center: bloom.1,
                        startRadius: 0,
                        endRadius: diag * bloom.2
                    )
                }
            }
            .drawingGroup()          // rasterise once; the layer never changes
            .ignoresSafeArea()
        }
    }
}
```

`.drawingGroup()` is the important line: it flattens three gradients into one
texture on the GPU. Without it each bloom composites separately every frame.

---

## 4. The texture

One tile, drawn once, repeated by the system. Never a `ForEach` of circles.

```swift
struct TextureLayer: View {
    @Environment(\\.colorScheme) private var scheme

    var body: some View {
        let dark  = scheme == .dark
        let pitch = Ground.texturePitch
        Canvas { ctx, size in
            let dot = Path(ellipseIn: CGRect(x: 0, y: 0, width: 1.6, height: 1.6))
            ctx.fill(dot.offsetBy(dx: pitch / 2 - 0.8, dy: pitch / 2 - 0.8),
                     with: .color(Ground.texture(dark)))
        }
        .frame(width: pitch, height: pitch)
        .drawingGroup()
        // repeat the tile across the screen
        .background(alignment: .topLeading) { Color.clear }
        .modifier(TileModifier(pitch: pitch))
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// Repeats the 24pt tile. Uses `Image(uiImage:).resizable(resizingMode: .tile)`
/// so the repeat happens in Core Animation, not in SwiftUI's layout pass.
struct TileModifier: ViewModifier {
    let pitch: CGFloat
    func body(content: Content) -> some View {
        content.overlay {
            if let img = Self.render(pitch: pitch) {
                Image(uiImage: img)
                    .resizable(resizingMode: .tile)
                    .ignoresSafeArea()
                    .allowsHitTesting(false)
            }
        }
    }
    @MainActor static func render(pitch: CGFloat) -> UIImage? { /* ImageRenderer of one tile */ nil }
}
```

In practice: render the tile once with `ImageRenderer` at
`scale = UIScreen.main.scale`, cache it per colour scheme, and hand it to
`Image(uiImage:).resizable(resizingMode: .tile)`. One `CALayer` with a pattern
fill, zero per-frame cost.

**Do not** lower the texture's alpha to "make it subtle". It is already at the
web's value (2.8% light / 3.0% dark). Subtle in light is by design — law 7
says so explicitly.

---

## 5. The wandering mark

Law 8: an eight-dot rose at 1400px, 6% accent, on a 48s figure, **still under
reduced motion**, stepped on Android so the window idles.

```swift
struct WanderingMark: View {
    @Environment(\\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\\.colorScheme) private var scheme
    @State private var phase: Int = 0

    // Android steps 1.2s every 12s. iOS uses the same cadence: four steps
    // around the 48s figure, so the layer is static 90% of the time.
    private let step = Timer.publish(every: 12, on: .main, in: .common).autoconnect()

    var body: some View {
        GeometryReader { geo in
            let t = Double(phase) * .pi / 2                       // 4 steps / 48s
            let ax = geo.size.width  * 0.10
            let ay = geo.size.height * 0.06
            RoseShape()                                            // canonical geometry
                .fill(Ground.mark(scheme == .dark))
                .frame(width: Ground.markSize, height: Ground.markSize)
                .position(x: geo.size.width * 0.5 + sin(t) * ax,
                          y: geo.size.height * 0.42 + sin(2 * t) * ay)  // figure-eight
                .animation(reduceMotion ? nil : .easeInOut(duration: 1.2), value: phase)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .onReceive(step) { _ in
            guard !reduceMotion,
                  !ProcessInfo.processInfo.isLowPowerModeEnabled else { return }
            phase = (phase + 1) % 4
        }
    }
}
```

Three guards, all required:

- `accessibilityReduceMotion` — law 8 says the mark is **still**, not slower.
- `isLowPowerModeEnabled` — a decorative layer must not cost battery when the
  user has asked for the opposite.
- The 12s cadence — the layer is static for 10.8 of every 12 seconds, so the
  display can drop to its idle refresh rate.

`RoseShape` is the canonical geometry from law 9 — ring r=11 in a 24 box, eight
bearings, `r = 2.275 + 0.2944 * i` clockwise from 000, **the two largest dots
touching at 270/315 on purpose**. At this size it is the display cut, so the
path's bounds are the true bbox (x −3.041…25.864, y −1.275…26.453) plus 1.2
clear space, squared:

```swift
struct RoseShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let vb = CGRect(x: -4.2416, y: -3.0639, width: 31.3054, height: 31.3054)
        let s  = min(rect.width, rect.height) / vb.width
        for i in 0..<8 {
            let a  = Double(i) * .pi / 4 - .pi / 2
            let cx = (12 + 11 * cos(a) - vb.minX) * s
            let cy = (12 + 11 * sin(a) - vb.minY) * s
            let r  = (2.275 + 0.2944 * Double(i)) * s
            p.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        }
        return p
    }
}
```

---

## 6. Assembly — one modifier, every screen

Law 7's whole point is that there is **one** ground and no screen paints its
own. Express that as a single modifier so it cannot be forgotten or duplicated.

```swift
extension View {
    /// The ground. Apply once, at the root of every screen, outside any ScrollView.
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

// Usage — note the ScrollView is the CONTENT, not the ground's parent.
struct BrowseScreen: View {
    var body: some View {
        ScrollView { /* … */ }
            .ground()
    }
}
```

**The rule that keeps law 7 true on iOS:** no screen, sheet, card or section may
set a `background` that covers more than half the viewport. If a screen needs a
surface, it is `--surface` on a rounded card, not a full-bleed fill. That is
the same rule as `check_halo.mjs`'s ">50% of the viewport" assertion, and it is
what caught the web's 1.126:1 seam.

---

## 7. Sheets keep the ground visible

THEME.md §15 already specifies sheets under 620px: full width, 90dvh, rounded
top only, grab handle, 30px icon Close, full-width action above the home bar,
scrim .66, themed thin scrollbar.

On iOS that is `.presentationDetents([.fraction(0.9)])` with
`.presentationBackground` set to `--surface` — **not** `.regularMaterial`. A
system material samples whatever is behind it, which means the market's hero
gradient would tint a sheet, and law 1 says market owns the hero and nothing
else. An explicit surface colour is the only safe choice.

```swift
.sheet(isPresented: $showing) {
    CoverLetterSheet()
        .presentationDetents([.fraction(0.9)])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(22)                 // --radius-sheet
        .presentationBackground(Color.surface)        // never .regularMaterial
}
```

The scrim at `.66` comes from THEME.md §15 and is measured: it puts the content
behind at 2.78:1 on light and 2.68:1 on dark. A scrim is meant to *fail*
contrast — at the 0.55 the mockup used, the page behind still read at 4.08:1,
which is why a half-covered heading looked like a rendering fault.

---

## 8. Acceptance

Add to the build order as part of **Stage 7**.

- **Screenshot parity.** An iOS simulator capture of browse, in both themes and
  both markets, sampled at six corners, matches the web's halo lift within
  **±0.02** of the ratio: light peak 1.105:1 ceiling, dark peak 1.26:1. This is
  the same six-corner method that found `/saved` had no halo at all.
- **Hue, not brightness, on light.** Sample a 12-point grid on the light
  screen: every sample has chroma ≥ 0.012 and hue within 25–50°. A cool bloom
  fails this even if its luminance is right.
- **One ground.** Assert no view other than the root sets a background larger
  than half the screen. A snapshot test with the ground layer removed must show
  a *uniformly* transparent page — if any screen still has colour, it is
  painting its own.
- **The mark idles.** Instruments Core Animation: zero commits in a 10-second
  window with no user input. Then enable Low Power Mode and confirm the phase
  timer no longer fires at all.
- **Reduced motion.** With `accessibilityReduceMotion` on, the mark's position
  is constant across a 60-second capture, and the halo and texture are
  unchanged — reduced motion removes motion, not the ground.

**Mutation:** swap the light and dark halo colour arrays. The hue assertion
must fail on light — a bloom that is lighter but cool turns the cream grey, and
that is precisely the bug this spec exists to prevent from returning.

---

## 9. Order

1. `Ground.swift` with the tokens and `RoseShape`.
2. `HaloLayer` — the biggest visual win, and on its own it closes most of the
   gap with web and Android.
3. `TextureLayer` with the cached tile.
4. `WanderingMark` with all three guards.
5. `.ground()` applied at every screen root; delete any per-screen background
   as you go.
6. Sheets to §15.

Steps 1–2 are worth shipping alone. iOS currently has a flat colour where the
other three surfaces have a ground, and that is the whole visible difference.
