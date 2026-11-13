"""Contact sheet for choosing shots: thumbnails of one camera's video between two times.
Tiles read left to right, top to bottom; tile i shows time from + i * step (printed on exit).
usage: contact_sheet.py <cam> <from_s> <to_s> <out.png> [cols=4] [rows=3]"""
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
FFMPEG = str(next((ROOT / ".local/video-venv/Lib/site-packages/imageio_ffmpeg/binaries").glob("ffmpeg-*.exe")))
cam, a, b, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
cols = int(sys.argv[5]) if len(sys.argv) > 5 else 4
rows = int(sys.argv[6]) if len(sys.argv) > 6 else 3
n = cols * rows
step = (b - a) / n
src = Path(__file__).resolve().parents[1] / f"remotion/public/footage/{cam}.mp4"
tw = 1920 // cols - 4
vf = f"fps=1/{step:.3f},scale={tw}:{tw * 9 // 16},tile={cols}x{rows}:padding=4:color=white"
subprocess.run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", str(a), "-t", str(b - a), "-i", str(src), "-vf", vf, "-frames:v", "1", out], check=True)
print(out, "tiles at:", " ".join(f"{a + i * step:.1f}" for i in range(n)))
