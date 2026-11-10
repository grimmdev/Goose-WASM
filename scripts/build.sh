#!/usr/bin/env bash
set -euo pipefail

# Build Goose WebAssembly Module using Emscripten
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GOOSE_DIR="${1:-${ROOT_DIR}/goose}"
DIST_DIR="${ROOT_DIR}/dist"

echo "=== Goose WebAssembly Builder ==="
echo "Goose submodule directory: ${GOOSE_DIR}"
echo "Output directory: ${DIST_DIR}"

if [ ! -d "${GOOSE_DIR}/src" ]; then
    echo "Error: Goose submodule not found at ${GOOSE_DIR}"
    echo "Did you run: git submodule update --init --recursive ?"
    exit 1
fi

mkdir -p "${DIST_DIR}"
mkdir -p "${GOOSE_DIR}/build"

# Ensure stubs.c is in goose/src
cp "${ROOT_DIR}/src/stubs.c" "${GOOSE_DIR}/src/stubs.c"

# Apply patch if not already applied
cd "${GOOSE_DIR}"
if git apply --check "${ROOT_DIR}/patches/0001-wasm-support.patch" 2>/dev/null; then
    echo "Applying WASM patch to Goose repository..."
    git apply "${ROOT_DIR}/patches/0001-wasm-support.patch"
else
    echo "Patch already applied or skipped."
fi

# Build version header and JIT symbols
mkdir -p build/version
echo '#define GOOSE_VERSION "0.1.0-wasm"' > build/version/goose_version.h

if [ ! -f "build/jit_symbols.inc" ]; then
    grep -h "^GS_API " src/runtime/runtime.h src/runtime/runtime_ext.h 2>/dev/null \
        | sed -n 's/.*\(gs_[A-Za-z0-9_]*\)(.*/GS_JIT_SYMBOL(\1)/p' > build/jit_symbols.inc || true
fi

# Compile objects
echo "Compiling C++ sources with em++..."
em++ -std=c++20 -O2 -fexceptions -c src/main.cpp \
    -I src -I build/version -I third_party/subprocess -I third_party/tinycc -I build -I build/tcc/api \
    -DGOOSE_BUILTIN_RSPDIR_physics=nullptr \
    -DGOOSE_BUILTIN_RSPDIR_gfx=nullptr \
    -o build/main.o

em++ -std=c++20 -O2 -fexceptions -c src/version.cpp -I src -I build/version -o build/version.o
em++ -std=c++20 -O2 -fexceptions -c src/progress.cpp -I src -o build/progress.o
em++ -std=c++20 -O2 -fexceptions -c src/process.cpp -I src -I third_party/subprocess -o build/process.o

echo "Compiling C sources with emcc..."
emcc -O2 -c src/shaderc.c -I src -I third_party/cute_spirv -o build/shaderc.o
emcc -O2 -c src/jit_runtime.c -I src -I build -o build/jit_runtime.o
emcc -O2 -c src/stubs.c -o build/stubs.o

echo "Linking into goose_linter.js..."
em++ -O2 -fexceptions \
    build/main.o build/version.o build/progress.o build/process.o \
    build/shaderc.o build/jit_runtime.o build/stubs.o \
    --embed-file stdlib@/stdlib \
    -o "${DIST_DIR}/goose_linter.js" \
    -sALLOW_MEMORY_GROWTH \
    -sSTACK_SIZE=16777216 \
    -sINITIAL_MEMORY=67108864 \
    -sENVIRONMENT=node,web,worker \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createGooseLinter \
    -sSINGLE_FILE=1 \
    -sEXPORTED_RUNTIME_METHODS="['callMain','FS']"

# Copy TypeScript definition
if [ -f "${ROOT_DIR}/src/goose_linter.d.ts" ]; then
    cp "${ROOT_DIR}/src/goose_linter.d.ts" "${DIST_DIR}/goose_linter.d.ts"
fi

echo "=== Build Complete! ==="
ls -lh "${DIST_DIR}/goose_linter.js"

