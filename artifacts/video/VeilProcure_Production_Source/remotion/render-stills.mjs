// Renders review stills of the edit at the given times (seconds) with one bundle.
// usage: node render-stills.mjs <outDir> <t1> <t2> ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { mkdirSync } from "node:fs";

const [outDir, ...times] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "Explainer" });
for (const t of times) {
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(t) * composition.fps));
  const output = path.join(outDir, `t${String(t).replace(".", "_")}.png`);
  await renderStill({ composition, serveUrl, frame, output, scale: 0.5 });
  console.log(output);
}
