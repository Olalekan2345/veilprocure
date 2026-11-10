"""Recolours the approved VeilProcure logo for the NEAR-green site palette.

Only colours change: every pixel keeps its alpha and its brightness within its colour family, so
the artwork's shapes, proportions, gradients and shading are preserved. The original navy/gold
files (public/brand/vp-*.png) stay in the repository; this writes *-green.png next to them.

    python scripts/brand/recolor_logo.py
"""
import colorsys
from pathlib import Path

from PIL import Image

BRAND = Path(__file__).resolve().parents[2] / "apps/web/public/brand"
APP = Path(__file__).resolve().parents[2] / "apps/web/src/app"

# Brightness (HSV value) → colour stops. Navy + blue form one continuous "cool" family (the P's
# shading runs from navy into blue); gold is the accent family.
COOL = [(0.10, "#081a15"), (0.20, "#0d2b22"), (0.34, "#0b4a37"), (0.50, "#087a58"), (0.70, "#12b07a")]
GOLD = [(0.50, "#007f55"), (0.60, "#00a56d"), (0.72, "#00cf88")]


def hex_rgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def ramp(stops, v):
    if v <= stops[0][0]:
        return hex_rgb(stops[0][1])
    for (v0, c0), (v1, c1) in zip(stops, stops[1:]):
        if v <= v1:
            t = (v - v0) / (v1 - v0)
            a, b = hex_rgb(c0), hex_rgb(c1)
            return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return hex_rgb(stops[-1][1])


def recolor(src: Path) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            gold = s > 0.35 and 20 <= h * 360 <= 65
            px[x, y] = (*ramp(GOLD if gold else COOL, v), a)
    return im


if __name__ == "__main__":
    for name in ("vp-mark", "vp-wordmark", "vp-logo"):
        out = recolor(BRAND / f"{name}.png")
        out.save(BRAND / f"{name}-green.png", optimize=True)
        print("wrote", f"{name}-green.png", out.size)
    # Browser-tab icon: green mark centred on a transparent square.
    mark = Image.open(BRAND / "vp-mark-green.png")
    icon = Image.new("RGBA", (192, 192), (0, 0, 0, 0))
    m = mark.resize((172, round(mark.height * 172 / mark.width)), Image.LANCZOS)
    icon.paste(m, ((192 - m.width) // 2, (192 - m.height) // 2), m)
    icon.save(APP / "icon.png", optimize=True)
    print("wrote app/icon.png", icon.size)
