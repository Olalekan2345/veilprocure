import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { C, FONT, FPS, H, W, WIN, WIN_H, WIN_W } from "./theme";
import type { FootageSeg, Move } from "./types";

const ease = Easing.bezier(0.65, 0, 0.35, 1);

/** Camera state at time t: the focus rectangle eases from one keyframe to the next. */
export function cameraAt(moves: Move[] | undefined, t: number) {
  const full = { x: 0, y: 0, w: W };
  if (!moves?.length) return full;
  if (t <= moves[0]!.t) return moves[0]!;
  for (let i = 1; i < moves.length; i++) {
    const a = moves[i - 1]!;
    const b = moves[i]!;
    if (t <= b.t) {
      const k = ease((t - a.t) / Math.max(0.001, b.t - a.t));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k };
    }
  }
  return moves[moves.length - 1]!;
}

function clampCam(c: { x: number; y: number; w: number }) {
  const w = Math.min(W, Math.max(480, c.w));
  const h = (w * 9) / 16;
  return { x: Math.min(Math.max(0, c.x), W - w), y: Math.min(Math.max(0, c.y), H - h), w };
}

export const Canvas: React.FC<{ dark?: boolean; children?: React.ReactNode }> = ({ dark, children }) => (
  <AbsoluteFill
    style={{
      background: dark
        ? `radial-gradient(70rem 40rem at 80% -10%, rgba(0,236,151,0.16), transparent 60%), ${C.night}`
        : `radial-gradient(70rem 36rem at 85% -15%, rgba(0,236,151,0.13), transparent 60%), radial-gradient(50rem 30rem at -10% 110%, rgba(199,245,216,0.5), transparent 60%), ${C.canvas}`,
    }}
  >
    {children}
  </AbsoluteFill>
);

export const RolePill: React.FC<{ kind: string; name: string }> = ({ kind, name }) => (
  <div style={{ position: "absolute", left: WIN.x, top: 16, display: "flex", alignItems: "center", gap: 12, fontFamily: FONT }}>
    <span style={{ background: kind === "Buyer" ? C.night : C.evergreen, color: "#fff", borderRadius: 999, padding: "5px 14px", fontSize: 17, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
      <span style={{ color: C.mint, marginRight: 8 }}>●</span>
      {kind}
    </span>
    <span style={{ color: C.body, fontSize: 19, fontWeight: 600 }}>{name}</span>
  </div>
);

export const Footage: React.FC<{ seg: FootageSeg; meta: { file: string } }> = ({ seg, meta }) => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const cam = clampCam(cameraAt(seg.moves, t));
  const z = W / cam.w; // zoom inside the window
  const s = WIN.scale * z; // source px → screen px
  const toScreen = (x: number, y: number) => ({ x: WIN.x + (x - cam.x) * s, y: WIN.y + (y - cam.y) * s });
  return (
    <Canvas>
      {seg.role && <RolePill kind={seg.role.kind} name={seg.role.name} />}
      <div
        style={{
          position: "absolute",
          left: WIN.x,
          top: WIN.y,
          width: WIN_W,
          height: WIN_H,
          borderRadius: 18,
          overflow: "hidden",
          border: `1px solid ${C.border}`,
          boxShadow: "0 40px 80px -36px rgba(13,32,28,0.45), 0 2px 10px rgba(13,32,28,0.08)",
          background: C.paper,
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: "0 0", transform: `scale(${s}) translate(${-cam.x}px, ${-cam.y}px)` }}>
          <OffthreadVideo src={staticFile(meta.file)} trimBefore={Math.round(seg.src * FPS)} playbackRate={seg.rate ?? 1} muted style={{ width: W, height: H }} />
        </div>
        {seg.edgeFade && cam.y > 2 && <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 34, background: `linear-gradient(${C.canvas}, rgba(250,251,249,0))` }} />}
        {seg.edgeFade && cam.y + (cam.w * 9) / 16 < H - 2 && <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 34, background: `linear-gradient(rgba(250,251,249,0), ${C.canvas})` }} />}
      </div>
      {(seg.callouts ?? []).map((c, i) => {
        const o = interpolate(t, [c.t0, c.t0 + 0.35, c.t1 - 0.3, c.t1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        if (o <= 0) return null;
        const a = toScreen(c.x, c.y);
        const pad = 10;
        const left = Math.max(WIN.x + 6, a.x - pad);
        const top = Math.max(WIN.y + 6, a.y - pad);
        const width = Math.min(WIN.x + WIN_W - 6, a.x + c.w * s + pad) - left;
        const height = Math.min(WIN.y + WIN_H - 6, a.y + c.h * s + pad) - top;
        const grow = interpolate(t, [c.t0, c.t0 + 0.45], [0.92, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        // Tag position relative to the box; kept inside the window on the right.
        const tagW = (c.text?.length ?? 0) * 12.2 + 64;
        const place = c.place ?? (top - WIN.y > 60 ? "above" : "below");
        const tag =
          place === "right" ? { left: width + 14, top: height / 2 - 20 }
          : place === "inside" ? { left: width - tagW - 12, top: 10 }
          : place === "below" ? { left: 0, top: height + 12 }
          : { left: 0, top: -50 };
        tag.left = Math.min(tag.left, WIN.x + WIN_W - 8 - left - tagW);
        return (
          <div key={i} style={{ position: "absolute", left, top, width, height, opacity: o, transform: `scale(${grow})`, transformOrigin: "center" }}>
            <div style={{ position: "absolute", inset: 0, borderRadius: 14, border: `3px solid ${C.mint}`, boxShadow: "0 0 0 6px rgba(0,236,151,0.18), 0 18px 40px -16px rgba(0,236,151,0.55)" }} />
            {c.text && (
              <div style={{ position: "absolute", left: tag.left, top: tag.top, background: C.night, color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 22, padding: "8px 16px", borderRadius: 999, whiteSpace: "nowrap", boxShadow: "0 12px 30px -12px rgba(13,32,28,0.6)" }}>
                <span style={{ color: C.mint, marginRight: 8 }}>●</span>
                {c.text}
              </div>
            )}
          </div>
        );
      })}
    </Canvas>
  );
};
