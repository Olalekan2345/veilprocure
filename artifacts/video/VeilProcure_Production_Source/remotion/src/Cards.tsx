import { Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Canvas } from "./Footage";
import { IllustrationTag } from "./Overlays";
import { C, FONT, FPS, MONO, W } from "./theme";
import type { RpcTx } from "./types";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.3, 0.7, 0.4, 1);

/** How a bid commitment works (illustration): what it proves and what it does not. */
export const Diagram: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / FPS;
  const step = (at: number) => spring({ frame: frame - at * fps, fps, config: { damping: 18, stiffness: 120 } });
  const box = (x: number, y: number, w: number, h: number, at: number, children: React.ReactNode, accent = false) => {
    const p = step(at);
    return (
      <div style={{ position: "absolute", left: x, top: y, width: w, height: h, borderRadius: 20, background: accent ? "rgba(0,236,151,0.1)" : "rgba(255,255,255,0.06)", border: `1.5px solid ${accent ? C.mint : "rgba(255,255,255,0.18)"}`, opacity: p, transform: `translateY(${(1 - p) * 30}px)`, fontFamily: FONT, color: "#fff", padding: "22px 26px", boxSizing: "border-box" }}>
        {children}
      </div>
    );
  };
  const arrow = (x: number, y: number, at: number, label: string) => {
    const p = interpolate(t, [at, at + 0.5], [0, 1], { ...clamp, easing: out });
    return (
      <div style={{ position: "absolute", left: x, top: y, width: 170, textAlign: "center", fontFamily: FONT, color: C.mint, opacity: p }}>
        <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>{label}</div>
        <div style={{ height: 3, margin: "10px 12px 0", background: C.mint, transformOrigin: "left", transform: `scaleX(${p})`, borderRadius: 2 }} />
        <div style={{ position: "absolute", right: 6, top: 20, width: 0, height: 0, borderTop: "9px solid transparent", borderBottom: "9px solid transparent", borderLeft: `14px solid ${C.mint}`, opacity: p }} />
      </div>
    );
  };
  const dots = (seed: number) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 16px)", gap: 7, marginTop: 14 }}>
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} style={{ width: 16, height: 16, borderRadius: 4, background: ((i * 7 + seed) % 5) % 2 ? C.mint : "rgba(0,236,151,0.25)" }} />
      ))}
    </div>
  );
  const head = (text: string) => <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: C.mint }}>{text}</div>;
  const field = (k: string) => <div style={{ marginTop: 10, fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{k}</div>;
  const verdict = step(4.2);
  return (
    <Canvas dark>
      <div style={{ position: "absolute", left: 0, width: W, top: 70, textAlign: "center", fontFamily: FONT, color: "#fff", fontSize: 50, fontWeight: 800, letterSpacing: "-0.04em", opacity: step(0) }}>
        How a sealed bid is checked
      </div>
      {box(170, 210, 430, 300, 0.3, <>{head("At bid time")}{field("Price · delivery · approach")}{field("Attachments (their hashes)")}{field("Request · supplier · version")}{field("+ a random salt")}</>)}
      {arrow(620, 330, 1.0, "hash")}
      {box(810, 230, 330, 260, 1.3, <>{head("Fingerprint")}{dots(3)}<div style={{ marginTop: 16, fontSize: 19, color: "rgba(255,255,255,0.7)" }}>stored on NEAR testnet</div></>, true)}
      {box(170, 580, 430, 250, 2.2, <>{head("After the deadline")}{field("The opened quote")}{field("+ the same salt")}</>)}
      {arrow(620, 680, 2.8, "hash again")}
      {box(810, 590, 330, 230, 3.1, <>{head("Recomputed")}{dots(3)}</>, true)}
      <div style={{ position: "absolute", left: 1190, top: 380, width: 600, fontFamily: FONT, opacity: verdict, transform: `translateX(${(1 - verdict) * 40}px)` }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, background: C.mint, color: C.night, borderRadius: 999, padding: "10px 24px", fontSize: 28, fontWeight: 800 }}>✓ Match: commitment verified</div>
        <div style={{ marginTop: 30, color: "#fff", fontSize: 28, fontWeight: 700, lineHeight: 1.35 }}>Proves: the quote is unchanged since it was sealed.</div>
        <div style={{ marginTop: 16, color: "rgba(255,255,255,0.72)", fontSize: 26, fontWeight: 600, lineHeight: 1.35 }}>Does not prove secrecy: quotes are encrypted at rest and the platform holds that key.</div>
      </div>
      <IllustrationTag dark />
    </Canvas>
  );
};

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

