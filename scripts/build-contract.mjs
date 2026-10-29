#!/usr/bin/env node
// Builds the contract WASM with cargo-near and prints its size and SHA-256 (record it in
// docs/DEPLOYMENTS.md). Requires Rust + wasm32-unknown-unknown + cargo-near 0.22.x.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(import.meta.dirname, "../contracts/veilprocure/contract");
execFileSync("cargo", ["near", "build", "non-reproducible-wasm", "--no-abi"], { cwd: dir, stdio: "inherit" });
const wasm = resolve(dir, "../target/near/veilprocure/veilprocure.wasm");
const bytes = readFileSync(wasm);
console.log(`\nveilprocure.wasm  ${bytes.length} bytes  sha256 ${createHash("sha256").update(bytes).digest("hex")}`);
