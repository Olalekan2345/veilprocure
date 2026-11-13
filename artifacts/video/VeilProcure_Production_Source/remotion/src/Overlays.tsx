import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT, FPS, W, WIN, WIN_H, WIN_W } from "./theme";

/** Burned-in caption below the recorded window (never over amounts, buttons or hashes). */
export const Captions: React.FC<{ captions: { start: number; end: number; text: string }[]; dark: (t: number) => boolean }> = ({ captions, dark }) => {
  const t = useCurrentFrame() / FPS;
  const cap = captions.find((c) => t >= c.start && t < c.end);
  if (!cap) return null;
  const o = interpolate(t, [cap.start, cap.start + 0.12, cap.end - 0.12, cap.end], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const isDark = dark(t);
  return (
    <div style={{ position: "absolute", left: 0, width: W, top: WIN.y + WIN_H + 18, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          maxWidth: 1480,
          textAlign: "center",
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 31,
          lineHeight: 1.32,
          letterSpacing: "-0.005em",
          color: isDark ? "#ffffff" : C.ink,
          textWrap: "balance",
          textShadow: isDark ? "0 2px 12px rgba(0,0,0,0.5)" : "none",
        }}
      >
        {cap.text}
      </div>
    </div>
  );
};

/** Required on every financial shot. */
export const TestnetBadge: React.FC<{ visible: boolean }> = ({ visible }) => {
  if (!visible) return null;
  return (
    <div style={{ position: "absolute", right: WIN.x, top: 16, display: "flex", alignItems: "center", gap: 10, background: C.warnSoft, border: "1px solid rgba(138,98,20,0.3)", color: C.warn, borderRadius: 999, padding: "6px 16px", fontFamily: FONT, fontSize: 17, fontWeight: 800, letterSpacing: "0.04em" }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: C.warn }} />
      NEAR TESTNET • test tokens, not real-money settlement
    </div>
  );
};

/** Section label at the top centre (Buyer set-up, Sealed bid, AI evaluation, …). */
export const Chapter: React.FC<{ text: string; dark?: boolean }> = ({ text, dark }) => (
  <div style={{ position: "absolute", left: 0, width: W, top: 24, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
    <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: dark ? C.mint : C.evergreen }}>{text}</div>
  </div>
);

export const IllustrationTag: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div style={{ position: "absolute", left: WIN.x, top: WIN.y + WIN_H - 44, fontFamily: FONT, fontSize: 15, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: dark ? "rgba(255,255,255,0.55)" : C.muted }}>
    Illustration · not a product screen
  </div>
);

export const winBox = { left: WIN.x, top: WIN.y, width: WIN_W, height: WIN_H };
