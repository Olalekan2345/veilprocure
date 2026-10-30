#!/usr/bin/env node
// Bundles the Netlify worker functions (netlify/functions/*.mts) into self-contained ES modules in
// netlify/bundled-functions/. The workspace packages they import (@veilprocure/db, /worker,
// /shared) are TypeScript source that Netlify's packager leaves as external imports, which then
// fail at runtime; bundling them here ships one file per function. Schedules and background mode
// are declared in netlify.toml.
import { readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const web = resolve(import.meta.dirname, "..");
const src = join(web, "netlify/functions");
const out = join(web, "netlify/bundled-functions");

rmSync(out, { recursive: true, force: true });
const entryPoints = readdirSync(src)
  .filter((f) => f.endsWith(".mts"))
  .map((f) => join(src, f));

await build({
  entryPoints,
  outdir: out,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // CommonJS dependencies inside an ES module bundle still need `require`.
  banner: { js: "import { createRequire as __veilCreateRequire } from 'node:module'; const require = __veilCreateRequire(import.meta.url);" },
  logLevel: "info",
});
