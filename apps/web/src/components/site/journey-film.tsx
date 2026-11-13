"use client";

import { Cpu, FileText, ListChecks, Lock, Receipt, ShieldCheck, Signature } from "lucide-react";
import { useEffect, useRef } from "react";

/*
 * "Inside the workspace" showcase: a nine-second, play-once film of the workflow inside the existing
 * window. A: the request assembles; B: sealed supplier quotes arrive from depth and lock; C: they
 * flow into the comparison, which is scanned against the published rules (AI notes advisory);
 * D: buyer approval connects to escrow. Illustration only — no names, amounts, hashes or payments.
 *
 * The resting layout in CSS is the final frame, so without JavaScript or with reduced motion the
 * complete composition is shown. With motion, Web Animations (transform/opacity, stroke offsets)
 * start when the window is a third visible, pause off screen and end on that same frame.
 */

const T = 9; // seconds
const OUT = "cubic-bezier(0.3, 0.7, 0.4, 1)";
const INOUT = "cubic-bezier(0.65, 0, 0.35, 1)";
const SPRING = "cubic-bezier(0.34, 1.32, 0.64, 1)";

/** A card pose at time t: x/y in % of the stage, offset from the card's resting place. */
type Pose = { t: number; x?: number; y?: number; s?: number; r?: number; o?: number; e?: string };

const ORBITS = [
  { icon: Lock, t: "Sealed bid", s: "Committed on chain", pos: "lg:-left-16 lg:top-[44%]", depth: "-26px", beat: 2.7 },
  { icon: ListChecks, t: "Comparison", s: "Your rules, exact arithmetic", pos: "lg:-right-12 lg:-top-8", depth: "22px", beat: 4.9 },
  { icon: Signature, t: "Approval", s: "Signed in your wallet", pos: "lg:-left-14 lg:bottom-10", depth: "18px", beat: 6.9 },
  { icon: Receipt, t: "Receipt", s: "Explorer link per transaction", pos: "lg:-right-8 lg:bottom-6", depth: "-20px", beat: 8.3 },
];

const REQUEST_ROWS: [string, string][] = [
  ["Scope", "88%"],
  ["Hard requirements", "64%"],
  ["Price ceiling", "40%"],
  ["Bid deadline", "52%"],
  ["Scoring weights", "70%"],
];

/** Connectors in % of the stage: request → quotes (beat B), comparison → approval → escrow (beat D), phone variants. */
const PATHS: [string, string][] = [
  ["jf-path jf-p-b", "M43 50 C 51 50, 52 32, 60 32"],
  ["jf-path jf-p-b", "M43 50 C 51 50, 54 50.5, 62.5 50.5"],
  ["jf-path jf-p-b", "M43 50 C 51 50, 56 69, 65 69"],
  ["jf-path jf-p-d1", "M58 50 C 62 50, 61 22, 65 22"],
  ["jf-path jf-p-d2", "M81 37.5 L 81 57"],
  ["jf-comet jf-p-d1", "M58 50 C 62 50, 61 22, 65 22"],
  ["jf-comet jf-p-d2", "M81 37.5 L 81 57"],
  ["jf-path jf-p-n1", "M26 63 L 26 67"],
  ["jf-path jf-p-n2", "M48 81.5 L 52 81.5"],
];

function Padlock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <g className="jf-shackle">
        <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.6" fill="currentColor" />
      <circle cx="12" cy="15.6" r="1.6" fill="var(--color-vp-night)" />
    </svg>
  );
}

