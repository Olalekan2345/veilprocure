"""Turns each camera's screencast frames (variable rate, one PNG per screen change) into a constant
30 fps H.264 file for the edit, and writes how wall-clock markers map to that file's timeline.
Input:  .local/video/footage/<cam>/NNNNNN.png + frames.tsv, markers.jsonl
Output: remotion/public/footage/<cam>.mp4, remotion/public/footage/index.json"""
import bisect, csv, json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
FOOT = ROOT / ".local/video/footage"
OUT = Path(__file__).resolve().parents[1] / "remotion/public/footage"
FFMPEG = str(next((ROOT / ".local/video-venv/Lib/site-packages/imageio_ffmpeg/binaries").glob("ffmpeg-*.exe")))
OUT.mkdir(parents=True, exist_ok=True)
# The screencast only emits a frame when the screen changes, so idle stretches (the 12-minute wait
# for the on-chain deadline, a camera waiting while another films) become one long-held frame.
# Each frame is held at most CAP seconds; no captured frame is dropped. Markers use the same map.
CAP = 6.0
only = set(sys.argv[1:])

index = {"cams": {}, "markers": []}
maps = {}
for cam_dir in sorted(p for p in FOOT.iterdir() if p.is_dir()):
    rows = list(csv.DictReader(open(cam_dir / "frames.tsv"), delimiter="\t"))
    rows = [r for r in rows if (cam_dir / f"{int(r['frame']):06d}.png").exists()]
    if not rows:
        continue
    walls = [int(r["wall_ms"]) for r in rows]
    lines, starts, vt = [], [], 0.0
    for i, r in enumerate(rows):
        dur = min(CAP, ((walls[i + 1] if i + 1 < len(rows) else walls[i] + 1500) - walls[i]) / 1000)
        dur = max(dur, 0.001)
        starts.append(vt)
        vt += dur
        lines.append(f"file '{cam_dir.as_posix()}/{int(r['frame']):06d}.png'\nduration {dur:.4f}")
    lines.append(f"file '{cam_dir.as_posix()}/{int(rows[-1]['frame']):06d}.png'")
    maps[cam_dir.name] = (walls, starts)
    dst = OUT / f"{cam_dir.name}.mp4"
    index["cams"][cam_dir.name] = {"file": f"footage/{cam_dir.name}.mp4", "t0Wall": walls[0], "seconds": round(vt, 2), "frames": len(rows), "capSeconds": CAP}
    if only and cam_dir.name not in only:
        continue
    lst = cam_dir / "concat.txt"
    lst.write_text("\n".join(lines) + "\n", encoding="utf-8")
    cmd = [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
           "-vf", "fps=30,format=yuv420p", "-fps_mode", "cfr", "-c:v", "libx264", "-preset", "faster", "-crf", "13",
           "-tune", "stillimage", "-g", "30", "-movflags", "+faststart", str(dst)]
    subprocess.run(cmd, check=True)
    print(f"{cam_dir.name}: {len(rows)} frames -> {vt:.1f}s  {dst.stat().st_size/1e6:.1f} MB", flush=True)

for line in (FOOT / "markers.jsonl").read_text(encoding="utf-8").splitlines():
    m = json.loads(line)
    if m["cam"] in maps:  # video time of the last frame at/before the marker, plus the (capped) time since
        walls, starts = maps[m["cam"]]
        i = max(0, bisect.bisect_right(walls, m["wall"]) - 1)
        m["t"] = round(starts[i] + min(CAP, max(0.0, (m["wall"] - walls[i]) / 1000)), 2)
    index["markers"].append(m)
(OUT / "index.json").write_text(json.dumps(index, indent=1), encoding="utf-8")
for m in index["markers"]:
    print(f"  {m['cam']:10} {m.get('t', '?'):>8}  {m['name']}")
