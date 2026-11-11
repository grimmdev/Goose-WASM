import type { GooseDiagnostic, GooseModule } from "./goose_linter";
import embeddedPackages from "./embedded_packages.json";

export interface StageResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface CompileResult {
  success: boolean;
  diagnostics: GooseDiagnostic[];
  transpiledC: string;
  astDump: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  stages: {
    check: StageResult;
    transpile?: StageResult;
    dumpAst?: StageResult;
  };
}

export interface CompileOptions {
  stdlibPath?: string;
  transpile?: boolean;
  dumpAst?: boolean;
  entryFile?: string;
  files?: Record<string, string>;
}

let requestSeq = 0;

/**
 * Robust compiler runner that executes check, C transpilation, and AST dumping
 * with independent stage tracking, per-request isolation, multi-file support,
 * and fail-safe error handling.
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
  const entryFile = options.entryFile || "/source.goose";

  const reqId = ++requestSeq;
  const origProcessExitCode = typeof (globalThis as any).process !== "undefined"
    ? (globalThis as any).process.exitCode
    : undefined;
  const outPath = `/out_${reqId}.c`;
  const writtenFiles: string[] = [];

  let currentStdout = "";
  let currentStderr = "";

  const origPrint = mod.print;
  const origPrintErr = mod.printErr;

  mod.print = (text: string) => {
    currentStdout += text + "\n";
  };
  mod.printErr = (text: string) => {
    currentStderr += text + "\n";
  };

  // Intercept standard streams at the Emscripten FS/TTY layer if available
  // This guarantees stdout/stderr capture even when mod.print wasn't attached during factory creation
  let origTtyPut1: any;
  let origTtyPut2: any;
  const s1 = mod.FS?.streams?.[1];
  const s2 = mod.FS?.streams?.[2];

  if (s1?.tty?.ops?.put_char) {
    origTtyPut1 = s1.tty.ops.put_char;
    s1.tty.ops.put_char = (tty: any, val: number | null) => {
      if (val === null || val === 10) {
        if (typeof (globalThis as any).Buffer !== "undefined") {
          currentStdout += (globalThis as any).Buffer.from(tty.output).toString("utf8") + "\n";
        } else {
          currentStdout += new TextDecoder().decode(new Uint8Array(tty.output)) + "\n";
        }
        tty.output = [];
      } else if (val !== 0) {
        tty.output.push(val);
      }
    };
  }

  if (s2?.tty?.ops?.put_char) {
    origTtyPut2 = s2.tty.ops.put_char;
    s2.tty.ops.put_char = (tty: any, val: number | null) => {
      if (val === null || val === 10) {
        if (typeof (globalThis as any).Buffer !== "undefined") {
          currentStderr += (globalThis as any).Buffer.from(tty.output).toString("utf8") + "\n";
        } else {
          currentStderr += new TextDecoder().decode(new Uint8Array(tty.output)) + "\n";
        }
        tty.output = [];
      } else if (val !== 0) {
        tty.output.push(val);
      }
    };
  }

  function safeUnlink(p: string) {
    try {
      if (mod.FS && typeof mod.FS.unlink === "function") {
        mod.FS.unlink(p);
      }
    } catch (_) {}
  }

  function ensureParentDirs(p: string) {
    if (!mod.FS || typeof mod.FS.mkdirTree !== "function") return;
    const parts = p.split("/").slice(0, -1);
    const dir = parts.join("/");
    if (dir && dir !== "" && dir !== ".") {
      try {
        mod.FS.mkdirTree(dir);
      } catch (_) {}
    }
  }

  function mountBlessedPackages() {
    if (!mod.FS) return;
    try {
      mod.FS.mkdirTree("/home/web_user/.goose/pkg/github.com/aardappel/goose_physics/v1");
      mod.FS.mkdirTree("/home/web_user/.goose/pkg/github.com/aardappel/goose_gfx/v1");
      mod.FS.mkdirTree("/data");

      const pkgFiles: Record<string, string> = {
        "/home/web_user/.goose/pkg/github.com/aardappel/goose_physics/v1/physics.goose": "packages/physics/physics.goose",
        "/home/web_user/.goose/pkg/github.com/aardappel/goose_physics/v1/physics.build": "packages/physics/physics.build",
        "/home/web_user/.goose/pkg/github.com/aardappel/goose_gfx/v1/gfx.goose": "packages/gfx/gfx.goose",
        "/home/web_user/.goose/pkg/github.com/aardappel/goose_gfx/v1/audio.goose": "packages/gfx/audio.goose",
        "/home/web_user/.goose/pkg/github.com/aardappel/goose_gfx/v1/ui.goose": "packages/gfx/ui.goose",
        "/home/web_user/.goose/pkg/github.com/aardappel/goose_gfx/v1/gfx.build": "packages/gfx/gfx.build",
        "/data/Roboto-Regular.ttf": "goose/samples/data/Roboto-Regular.ttf",
      };

      for (const [targetPath, embeddedKey] of Object.entries(pkgFiles)) {
        if (!mod.FS.analyzePath(targetPath).exists) {
          const b64 = (embeddedPackages as any)[embeddedKey];
          if (b64) {
            if (typeof (globalThis as any).Buffer !== "undefined") {
              mod.FS.writeFile(targetPath, (globalThis as any).Buffer.from(b64, "base64"));
            } else {
              const binStr = atob(b64);
              const len = binStr.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binStr.charCodeAt(i);
              }
              mod.FS.writeFile(targetPath, bytes);
            }
          }
        }
      }
    } catch (_) {}
  }

  let checkStage: StageResult = { success: false, exitCode: -1, stdout: "", stderr: "" };
  let transpileStage: StageResult | undefined;
  let dumpStage: StageResult | undefined;
  let diagnostics: GooseDiagnostic[] = [];
  let transpiledC = "";
  let astDump = "";

  try {
    // Mount blessed external packages (gfx, audio, ui, physics) into virtual package cache
    mountBlessedPackages();

    // Write source file(s) to virtual filesystem with parent directory creation
    if (options.files && Object.keys(options.files).length > 0) {
      for (const [filePath, content] of Object.entries(options.files)) {
        const normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
        ensureParentDirs(normalized);
        mod.FS.writeFile(normalized, content);
        writtenFiles.push(normalized);
      }
      if (!options.files[entryFile] && !options.files[entryFile.replace(/^\//, "")]) {
        ensureParentDirs(entryFile);
        mod.FS.writeFile(entryFile, source);
        writtenFiles.push(entryFile);
      }
    } else {
      ensureParentDirs(entryFile);
      mod.FS.writeFile(entryFile, source);
      writtenFiles.push(entryFile);
    }

    // Ensure output file does not pre-exist from previous runs
    safeUnlink(outPath);
    safeUnlink("/out.c");

    // Stage 1: Run semantic analysis and check
    currentStdout = "";
    currentStderr = "";
    let checkExit = -1;
    let checkError: string | undefined;

    try {
      checkExit = mod.callMain([
        "check",
        entryFile,
        "--stdlib",
        stdlib,
        "--diagnostics",
        "json",
      ]);
    } catch (err: any) {
      checkExit = -1;
      checkError = err?.message || String(err);
      currentStderr += `[internal error] compiler aborted: ${checkError}\n`;
    }

    const checkStdout = currentStdout;
    const checkStderr = currentStderr;
    const checkSuccess = checkExit === 0 && !checkError;

    checkStage = {
      success: checkSuccess,
      exitCode: checkExit,
      stdout: checkStdout,
      stderr: checkStderr,
      error: checkError,
    };

    // Parse diagnostics
    const jsonStart = checkStdout.indexOf("[");
    const jsonEnd = checkStdout.lastIndexOf("]");
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        const jsonSlice = checkStdout.slice(jsonStart, jsonEnd + 1);
        diagnostics = JSON.parse(jsonSlice);
      } catch (parseErr: any) {
        checkStage.error = (checkStage.error ? `${checkStage.error}; ` : "") +
          `Failed to parse diagnostics JSON: ${parseErr?.message || String(parseErr)}`;
        checkStage.success = false;
        diagnostics.push({
          severity: "error",
          message: `CompilerProtocolError: Malformed diagnostics payload: ${parseErr?.message || String(parseErr)}`,
          line: 1,
          col: 1,
        });
      }
    } else if (checkStdout.trim().length > 0 && !checkSuccess) {
      // Diagnostic was emitted in non-JSON format or check failed without valid JSON array
      diagnostics.push({
        severity: "error",
        message: `Compiler check failed: ${checkStderr.trim() || checkStdout.trim()}`,
        line: 1,
        col: 1,
      });
    }

    if (checkError && diagnostics.length === 0) {
      diagnostics.push({
        severity: "error",
        message: `Compiler internal error: ${checkError}`,
        line: 1,
        col: 1,
      });
    }

    // Stage 2: Transpile to C (only if check succeeded)
    if (checkSuccess && shouldTranspile) {
      currentStdout = "";
      currentStderr = "";
      let transpileExit = -1;
      let transpileError: string | undefined;

      try {
        transpileExit = mod.callMain([
          "-o",
          outPath,
          entryFile,
          "--stdlib",
          stdlib,
        ]);
        if (transpileExit === 0) {
          transpiledC = mod.FS.readFile(outPath, { encoding: "utf8" }) as string;
        } else {
          transpileError = `C transpilation failed with exit code ${transpileExit}`;
        }
      } catch (err: any) {
        transpileExit = -1;
        transpileError = err?.message || String(err);
      }

      const transpileSuccess = transpileExit === 0 && !transpileError && transpiledC.length > 0;
      transpileStage = {
        success: transpileSuccess,
        exitCode: transpileExit,
        stdout: currentStdout,
        stderr: currentStderr,
        error: transpileError,
      };
    } else if (shouldTranspile && !checkSuccess) {
      transpileStage = {
        success: false,
        exitCode: -1,
        stdout: "",
        stderr: "",
        error: "Skipped due to semantic analysis failure",
      };
    }

    // Stage 3: Generate AST / Source Dump
    if (shouldDumpAst) {
      currentStdout = "";
      currentStderr = "";
      let dumpExit = -1;
      let dumpError: string | undefined;

      try {
        dumpExit = mod.callMain(["--dump", entryFile, "--stdlib", stdlib]);
        astDump = currentStdout;
      } catch (err: any) {
        dumpExit = -1;
        dumpError = err?.message || String(err);
        astDump = `// AST dump unavailable: ${dumpError}`;
      }

      dumpStage = {
        success: dumpExit === 0 && !dumpError,
        exitCode: dumpExit,
        stdout: currentStdout,
        stderr: currentStderr,
        error: dumpError,
      };
    }

    const overallSuccess =
      checkStage.success &&
      (!shouldTranspile || (transpileStage !== undefined && transpileStage.success));

    const durationMs = performance.now() - t0;

    return {
      success: overallSuccess,
      diagnostics,
      transpiledC,
      astDump,
      stdout: checkStage.stdout,
      stderr: [checkStage.stderr, transpileStage?.stderr, dumpStage?.stderr].filter(Boolean).join("\n"),
      durationMs,
      stages: {
        check: checkStage,
        transpile: transpileStage,
        dumpAst: dumpStage,
      },
    };
  } finally {
    if (typeof (globalThis as any).process !== "undefined") {
      (globalThis as any).process.exitCode = origProcessExitCode;
    }

    mod.print = origPrint;
    mod.printErr = origPrintErr;

    if (s1?.tty?.ops && origTtyPut1) {
      s1.tty.ops.put_char = origTtyPut1;
    }
    if (s2?.tty?.ops && origTtyPut2) {
      s2.tty.ops.put_char = origTtyPut2;
    }

    // Clean up temporary files
    safeUnlink(outPath);
    safeUnlink("/out.c");
    for (const f of writtenFiles) {
      safeUnlink(f);
    }
  }
}
