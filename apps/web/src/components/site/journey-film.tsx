"use client";

import { Cpu, FileText, ListChecks, Lock, Receipt, ShieldCheck, Signature } from "lucide-react";
import { useEffect, useRef } from "react";

/*
 * "Inside the workspace" showcase: a 3D stage inside the existing window. A workspace plate floats
 * at an angle like a device; cards hover around it at different depths over a live security
 * network. A: requirement chips fly in and dock onto the request; B: sealed quotes arrive from far
 * behind, lock and orbit the plate; C: they plug into the comparison, a scan beam passes and an
 * advisory AI node lights above it; D: buyer approval connects to escrow and a shield settles.
 * Illustration only — no names, amounts, hashes or payments.
 *
 * The resting CSS is the final frame, so without JavaScript or with reduced motion the complete
 * composition is shown, still. With motion, Web Animations (transform/opacity/stroke offsets) run
 * the story once when the window is in view; afterwards CSS keeps the cards floating and light
 * moving along the network. Everything pauses while the window is off screen.
 */

const T = 9.6; // seconds
const OUT = "cubic-bezier(0.22, 0.8, 0.3, 1)";
const INOUT = "cubic-bezier(0.65, 0, 0.35, 1)";
const SPRING = "cubic-bezier(0.34, 1.3, 0.64, 1)";

/** A pose at time t: x/y are % of the stage (offsets from the resting place), z/ry/rz absolute. */
type Pose = { t: number; x?: number; y?: number; z?: number; ry?: number; rz?: number; s?: number; o?: number; e?: string };

const ORBITS = [
  { icon: Lock, t: "Sealed bid", s: "Committed on chain", pos: "lg:-left-16 lg:top-[44%]", depth: "-26px", beat: 3.5 },
  { icon: ListChecks, t: "Comparison", s: "Your rules, exact arithmetic", pos: "lg:-right-12 lg:-top-8", depth: "22px", beat: 5.6 },
  { icon: Signature, t: "Approval", s: "Signed in your wallet", pos: "lg:-left-14 lg:bottom-10", depth: "18px", beat: 7.6 },
  { icon: Receipt, t: "Receipt", s: "Explorer link per transaction", pos: "lg:-right-8 lg:bottom-6", depth: "-20px", beat: 9.0 },
];

const REQUEST_ROWS: [string, string][] = [
  ["Scope", "88%"],
  ["Hard requirements", "64%"],
  ["Price ceiling", "40%"],
  ["Bid deadline", "52%"],
  ["Scoring weights", "70%"],
];

/** Connectors in % of the stage (drawn on the scene plane). */
const PATHS: [string, string][] = [
  ["jf-path jf-p-b", "M60 46 C 61.5 46, 59.5 28, 61 28"],
  ["jf-path jf-p-b", "M60 48 C 62 48, 63 43, 65 43"],
  ["jf-path jf-p-b", "M60 50 C 63 50, 66 59, 70 59"],
  ["jf-path jf-p-d1", "M60 40 C 62 40, 62 26, 64 26"],
  ["jf-path jf-p-d2", "M78.5 39 L 78.5 57"],
  ["jf-comet jf-p-d1", "M60 40 C 62 40, 62 26, 64 26"],
  ["jf-comet jf-p-d2", "M78.5 39 L 78.5 57"],
  ["jf-path jf-p-n1", "M25 56 L 25 61"],
  ["jf-path jf-p-n2", "M47 72.5 L 51 72.5"],
];

