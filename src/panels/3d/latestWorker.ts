import type { PointCloudRequest, PointCloudResponse } from "../../decoding/worker.ts";

export type WorkerPort = {
  postMessage(message: PointCloudRequest): void;
  onmessage: ((event: MessageEvent<PointCloudResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
};

/** 処理中の次には、最後に届いたフレームだけを渡す。 */
export class LatestWorker {
  private busy = false;
  private pending: PointCloudRequest | undefined;
  private worker: WorkerPort;
  constructor(worker: WorkerPort, onResult: (result: PointCloudResponse) => void, onError: (message: string) => void) {
    this.worker = worker;
    worker.onmessage = (event) => {
      this.busy = false;
      onResult(event.data);
      const next = this.pending;
      this.pending = undefined;
      if (next) this.submit(next);
    };
    worker.onerror = (event) => {
      this.busy = false;
      this.pending = undefined;
      onError(event.message);
    };
  }
  submit(request: PointCloudRequest): void {
    if (this.busy) { this.pending = request; return; }
    this.busy = true;
    this.worker.postMessage(request);
  }
  dispose(): void { this.pending = undefined; this.worker.terminate(); }
}
