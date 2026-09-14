"""Compose Play Store screenshots from raw phone captures.

Play wants 9:16 with every side 320-3840 (phone) and 1080-7680 (10-inch tablet).
A modern phone shoots ~9:19.5 at 591 px wide, which fails both. Rather than crop
content, each capture sits on a cream 1440x2560 canvas inside a rounded device
frame with a one-line caption in the brand serif - the one file then serves
every screenshot field.

    python tools/play_shots.py <input dir> <output dir>

Captions come from the file name (candidate/scoring/gates/saved), and the raw
files are left untouched.
"""
import sys, pathlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1440, 2560
CREAM, INK, INDIGO, MUTED = (248, 243, 235), (8, 3, 49), (72, 101, 255), (74, 69, 96)
SERIF = "C:/Workspaces/jobscout-app/android/app/src/main/res/font/newsreader.ttf"
SANS = "C:/Workspaces/jobscout-app/android/app/src/main/res/font/inter.ttf"
CAPTIONS = {
    "candidate": ("Start with a candidate.", "Three profiles, or your own resume."),
    "scoring":   ("What Claude makes of them.", "A fit, a verdict, the strongest point and the weakest."),
    "gates":     ("Why those, and not the rest.", "Every rejection carries its reason."),
    "saved":     ("The ones you kept.", "Saved on your device. You click Apply."),
}

def font(path, size, weight=None):
    f = ImageFont.truetype(path, size)
    if weight is not None:
        try: f.set_variation_by_axes([weight] if path == SANS else [weight, 16])
        except Exception: pass
    return f

def dots(canvas):
    d = ImageDraw.Draw(canvas)
    for y in range(24, H, 32):
        for x in range(24, W, 32):
            d.ellipse((x - 1.5, y - 1.5, x + 1.5, y + 1.5), fill=(231, 226, 218))

def compose(src, dst, key):
    shot = Image.open(src).convert("RGB")
    # drop the phone's own status bar and the three-button nav: the listing shows
    # the app, not the clock, and a Dialog-era grey bar cannot sneak in
    top, bottom = round(shot.height * 58 / 1280), round(shot.height * 68 / 1280)
    shot = shot.crop((0, top, shot.width, shot.height - bottom))
    canvas = Image.new("RGB", (W, H), CREAM); dots(canvas)
    d = ImageDraw.Draw(canvas)
    title, sub = CAPTIONS.get(key, (key.title(), ""))
    fT, fS = font(SERIF, 96, 500), font(SANS, 40, 450)
    d.text((W // 2, 190), title, fill=INK, font=fT, anchor="mm")
    d.text((W // 2, 280), sub, fill=MUTED, font=fS, anchor="mm")
    # the phone: scaled to fit the band under the caption, rounded, on a warm shadow
    target_h = H - 420 - 120
    scale = target_h / shot.height
    ph = shot.resize((round(shot.width * scale), target_h), Image.LANCZOS)
    r = 56
    mask = Image.new("L", ph.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, ph.width, ph.height), r, fill=255)
    x, y = (W - ph.width) // 2, 420
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x, y + 30, x + ph.width, y + ph.height + 30), r, fill=(75, 68, 57, 70))
    shadow = shadow.filter(ImageFilter.GaussianBlur(40))
    canvas.paste(shadow, (0, 0), shadow)
    # a hairline frame so the cream edges of the capture do not melt into the canvas
    frame = Image.new("RGBA", (ph.width + 8, ph.height + 8), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, ph.width + 7, ph.height + 7), r + 4, fill=(255, 255, 255, 255), outline=(8, 3, 49, 40), width=2)
    canvas.paste(frame, (x - 4, y - 4), frame)
    canvas.paste(ph, (x, y), mask)
    canvas.save(dst, "PNG", optimize=True)
    return canvas.size

if __name__ == "__main__":
    src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in src.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    for i, p in enumerate(files, 1):
        key = next((k for k in CAPTIONS if k in p.stem.lower()), p.stem)
        order = {"candidate": 1, "scoring": 2, "gates": 3, "saved": 4}
        dst = out / f"play-{order.get(key, i):02d}-{key}.png"
        print(dst.name, compose(p, dst, key))
