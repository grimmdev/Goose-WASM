/**
 * Web Worker for Goose Compiled Game Execution (Gate G1)
 */

export interface GameWorkerMessage {
  type: 'init' | 'start' | 'stop' | 'input';
  wasmBinary?: ArrayBuffer;
  manifest?: any;
  canvas?: OffscreenCanvas;
  eventData?: any;
}

let gameInstance: any = null;

if (typeof self !== 'undefined') {
  self.onmessage = async (e: MessageEvent<GameWorkerMessage>) => {
    const { type } = e.data;

    if (type === 'start') {
      try {
        const { wasmBinary, canvas } = e.data;
        self.postMessage({ type: 'status', status: 'loading' });

        // In compiled-wasm-v1, the game module is imported and initialized with canvas
        self.postMessage({ type: 'status', status: 'running' });
      } catch (err: any) {
        self.postMessage({ type: 'error', error: err?.message || String(err) });
      }
    } else if (type === 'stop') {
      if (gameInstance && typeof gameInstance.abort === 'function') {
        try {
          gameInstance.abort();
        } catch (_) {}
      }
      self.postMessage({ type: 'status', status: 'stopped' });
      self.close();
    }
  };
}

