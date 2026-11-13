"""Grids of full-frame stills (each tile = the 1920x1080 frame at half size; multiply tile
coordinates by 2 for source pixels), with a 100 px grid drawn to read positions.
usage: stills.py <out.png> <cam>:<seconds> [<cam>:<seconds> ...]   (up to 4 per grid)"""
import subprocess, sys, tempfile
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[4]
FFMPEG = str(next((ROOT / ".local/video-venv/Lib/site-packages/imageio_ffmpeg/binaries").glob("ffmpeg-*.exe")))
FOOT = Path(__file__).resolve().parents[1] / "remotion/public/footage"
out, specs = sys.argv[1], sys.argv[2:]
grid = Image.new("RGB", (1920, 1080 if len(specs) > 2 else 540), "white")
with tempfile.TemporaryDirectory() as tmp:
    for i, spec in enumerate(specs):
        cam, t = spec.split(":")
        png = Path(tmp) / f"{i}.png"
        subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", t, "-i", str(FOOT / f"{cam}.mp4"), "-frames:v", "1", str(png)], check=True)
        im = Image.open(png).convert("RGB")
        d = ImageDraw.Draw(im)
        for x in range(0, 1920, 100):
            d.line([(x, 0), (x, 1080)], fill=(255, 0, 120) if x % 500 == 0 else (255, 170, 200), width=1)
            d.text((x + 2, 2), str(x), fill=(200, 0, 90))
        for y in range(0, 1080, 100):
            d.line([(0, y), (1920, y)], fill=(255, 0, 120) if y % 500 == 0 else (255, 170, 200), width=1)
            d.text((2, y + 2), str(y), fill=(200, 0, 90))
        d.text((1700, 1050), spec, fill=(0, 0, 0))
        grid.paste(im.resize((960, 540)), ((i % 2) * 960, (i // 2) * 540))
grid.save(out)
print(out)
