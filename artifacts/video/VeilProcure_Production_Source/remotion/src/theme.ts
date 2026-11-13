// Product palette and type (apps/web/src/app/globals.css). The film uses the app's own look.
export const C = {
  night: "#0d201c",
  nightSoft: "#14302a",
  ink: "#191729",
  body: "#333644",
  muted: "#66716e",
  canvas: "#fafbf9",
  paper: "#ffffff",
  mint: "#00ec97",
  mintSoft: "#e8fff5",
  sage: "#c7f5d8",
  evergreen: "#087a58",
  border: "#e4ebe7",
  warn: "#8a6214",
  warnSoft: "#fbf2dc",
  bad: "#e0685f",
};

export const FONT = "Manrope, ui-sans-serif, system-ui, sans-serif";
export const MONO = "JetBrainsMono, ui-monospace, monospace";

export const W = 1920;
export const H = 1080;
export const FPS = 30;

/** The recorded screen is shown as a window on the canvas; captions sit below it. */
// Slightly smaller than full width so the labels above and the captions below have clear space.
export const WIN = { scale: 0.8, x: (W - W * 0.8) / 2, y: 64 };
export const WIN_W = W * WIN.scale;
export const WIN_H = H * WIN.scale;
