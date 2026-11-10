# Goose WebAssembly & WebGL Engine (`@grimmdev/goose-wasm`)

Complete client-side WebAssembly compiler, linter, C transpiler, and real-time WebGL graphics engine for the **Goose** programming language.

## Features

- **Instant Compiler & Linter**: Emits structured JSON diagnostics in ~1.5 ms directly in the client.
- **C Transpiler**: Compiles Goose AST to standard C (`-o /out.c`).
- **AST Inspector**: Dumps full compiler syntax trees (`--dump`).
- **Embedded Standard Library**: Packages the entire Goose `stdlib/` in virtual memory at `/stdlib`.
- **Live WebGL Shader Compiler**: Translates user Goose 3D distance fields (`map_scene`, `sd_sphere`, `sd_torus`, `sd_box`) and 2D scenes directly into GPU fragment shaders running at 60–120 FPS.
- **Touch & Gameplay Ready**: Built-in shaders and uniforms for 2D Flappy Goose, 2D Game Boy retro RPG, and 3D raymarching.
- **Single-File JS/WASM**: Zero network latency; self-contained module with inlined WASM for offline bundling.

---

## Installation via GitHub Packages

Configure your `.npmrc` to route the `@grimmdev` scope to GitHub Packages:

```ini
@grimmdev:registry=https://npm.pkg.github.com
```

Then install:

```bash
npm install @grimmdev/goose-wasm
```

---

## Quick Start

### 1. Compiling & Linting Goose Code

```typescript
import createGooseLinter, { compileGoose } from "@grimmdev/goose-wasm";

async function main() {
  const mod = await createGooseLinter({ noInitialRun: true });

  const result = await compileGoose(mod, `
    import std;
    fn main() {
        print("Hello from Goose WebAssembly!");
    }
  `);

  console.log("Success:", result.success);
  console.log("Diagnostics:", result.diagnostics);
  console.log("Transpiled C:", result.transpiledC);
}
main();
```

### 2. Live WebGL Rendering

```typescript
import {
  initWebGLContext,
  compileGooseToShader,
  updateWebGLProgram,
  renderWebGLFrame
} from "@grimmdev/goose-wasm/renderer";

const canvas = document.getElementById("viewport") as HTMLCanvasElement;
const handle = initWebGLContext(canvas);

// Compile Goose source into GPU fragment shader
const gooseCode = `
import std;

fn map_scene(p: f32[3], time: f32) -> f32[2] {
    let s = sd_sphere(p, 1.0);
    return [s, 1.0];
}
`;

const res = compileGooseToShader(gooseCode);
if (res.success && handle) {
  updateWebGLProgram(handle, res.fragmentShader);

  function animate(timeMs: number) {
    renderWebGLFrame(
      handle,
      canvas.width,
      canvas.height,
      timeMs * 0.001,
      0, 0, // yaw, pitch
      0, 0, 3 // camX, camY, camZ
    );
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
```

---

## Repository Structure

```
goose-wasm/
├── .github/workflows/
│   └── build-wasm.yml       # GitHub Actions build, test & publish workflow
├── patches/
│   └── 0001-wasm-support.patch # Git patch for upstream Goose
├── scripts/
│   ├── build.sh             # Linux / CI Emscripten builder
│   ├── build.ps1            # Windows PowerShell Emscripten builder
│   ├── bundle.cjs           # JS/TS & renderer bundler (esbuild)
│   └── test.cjs             # Integrated test runner
├── src/
│   ├── index.ts             # Main package entrypoint
│   ├── engine.ts            # High-level compiler runner
│   ├── renderer.ts          # WebGL renderer module entrypoint
│   ├── gooseShaderCompiler.ts # Goose to WebGL shader translator
│   ├── webglRenderer.ts     # Lightweight WebGL 1.0/2.0 context & render loop
│   ├── goose_linter.d.ts    # Emscripten module & diagnostic types
│   └── stubs.c              # Stubs for JIT & platform runtime symbols
├── dist/                    # Bundled CJS, ESM, WASM, and .d.ts files
└── package.json
```

---

## Building Locally

### Prerequisites
- [Emscripten SDK (emsdk)](https://emscripten.org/docs/getting_started/downloads.html) >= 3.1.50
- Node.js >= 18

### Linux / macOS:
```bash
./scripts/build.sh
node scripts/bundle.cjs
npm test
```

### Windows:
```powershell
powershell -ExecutionPolicy Bypass -File ./scripts/build.ps1
node scripts/bundle.cjs
npm test
```
