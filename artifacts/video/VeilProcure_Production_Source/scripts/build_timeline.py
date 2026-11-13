"""The edit decision list. Builds remotion/src/timeline.json (shots, camera moves, callouts, captions,
testnet-label ranges, voice cues, sound accents), the SRT subtitles, and copies the narration and
music into audio/. Every footage shot names its camera and source time; every chain card is filled
from rpc-verification.json (NEAR testnet RPC), never typed in by hand."""
import json, re, shutil
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[4]
VID = ROOT / ".local/video"
idx = json.loads((HERE / "remotion/public/footage/index.json").read_text(encoding="utf-8"))
timing = json.loads((VID / "narration/timing.json").read_text(encoding="utf-8"))
rpc = json.loads((VID / "footage/rpc-verification.json").read_text(encoding="utf-8"))
manifest = json.loads((VID / "footage/manifest.json").read_text(encoding="utf-8"))
lines = {l["file"][:-4]: l for l in timing["lines"]}  # "S4-2" -> {seconds, text}

BUYER = {"kind": "Buyer", "name": "Northwind Studio (test buyer)"}
SUP_A = {"kind": "Supplier", "name": "Clearline Accessibility (test supplier)"}
SUP_B = {"kind": "Supplier", "name": "Harbor Digital (test supplier) · the competitor"}
ROLE = {"buyer": BUYER, "supplierA": SUP_A, "supplierB": SUP_B}

# Focus rectangles (source px, 16:9; w = width). Measured on gridded stills (sheets/st*.png).
# App pages: sidebar 0-330, content column 436-1814 (centre 1125). Public pages and dialogs are
# centred on 960. Every framing keeps whole cards and whole lines inside the window: no zoom may
# cut content at the left or right edge.
FULL = (0, 0, 1920)
def COL(y):                   # the app's content column with a margin; nothing of the sidebar
    return (395, y, 1460)
