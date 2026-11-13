import { Composition, continueRender, delayRender, staticFile } from "remotion";
import { Explainer } from "./Explainer";
import { FPS, H, W } from "./theme";
import timeline from "./timeline.json";
import type { Timeline } from "./types";

// Manrope (the app's typeface) and JetBrains Mono, both SIL OFL, served from public/fonts.
const fontHandle = delayRender("fonts");
Promise.all([
  new FontFace("Manrope", `url(${staticFile("fonts/Manrope-latin.woff2")}) format("woff2")`, { weight: "200 800" }),
  new FontFace("JetBrainsMono", `url(${staticFile("fonts/JetBrainsMono-latin.woff2")}) format("woff2")`, { weight: "400 700" }),
].map((f) => f.load().then((loaded) => (document.fonts as unknown as { add(font: FontFace): void }).add(loaded))))
  .then(() => continueRender(fontHandle))
  .catch((e) => {
    console.error(e);
    continueRender(fontHandle);
  });

export const Root = () => {
  const t = timeline as unknown as Timeline;
  return <Composition id="Explainer" component={Explainer} durationInFrames={Math.round(t.durationSec * FPS)} fps={FPS} width={W} height={H} defaultProps={{ timeline: t }} />;
};
