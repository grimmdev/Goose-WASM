/**
 * CompiledGooseRunner (Gate G1)
 *
 * Manages the lifecycle of a compiled Goose game running inside an isolated Web Worker.
 */

export interface RunnerOptions {
  canvas?: HTMLCanvasElement;
  onLog?: (text: string) => void;
  onError?: (err: any) => void;
  onExit?: (code: number) => void;
}

export class CompiledGooseRunner {
  private worker: Worker | null = null;
  private running = false;

  constructor(private options: RunnerOptions = {}) {}

  async run(gameMjsUrl: string, wasmUrl: string): Promise<void> {
    this.stop();
    this.running = true;

    // Worker lifecycle management
    return new Promise((resolve, reject) => {
      try {
        const workerScript = `
          self.onmessage = async (e) => {
            if (e.data.type === 'start') {
              try {
                importScripts(e.data.gameMjsUrl);
                const moduleFactory = self.createGooseGame;
                if (!moduleFactory) {
                  throw new Error('createGooseGame export not found in ' + e.data.gameMjsUrl);
                }
                const gameModule = await moduleFactory({
                  noInitialRun: true,
                  locateFile: (path) => path.endsWith('.wasm') ? e.data.wasmUrl : path,
                  print: (text) => self.postMessage({ type: 'log', text }),
                  printErr: (text) => self.postMessage({ type: 'log_err', text }),
                });

                self.postMessage({ type: 'ready' });
                const exitCode = gameModule._goose_web_run ? gameModule._goose_web_run(0, 0) : 0;
                self.postMessage({ type: 'exit', code: exitCode });
              } catch (err) {
                self.postMessage({ type: 'error', error: err?.message || String(err) });
              }
            }
          };
        `;

        const blob = new Blob([workerScript], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));

        this.worker.onmessage = (e) => {
          const { type } = e.data;
          if (type === 'log') {
            this.options.onLog?.(e.data.text);
          } else if (type === 'log_err') {
            this.options.onLog?.(e.data.text);
          } else if (type === 'exit') {
            this.running = false;
            this.options.onExit?.(e.data.code);
            resolve();
          } else if (type === 'error') {
            this.running = false;
            this.options.onError?.(e.data.error);
            reject(new Error(e.data.error));
          }
        };

        this.worker.postMessage({ type: 'start', gameMjsUrl, wasmUrl });
      } catch (err) {
        this.running = false;
        reject(err);
      }
    });
  }

  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}

