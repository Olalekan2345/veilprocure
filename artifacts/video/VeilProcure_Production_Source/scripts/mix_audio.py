"""Final soundtrack: narration lines placed at their edit times, the original music bed ducked
under the voice, soft UI accents at confirmations, loudness-normalised to -16 LUFS (stereo, 48 kHz).
Reads remotion/src/timeline.json (voice cues and accents) and narration/lines/*.wav.
Output: ../VeilProcure_Production_Source/audio/final_mix.wav"""
import json, subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[4]
FFMPEG = str(next((ROOT / ".local/video-venv/Lib/site-packages/imageio_ffmpeg/binaries").glob("ffmpeg-*.exe")))
SR = 48000
tl = json.loads((HERE / "remotion/src/timeline.json").read_text(encoding="utf-8"))
dur = tl["durationSec"]
n = int(dur * SR)
voice = np.zeros(n)


def load(path):
    a, sr = sf.read(path, dtype="float64")
    if a.ndim > 1:
        a = a.mean(axis=1)
    if sr != SR:  # resample (linear is fine for speech at 24k -> 48k; checked by ear)
        x = np.arange(len(a)) / sr
        a = np.interp(np.arange(int(len(a) * SR / sr)) / SR, x, a)
    return a


for cue in tl["voice"]:
    a = load(HERE / "audio/narration" / cue["file"])
    s = int(cue["start"] * SR)
    e = min(n, s + len(a))
    voice[s:e] += a[: e - s]

# Music bed, ducked smoothly under narration (-11 dB while speaking, 300 ms attack / 700 ms release)
bed, bsr = sf.read(HERE / "audio/music_bed.wav", dtype="float64")
bed = bed[:n] if len(bed) >= n else np.pad(bed, ((0, n - len(bed)), (0, 0)))
env = np.abs(voice)
win = int(0.05 * SR)
env = np.convolve(env, np.ones(win) / win, mode="same")
speaking = (env > 0.01).astype(float)
duck = np.ones(n)
g = 1.0
att, rel = 1 / (0.3 * SR), 1 / (0.7 * SR)
low = 10 ** (-11 / 20)
for i in range(0, n, 48):  # control rate 1 kHz
    target = low if speaking[i] else 1.0
    step = att * 48 if target < g else rel * 48
    g = max(target, g - step) if target < g else min(target, g + step)
    duck[i : i + 48] = g
music_gain = 10 ** (-9 / 20)
mix = bed * (duck * music_gain)[:, None]

# Soft accents (synthesised): a two-note mint chime at each on-chain confirmation, a low whoosh at scene cuts
t = np.arange(int(0.9 * SR)) / SR
chime = (np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t / 0.18) + 0.7 * np.sin(2 * np.pi * 1975.5 * np.maximum(0, t - 0.09)) * np.exp(-np.maximum(0, t - 0.09) / 0.22) * (t > 0.09)) * 0.07
rng = np.random.default_rng(3)
wt = np.arange(int(0.7 * SR)) / SR
whoosh = rng.standard_normal(len(wt))
whoosh = np.convolve(whoosh, np.ones(60) / 60, mode="same") * np.sin(np.pi * wt / wt[-1]) ** 2 * 0.05
for acc in tl.get("accents", []):
    snd = chime if acc["kind"] == "chime" else whoosh
    s = int(acc["t"] * SR)
    e = min(n, s + len(snd))
    mix[s:e] += snd[: e - s, None]

mix += voice[:, None] * 0.98
# final fade-out
fade = int(1.2 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
pre = HERE / "audio/premix.wav"
sf.write(pre, mix.astype(np.float32), SR)

out = HERE / "audio/final_mix.wav"
r = subprocess.run([FFMPEG, "-y", "-hide_banner", "-i", str(pre), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary", "-ar", "48000", "-ac", "2", str(out)], capture_output=True, text=True, check=True)
print("\n".join(l for l in r.stderr.splitlines() if any(k in l for k in ("Input Integrated", "Output Integrated", "Output True Peak", "Output LRA"))))
print("written", out)
