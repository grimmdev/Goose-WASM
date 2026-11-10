import type { GooseDiagnostic, GooseModule } from "./goose_linter";

export interface CompileResult {
  success: boolean;
  diagnostics: GooseDiagnostic[];
  transpiledC: string;
  astDump: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface CompileOptions {
  stdlibPath?: string;
  transpile?: boolean;
  dumpAst?: boolean;
}

/**
 * High-level compiler runner that compiles, generates diagnostics, transpiles to C,
 * and extracts AST dumps using the Goose WebAssembly compiler instance.
 */
export async function compileGoose(
  mod: GooseModule,
  source: string,
  options: CompileOptions = {}
): Promise<CompileResult> {
  const t0 = performance.now();
  const stdlib = options.stdlibPath || "/stdlib";
  const shouldTranspile = options.transpile !== false;
  const shouldDumpAst = options.dumpAst !== false;

  let stdout = "";
  let stderr = "";

  const origPrint = mod.print;
  const origPrintErr = mod.printErr;

  mod.print = (text: string) => {
    stdout += text + "\n";
  };
  mod.printErr = (text: string) => {
    stderr += text + "\n";
  };

  try {
    mod.FS.writeFile("/source.goose", source);

    // Run check with JSON diagnostics
    let checkExit = 0;
    try {
      checkExit = mod.callMain([
        "check",
        "/source.goose",
        "--stdlib",
        stdlib,
        "--diagnostics",
        "json",
      ]);
    } catch {
      // Non-zero compiler exit status
    }

    let diagnostics: GooseDiagnostic[] = [];
    try {
      const trimmed = stdout.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        diagnostics = JSON.parse(trimmed);
      }
    } catch {
      // Diagnostic JSON parse fallback
    }

    // Transpile to C
    let transpiledC = "";
    if (checkExit === 0 && shouldTranspile) {
      try {
        const transpileExit = mod.callMain([
          "-o",
          "/out.c",
          "/source.goose",
          "--stdlib",
          stdlib,
        ]);
        if (transpileExit === 0) {
          transpiledC = mod.FS.readFile("/out.c", { encoding: "utf8" }) as string;
        }
      } catch (err: any) {
        transpiledC = "// Transpilation note: " + (err.message || String(err));
      }
    }

    // Generate AST Dump
    let astDump = "";
    if (shouldDumpAst) {
      stdout = "";
      try {
        mod.callMain(["--dump", "/source.goose", "--stdlib", stdlib]);
        astDump = stdout;
      } catch {
        astDump = "// AST dump unavailable";
      }
    }

    const durationMs = performance.now() - t0;
    return {
      success: checkExit === 0,
      diagnostics,
      transpiledC,
      astDump,
      stdout,
      stderr,
      durationMs,
    };
  } finally {
    mod.print = origPrint;
    mod.printErr = origPrintErr;
  }
}

