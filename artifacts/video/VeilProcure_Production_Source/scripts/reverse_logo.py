"""Video-only reversed logo for dark (#0d201c) backgrounds, derived from the approved green artwork.
Each pixel keeps its alpha; night-green tones become white, the evergreen/mint tones are lifted so
they stay visible on dark. Input: apps/web/public/brand/vp-{mark,wordmark}-green.png.
Output: remotion/public/brand/vp-{mark,wordmark}-{green,light}.png."""
import colorsys
import shutil
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[4]
src = root / "apps/web/public/brand"
out = Path(__file__).resolve().parents[1] / "remotion/public/brand"
out.mkdir(parents=True, exist_ok=True)


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


WHITE, MINT, MINT_LIGHT = (255, 255, 255), (0, 236, 151), (120, 248, 196)

for name in ("vp-mark", "vp-wordmark"):
    shutil.copy(src / f"{name}-green.png", out / f"{name}-green.png")
    im = Image.open(src / f"{name}-green.png").convert("RGBA")
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if v < 0.30:  # night green (the V, "Veil") -> white
                c = WHITE
            else:  # evergreen and mint parts -> one smooth mint gradient across the artwork (no texture)
                c = lerp(MINT_LIGHT, MINT, x / max(1, im.width - 1))
            px[x, y] = (*c, a)
    im.save(out / f"{name}-light.png")
    print(name, im.size)

# Preview on the video's dark and light backgrounds
prev = Image.new("RGB", (1300, 420), (13, 32, 28))
light = Image.new("RGB", (1300, 210), (250, 251, 249))
prev.paste(light, (0, 210))
for row, kind in ((0, "light"), (210, "green")):
    m = Image.open(out / f"vp-mark-{kind}.png").convert("RGBA")
    w = Image.open(out / f"vp-wordmark-{kind}.png").convert("RGBA")
    m = m.resize((round(m.width * 130 / m.height), 130))
    w = w.resize((round(w.width * 65 / w.height), 65))
    prev.paste(m, (60, row + 40), m)
    prev.paste(w, (60 + m.width + 30, row + 72), w)
prev.save(out.parent.parent.parent / "logo-preview.png")
print("preview written")
