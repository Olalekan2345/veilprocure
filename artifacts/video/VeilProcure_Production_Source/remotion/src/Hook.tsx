import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Canvas } from "./Footage";
import { IllustrationTag } from "./Overlays";
import { C, FONT, FPS } from "./theme";

const out = Easing.bezier(0.3, 0.7, 0.4, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** The procurement problem, plainly illustrative: scattered quote threads, a spreadsheet nobody
 * trusts, an approval nobody can explain, payment on trust. No real data, names or amounts. */
export const Hook: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / FPS;
  const collapse = interpolate(t, [dur - 2.0, dur - 0.9], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const pop = (at: number) => spring({ frame: frame - at * fps, fps, config: { damping: 16, stiffness: 120, mass: 0.8 } });

  const mail = (i: number, subject: string, from: string, x: number, y: number, rot: number, at: number) => {
    const p = pop(at);
    return (
      <div key={i} style={{ position: "absolute", left: x, top: y, width: 470, padding: "22px 26px", borderRadius: 18, background: "#fff", boxShadow: "0 30px 60px -28px rgba(0,0,0,0.55)", opacity: p, transform: `translate(${(1 - p) * (i % 2 ? 120 : -120)}px, ${(1 - p) * 60}px) rotate(${rot * p}deg) scale(${1 - collapse * 0.35})`, fontFamily: FONT }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 18, fontWeight: 600 }}>
          <span>{from}</span>
          <span>✉</span>
        </div>
        <div style={{ marginTop: 8, color: C.ink, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{subject}</div>
        {[0.92, 0.78, 0.6].map((w, k) => (
          <div key={k} style={{ marginTop: 12, height: 10, width: `${w * 100}%`, borderRadius: 6, background: "#e8ece9" }} />
        ))}
      </div>
    );
  };

  const sheetP = pop(1.7);
  const stampP = spring({ frame: frame - 3.3 * fps, fps, config: { damping: 9, stiffness: 160 } });
  const noteP = pop(4.0);
  const lines = [
    { text: "Business purchasing", at: 0.2 },
    { text: "shouldn't mean", at: 0.45 },
    { text: "scattered bids,", at: 0.8, mint: true },
    { text: "opaque decisions,", at: 1.1, mint: true },
    { text: "and payment uncertainty.", at: 1.4, mint: true },
  ];
  const sub = interpolate(t, [3.6, 4.3], [0, 1], { ...clamp, easing: out });
  const clutterOpacity = 1 - collapse;
  return (
    <Canvas dark>
      <div style={{ position: "absolute", left: 150, top: 120, width: 900, fontFamily: FONT, opacity: 1 - collapse * 0.15 }}>
        {lines.map((l, i) => {
          const o = interpolate(t, [l.at, l.at + 0.55], [0, 1], { ...clamp, easing: out });
          return (
            <div key={i} style={{ fontSize: 66, lineHeight: 1.05, whiteSpace: "nowrap", fontWeight: 800, letterSpacing: "-0.045em", color: l.mint ? C.mint : "#fff", opacity: o, transform: `translateY(${(1 - o) * 28}px)` }}>
              {l.text}
            </div>
          );
        })}
        <div style={{ marginTop: 44, opacity: sub, transform: `translateY(${(1 - sub) * 16}px)` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Img src={staticFile("brand/vp-mark-light.png")} style={{ height: 52 }} />
            <Img src={staticFile("brand/vp-wordmark-light.png")} style={{ height: 30 }} />
          </div>
          <div style={{ marginTop: 16, color: "rgba(255,255,255,0.88)", fontSize: 29, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em" }}>
            Sealed supplier quotes, rules published up front,
            <br />
            and escrow that only the buyer releases.
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", inset: 0, opacity: clutterOpacity }}>
        {mail(0, "Re: Re: Fwd: quote for the audit", "supplier one", 1110, 150, -4, 0.35)}
        {mail(1, "Updated pricing (v3, final?)", "supplier two", 1360, 320, 3, 0.85)}
        {mail(2, "Quote attached — see thread", "supplier three", 1130, 480, -2, 1.3)}

        <div style={{ position: "absolute", left: 1120, top: 640, width: 640, borderRadius: 16, background: "#fff", overflow: "hidden", boxShadow: "0 30px 60px -28px rgba(0,0,0,0.55)", opacity: sheetP, transform: `translateY(${(1 - sheetP) * 80}px) rotate(${1.5 * sheetP}deg)`, fontFamily: FONT }}>
          <div style={{ background: "#e9efe9", padding: "10px 18px", fontSize: 17, fontWeight: 700, color: C.body }}>comparison_FINAL_v2.xlsx</div>
          {[
            ["Supplier", "Price", "Delivery", "Notes"],
            ["One", "see e-mail", "TBC", "?"],
            ["Two", "v3?", "asap", "call back"],
            ["Three", "attached", "—", "??"],
          ].map((row, r) => (
            <div key={r} style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr", borderTop: "1px solid #e4ebe7" }}>
              {row.map((cell, c) => (
                <div key={c} style={{ padding: "10px 16px", fontSize: 19, fontWeight: r === 0 ? 800 : 600, color: r === 0 ? C.ink : c > 0 && r > 0 ? "#b45c3c" : C.body, background: r > 0 && c > 0 && (r + c) % 3 === 0 ? "#fff3cd" : "transparent", borderLeft: c ? "1px solid #e4ebe7" : "none" }}>
                  {cell}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", left: 1500, top: 600, opacity: Math.min(1, stampP), transform: `rotate(-12deg) scale(${1.6 - 0.6 * Math.min(1, stampP)})`, border: "5px solid #e0685f", color: "#e0685f", borderRadius: 14, padding: "6px 22px", fontFamily: FONT, fontSize: 40, fontWeight: 800, letterSpacing: "0.06em" }}>APPROVED?</div>
        <div style={{ position: "absolute", left: 1330, top: 52, opacity: noteP, transform: `translateY(${(1 - noteP) * 30}px) rotate(3deg)`, background: "#fff3cd", color: "#7a5b12", borderRadius: 10, padding: "12px 22px", fontFamily: FONT, fontSize: 24, fontWeight: 700, boxShadow: "0 18px 40px -20px rgba(0,0,0,0.5)" }}>
          Payment: "send it when it's done" 🤝
        </div>
      </div>
      <IllustrationTag dark />
    </Canvas>
  );
};