def CENTER(w, y):             # centred on the screen (public pages)
    return (960 - w // 2, y, w)
PAGE = COL(120)
DIALOG = (160, 85, 1600)      # the whole transaction preview (it is up to ~880 px tall)
CONFIRMED = (460, 258, 1000)  # "Confirmed on chain" state of the same dialog, centred


def shot(cam, src, dur, rate=1.0, rect=PAGE, to=None, callouts=(), fade=0.2):
    moves = [{"t": 0, "x": rect[0], "y": rect[1], "w": rect[2]}]
    if to:  # slow drift / push-in to a second rectangle over the shot
        moves.append({"t": dur, "x": to[0], "y": to[1], "w": to[2]})
    # Scrolled app pages get soft fades at the window's top and bottom edges so a line passing the
    # edge fades out instead of being sliced; dialogs, confirmations and centred pages do not.
    edge = rect not in (DIALOG, CONFIRMED, FULL) and rect[2] <= 1500 and cam != "supplierB" and rect != (335, 300, 1250) and rect[0] != 310
    return {"type": "footage", "cam": cam, "src": src, "dur": dur, "rate": rate, "moves": moves, "role": ROLE[cam], "edgeFade": edge,
            "callouts": [dict(zip(("t0", "t1", "x", "y", "w", "h", "text", "place"), c)) for c in callouts], "fadeIn": fade}


tx = {t["method"] + ("#2" if t["method"] == "approve_release" and t["status"] != "Success" and t["signer"].endswith("buyer.testnet") else ""): t for t in rpc["txs"]}
by_hash = {t["txHash"]: t for t in rpc["txs"]}
def rpc_tx(method, status=None, signer=None):
    for t in rpc["txs"]:
        if t["method"] == method and (status is None or (t["status"] == "Success") == (status == "ok")) and (signer is None or t["signer"].startswith(signer)):
            return {k: t[k] for k in ("step", "method", "signer", "receiver", "depositNear", "status", "block", "at", "txHash", "explorer")}
    raise KeyError(method)
bal = manifest["supplierBalance"]
fmt = lambda y: f"{int(y) / 1e24:.4f}"

# ------------------------------------------------------------------ the cut, scene by scene
# (scene id, chapter, [segments], {line: offset in scene seconds})
SCENES = [
    ("S1", None, [{"type": "hook", "dur": 12.4}], {"S1-1": 0.5}),
    ("S2", "The product", [{**shot("buyer", 0.8, 14.6, 1.2, FULL, (90, 40, 1740), fade=0.5), "role": None}], {"S2-1": 0.3}),
    ("S3", "01 · Buyer set-up", [
        shot("buyer", 24.0, 3.4, 2.0, (335, 300, 1250), fade=0.35),
        shot("buyer", 53.0, 3.8, 2.4, (375, 128, 1500)),
        shot("buyer", 64.2, 2.3, 1.0, COL(110)),
        shot("buyer", 85.2, 4.0, 1.0, COL(60)),
    ], {"S3-1": 0.3, "S3-2": 8.4}),
    ("S4", "02 · Request & rules", [
        shot("buyer", 117.0, 4.6, 2.6, COL(236), fade=0.35),
        shot("buyer", 135.5, 5.0, 2.5, COL(120)),
        shot("buyer", 170.0, 3.2, 3.2, COL(180)),
        shot("buyer", 206.4, 3.6, 1.0, DIALOG),
        shot("buyer", 228.4, 3.6, 0.55, CONFIRMED, callouts=[(0.3, 3.4, 630, 490, 660, 140, "Rules frozen: policy hash on NEAR testnet")]),
    ], {"S4-1": 0.4, "S4-2": 4.8, "S4-3": 10.0, "S4-4": 12.6}),
    ("S5", "03 · Sealed bids", [
        shot("supplierA", 19.5, 3.4, 2.2, CENTER(1300, 120), fade=0.35),
        shot("supplierA", 66.0, 4.4, 4.0, COL(236)),
        shot("supplierA", 102.2, 2.8, 1.2, COL(160)),
        shot("supplierA", 109.5, 2.4, 1.4, DIALOG),
        shot("supplierA", 122.8, 2.0, 0.8, CONFIRMED, callouts=[(0.2, 1.9, 630, 490, 660, 140, "Sealed bid committed on chain")]),
        shot("supplierB", 138.3, 2.8, 0.9, CENTER(800, 300), callouts=[(0.4, 2.7, 780, 480, 340, 90, "The competitor opens the request: 404")]),
        shot("buyer", 246.5, 3.2, 1.0, COL(60), callouts=[(0.4, 3.1, 436, 306, 1378, 92, "The buyer, before the deadline: sealed", "below")]),
    ], {"S5-1": 0.3, "S5-2": 5.2, "S5-3": 15.4}),
    ("S6", "04 · Deadline & integrity", [
        shot("buyer", 267.0, 3.0, 1.0, DIALOG, fade=0.35),
        shot("buyer", 286.0, 2.4, 1.0, CONFIRMED),
        shot("buyer", 302.6, 5.6, 0.48, COL(222), callouts=[(1.8, 5.5, 930, 520, 230, 132, "Recomputed against the chain", "below")]),
        {"type": "diagram", "dur": 7.4, "fadeIn": 0.4},
    ], {"S6-1": 0.4, "S6-2": 5.6, "S6-3": 12.0}),
    ("S7", "05 · Evaluation & private AI", [
        shot("buyer", 302.6, 5.2, 0.5, COL(222), callouts=[(0.6, 2.7, 1185, 518, 110, 135), (2.8, 5.1, 1705, 518, 110, 135)], fade=0.4),
        shot("buyer", 313.0, 3.2, 1.2, COL(120)),
        shot("buyer", 326.2, 2.4, 1.0, COL(130)),
        shot("buyer", 333.4, 3.4, 0.6, (437, 100, 700), (437, 520, 700)),
        shot("buyer", 342.8, 6.6, 1.1, COL(60), callouts=[(0.4, 3.6, 436, 326, 1378, 94, "Attestation verified before any quote was sent")]),
        shot("buyer", 371.0, 4.0, 1.0, COL(200), callouts=[(0.3, 3.9, 450, 392, 1110, 100, "Human decision: the AI cannot award or move funds")]),
    ], {"S7-1": 0.2, "S7-2": 6.8, "S7-3": 10.0, "S7-4": 20.6}),
    ("S8", "06 · Award & escrow", [
        shot("buyer", 373.0, 4.2, 2.4, COL(200), fade=0.35),
        shot("buyer", 399.8, 2.2, 1.0, CONFIRMED),
        shot("buyer", 419.5, 4.0, 1.0, DIALOG, callouts=[(0.6, 3.9, 630, 552, 680, 80, "1.2 NEAR held in escrow", "right")]),
        shot("buyer", 437.5, 2.4, 1.0, CONFIRMED, callouts=[(0.2, 2.3, 630, 470, 660, 140, "Escrow funded on NEAR testnet")]),
        {"type": "rpc", "dur": 5.6, "fadeIn": 0.35, "title": "Escrow funded: the contract holds 1.2 testnet NEAR",
         "note": f"Explorer: testnet.nearblocks.io/txns/{rpc_tx('fund_award')['txHash']}",
         "txs": [rpc_tx("award_supplier"), rpc_tx("fund_award")]},
    ], {"S8-1": 0.4, "S8-2": 11.0}),
    ("S9", "07 · Delivery & payment", [
        shot("supplierA", 148.5, 2.0, 1.6, COL(120), callouts=[(0.2, 1.9, 452, 360, 640, 42, "Funded: 1.2 testnet NEAR", "right")], fade=0.35),
        shot("supplierA", 180.0, 1.4, 1.0, CONFIRMED),
        shot("supplierA", 200.0, 1.8, 3.0, COL(300)),
        shot("supplierA", 227.0, 1.4, 1.0, COL(300)),
        shot("supplierA", 261.8, 1.4, 1.0, CONFIRMED),
        shot("buyer", 467.2, 2.4, 1.6, COL(60), callouts=[(0.2, 2.3, 464, 504, 1320, 132, "Delivery evidence: its hash is anchored on chain", "inside")]),
        shot("buyer", 476.5, 2.0, 1.0, DIALOG),
        shot("buyer", 507.0, 1.8, 1.0, CONFIRMED, callouts=[(0.1, 1.8, 630, 470, 660, 140, "Payment released")]),
        {"type": "rpc", "dur": 4.6, "fadeIn": 0.35, "title": "The contract paid the supplier",
         "note": f"Explorer: testnet.nearblocks.io/txns/{rpc_tx('approve_release', 'ok')['txHash']}",
         "txs": [rpc_tx("approve_release", "ok")],
         "balance": {"account": bal["account"], "before": fmt(bal["beforeYocto"]), "after": fmt(bal["afterYocto"]), "delta": f"{bal['deltaNear']}"}},
        {"type": "rpc", "dur": 5.4, "fadeIn": 0.3, "title": "Everyone else is refused by the contract",
         "note": "Sent directly to the contract from the test process to test it (not app buttons). Each failed with the contract's own error.",
         "txs": [rpc_tx("approve_release", "fail", "vp-106725-test-outsider"), rpc_tx("accept_award", "fail"), rpc_tx("approve_release", "fail", "vp-106725-test-buyer")]},
    ], {"S9-1": 1.2, "S9-2": 10.0, "S9-3": 19.0}),
    ("S10", "08 · Records", [
        shot("buyer", 549.5, 2.6, 1.0, COL(60), fade=0.35),
        shot("buyer", 560.0, 2.4, 1.0, COL(100), callouts=[(0.2, 2.3, 1484, 296, 334, 142, "Paid out: 1.2 NEAR", "below")]),
        {"type": "outro", "dur": 5.6, "fadeIn": 0.5},
    ], {"S9-4": 0.2, "S10-1": 5.0}),
]

segments, voice, captions, accents, problems = [], [], [], [], []
t = 0.0
scene_starts = {}
for sid, chapter, segs, cues in SCENES:
    scene_starts[sid] = t
    for i, s in enumerate(segs):
        s = dict(s)
        s["id"] = f"{sid}-{i + 1}"
        s["start"] = round(t, 3)
        s.setdefault("fadeIn", 0.2)
        if chapter:
            s["chapter"] = chapter
        if s["type"] == "footage":
            meta = idx["cams"][s["cam"]]
            end_src = s["src"] + s["dur"] * s.get("rate", 1)
            if end_src > meta["seconds"] - 0.05:
                problems.append(f"{s['id']}: source runs past the end of {s['cam']} ({end_src:.1f} > {meta['seconds']:.1f})")
            if s["callouts"]:
                pass
            if any(k in (c.get("text") or "") for c in s["callouts"] for k in ("Confirmed", "committed", "funded", "released", "frozen")):
                accents.append({"t": round(t + 0.25, 2), "kind": "chime"})
        if s["type"] == "rpc" and any(x["status"] == "Success" for x in s["txs"]):
            accents.append({"t": round(t + 0.6, 2), "kind": "chime"})
        if s["type"] in ("diagram", "outro") or (s["type"] == "footage" and i == 0 and sid == "S2"):
            accents.append({"t": round(t - 0.15, 2), "kind": "whoosh"})
        segments.append(s)
        t += s["dur"]
    # narration cues for this scene
    for name, off in cues.items():
        ln = lines[name]
        start = scene_starts[sid] + off
        voice.append({"file": f"{name}.wav", "start": round(start, 3), "end": round(start + ln["seconds"], 3), "text": ln["text"], "line": name})
# any line not given an explicit offset follows the previous line of its scene with a 0.4 s gap
placed = {v["line"] for v in voice}
for name in lines:
    if name not in placed:
        prev = max((v for v in voice if v["line"].split("-")[0] == name.split("-")[0]), key=lambda v: v["end"])
        start = prev["end"] + 0.4
        voice.append({"file": f"{name}.wav", "start": round(start, 3), "end": round(start + lines[name]["seconds"], 3), "text": lines[name]["text"], "line": name})
voice.sort(key=lambda v: v["start"])
for a, b in zip(voice, voice[1:]):
    if b["start"] < a["end"] + 0.15:
        problems.append(f"voice overlap: {a['line']} ends {a['end']:.2f}, {b['line']} starts {b['start']:.2f}")
duration = round(t, 3)
if voice[-1]["end"] > duration - 0.2:
    problems.append(f"last line ends {voice[-1]['end']:.2f} after the film ({duration})")

# captions: each line split into chunks of at most ~62 characters at clause boundaries, timed by length
def chunks(text, limit=62):
    words, out, cur = text.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > limit:
            out.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
        if cur and re.search(r"[.:;,]$", cur) and len(cur) > limit * 0.55:
            out.append(cur); cur = ""
    if cur:
        out.append(cur)
    return out
for v in voice:
    parts = chunks(v["text"].replace("Veil Procure", "VeilProcure").replace("A.I.", "AI"))
    total = sum(len(p) for p in parts)
    s = v["start"]
    for p in parts:
        d = (v["end"] - v["start"]) * len(p) / total
        captions.append({"start": round(s, 3), "end": round(s + d - 0.04, 3), "text": p})
        s += d

testnet = [{"start": next(s["start"] for s in segments if s["id"] == "S4-4"), "end": next(s["start"] for s in segments if s["type"] == "outro")}]

timeline = {"durationSec": duration, "segments": segments, "captions": captions, "testnet": testnet,
            "footageMeta": {k: {"file": v["file"], "seconds": v["seconds"]} for k, v in idx["cams"].items()},
            "voice": voice, "accents": accents}
(HERE / "remotion/src/timeline.json").write_text(json.dumps(timeline, indent=1), encoding="utf-8")

# subtitles
def ts(x):
    ms = int(round(x * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
srt = "\n".join(f"{i}\n{ts(c['start'])} --> {ts(c['end'])}\n{c['text']}\n" for i, c in enumerate(captions, 1))
(HERE.parent / "VeilProcure_Explainer.srt").write_text(srt, encoding="utf-8")

# audio sources for the mix (and the editable project)
(HERE / "audio/narration").mkdir(parents=True, exist_ok=True)
for v in voice:
    shutil.copy(VID / "narration/lines" / v["file"], HERE / "audio/narration" / v["file"])
shutil.copy(VID / "music/bed.wav", HERE / "audio/music_bed.wav")

print(f"duration {duration}s, {len(segments)} segments, {len(voice)} voice cues, {len(captions)} captions, {len(accents)} accents")
for s in segments:
    extra = f"{s['cam']:9} src {s['src']:6.1f} x{s.get('rate', 1)}" if s["type"] == "footage" else s["type"]
    print(f"  {s['start']:7.2f} +{s['dur']:4.1f}  {s['id']:6} {extra}")
for v in voice:
    print(f"  voice {v['start']:7.2f}-{v['end']:7.2f} {v['line']}")
print("PROBLEMS:" if problems else "no problems", *problems, sep="\n  ")
