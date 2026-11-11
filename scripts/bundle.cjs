let esbuild;
try {
  esbuild = require("esbuild");
} catch {
  try {
    esbuild = require("../../web/node_modules/esbuild");
  } catch {
    try {
      esbuild = require("../web/node_modules/esbuild");
    } catch {
      esbuild = require("../node_modules/esbuild");
    }
  }
}
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log("=== Bundling Goose WASM & Renderer ===");

// Bundle index.ts (CJS and ESM)
esbuild.buildSync({
  entryPoints: [path.join(srcDir, "index.ts")],
  bundle: true,
  platform: "neutral",
  format: "cjs",
  outfile: path.join(distDir, "index.js"),
  external: ["./goose_linter", "./goose_linter.js"],
});

esbuild.buildSync({
  entryPoints: [path.join(srcDir, "index.ts")],
  bundle: true,
  platform: "neutral",
  format: "esm",
  outfile: path.join(distDir, "index.mjs"),
  external: ["./goose_linter", "./goose_linter.js"],
});

// Bundle renderer.ts (CJS and ESM)
esbuild.buildSync({
  entryPoints: [path.join(srcDir, "renderer.ts")],
  bundle: true,
  platform: "neutral",
  format: "cjs",
  outfile: path.join(distDir, "renderer.js"),
});

esbuild.buildSync({
  entryPoints: [path.join(srcDir, "renderer.ts")],
  bundle: true,
  platform: "neutral",
  format: "esm",
  outfile: path.join(distDir, "renderer.mjs"),
});

// Generate TypeScript declarations
console.log("Generating TypeScript declaration files...");
const tscBin = path.join(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc"
);

if (fs.existsSync(tscBin)) {
  execSync(`"${tscBin}"`, { cwd: rootDir, stdio: "inherit" });
} else {
  try {
    execSync("bunx tsc", { cwd: rootDir, stdio: "inherit" });
  } catch {
    execSync("npx tsc", { cwd: rootDir, stdio: "inherit" });
  }
}

// Ensure goose_linter.d.ts is copied
const linterDtsSrc = path.join(srcDir, "goose_linter.d.ts");
const linterDtsDest = path.join(distDir, "goose_linter.d.ts");
if (fs.existsSync(linterDtsSrc)) {
  fs.copyFileSync(linterDtsSrc, linterDtsDest);
}

console.log("✓ Bundle completed successfully!");

