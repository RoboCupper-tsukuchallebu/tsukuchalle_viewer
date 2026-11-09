import { expect, it, vi } from "vitest";
import { LatestWorker, type WorkerPort } from "../../src/panels/3d/latestWorker.ts";
import type { PointCloudRequest, PointCloudResponse } from "../../src/decoding/worker.ts";

it("処理中に来たフレームは最新の一枚だけを次に処理する", () => {
  const postMessage = vi.fn<(request: PointCloudRequest) => void>();
  const terminate = vi.fn();
  const worker: WorkerPort = { postMessage, onmessage: null, onerror: null, terminate };
  const results = vi.fn();
  const queue = new LatestWorker(worker, results, vi.fn());
  const request = (number: number): PointCloudRequest => ({
    channel: { encoding: "cdr", schema: "" },
    payload: new Uint8Array([number]),
    maximumPoints: 1,
  });
  queue.submit(request(1));
  queue.submit(request(2));
  queue.submit(request(3));
  expect(postMessage).toHaveBeenCalledTimes(1);
  worker.onmessage?.({ data: { error: "失敗" } } as MessageEvent<PointCloudResponse>);
  expect(postMessage).toHaveBeenCalledTimes(2);
  expect(vi.mocked(postMessage).mock.calls[1]?.[0].payload[0]).toBe(3);
  expect(results).toHaveBeenCalledOnce();
  queue.dispose();
  expect(terminate).toHaveBeenCalledOnce();
});