/* The security network behind the stage (fixed 820 × 360 drawing, cropped to fit). */
const NODES: [number, number][] = [
  [36, 58], [128, 300], [214, 36], [330, 334], [470, 18], [566, 330], [682, 52], [790, 196], [748, 330], [24, 214], [300, 150], [612, 168],
];
const LINKS: [number, number][] = [
  [0, 2], [2, 4], [4, 6], [6, 7], [7, 8], [8, 5], [5, 3], [3, 1], [1, 9], [9, 0], [2, 10], [10, 3], [4, 11], [11, 5], [6, 11], [10, 9], [11, 7],
];
const LOCKS = [1, 4, 7];
const PULSES = ["M36 58 L 214 36 L 470 18 L 682 52 L 790 196", "M24 214 L 128 300 L 330 334 L 566 330 L 748 330", "M214 36 L 300 150 L 330 334", "M682 52 L 612 168 L 566 330"];

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
    /** Local keyframes given in seconds: [t, props, easing into the next]. */
    const at = (el: Element, steps: [number, Keyframe, string?][]) => run(el, steps.map(([t, k, e]) => ({ ...k, offset: Math.min(1, t / T), easing: e ?? "linear" })));
    const zOf = (el: Element) => parseFloat(getComputedStyle(el).getPropertyValue("--z")) || 0;
    /** Card motion in 3D: x/y offsets in % of the stage, z/rotations absolute; ends on the resting place. */
    const fly = (el: Element, poses: Pose[], W: number, H: number) => {
      const rz = zOf(el);
      run(
        el,
        poses.map((p, i) => ({
          offset: Math.min(1, p.t / T),
          opacity: p.o ?? 1,
          transform: `translate3d(${((p.x ?? 0) * W) / 100}px, ${((p.y ?? 0) * H) / 100}px, ${p.z ?? rz}px) rotateY(${p.ry ?? 0}deg) rotateZ(${p.rz ?? 0}deg) scale(${p.s ?? 1})`,
          easing: poses[i + 1]?.e ?? "linear",
        })),
      );
    };
    /** One glow pulse (overlay opacity) peaking at time t. */
    const pulse = (el: Element, t: number, rest = 0) =>
      at(el, [
        [0, { opacity: 0 }],
        [Math.max(0, t - 0.35), { opacity: 0 }, OUT],
        [t, { opacity: 1 }, INOUT],
        [Math.min(T, t + 1.3), { opacity: rest }],
        [T, { opacity: rest }],
      ]);
    /** A light sheen crossing a card at time t. */
    const sheen = (el: Element, t: number) =>
      at(el, [
        [0, { transform: "translateX(0) skewX(-16deg)" }],
        [t, { transform: "translateX(0) skewX(-16deg)" }, INOUT],
        [t + 0.8, { transform: "translateX(420%) skewX(-16deg)" }],
        [T, { transform: "translateX(420%) skewX(-16deg)" }],
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
    const fadeIn = (el: Element, t0: number, t1: number, from = "translateY(6px)") =>
      at(el, [
        [0, { opacity: 0, transform: from }],
        [t0, { opacity: 0, transform: from }, OUT],
        [t1, { opacity: 1, transform: "none" }],
        [T, { opacity: 1, transform: "none" }],
      ]);

    const build = () => {
      anims.forEach((a) => a.cancel());
      anims = [];
      const W = stage.offsetWidth;
      const H = stage.offsetHeight;
      narrow = W < 600;

      // Scene connectors are authored in % of the stage; in pixels the dash offset draws them cleanly.
      const svg = q<SVGSVGElement>(".jf-paths");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      qa<SVGPathElement>(".jf-paths path").forEach((p) => {
        let k = 0;
        p.setAttribute("d", p.dataset.d!.replace(/-?\d+(\.\d+)?/g, (n) => String(((k++ % 2 === 0 ? W : H) * Number(n)) / 100)));
      });

      // The camera: a wide angle that settles into the resting view.
      const cam = narrow
        ? [[0, 12, -14, -40], [2.2, 9, -10, -10], [5, 7, -6, 0], [T, 6, -7, 0]]
        : [[0, 18, -30, -90], [2.2, 13, -21, -30], [4.4, 10, -12, 0], [6.6, 9, -17, 0], [T, 8, -12, 0]];
      at(q(".jf-scene"), cam.map(([t, rx, ry, z], i) => [t!, { transform: `translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg)` }, i < cam.length - 1 ? INOUT : undefined] as [number, Keyframe, string?]));

      // The plate (the "device") rises out of depth and stays at the centre of the story.
      fly(q(".jf-plate"), [
        { t: 0, z: -260, s: 0.92, o: 0 },
        { t: 0.9, z: 0, e: OUT },
        { t: T },
      ], W, H);
      at(q(".jf-layer-req"), [[0, { opacity: 1 }], [4.3, { opacity: 1 }, INOUT], [4.8, { opacity: 0 }], [T, { opacity: 0 }]]);
      at(q(".jf-layer-cmp"), [[0, { opacity: 0 }], [4.5, { opacity: 0 }, INOUT], [5.0, { opacity: 1 }], [T, { opacity: 1 }]]);
      qa(".jf-req-row i").forEach((el, i) =>
        at(el, [
          [0, { transform: "scaleX(0)" }],
          [1.7 + i * 0.1, { transform: "scaleX(0)" }, OUT],
          [2.15 + i * 0.1, { transform: "scaleX(1)" }],
          [T, { transform: "scaleX(1)" }],
        ]),
      );
      at(q(".jf-pub"), [
        [0, { opacity: 0, transform: "scale(0.8)" }],
        [2.15, { opacity: 0, transform: "scale(0.8)" }, SPRING],
        [2.5, { opacity: 1, transform: "none" }],
        [T, { opacity: 1, transform: "none" }],
      ]);
      sheen(q(".jf-plate .jf-sheen"), 2.3);

      // A: requirement chips fly in from depth, hover, then dock onto the request rows.
      if (!narrow) {
        const float: [number, number, number][] = [[-15, -16, 150], [-12, -10, 95], [-16, -2, 170], [-11, 4, 110], [-14, 10, 70]];
        qa(".jf-chip").forEach((el, i) => {
          const [fx, fy, fz] = float[i]!;
          const t0 = 0.25 + i * 0.12;
          fly(el, [
            { t: 0, x: fx - 6, y: fy, z: -320, ry: 20, o: 0 },
            { t: t0, x: fx - 6, y: fy, z: -320, ry: 20, o: 0 },
            { t: t0 + 0.7, x: fx, y: fy, z: fz, e: SPRING },
            { t: 1.55 + i * 0.1, x: fx, y: fy, z: fz },
            { t: 2.05 + i * 0.1, z: 0, s: 0.92, o: 0, e: INOUT },
            { t: T, z: 0, s: 0.92, o: 0 },
          ], W, H);
        });
      }

      // B: sealed quotes arrive from far behind, lock, orbit the plate, then plug into the comparison.
      const orbit: [number, number, number][] = narrow ? [[0, -8, 80], [0, -8, 105], [0, -8, 130]] : [[38, -28, 20], [43, -23, 55], [48, -17, 90]];
      qa(".jf-q").forEach((el, i) => {
        const [ox, oy, oz] = orbit[i]!;
        const t0 = 2.45 + i * 0.25;
        fly(el, [
          { t: 0, x: ox + 26, y: oy - 12, z: -620, ry: 38, o: 0 },
          { t: t0, x: ox + 26, y: oy - 12, z: -620, ry: 38, o: 0 },
          { t: t0 + 0.85, x: ox, y: oy, z: oz, ry: narrow ? 0 : -8, e: SPRING },
          { t: 4.35 + i * 0.08, x: ox, y: oy, z: oz, ry: narrow ? 0 : -8 },
          { t: 4.95 + i * 0.1, z: 0, s: 0.7, o: 0, e: INOUT },
          { t: T, z: 0, s: 0.7, o: 0 },
        ], W, H);
      });
      qa(".jf-q .jf-shackle").forEach((el, i) => {
        const land = 2.45 + i * 0.25 + 0.85;
        at(el, [[0, { transform: "translateY(-3.5px)" }], [land, { transform: "translateY(-3.5px)" }, SPRING], [land + 0.3, { transform: "none" }], [T, { transform: "none" }]]);
      });
      qa(".jf-q .jf-lockring").forEach((el, i) => {
        const land = 2.45 + i * 0.25 + 1.0;
        at(el, [[0, { opacity: 0, transform: "scale(1)" }], [land, { opacity: 0.9, transform: "scale(1)" }, OUT], [land + 0.9, { opacity: 0, transform: "scale(1.9)" }], [T, { opacity: 0, transform: "scale(1.9)" }]]);
      });
      qa(".jf-q .jf-sheen").forEach((el, i) => sheen(el, 2.45 + i * 0.25 + 1.0));
      if (!narrow) qa(".jf-p-b").forEach((el, i) => draw(el, 3.05 + i * 0.25, 3.5 + i * 0.25, [4.45, 4.85]));

      // C: the comparison, scanned against the published rules; the AI node lights above it.
      qa(".jf-cmp-row").forEach((el, i) => fadeIn(el, 4.85 + i * 0.18, 5.3 + i * 0.18, "translateX(-12px)"));
      qa(".jf-verified-glow").forEach((el, i) => pulse(el, 5.45 + i * 0.2));
      at(q(".jf-scan"), [
        [0, { opacity: 0, transform: "translateY(0%)" }],
        [5.2, { opacity: 0, transform: "translateY(0%)" }, OUT],
        [5.4, { opacity: 1, transform: "translateY(6%)" }, "linear"],
        [6.3, { opacity: 1, transform: "translateY(94%)" }, OUT],
        [6.55, { opacity: 0, transform: "translateY(100%)" }],
        [T, { opacity: 0, transform: "translateY(100%)" }],
      ]);
      fly(q(".jf-ai"), [
        { t: 0, y: -6, z: -140, s: 0.8, o: 0 },
        { t: 6.2, y: -6, z: -140, s: 0.8, o: 0 },
        { t: 6.85, e: SPRING },
        { t: T },
      ], W, H);
      at(q(".jf-beam"), [[0, { transform: "scaleY(0)" }], [6.55, { transform: "scaleY(0)" }, OUT], [6.95, { transform: "scaleY(1)" }], [T, { transform: "scaleY(1)" }]]);
      pulse(q(".jf-ai-glow"), 7.0, 0.5);

      // D: buyer approval connects to escrow; a shield settles on the escrow card.
      fly(q(".jf-approve"), [
        { t: 0, x: 14, y: -10, z: -420, ry: 30, o: 0 },
        { t: 6.95, x: 14, y: -10, z: -420, ry: 30, o: 0 },
        { t: 7.7, e: SPRING },
        { t: T },
      ], W, H);
      fly(q(".jf-escrow"), [
        { t: 0, x: 14, y: 10, z: -420, ry: 30, o: 0 },
        { t: 7.5, x: 14, y: 10, z: -420, ry: 30, o: 0 },
        { t: 8.25, e: SPRING },
        { t: T },
      ], W, H);
      qa(narrow ? ".jf-path.jf-p-n1" : ".jf-path.jf-p-d1").forEach((el) => draw(el, 7.35, 7.85));
      qa(narrow ? ".jf-path.jf-p-n2" : ".jf-path.jf-p-d2").forEach((el) => draw(el, 7.95, 8.45));
      at(q(".jf-shield"), [
        [0, { opacity: 0, transform: "scale(0.6)" }],
        [8.4, { opacity: 0, transform: "scale(0.6)" }, SPRING],
        [8.85, { opacity: 1, transform: "none" }],
        [T, { opacity: 1, transform: "none" }],
      ]);
      sheen(q(".jf-escrow .jf-sheen"), 8.65);

      // The workspace navigation follows the story; the four labels light at their beat.
      const [reqNav, txNav] = [q("[data-nav='Requests']"), q("[data-nav='Transactions']")];
      const on = { backgroundColor: "#0d201c", color: "#ffffff" };
      const off = { backgroundColor: "rgba(13, 32, 28, 0)", color: "#66716e" };
      at(reqNav, [[0, on], [6.9, on, INOUT], [7.25, off], [T, off]]);
      at(txNav, [[0, off], [6.9, off, INOUT], [7.25, on], [T, on]]);
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
      if (stage.offsetWidth < 600 === narrow) return;
      if (state === "idle") build();
      else {
        anims.forEach((a) => a.cancel());
        anims = [];
        state = "done";
        fig.dataset.done = "true";
      }
    };
    window.addEventListener("resize", onResize);

    // The stage leans a few degrees towards the pointer on desktop.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
    let raf = 0;
    const onMove = (ev: PointerEvent) => {
      if (!fine.matches || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = stage.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        tilt.style.setProperty("--ry", `${(px * 6).toFixed(2)}deg`);
        tilt.style.setProperty("--rx", `${(-py * 5).toFixed(2)}deg`);
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
            {/* Security network: nodes, padlock nodes and light moving along the links. */}
            <svg className="jf-net" viewBox="0 0 820 360" preserveAspectRatio="xMidYMid slice">
              {LINKS.map(([a, b], i) => (
                <line key={i} className="jf-link" x1={NODES[a]![0]} y1={NODES[a]![1]} x2={NODES[b]![0]} y2={NODES[b]![1]} />
              ))}
              {PULSES.map((d, i) => (
                <path key={i} className="jf-pulse" d={d} pathLength={1} style={{ animationDelay: `${i * -1.1}s` }} />
              ))}
              {NODES.map(([x, y], i) =>
                LOCKS.includes(i) ? (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <circle className="jf-lockn-ring" r="15" />
                    <circle className="jf-lockn" r="11" />
                    <path className="jf-lockn-icon" d="M-3.5 -1.5 v-2 a3.5 3.5 0 0 1 7 0 v2 M-5 -1.5 h10 v7 h-10 z" />
                  </g>
                ) : (
                  <g key={i} transform={`translate(${x} ${y})`}>
                    <circle className="jf-node-glow" r="7" />
                    <circle className="jf-node" r="3" />
                  </g>
                ),
              )}
            </svg>

            <div className="jf-tilt">
              <div className="jf-scene">
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

                {/* The plate: the request, then the comparison. */}
                <div className="jf-plate" data-jf>
                  <span className="jf-sheen" />
                  <div className="jf-layer jf-layer-req">
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
                        <div key={label} className="jf-req-row">
                          <dt>{label}</dt>
                          <dd>
                            <i style={{ width: w }} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="jf-layer jf-layer-cmp">
                    <span className="jf-eyebrow">Comparison</span>
                    <span className="jf-title">Checked against chain</span>
                    <div className="jf-prows">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="jf-cmp-row">
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
                </div>

                {REQUEST_ROWS.map(([label], i) => (
                  <div key={label} className={`jf-chip jf-chip-${i + 1}`} data-jf>
                    <span className="jf-float jf-chip-in">
                      <span className="jf-chip-dot" />
                      {label}
                    </span>
                  </div>
                ))}

                {[1, 2, 3].map((n) => (
                  <div key={n} className={`jf-q jf-q${n}`} data-jf>
                    <div className="jf-float jf-card">
                      <span className="jf-sheen" />
                      <div className="flex items-center gap-2">
                        <span className="jf-icon jf-lock">
                          <span className="jf-lockring" />
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
                      <span className="vp-chip vp-chip-ink jf-sealed">Sealed until deadline</span>
                    </div>
                  </div>
                ))}

                <div className="jf-ai" data-jf>
                  <div className="jf-float">
                    <span className="jf-ai-pill">
                      <span className="jf-ai-glow" />
                      <Cpu aria-hidden />
                      AI notes · advisory
                    </span>
                    <span className="jf-beam" />
                  </div>
                </div>

                <div className="jf-approve" data-jf>
                  <div className="jf-float jf-card">
                    <span className="jf-icon">
                      <Signature aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="jf-t">Buyer approval</span>
                      <span className="jf-s">Signed in your wallet</span>
                    </span>
                  </div>
                </div>

                <div className="jf-escrow" data-jf>
                  <div className="jf-float jf-card">
                    <span className="jf-sheen" />
                    <span className="jf-shield">
                      <span className="jf-shield-ring" />
                      <ShieldCheck aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="jf-t">Escrow</span>
                      <span className="jf-s">Held by the contract</span>
                    </span>
                    <span className="vp-chip vp-chip-dark jf-net-chip">NEAR testnet</span>
                  </div>
                </div>
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
