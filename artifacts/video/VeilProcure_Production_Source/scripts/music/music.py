"""Original soundtrack for the explainer: a restrained electronic bed (additive pads, soft pulse,
sparse plucked arpeggio, air), written for the film's sections. Pure numpy; no samples, no
third-party audio. Output: music/bed.wav (48 kHz stereo, ~185 s, peaks at -6 dBFS)."""
import numpy as np, soundfile as sf
from pathlib import Path

SR, LEN = 48000, 185.0
N = int(SR * LEN); t = np.arange(N) / SR
rng = np.random.default_rng(7)

def note(name):  # "D3" -> Hz
    semis = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    return 440.0 * 2 ** ((semis[name[:-1]] + 12 * (int(name[-1]) - 4) - 9) / 12)

def env_points(points):  # piecewise-linear gain over time from [(sec, gain), ...]
    xs, ys = zip(*points); return np.interp(t, xs, ys)

def pad_voice(freq, start, end, amp=1.0, bright=1.0):
    """Additive pad: 3 detuned voices, harmonics rolled off, slow attack/release, gentle vibrato."""
    seg = slice(int(start * SR), int(end * SR)); tt = t[seg] - start; n = len(tt)
    out = np.zeros(n)
    for det in (-0.35, 0.0, 0.35):
        f = freq * 2 ** (det / 1200) * (1 + 0.0025 * np.sin(2 * np.pi * 0.18 * tt + det))
        ph = 2 * np.pi * np.cumsum(f) / SR
        for h in range(1, 14):
            out += np.sin(h * ph) / (h ** (1.9 / bright)) * (1.0 if h % 2 else 0.6)
    att = np.clip(tt / 2.2, 0, 1) ** 2; rel = np.clip((end - start - tt) / 2.6, 0, 1) ** 2
    return seg, out * att * rel * amp / 9.0

def pluck(freq, start, amp, decay=0.7):
    n = int(decay * 3 * SR); seg = slice(int(start * SR), min(N, int(start * SR) + n)); tt = np.arange(seg.stop - seg.start) / SR
    sig = (np.sin(2 * np.pi * freq * tt) + 0.35 * np.sin(2 * np.pi * 2 * freq * tt) + 0.12 * np.sin(2 * np.pi * 3 * freq * tt))
    return seg, sig * np.exp(-tt / decay) * (1 - np.exp(-tt / 0.004)) * amp

CHORDS = [  # one chord per 8 s, 32 s cycle: Dmaj9, Bm7(add11), Gmaj7, Asus2 — open, hopeful
    ["D2", "A2", "D3", "F#3", "C#4", "E4"],
    ["B1", "F#2", "B2", "D3", "A3", "E4"],
    ["G1", "D2", "G2", "B2", "F#3", "D4"],
    ["A1", "E2", "A2", "B2", "E3", "C#4"],
]
L = np.zeros(N); R = np.zeros(N)

# Pads from 0 s; the top two notes join at 30 s (narration starts, texture opens) and an octave shimmer from 137 s (escrow lift)
for i, start in enumerate(np.arange(0, LEN, 8.0)):
    chord = CHORDS[i % 4]; end = min(LEN, start + 8.6)
    for j, nm in enumerate(chord):
        if j >= 4 and start < 30: continue
        seg, v = pad_voice(note(nm), start, end, amp=0.9 if j < 2 else 0.55, bright=1.0 if start < 137 else 1.25)
        pan = 0.5 + 0.35 * ((j % 3) - 1) / 1.0 * 0.5
        L[seg] += v * (1 - pan); R[seg] += v * pan
        if start >= 137 and j in (3, 4):
            seg, v = pad_voice(note(nm) * 2, start, end, amp=0.22, bright=1.3)
            L[seg] += v * pan; R[seg] += v * (1 - pan)

# Soft pulse at 92 bpm from 30 s to 173 s, low sine thump with a tiny click
beat = 60 / 92
for k in range(int(30 / beat), int(173 / beat)):
    s = k * beat; seg = slice(int(s * SR), int(s * SR) + int(0.35 * SR)); tt = np.arange(seg.stop - seg.start) / SR
    f = 52 * (1 + 1.8 * np.exp(-tt / 0.03)); thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.11) * (1 - np.exp(-tt / 0.002))
    g = 0.5 if k % 2 == 0 else 0.3
    L[seg] += thump * g; R[seg] += thump * g

# Sparse arpeggio: eighth notes on chord tones, skipping at random, with a dotted-eighth echo; 45 s → 173 s
eighth = beat / 2
for k in range(int(45 / eighth), int(173 / eighth)):
    s = k * eighth
    if rng.random() < 0.55: continue
    chord = CHORDS[int(s // 8) % 4]
    nm = chord[2 + int(rng.integers(0, 4))]; f = note(nm) * (2 if rng.random() < 0.5 else 4)
    amp = 0.16 * (0.6 + 0.4 * rng.random())
    for d, g, side in ((0.0, 1.0, 0.0), (eighth * 1.5, 0.45, 0.6), (eighth * 3.0, 0.2, -0.6)):
        seg, v = pluck(f, s + d, amp * g)
        L[seg] += v * (0.5 - 0.5 * side * 0.5); R[seg] += v * (0.5 + 0.5 * side * 0.5)

# Air: filtered noise that swells into the hook (0–12 s) and sighs out at the end
noise = rng.standard_normal(N); spec = np.fft.rfft(noise); freqs = np.fft.rfftfreq(N, 1 / SR)
spec *= np.exp(-((np.log(np.maximum(freqs, 1)) - np.log(1800)) ** 2) / 0.9); air = np.fft.irfft(spec, N); air /= np.abs(air).max()
air *= env_points([(0, 0.0), (9, 0.08), (12, 0.0), (172, 0.0), (176, 0.05), (182, 0.0)])
L += air; R += air * 0.9

# Section dynamics (the final mix also ducks under narration)
dyn = env_points([(0, 0.55), (10, 0.9), (12.5, 0.7), (30, 0.75), (136, 0.75), (138, 0.95), (156, 0.85), (173, 0.8), (178, 0.55), (183, 0.0), (185, 0.0)])
L *= dyn; R *= dyn

# Simple room: short diffuse reverb (exponentially decaying noise IR, 1.9 s) via FFT convolution, 18 % wet
ir_n = int(1.9 * SR); ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / (0.45 * SR)); ir /= np.sqrt(np.sum(ir ** 2))
def conv(x):
    n = 1 << (N + ir_n - 1).bit_length(); return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:N]
L = L + 0.18 * conv(L); R = R + 0.18 * conv(R)

mix = np.stack([L, R], axis=1); mix /= np.abs(mix).max(); mix *= 10 ** (-6 / 20)
Path(__file__).with_name("bed.wav").write_bytes(b"")
sf.write(Path(__file__).with_name("bed.wav"), mix.astype(np.float32), SR)
print("bed.wav", mix.shape, "peak dBFS", round(20 * np.log10(np.abs(mix).max()), 1), "rms dBFS", round(20 * np.log10(np.sqrt(np.mean(mix ** 2))), 1))
