param([string]$GooseDir = "")
$ErrorActionPreference = "Stop"
$builder = Join-Path $PSScriptRoot "build-compiler.cjs"
if ($GooseDir) { & node $builder $GooseDir } else { & node $builder }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