/** Transactions as returned by NEAR testnet RPC (EXPERIMENTAL_tx_status), not a mock-up. */
export const Rpc: React.FC<{ title: string; note: string; txs: RpcTx[]; balance?: { account: string; before: string; after: string; delta: string } }> = ({ title, note, txs, balance }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = (i: number) => spring({ frame: frame - (0.25 + i * 0.35) * fps, fps, config: { damping: 18, stiffness: 120 } });
  return (
    <Canvas dark>
      <div style={{ position: "absolute", left: 170, top: 60, right: 170, bottom: 150, display: "flex", flexDirection: "column", justifyContent: "center", fontFamily: FONT, color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 17, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: C.mint, opacity: enter(0) }}>
          <span style={{ width: 10, height: 10, borderRadius: 99, background: C.mint }} />
          Checked against NEAR testnet RPC
        </div>
        <div style={{ marginTop: 14, fontSize: 52, fontWeight: 800, letterSpacing: "-0.04em", opacity: enter(0) }}>{title}</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 18 }}>
          {txs.map((tx, i) => {
            const p = enter(i + 1);
            const ok = tx.status === "Success";
            return (
              <div key={tx.txHash} style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)`, borderRadius: 18, background: "rgba(255,255,255,0.05)", border: `1.5px solid ${ok ? "rgba(0,236,151,0.45)" : "rgba(224,104,95,0.55)"}`, padding: "18px 26px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <span style={{ background: ok ? C.mint : C.bad, color: ok ? C.night : "#fff", borderRadius: 999, padding: "4px 14px", fontSize: 19, fontWeight: 800 }}>{ok ? "✓ SUCCESS" : `✕ REJECTED · ${tx.status}`}</span>
                  <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>{tx.method}</span>
                  {tx.depositNear && Number(tx.depositNear) >= 0.01 && (
                    <span style={{ fontSize: 24, fontWeight: 800, color: tx.method === "fund_award" ? C.mint : "rgba(255,255,255,0.7)" }}>
                      {Number(tx.depositNear)} NEAR {tx.method === "fund_award" ? "escrow attached" : "storage deposit"}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: 18, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>block {tx.block.toLocaleString("en-US")} · {tx.at.replace("T", " ").slice(0, 19)} UTC</span>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 30, fontSize: 19, color: "rgba(255,255,255,0.78)", fontWeight: 600 }}>
                  <span>
                    signer <span style={{ fontFamily: MONO, color: "#fff" }}>{tx.signer}</span>
                  </span>
                  <span>
                    → <span style={{ fontFamily: MONO, color: "#fff" }}>{tx.receiver}</span>
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    tx <span style={{ fontFamily: MONO, color: "#fff" }}>{txs.length > 2 ? short(tx.txHash) : tx.txHash}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {balance && (
          <div style={{ marginTop: 30, opacity: enter(txs.length + 1), fontSize: 30, fontWeight: 700, color: "#fff" }}>
            Supplier balance (<span style={{ fontFamily: MONO, fontSize: 26 }}>{balance.account}</span>): {balance.before} → {balance.after} NEAR{" "}
            <span style={{ color: C.night, background: C.mint, borderRadius: 999, padding: "2px 14px", marginLeft: 8 }}>+{balance.delta} NEAR</span>
          </div>
        )}
        <div style={{ marginTop: 22, fontSize: 18, color: "rgba(255,255,255,0.55)", fontWeight: 600, opacity: enter(txs.length + 1) }}>{note}</div>
      </div>
    </Canvas>
  );
};

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame, fps, config: { damping: 20, stiffness: 90 } });
  const tag = interpolate(frame / FPS, [0.6, 1.3], [0, 1], { ...clamp, easing: out });
  return (
    <Canvas dark>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: "#fff", paddingBottom: 90 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: p, transform: `scale(${0.92 + 0.08 * p})` }}>
          <Img src={staticFile("brand/vp-mark-light.png")} style={{ height: 150 }} />
          <Img src={staticFile("brand/vp-wordmark-light.png")} style={{ height: 76 }} />
        </div>
        <div style={{ marginTop: 44, fontSize: 52, fontWeight: 800, letterSpacing: "-0.04em", opacity: tag, transform: `translateY(${(1 - tag) * 18}px)` }}>
          Private bids. <span style={{ color: C.mint }}>Intelligent decisions.</span> Payments under your control.
        </div>
        <div style={{ marginTop: 26, fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.6)", opacity: tag }}>veilprocure.netlify.app · github.com/Olalekan2345/veilprocure</div>
        <div style={{ marginTop: 40, fontSize: 19, fontWeight: 700, letterSpacing: "0.04em", color: "rgba(255,255,255,0.5)", opacity: tag }}>Public beta on NEAR testnet · test tokens have no monetary value · escrow contract not audited</div>
      </div>
    </Canvas>
  );
};
