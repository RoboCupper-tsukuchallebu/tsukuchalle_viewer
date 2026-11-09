// @vitest-environment happy-dom

import { expect, test, vi } from "vitest";
import { WriteGate } from "../src/control/writeGate.ts";
import type { PanelContext } from "../src/layout/panelContext.ts";
import { mountPanel } from "../src/panels/services/index.ts";

test("書き込みの許可と確認を経てサービスを操作する", async () => {
  const gate = new WriteGate();
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([{ id: "drive", running: false, started_at: null, image_tag: null }]) });
  vi.stubGlobal("fetch", fetchMock);
  const panel = document.createElement("div"); document.body.append(panel);
  const dispose = mountPanel(panel, { writeGate: gate } as PanelContext);
  await vi.waitFor(() => { expect(panel.querySelector("button")).not.toBeNull(); });
  expect(panel.querySelector("button")?.disabled).toBe(true);
  gate.enable();
  panel.querySelector("button")?.click();
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("モーターはゲームパッドの Start まで動かない");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  document.querySelector<HTMLButtonElement>('[data-role="confirm"]')?.click();
  await vi.waitFor(() => { expect(fetchMock).toHaveBeenCalledWith("/api/services/drive/start", expect.objectContaining({ method: "POST" })); });
  dispose(); panel.remove(); vi.unstubAllGlobals();
});

test("状態取得が完了するまで次のポーリングを開始しない", async () => {
  vi.useFakeTimers();
  let completeFetch: ((value: { ok: boolean; json: () => Promise<unknown[]> }) => void) | undefined;
  const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => { completeFetch = resolve; }));
  vi.stubGlobal("fetch", fetchMock);
  const panel = document.createElement("div");
  document.body.append(panel);
  const dispose = mountPanel(panel, { writeGate: new WriteGate() } as PanelContext);
  await vi.advanceTimersByTimeAsync(6000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  completeFetch?.({ ok: true, json: () => Promise.resolve([]) });
  await vi.advanceTimersByTimeAsync(2000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  dispose(); panel.remove(); vi.unstubAllGlobals(); vi.useRealTimers();
});
