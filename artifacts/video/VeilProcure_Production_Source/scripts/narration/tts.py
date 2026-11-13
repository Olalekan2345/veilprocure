"""Synthesises every narration line with Kokoro (local, Apache-2.0) and records its duration.
Writes narration/lines/<scene>-<n>.wav and narration/timing.json (scene, line, seconds, words)."""
import json, sys, time
from pathlib import Path
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

here = Path(__file__).parent
script = json.loads((here / "script.json").read_text(encoding="utf-8"))
out = here / "lines"; out.mkdir(exist_ok=True)
k = Kokoro(str(here.parent.parent / "kokoro/kokoro-v1.0.onnx"), str(here.parent.parent / "kokoro/voices-v1.0.bin"))
timing, total_words, total_sec = [], 0, 0.0
t0 = time.time()
prev = {}
if (here / "timing.json").exists():  # reuse lines whose text, voice and speed are unchanged
    old = json.loads((here / "timing.json").read_text(encoding="utf-8"))
    if old.get("voice") == script["voice"] and old.get("speed") == script["speed"]:
        prev = {l["file"]: l["text"] for l in old["lines"]}
for scene in script["scenes"]:
    for i, line in enumerate(scene["lines"], 1):
        name = f"{scene['id']}-{i}.wav"
        if prev.get(name) == line and (out / name).exists():
            audio, sr = sf.read(out / name, dtype="float32")
            sec = len(audio) / sr; words = len(line.split())
            timing.append({"scene": scene["id"], "n": i, "file": name, "seconds": round(sec, 3), "words": words, "text": line, "peak": round(float(np.abs(audio).max()), 3)})
            total_words += words; total_sec += sec
            continue
        audio, sr = k.create(line, voice=script["voice"], speed=script["speed"], lang="en-us")
        audio = audio.astype(np.float32)
        # trim leading/trailing silence below -50 dBFS, keep 60 ms of air
        thr = 10 ** (-50 / 20); idx = np.where(np.abs(audio) > thr)[0]
        if len(idx): a, b = max(0, idx[0] - int(0.06 * sr)), min(len(audio), idx[-1] + int(0.06 * sr)); audio = audio[a:b]
        name = f"{scene['id']}-{i}.wav"; sf.write(out / name, audio, sr)
        sec = len(audio) / sr; words = len(line.split())
        timing.append({"scene": scene["id"], "n": i, "file": name, "seconds": round(sec, 3), "words": words, "text": line, "peak": round(float(np.abs(audio).max()), 3)})
        total_words += words; total_sec += sec
        print(f"{scene['id']}-{i}: {sec:5.2f}s  {words:3d} words  | {line[:70]}", flush=True)
(here / "timing.json").write_text(json.dumps({"sampleRate": sr, "voice": script["voice"], "speed": script["speed"], "totalWords": total_words, "totalSeconds": round(total_sec, 2), "lines": timing}, indent=2), encoding="utf-8")
by_scene = {}
for t in timing: by_scene.setdefault(t["scene"], 0.0); by_scene[t["scene"]] += t["seconds"]
for s in script["scenes"]: print(f"{s['id']:4} window {s['window'][1]-s['window'][0]:3d}s  speech {by_scene[s['id']]:5.1f}s")
print(f"TOTAL {total_words} words, {total_sec:.1f}s of speech, generated in {time.time()-t0:.0f}s")
