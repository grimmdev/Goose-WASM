# Windows build script for Goose WebAssembly Module using Emscripten
param (
    [string]$GooseDir = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$rootDir = Split-Path -Parent $scriptDir
if ([string]::IsNullOrEmpty($GooseDir)) {
    $GooseDir = Join-Path $rootDir "goose"
    if (-not (Test-Path $GooseDir)) {
        $GooseDir = "P:\Repositories\Goose\goose"
    }
}

$distDir = Join-Path $rootDir "dist"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

Write-Host "=== Goose WebAssembly Builder (Windows) ===" -ForegroundColor Cyan
Write-Host "Goose repo: $GooseDir"
Write-Host "Output: $distDir"

$buildDir = Join-Path $GooseDir "build"
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Path $buildDir -Force | Out-Null }
$versionDir = Join-Path $buildDir "version"
if (-not (Test-Path $versionDir)) { New-Item -ItemType Directory -Path $versionDir -Force | Out-Null }

Set-Content -Path (Join-Path $versionDir "goose_version.h") -Value '#define GOOSE_VERSION "0.1.0-wasm"'

# Copy stubs
Copy-Item (Join-Path $rootDir "src\stubs.c") (Join-Path $GooseDir "src\stubs.c") -Force

Push-Location $GooseDir
try {
    Write-Host "1. Compiling C++ compiler sources..."
    em++ -std=c++20 -O2 -fexceptions -c src\main.cpp `
        -I src -I build\version -I third_party\subprocess -I build `
        -DGOOSE_BUILTIN_RSPDIR_physics=nullptr -DGOOSE_BUILTIN_RSPDIR_gfx=nullptr `
        -o build\main.o

    em++ -std=c++20 -O2 -fexceptions -c src\version.cpp -I src -I build\version -o build\version.o
    em++ -std=c++20 -O2 -fexceptions -c src\progress.cpp -I src -o build\progress.o
    em++ -std=c++20 -O2 -fexceptions -c src\process.cpp -I src -I third_party\subprocess -o build\process.o

    Write-Host "2. Compiling C dependencies and stubs..."
    emcc -O2 -c src\shaderc.c -I src -I third_party\cute_spirv -o build\shaderc.o
    emcc -O2 -c src\jit_runtime.c -I src -I build -o build\jit_runtime.o
    emcc -O2 -c src\stubs.c -o build\stubs.o

    Write-Host "3. Linking into goose_linter.js..."
    $outFile = Join-Path $distDir "goose_linter.js"
    em++ -O2 -fexceptions `
        build\main.o build\version.o build\progress.o build\process.o `
        build\shaderc.o build\jit_runtime.o build\stubs.o `
        --embed-file stdlib@/stdlib `
        -o $outFile `
        -sALLOW_MEMORY_GROWTH `
        -sSTACK_SIZE=16777216 `
        -sINITIAL_MEMORY=67108864 `
        "-sENVIRONMENT=node,web,worker" `
        -sMODULARIZE=1 `
        -sEXPORT_NAME=createGooseLinter `
        -sSINGLE_FILE=1 `
        "-sEXPORTED_RUNTIME_METHODS=['callMain','FS']"

    $typesSrc = Join-Path $rootDir "src\goose_linter.d.ts"
    if (Test-Path $typesSrc) {
        Copy-Item $typesSrc (Join-Path $distDir "goose_linter.d.ts") -Force
    }

    Write-Host "`nBuild complete: $outFile" -ForegroundColor Green
} finally {
    Pop-Location
}