export function JourneyFilm() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const fig = ref.current!;
    const stage = fig.querySelector<HTMLElement>(".jf")!;
    const tilt = fig.querySelector<HTMLElement>(".jf-tilt")!;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || typeof stage.animate !== "function") {
      fig.dataset.ready = "static";
      return;
    }
    const q = <E extends Element = HTMLElement>(s: string) => fig.querySelector<E & Element>(s)!;
    const qa = <E extends Element = HTMLElement>(s: string) => Array.from(fig.querySelectorAll<E & Element>(s));
    let anims: Animation[] = [];
    let state: "idle" | "playing" | "paused" | "done" = "idle";
    let narrow = false;

    const run = (el: Element, frames: Keyframe[]) => {
      const a = el.animate(frames, { duration: T * 1000, fill: "both" });
      a.pause();
      anims.push(a);
    };
    /** Stage-relative card motion from poses (seconds → offsets; each pose's easing leads into it). */
    const card = (el: Element, poses: Pose[], W: number, H: number) =>
      run(
        el,
        poses.map((p, i) => ({
          offset: p.t / T,
          opacity: p.o ?? 1,
          transform: `translate(${((p.x ?? 0) * W) / 100}px, ${((p.y ?? 0) * H) / 100}px) rotate(${p.r ?? 0}deg) scale(${p.s ?? 1})`,
          easing: poses[i + 1]?.e ?? "linear",
        })),
      );
    /** Local keyframes given in seconds: [t, props, easing into the next]. */
    const at = (el: Element, steps: [number, Keyframe, string?][]) =>
      run(
        el,
        steps.map(([t, k, e]) => ({ ...k, offset: t / T, easing: e ?? "linear" })),
      );
    /** One glow pulse (opacity of an overlay) peaking at time t. */
    const pulse = (el: Element, t: number, rest = 0) =>
      at(el, [
        [0, { opacity: 0 }],
        [Math.max(0, t - 0.35), { opacity: 0 }, OUT],
        [t, { opacity: 1 }, INOUT],
        [Math.min(T, t + 1.3), { opacity: rest }],
        [T, { opacity: rest }],
      ]);
    /** SVG stroke drawn from t0 to t1 (pathLength 1), optionally faded out later. */
    const draw = (el: Element, t0: number, t1: number, fade?: [number, number]) =>
      at(el, [
        [0, { strokeDashoffset: 1, opacity: 1 }],
        [t0, { strokeDashoffset: 1, opacity: 1 }, INOUT],
        [t1, { strokeDashoffset: 0, opacity: 1 }],
        ...(fade ? ([[fade[0], { strokeDashoffset: 0, opacity: 1 }, INOUT], [fade[1], { strokeDashoffset: 0, opacity: 0 }]] as [number, Keyframe, string?][]) : []),
        [T, { strokeDashoffset: 0, opacity: fade ? 0 : 1 }],
      ]);

    const build = () => {
      anims.forEach((a) => a.cancel());
      anims = [];
      const W = stage.offsetWidth;
      const H = stage.offsetHeight;
      narrow = W < 560;

      // Connectors are authored in % of the stage; in pixels the stroke keeps its width and the
      // dash offset (pathLength 1) draws the line cleanly.
      const svg = q<SVGSVGElement>(".jf-paths");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      qa<SVGPathElement>(".jf-paths path").forEach((p) => {
        let k = 0;
        p.setAttribute("d", p.dataset.d!.replace(/-?\d+(\.\d+)?/g, (n) => String(((k++ % 2 === 0 ? W : H) * Number(n)) / 100)));
      });

      // Light edge around the request card: sized to the card, one lap during beat A.
      const req = q(".jf-req");
      const edge = q<SVGRectElement>(".jf-edge rect");
      edge.setAttribute("width", String(Math.max(0, req.offsetWidth - 2)));
      edge.setAttribute("height", String(Math.max(0, req.offsetHeight - 2)));
      at(edge, [
        [0, { strokeDashoffset: 1000, opacity: 0 }],
        [0.45, { strokeDashoffset: 1000, opacity: 0 }, OUT],
        [0.7, { strokeDashoffset: 860, opacity: 1 }, "linear"],
        [1.75, { strokeDashoffset: 0, opacity: 1 }, OUT],
        [2.1, { strokeDashoffset: 0, opacity: 0 }],
        [T, { strokeDashoffset: 0, opacity: 0 }],
      ]);

      if (!narrow) {
        card(req, [
          { t: 0, x: 30, y: 20, s: 0.96, o: 0 },
          { t: 0.9, x: 30, y: 16, s: 1.1, e: OUT },
          { t: 2.0, x: 30, y: 16, s: 1.1 },
          { t: 2.6, x: 5, y: 16, s: 1.04, e: INOUT },
          { t: 4.0, x: 5, y: 16, s: 1.04 },
          { t: 4.8, x: 0, y: 0, s: 0.9, o: 0, e: INOUT },
          { t: T, s: 0.9, o: 0 },
        ], W, H);
        // Offsets of the landing places (right of the request) from the resting places inside the comparison.
        const landing: [number, number][] = [[38, -21], [38.5, -9.5], [39, 2]];
        qa(".jf-quote").forEach((el, i) => {
          const [bx, by] = landing[i]!;
          const t0 = 1.9 + i * 0.22;
          card(el, [
            { t: 0, x: bx + 20, y: by - 16, s: 0.66, r: 11, o: 0 },
            { t: t0, x: bx + 20, y: by - 16, s: 0.66, r: 11, o: 0 },
            { t: t0 + 0.78, x: bx, y: by, e: SPRING },
            { t: 4.05, x: bx, y: by },
            { t: 4.5, x: bx * 0.35, y: by * 0.35, s: 0.96, o: 0.9, e: INOUT },
            { t: 4.9, s: 0.9, o: 0, e: OUT },
            { t: T, s: 0.9, o: 0 },
          ], W, H);
        });
        qa(".jf-p-b").forEach((el, i) => draw(el, 2.45 + i * 0.22, 3.1 + i * 0.22, [4.1, 4.6]));
      } else {
        card(req, [
          { t: 0, y: 6, s: 0.96, o: 0 },
          { t: 0.8, e: OUT },
          { t: 2.0 },
          { t: 2.5, s: 0.94, o: 0.16, e: INOUT },
          { t: 3.9, s: 0.94, o: 0.16 },
          { t: 4.4, s: 0.94, o: 0, e: INOUT },
          { t: T, s: 0.94, o: 0 },
        ], W, H);
        qa(".jf-quote").forEach((el, i) => {
          const t0 = 1.9 + i * 0.22;
          card(el, [
            { t: 0, x: 30, y: -4, s: 0.8, r: 8, o: 0 },
            { t: t0, x: 30, y: -4, s: 0.8, r: 8, o: 0 },
            { t: t0 + 0.7, e: SPRING },
            { t: 4.0 },
            { t: 4.55, y: 6, s: 0.94, o: 0, e: INOUT },
            { t: T, y: 6, s: 0.94, o: 0 },
          ], W, H);
        });
      }

      // Request rows assemble and the rules are published.
      qa(".jf-req .jf-row").forEach((el, i) =>
        at(el, [
          [0, { opacity: 0, transform: "translateX(-10px)" }],
          [0.55 + i * 0.13, { opacity: 0, transform: "translateX(-10px)" }, OUT],
          [0.95 + i * 0.13, { opacity: 1, transform: "none" }],
          [T, { opacity: 1, transform: "none" }],
        ]),
      );
      at(q(".jf-pub"), [
        [0, { opacity: 0, transform: "scale(0.8)" }],
        [1.55, { opacity: 0, transform: "scale(0.8)" }, SPRING],
        [1.9, { opacity: 1, transform: "none" }],
        [T, { opacity: 1, transform: "none" }],
      ]);
      // Each quote's padlock closes as it lands.
      qa(".jf-quote .jf-shackle").forEach((el, i) => {
        const land = 1.9 + i * 0.22 + 0.78;
        at(el, [
          [0, { transform: "translateY(-3.5px)" }],
          [land, { transform: "translateY(-3.5px)" }, SPRING],
          [land + 0.35, { transform: "none" }],
          [T, { transform: "none" }],
        ]);
      });
      qa(".jf-quote .jf-glint").forEach((el, i) => pulse(el, 1.9 + i * 0.22 + 1.05));

      // Beat C: the comparison takes over, scanned against the published rules.
      card(q(".jf-panel"), [
        { t: 0, y: 6, s: 0.96, o: 0 },
        { t: 3.95, y: 6, s: 0.96, o: 0 },
        { t: 4.75, e: OUT },
        { t: T },
      ], W, H);
      qa(".jf-prow").forEach((el, i) =>
        at(el, [
          [0, { opacity: 0, transform: "translateX(-12px)" }],
          [4.45 + i * 0.2, { opacity: 0, transform: "translateX(-12px)" }, OUT],
          [4.95 + i * 0.2, { opacity: 1, transform: "none" }],
          [T, { opacity: 1, transform: "none" }],
        ]),
      );
      qa(".jf-verified-glow").forEach((el, i) => pulse(el, 5.15 + i * 0.22));
      at(q(".jf-scan"), [
        [0, { opacity: 0, transform: "translateY(0%)" }],
        [4.95, { opacity: 0, transform: "translateY(0%)" }, OUT],
        [5.15, { opacity: 1, transform: "translateY(4%)" }, "linear"],
        [6.0, { opacity: 1, transform: "translateY(92%)" }, OUT],
        [6.25, { opacity: 0, transform: "translateY(100%)" }],
        [T, { opacity: 0, transform: "translateY(100%)" }],
      ]);
      at(q(".jf-ai"), [
        [0, { opacity: 0, transform: "scale(0.85)" }],
        [5.9, { opacity: 0, transform: "scale(0.85)" }, SPRING],
        [6.3, { opacity: 1, transform: "none" }],
        [T, { opacity: 1, transform: "none" }],
      ]);
      pulse(q(".jf-ai-glow"), 6.45);

      // Beat D: buyer approval connects to escrow.
      card(q(".jf-approve"), [
        { t: 0, x: 8, y: -5, s: 0.8, r: 6, o: 0 },
        { t: 6.25, x: 8, y: -5, s: 0.8, r: 6, o: 0 },
        { t: 7.0, e: SPRING },
        { t: T },
      ], W, H);
      card(q(".jf-escrow"), [
        { t: 0, x: 8, y: 6, s: 0.8, r: -6, o: 0 },
        { t: 6.95, x: 8, y: 6, s: 0.8, r: -6, o: 0 },
        { t: 7.7, e: SPRING },
        { t: T },
      ], W, H);
      qa(narrow ? ".jf-p-n1" : ".jf-p-d1").forEach((el) => draw(el, 6.65, 7.25));
      qa(narrow ? ".jf-p-n2" : ".jf-p-d2").forEach((el) => draw(el, 7.45, 7.95));
      qa(".jf-comet").forEach((el) =>
        at(el, [
          [0, { strokeDashoffset: 1.2, opacity: 0 }],
          [7.95, { strokeDashoffset: 1.2, opacity: 0 }],
          [8.05, { strokeDashoffset: 1.2, opacity: 1 }, INOUT],
          [8.75, { strokeDashoffset: -0.2, opacity: 1 }],
          [8.9, { strokeDashoffset: -0.2, opacity: 0 }],
          [T, { strokeDashoffset: -0.2, opacity: 0 }],
        ]),
      );
      at(q(".jf-shield"), [
        [0, { opacity: 0, transform: "scale(0.6)" }],
        [7.95, { opacity: 0, transform: "scale(0.6)" }, SPRING],
        [8.4, { opacity: 1, transform: "none" }],
        [T, { opacity: 1, transform: "none" }],
      ]);
      pulse(q(".jf-shield-ring"), 8.5, 0.55);

      // The workspace navigation follows the story, and the four labels light at their beat.
      const [reqNav, walletNav] = [q("[data-nav='Requests']"), q("[data-nav='Transactions']")];
      const on = { backgroundColor: "#0d201c", color: "#ffffff" };
      const off = { backgroundColor: "rgba(13, 32, 28, 0)", color: "#66716e" };
      at(reqNav, [[0, on], [6.25, on, INOUT], [6.6, off], [T, off]]);
      at(walletNav, [[0, off], [6.25, off, INOUT], [6.6, on], [T, on]]);
      qa("[data-beat]").forEach((el) => pulse(el.querySelector(".vp-orbit-glow")!, Number(el.dataset.beat)));
    };

    const play = () => {
      if (state === "idle") {
        state = "playing";
        anims.forEach((a) => a.play());
        Promise.all(anims.map((a) => a.finished))
          .then(() => {
            state = "done";
            fig.dataset.done = "true";
          })
          .catch(() => {});
      } else if (state === "paused") {
        state = "playing";
        anims.forEach((a) => a.play());
      }
    };
    const pause = () => {
      if (state !== "playing") return;
      state = "paused";
      anims.forEach((a) => a.pause());
    };

    build();
    fig.dataset.ready = "true";

    const io = new IntersectionObserver(
      ([e]) => {
        fig.dataset.visible = String(Boolean(e?.isIntersecting));
        if (e && e.intersectionRatio >= 0.35) play();
        else if (!e?.isIntersecting) pause();
      },
      { threshold: [0, 0.35, 0.6] },
    );
    io.observe(stage);

    // Switching between the phone and desktop layouts: rebuild if not started, otherwise settle.
    const onResize = () => {
      const isNarrow = stage.offsetWidth < 560;
      if (isNarrow === narrow) return;
      if (state === "idle") build();
      else {
        anims.forEach((a) => a.cancel());
        anims = [];
        state = "done";
        fig.dataset.done = "true";
      }
    };
    window.addEventListener("resize", onResize);

    // A slight (≤1.5°) response to the pointer on desktop only.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      if (!fine.matches || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = stage.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--ry", `${(px * 3).toFixed(2)}deg`);
        tilt.style.setProperty("--rx", `${(-py * 2.4).toFixed(2)}deg`);
      });
    };
    const onLeave = () => {
      tilt.style.setProperty("--ry", "0deg");
      tilt.style.setProperty("--rx", "0deg");
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);

    return () => {
      io.disconnect();
      window.removeEventListener("resize", onResize);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <figure ref={ref} className="vp-journey jf-figure mt-16" aria-label="Illustration of the VeilProcure workspace">
      <div className="vp-window" data-reveal="scale">
        <div className="vp-window-bar" aria-hidden>
          <i />
          <i />
          <i />
          <span className="ml-3 text-[12px] font-semibold text-vp-muted">VeilProcure workspace</span>
        </div>
        <div className="grid min-h-[360px] grid-cols-[160px_1fr] max-sm:grid-cols-1">
          <ul className="border-r border-vp-border bg-vp-canvas p-4 text-[13px] font-semibold text-vp-muted max-sm:hidden" aria-hidden>
            {["Overview", "Requests", "Transactions", "Audit trail", "Wallet"].map((n) => (
              <li key={n} data-nav={n} className={`rounded-lg px-3 py-2 ${n === "Transactions" ? "jf-nav-on" : ""}`}>
                {n}
              </li>
            ))}
          </ul>

          <div className="jf" aria-hidden>
            <div className="jf-tilt">
              <div className="jf-ambient" />
              <svg className="jf-paths" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="jf-stroke" x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0" stopColor="#087a58" />
                    <stop offset="1" stopColor="#00ec97" />
                  </linearGradient>
                </defs>
                {PATHS.map(([cls, d], i) => (
                  <path key={i} className={cls} d={d} data-d={d} pathLength={1} />
                ))}
              </svg>

              <div className="jf-card jf-req" data-jf>
                <svg className="jf-edge">
                  <rect x="1" y="1" rx="15" pathLength={1000} />
                </svg>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="jf-icon">
                      <FileText aria-hidden />
                    </span>
                    <span>
                      <span className="jf-t">Request for quotation</span>
                      <span className="jf-s">Confidential</span>
                    </span>
                  </div>
                  <span className="vp-chip vp-chip-mint jf-pub">Rules published</span>
                </div>
                <dl className="jf-rows">
                  {REQUEST_ROWS.map(([label, w]) => (
                    <div key={label} className="jf-row">
                      <dt>{label}</dt>
                      <dd>
                        <i style={{ width: w }} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {[1, 2, 3].map((n) => (
                <div key={n} className={`jf-card jf-quote jf-q${n}`} data-jf>
                  <span className="jf-glint" />
                  <div className="flex items-center gap-2">
                    <span className="jf-icon jf-lock">
                      <Padlock />
                    </span>
                    <span className="min-w-0">
                      <span className="jf-t">Sealed quote</span>
                      <span className="jf-s">Supplier {n}</span>
                    </span>
                  </div>
                  <div className="jf-masked">
                    <i />
                    <i />
                  </div>
                  <span className="vp-chip vp-chip-ink">Sealed until deadline</span>
                </div>
              ))}

              <div className="jf-card jf-panel" data-jf>
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="jf-eyebrow">Comparison</span>
                    <span className="jf-title">Checked against chain</span>
                  </span>
                  <span className="jf-ai">
                    <span className="jf-ai-glow" />
                    <Cpu aria-hidden />
                    AI notes · advisory
                  </span>
                </div>
                <div className="jf-prows">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="jf-prow">
                      <span className="jf-dot" />
                      <span className="vp-bar vp-bar-strong jf-pbar" />
                      <span className="vp-chip vp-chip-mint jf-verified">
                        <span className="jf-verified-glow" />
                        Commitment verified
                      </span>
                      <span className="vp-chip vp-chip-ink">{i < 2 ? "Eligible" : "Rule not met"}</span>
                    </div>
                  ))}
                </div>
                <div className="jf-scan">
                  <span />
                </div>
              </div>

              <div className="jf-card jf-approve" data-jf>
                <span className="jf-icon">
                  <Signature aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="jf-t">Buyer approval</span>
                  <span className="jf-s">Signed in your wallet</span>
                </span>
              </div>

              <div className="jf-card jf-escrow" data-jf>
                <span className="jf-shield">
                  <span className="jf-shield-ring" />
                  <ShieldCheck aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="jf-t">Escrow</span>
                  <span className="jf-s">Held by the contract</span>
                </span>
                <span className="vp-chip vp-chip-dark jf-net">NEAR testnet</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:mt-0">
        {ORBITS.map((c) => (
          <div key={c.t} className={`vp-orbit flex items-center gap-3 ${c.pos}`} data-parallax data-beat={c.beat} style={{ "--depth": c.depth } as React.CSSProperties}>
            <span className="vp-orbit-glow" aria-hidden />
            <span className="vp-seal-icon">
              <c.icon className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block text-[14px] font-extrabold text-vp-ink">{c.t}</span>
              <span className="block text-[12.5px] text-vp-muted">{c.s}</span>
            </span>
          </div>
        ))}
      </div>
      <figcaption className="vp-small mt-10 text-center">Illustration of the workspace — not live data.</figcaption>
    </figure>
  );
}
